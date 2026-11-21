<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PatientFile;
use App\Models\Payment;
use App\Services\BillingService;
use App\Support\DoctorBooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/** SystemStatistics / MyFinances and the new revenue report per doctor / specialty. */
class ReportController extends Controller
{
    /** GET /stats?from=&to=&books=all|clinic|<doctor id> */
    public function stats(Request $request, BillingService $billing): JsonResponse
    {
        $this->authorize('viewAny', Payment::class);
        [$from, $to] = $this->range($request);
        $books = (string) $request->query('books', 'all');

        return response()->json(['data' => $billing->statistics($request->user(), $from, $to, $books)]);
    }

    /** GET /reports/revenue?from=&to=&group_by=doctor|specialty|doctor_specialty */
    public function revenue(Request $request, BillingService $billing): JsonResponse
    {
        $user = $request->user();
        // Money reports: admins and independent doctors (their own books).
        abort_unless($user->isSuperAdmin() || DoctorBooks::for($user)->isIndependentDoctor(), 403, 'ليس لديك صلاحية');
        $request->validate(['group_by' => ['nullable', Rule::in(['doctor', 'specialty', 'doctor_specialty'])]]);
        [$from, $to] = $this->range($request);

        return response()->json(['data' => $billing->revenue($user, $from, $to, $request->query('group_by', 'doctor'))]);
    }

    /**
     * GET /admin/storage — patient files size and free disk space (plan §2.4:
     * warn the admin before x-rays fill the hosting quota).
     */
    public function storage(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403, 'ليس لديك صلاحية');

        $root = storage_path('app');
        $total = @disk_total_space($root) ?: null;
        $free = @disk_free_space($root) ?: null;
        $usedPercent = $total ? round(100 * ($total - $free) / $total, 1) : null;

        return response()->json(['data' => [
            'files_count' => PatientFile::query()->count(),
            'files_bytes' => (int) PatientFile::withTrashed()->sum('size'),
            'disk_total_bytes' => $total,
            'disk_free_bytes' => $free,
            'disk_used_percent' => $usedPercent,
            'warning' => $usedPercent !== null && $usedPercent >= config('clinic.disk_warning_percent'),
            'warning_percent' => (int) config('clinic.disk_warning_percent'),
        ]]);
    }

    /** Default: first day of this month → end of today, in clinic local time. */
    private function range(Request $request): array
    {
        $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $tz = config('clinic.timezone');
        $from = $request->query('from') ? Carbon::parse($request->query('from'), $tz) : now($tz)->startOfMonth();
        $to = $request->query('to') ? Carbon::parse($request->query('to'), $tz) : now($tz)->endOfDay();

        return [$from->utc(), $to->utc()];
    }
}
