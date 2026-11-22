<?php

namespace App\Services;

use App\Models\CompensationRule;
use App\Models\Doctor;
use App\Models\DoctorAttendance;
use App\Models\DoctorPayout;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\Settlement;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Monthly doctor settlement (decisions 2026-11-20):
 *
 *   revenue      = payments COLLECTED in the month (paid_at), per currency
 *   direct       = expenses charged to the doctor (allocation = doctor)
 *   allocated    = clinic-wide expenses × doctor hours / all doctors' hours
 *                + specialty expenses × doctor hours / that specialty's doctors' hours
 *   net          = revenue − direct − allocated (− carried loss, if enabled)
 *   doctor_share = Σ per specialty  net_s × percent_s   (never below 0)
 *   clinic_share = net − doctor_share
 *
 * The doctor's net is split across their specialties in proportion to the
 * revenue of each, so a different percentage per specialty works.
 * If nobody has attendance hours in the month, shared expenses fall back to
 * a split by revenue (and the result says so).
 * Independent doctors (own books) do not carry clinic-wide charges unless
 * config('clinic.finance.independent_share_clinic_expenses') is true.
 * A closed month returns its frozen rows instead of recomputing.
 */
class SettlementService
{
    /**
     * @return array{period: string, closed: bool, closed_at: ?string, allocation_basis: string, total_hours: float,
     *               rows: array<int, array<string, mixed>>, warnings: string[]}
     */
    public function forPeriod(string $period, ?string $onlyDoctorId = null): array
    {
        [$from, $to] = $this->range($period);

        $closed = Settlement::where('period', $period)->with('doctor:id,full_name')->get();
        if ($closed->isNotEmpty()) {
            return $this->fromClosed($period, $closed, $onlyDoctorId);
        }

        $doctors = Doctor::withTrashed()->with('specialties')->get()->keyBy('id');
        $warnings = [];

        // ---- hours -----------------------------------------------------
        $hours = DoctorAttendance::query()
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->whereNotNull('minutes')
            ->groupBy('doctor_id')->selectRaw('doctor_id, SUM(minutes) m')
            ->pluck('m', 'doctor_id')->map(fn ($m) => round($m / 60, 2));

        // ---- revenue: collected, per doctor/specialty/currency ----------
        $revenue = Payment::query()
            ->whereBetween('paid_at', [$from->copy()->utc(), $to->copy()->utc()])
            ->groupBy('doctor_id', 'specialty_id', 'currency')
            ->selectRaw('doctor_id, specialty_id, currency, SUM(amount) total')
            ->toBase()->get();

        // ---- expenses --------------------------------------------------
        $expenses = Expense::query()
            ->whereBetween('spent_at', [$from->toDateString(), $to->toDateString()])
            ->get();

        $shareClinic = (bool) config('clinic.finance.independent_share_clinic_expenses');
        $sharing = $doctors->filter(fn ($d) => $shareClinic || ! $d->has_own_books)->keys();

        $currencies = collect(['SYP', 'USD']);
        $rows = [];
        $doctorIds = $doctors->keys()->filter(fn ($id) => $revenue->contains('doctor_id', $id)
            || $hours->has($id)
            || $expenses->contains('doctor_id', $id)
            || CompensationRule::where('doctor_id', $id)->exists());

        // Basis for shared charges: hours, or revenue when nobody clocked in.
        $totalHours = (float) $hours->only($sharing->all())->sum();
        $basis = $totalHours > 0 ? 'hours' : 'revenue';
        if ($basis === 'revenue' && $expenses->whereIn('allocation', ['clinic_wide', 'specialty'])->isNotEmpty()) {
            $warnings[] = 'لا توجد ساعات حضور مسجلة لهذا الشهر: وُزعت المصاريف المشتركة حسب الإيرادات';
        }

        foreach ($doctorIds as $doctorId) {
            if ($onlyDoctorId && $doctorId !== $onlyDoctorId) {
                continue;
            }
            $doctor = $doctors[$doctorId];
            $doctorSpecialtyIds = $doctor->specialties->pluck('id')->all();

            foreach ($currencies as $cur) {
                $rev = $revenue->where('doctor_id', $doctorId)->where('currency', $cur);
                $revenueTotal = round((float) $rev->sum('total'), 2);

                $direct = round((float) $expenses->where('allocation', 'doctor')->where('doctor_id', $doctorId)->where('currency', $cur)->sum('amount'), 2);

                $allocated = 0.0;
                $allocDetail = [];
                if ($sharing->contains($doctorId)) {
                    // clinic-wide
                    $clinicWide = (float) $expenses->where('allocation', 'clinic_wide')->where('currency', $cur)->sum('amount');
                    if ($clinicWide > 0) {
                        $ratio = $this->ratio($doctorId, $sharing, $basis, $hours, $revenue, $cur);
                        $allocated += $clinicWide * $ratio;
                        $allocDetail[] = ['type' => 'clinic_wide', 'total' => round($clinicWide, 2), 'ratio' => round($ratio, 4)];
                    }
                }
                // specialty charges: split among the doctors of that specialty
                foreach ($expenses->where('allocation', 'specialty')->where('currency', $cur)->groupBy('specialty_id') as $specialtyId => $items) {
                    if (! in_array($specialtyId, $doctorSpecialtyIds, true)) {
                        continue;
                    }
                    $members = $doctors->filter(fn ($d) => $d->specialties->contains('id', $specialtyId))->keys();
                    $specialtyBasis = $hours->only($members->all())->sum() > 0 ? 'hours' : 'revenue';
                    $ratio = $this->ratio($doctorId, $members, $specialtyBasis, $hours, $revenue, $cur);
                    $sum = (float) $items->sum('amount');
                    $allocated += $sum * $ratio;
                    $allocDetail[] = ['type' => 'specialty', 'specialty_id' => $specialtyId, 'total' => round($sum, 2), 'ratio' => round($ratio, 4)];
                }
                $allocated = round($allocated, 2);

                $carried = $this->carriedLoss($doctorId, $period, $cur);
                $net = round($revenueTotal - $direct - $allocated - $carried, 2);

                // Share per specialty: net split by each specialty's revenue.
                $share = 0.0;
                $perSpecialty = [];
                if ($net > 0 && $revenueTotal > 0) {
                    foreach ($rev->groupBy('specialty_id') as $specialtyId => $part) {
                        $partRevenue = (float) $part->sum('total');
                        $partNet = $net * $partRevenue / $revenueTotal;
                        $percent = $this->percentFor($doctorId, $specialtyId ?: null, $to);
                        $share += $partNet * $percent / 100;
                        $perSpecialty[] = ['specialty_id' => $specialtyId ?: null, 'revenue' => round($partRevenue, 2), 'percent' => $percent];
                    }
                }
                $share = round(max(0, $share), 2);

                if ($revenueTotal == 0.0 && $direct == 0.0 && $allocated == 0.0 && $carried == 0.0) {
                    continue; // nothing in this currency
                }

                $paid = round((float) DoctorPayout::where('doctor_id', $doctorId)->where('period', $period)->where('currency', $cur)->sum('amount'), 2);

                $rows[] = [
                    'doctor_id' => $doctorId,
                    'doctor_name' => $doctor->full_name,
                    'has_own_books' => (bool) $doctor->has_own_books,
                    'currency' => $cur,
                    'hours' => (float) ($hours[$doctorId] ?? 0),
                    'revenue' => $revenueTotal,
                    'direct_expenses' => $direct,
                    'allocated_expenses' => $allocated,
                    'carried_loss' => $carried,
                    'net' => $net,
                    'percent' => $this->percentFor($doctorId, null, $to),
                    'doctor_share' => $share,
                    'clinic_share' => round($net - $share, 2),
                    'paid' => $paid,
                    'owed' => round($share - $paid, 2),
                    'details' => ['per_specialty' => $perSpecialty, 'allocation' => $allocDetail],
                ];
            }
        }

        usort($rows, fn ($a, $b) => [$a['doctor_name'], $a['currency']] <=> [$b['doctor_name'], $b['currency']]);

        return [
            'period' => $period,
            'closed' => false,
            'closed_at' => null,
            'allocation_basis' => $basis,
            'total_hours' => round($totalHours, 2),
            'rows' => $rows,
            'warnings' => $warnings,
        ];
    }

