<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\Specialty;
use App\Models\TreatmentRecord;
use App\Models\User;
use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * All money maths in one place, in SQL (no 1000-row caps, one answer for
 * every screen). Conventions kept from the old app:
 *  - charges = Σ treatment_records.actual_cost_syp / _usd
 *  - payments are summed per currency (imported NULL currencies are SYP)
 *  - balance = charges − payments, per currency (positive = patient owes)
 * Every query is limited to what the user may see (DoctorBooks).
 */
class BillingService
{
    /** PatientProfile balance card (+ breakdown per books and per specialty). */
    public function patientBalance(Patient $patient, User $user): array
    {
        $records = TreatmentRecord::query()->visibleTo($user)->where('patient_id', $patient->id);
        $payments = Payment::query()->visibleTo($user)->where('patient_id', $patient->id);

        $chargesByDoctor = (clone $records)->groupBy('doctor_id', 'specialty_id')
            ->selectRaw('doctor_id, specialty_id, COALESCE(SUM(actual_cost_syp),0) syp, COALESCE(SUM(actual_cost_usd),0) usd')
            ->toBase()->get();
        $paidByDoctor = (clone $payments)->groupBy('doctor_id', 'specialty_id', 'currency')
            ->selectRaw('doctor_id, specialty_id, currency, COALESCE(SUM(amount),0) total')
            ->toBase()->get();

        $independent = Doctor::withTrashed()->where('has_own_books', true)->pluck('full_name', 'id');
        $specialtyNames = Specialty::pluck('name_ar', 'id');

        $totals = ['total_cost_syp' => 0.0, 'total_cost_usd' => 0.0, 'total_paid_syp' => 0.0, 'total_paid_usd' => 0.0];
        $books = [];
        $specialties = [];

        $bucket = function (array &$set, ?string $key, string $name) {
            $set[$key ?? 'none'] ??= ['id' => $key, 'name' => $name, 'syp' => 0.0, 'usd' => 0.0];

            return $key ?? 'none';
        };

        foreach ($chargesByDoctor as $r) {
            $totals['total_cost_syp'] += (float) $r->syp;
            $totals['total_cost_usd'] += (float) $r->usd;
            $b = $bucket($books, $independent->has($r->doctor_id) ? $r->doctor_id : null, $independent[$r->doctor_id] ?? 'العيادة');
            $books[$b]['syp'] += (float) $r->syp;
            $books[$b]['usd'] += (float) $r->usd;
            $s = $bucket($specialties, $r->specialty_id, $specialtyNames[$r->specialty_id] ?? '—');
            $specialties[$s]['syp'] += (float) $r->syp;
            $specialties[$s]['usd'] += (float) $r->usd;
        }
        foreach ($paidByDoctor as $r) {
            $cur = strtolower($r->currency) === 'usd' ? 'usd' : 'syp';
            $totals["total_paid_$cur"] += (float) $r->total;
            $b = $bucket($books, $independent->has($r->doctor_id) ? $r->doctor_id : null, $independent[$r->doctor_id] ?? 'العيادة');
            $books[$b][$cur] -= (float) $r->total;
            $s = $bucket($specialties, $r->specialty_id, $specialtyNames[$r->specialty_id] ?? '—');
            $specialties[$s][$cur] -= (float) $r->total;
        }

        return [
            'syp' => round($totals['total_cost_syp'] - $totals['total_paid_syp'], 2),
            'usd' => round($totals['total_cost_usd'] - $totals['total_paid_usd'], 2),
            ...array_map(fn ($v) => round($v, 2), $totals),
            // key "doctor_id" (null = clinic books) — same grouping as the old byBooks
            'by_books' => array_values(array_map(fn ($b) => ['doctor_id' => $b['id'], 'name' => $b['name'], 'syp' => round($b['syp'], 2), 'usd' => round($b['usd'], 2)], $books)),
            'by_specialty' => array_values(array_map(fn ($s) => ['specialty_id' => $s['id'], 'name' => $s['name'], 'syp' => round($s['syp'], 2), 'usd' => round($s['usd'], 2)], $specialties)),
        ];
    }

