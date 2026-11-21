<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