    /** Freeze the month. */
    public function close(string $period, string $userId): int
    {
        return DB::transaction(function () use ($period, $userId) {
            if (Settlement::where('period', $period)->exists()) {
                return 0;
            }
            $result = $this->forPeriod($period);
            foreach ($result['rows'] as $r) {
                Settlement::create([
                    'doctor_id' => $r['doctor_id'], 'period' => $period, 'currency' => $r['currency'],
                    'revenue' => $r['revenue'], 'direct_expenses' => $r['direct_expenses'],
                    'allocated_expenses' => $r['allocated_expenses'], 'carried_loss' => $r['carried_loss'],
                    'net' => $r['net'], 'doctor_share' => $r['doctor_share'], 'clinic_share' => $r['clinic_share'],
                    'hours' => $r['hours'],
                    'details' => $r['details'] + ['percent' => $r['percent'], 'allocation_basis' => $result['allocation_basis']],
                    'closed_at' => now(), 'closed_by' => $userId,
                ]);
            }

            return count($result['rows']);
        });
    }

    public function reopen(string $period): int
    {
        return Settlement::where('period', $period)->delete();
    }

    public function isClosed(string $period): bool
    {
        return Settlement::where('period', $period)->exists();
    }

    /** Clinic-local month boundaries. */
    public function range(string $period): array
    {
        $tz = config('clinic.timezone');
        $from = Carbon::createFromFormat('Y-m-d H:i:s', $period.'-01 00:00:00', $tz);

        return [$from, $from->copy()->endOfMonth()];
    }