    /**
     * SystemStatistics / MyFinances. $books: 'all' | 'clinic' | <doctor id>.
     * Same numbers as before, without the old 1000-row cap on the sums.
     */
    public function statistics(User $user, Carbon $from, Carbon $to, string $books = 'all'): array
    {
        $doctorIds = $this->booksDoctorIds($user, $books);
        $scope = fn (Builder $q, string $col) => $doctorIds === null ? $q : $q->whereIn($col, $doctorIds);

        $records = $scope(TreatmentRecord::query()->visibleTo($user)->whereBetween('performed_at', [$from, $to]), 'doctor_id');
        $payments = $scope(Payment::query()->visibleTo($user)->whereBetween('paid_at', [$from, $to]), 'doctor_id');
        $appointments = $scope(Appointment::query()->visibleTo($user)->whereBetween('scheduled_at', [$from, $to]), 'doctor_id');

        $cost = (clone $records)->selectRaw('COALESCE(SUM(actual_cost_syp),0) syp, COALESCE(SUM(actual_cost_usd),0) usd')->toBase()->first();
        $paid = (clone $payments)->groupBy('currency')->selectRaw('currency, COALESCE(SUM(amount),0) total')->toBase()->pluck('total', 'currency');

        $paidSyp = round((float) ($paid['SYP'] ?? 0), 2);
        $paidUsd = round((float) ($paid['USD'] ?? 0), 2);

        return [
            'appointments_count' => $appointments->count(),
            'treatments_count' => (clone $records)->count(),
            // New patients only make sense for the whole clinic view.
            'new_patients_count' => ($books === 'all' && ! DoctorBooks::for($user)->isIndependentDoctor())
                ? Patient::whereBetween('created_at', [$from, $to])->count() : null,
            'treatment_cost_syp' => round((float) $cost->syp, 2),
            'treatment_cost_usd' => round((float) $cost->usd, 2),
            'total_payments_syp' => $paidSyp,
            'total_payments_usd' => $paidUsd,
            // Old screen: "revenue" = payments − treatment cost (i.e. collected minus billed).
            'revenue_syp' => round($paidSyp - (float) $cost->syp, 2),
            'revenue_usd' => round($paidUsd - (float) $cost->usd, 2),
        ];
    }

    /**
     * Revenue report (decision 2026-11-20): per doctor, per specialty, or
     * doctor × specialty, per currency. "collected" = payments by paid_at
     * (the basis of the doctor percentage), "charged" = treatments by performed_at.
     */
    public function revenue(User $user, Carbon $from, Carbon $to, string $groupBy = 'doctor'): array
    {
        $cols = match ($groupBy) {
            'specialty' => ['specialty_id'],
            'doctor_specialty' => ['doctor_id', 'specialty_id'],
            default => ['doctor_id'],
        };

        $charged = TreatmentRecord::query()->visibleTo($user)->whereBetween('performed_at', [$from, $to])
            ->groupBy($cols)->select($cols)
            ->selectRaw('COUNT(*) treatments, COALESCE(SUM(actual_cost_syp),0) syp, COALESCE(SUM(actual_cost_usd),0) usd')
            ->toBase()->get();
        $collected = Payment::query()->visibleTo($user)->whereBetween('paid_at', [$from, $to])
            ->groupBy([...$cols, 'currency'])->select([...$cols, 'currency'])
            ->selectRaw('COALESCE(SUM(amount),0) total')
            ->toBase()->get();

        $doctors = Doctor::withTrashed()->pluck('full_name', 'id');
        $specialties = Specialty::pluck('name_ar', 'id');
        $rows = [];
        $key = fn ($r) => implode('|', array_map(fn ($c) => $r->{$c} ?? '', $cols));
        $row = function ($r) use (&$rows, $key, $cols, $doctors, $specialties) {
            $k = $key($r);
            if (! isset($rows[$k])) {
                $rows[$k] = [
                    'doctor_id' => in_array('doctor_id', $cols) ? $r->doctor_id : null,
                    'doctor_name' => in_array('doctor_id', $cols) ? ($doctors[$r->doctor_id] ?? null) : null,
                    'specialty_id' => in_array('specialty_id', $cols) ? $r->specialty_id : null,
                    'specialty_name' => in_array('specialty_id', $cols) ? ($specialties[$r->specialty_id] ?? null) : null,
                    'treatments' => 0, 'charged_syp' => 0.0, 'charged_usd' => 0.0, 'collected_syp' => 0.0, 'collected_usd' => 0.0,
                ];
            }

            return $k;
        };

        foreach ($charged as $r) {
            $k = $row($r);
            $rows[$k]['treatments'] = (int) $r->treatments;
            $rows[$k]['charged_syp'] = round((float) $r->syp, 2);
            $rows[$k]['charged_usd'] = round((float) $r->usd, 2);
        }
        foreach ($collected as $r) {
            $k = $row($r);
            $cur = strtolower($r->currency) === 'usd' ? 'usd' : 'syp';
            $rows[$k]["collected_$cur"] = round($rows[$k]["collected_$cur"] + (float) $r->total, 2);
        }

        $rows = array_values($rows);
        usort($rows, fn ($a, $b) => $b['collected_syp'] <=> $a['collected_syp']);

        $sum = fn (string $f) => round(array_sum(array_column($rows, $f)), 2);

        return [
            'group_by' => $groupBy,
            'from' => $from->toIso8601String(),
            'to' => $to->toIso8601String(),
            'rows' => $rows,
            'totals' => [
                'treatments' => (int) $sum('treatments'),
                'charged_syp' => $sum('charged_syp'), 'charged_usd' => $sum('charged_usd'),
                'collected_syp' => $sum('collected_syp'), 'collected_usd' => $sum('collected_usd'),
            ],
        ];
    }

    /** @return string[]|null null = no extra filter */
    private function booksDoctorIds(User $user, string $books): ?array
    {
        $own = DoctorBooks::for($user);
        if ($own->isIndependentDoctor()) {
            return [$own->currentDoctorId()];
        }

        return match ($books) {
            'all' => null,
            'clinic' => Doctor::withTrashed()->where('has_own_books', false)->pluck('id')->all(),
            default => [$books],
        };
    }
}
