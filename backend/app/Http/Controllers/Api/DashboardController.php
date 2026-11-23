<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\DoctorAttendance;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\TreatmentRecord;
use App\Models\WaitingListEntry;
use App\Services\BillingService;
use App\Support\DoctorBooks;
use App\Support\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Plan §4.5: one dashboard, contents by role.
 *  - everyone: today's appointments + waiting room counts
 *  - doctor: own patients today, own unfinished treatments, own month revenue
 *  - super_admin: month revenue by specialty and doctor, patients who owe most
 * Every number respects the user's books (independent doctors).
 */
class DashboardController extends Controller
{
    public function __invoke(Request $request, BillingService $billing): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->is_active && $user->role, 403);
        $tz = config('clinic.timezone');
        $dayStart = now($tz)->startOfDay()->utc();
        $dayEnd = $dayStart->copy()->addDay();
        $books = DoctorBooks::for($user);
        $ownDoctor = $user->hasRole(Role::DOCTOR) ? $books->currentDoctorId() : null;

        $todayQuery = Appointment::query()->visibleTo($user)->whereBetween('scheduled_at', [$dayStart, $dayEnd])
            ->when($ownDoctor, fn ($q) => $q->where('doctor_id', $ownDoctor));

        $data = [
            'role' => $user->role,
            'today' => [
                'appointments' => (clone $todayQuery)->count(),
                'scheduled' => (clone $todayQuery)->where('status', 'Scheduled')->count(),
                'completed' => (clone $todayQuery)->where('status', 'Completed')->count(),
                'next' => (clone $todayQuery)->where('status', 'Scheduled')->where('scheduled_at', '>=', now())
                    ->with(['patient:id,full_name', 'doctor:id,full_name'])->orderBy('scheduled_at')->limit(8)
                    ->get(['id', 'patient_id', 'doctor_id', 'scheduled_at']),
                'waiting' => WaitingListEntry::where('status', 'waiting')->count(),
                'in_examination' => WaitingListEntry::where('status', 'in_examination')->count(),
                'doctors_in' => DoctorAttendance::whereNull('check_out')->where('date', now($tz)->toDateString())->count(),
            ],
        ];

        if ($ownDoctor) {
            $data['doctor'] = [
                // distinct patient+treatment+tooth (portable: works on MySQL and SQLite)
                'unfinished_treatments' => DB::query()->fromSub(
                    TreatmentRecord::where('doctor_id', $ownDoctor)->where('is_completed', false)
                        ->groupBy('patient_id', 'treatment_id', 'sub_treatment_id', 'tooth_number')
                        ->select('patient_id')->toBase(),
                    'u'
                )->count(),
                'month' => $billing->statistics($user, now($tz)->startOfMonth()->utc(), now($tz)->endOfDay()->utc(), $ownDoctor),
            ];
        }

        if ($user->isSuperAdmin()) {
            $from = now($tz)->startOfMonth()->utc();
            $to = now($tz)->endOfDay()->utc();
            $data['admin'] = [
                'month' => $billing->statistics($user, $from, $to),
                'by_specialty' => $billing->revenue($user, $from, $to, 'specialty')['rows'],
                'by_doctor' => $billing->revenue($user, $from, $to, 'doctor')['rows'],
                'top_debtors' => $this->topDebtors(),
            ];
        }

        return response()->json(['data' => $data]);
    }

    /** Patients with the highest unpaid SYP balance (charges − payments). */
    private function topDebtors(): array
    {
        $charges = TreatmentRecord::query()->groupBy('patient_id')
            ->selectRaw('patient_id, COALESCE(SUM(actual_cost_syp),0) c')->pluck('c', 'patient_id');
        $paid = Payment::query()->where('currency', 'SYP')->groupBy('patient_id')
            ->selectRaw('patient_id, COALESCE(SUM(amount),0) p')->pluck('p', 'patient_id');

        $rows = $charges->map(fn ($c, $pid) => ['patient_id' => $pid, 'balance' => round((float) $c - (float) ($paid[$pid] ?? 0), 2)])
            ->filter(fn ($r) => $r['balance'] > 0)->sortByDesc('balance')->take(10)->values();
        $names = Patient::withTrashed()->whereIn('id', $rows->pluck('patient_id'))->pluck('full_name', 'id');

        return $rows->map(fn ($r) => $r + ['full_name' => $names[$r['patient_id']] ?? '—'])->all();
    }
}