    /** Period (YYYY-MM) that a date falls in, clinic-local. */
    public static function periodOf(mixed $date): string
    {
        return Carbon::parse($date)->setTimezone(config('clinic.timezone'))->format('Y-m');
    }

    // ---- helpers -----------------------------------------------------------

    private function ratio(string $doctorId, Collection $members, string $basis, Collection $hours, Collection $revenue, string $cur): float
    {
        if ($basis === 'hours') {
            $total = (float) $hours->only($members->all())->sum();

            return $total > 0 ? (float) ($hours[$doctorId] ?? 0) / $total : 0.0;
        }
        $rev = $revenue->where('currency', $cur)->whereIn('doctor_id', $members->all());
        $total = (float) $rev->sum('total');

        return $total > 0 ? (float) $rev->where('doctor_id', $doctorId)->sum('total') / $total : 0.0;
    }

    /** Percent in force at $date: specialty rule first, then the doctor's general rule. */
    private function percentFor(string $doctorId, ?string $specialtyId, Carbon $date): float
    {
        $day = $date->toDateString();
        $rules = CompensationRule::where('doctor_id', $doctorId)
            ->where('effective_from', '<=', $day)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $day))
            ->orderByDesc('effective_from')
            ->get();

        $rule = ($specialtyId ? $rules->firstWhere('specialty_id', $specialtyId) : null)
            ?? $rules->firstWhere('specialty_id', null);

        return (float) ($rule?->percent ?? 0);
    }

    /** Negative net of the previous CLOSED month, carried in when enabled. */
    private function carriedLoss(string $doctorId, string $period, string $cur): float
    {
        if (! config('clinic.finance.carry_losses')) {
            return 0.0;
        }
        $previous = Carbon::createFromFormat('Y-m-d', $period.'-01')->subMonth()->format('Y-m');
        $net = Settlement::where('doctor_id', $doctorId)->where('period', $previous)->where('currency', $cur)->value('net');

        return $net !== null && $net < 0 ? round(-$net, 2) : 0.0;
    }

    private function fromClosed(string $period, Collection $closed, ?string $onlyDoctorId): array
    {
        $rows = $closed
            ->when($onlyDoctorId, fn ($c) => $c->where('doctor_id', $onlyDoctorId))
            ->map(function (Settlement $s) use ($period) {
                $paid = round((float) DoctorPayout::where('doctor_id', $s->doctor_id)->where('period', $period)->where('currency', $s->currency)->sum('amount'), 2);

                return [
                    'doctor_id' => $s->doctor_id,
                    'doctor_name' => $s->doctor?->full_name,
                    'has_own_books' => (bool) Doctor::withTrashed()->whereKey($s->doctor_id)->value('has_own_books'),
                    'currency' => $s->currency,
                    'hours' => $s->hours,
                    'revenue' => $s->revenue,
                    'direct_expenses' => $s->direct_expenses,
                    'allocated_expenses' => $s->allocated_expenses,
                    'carried_loss' => $s->carried_loss,
                    'net' => $s->net,
                    'percent' => (float) ($s->details['percent'] ?? 0),
                    'doctor_share' => $s->doctor_share,
                    'clinic_share' => $s->clinic_share,
                    'paid' => $paid,
                    'owed' => round($s->doctor_share - $paid, 2),
                    'details' => $s->details,
                ];
            })->sortBy(fn ($r) => $r['doctor_name'].$r['currency'])->values()->all();

        return [
            'period' => $period,
            'closed' => true,
            'closed_at' => $closed->max('closed_at')?->toIso8601String(),
            'allocation_basis' => $closed->first()->details['allocation_basis'] ?? 'hours',
            'total_hours' => round((float) $closed->unique('doctor_id')->sum('hours'), 2),
            'rows' => $rows,
            'warnings' => [],
        ];
    }
}
