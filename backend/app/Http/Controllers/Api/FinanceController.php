<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompensationRule;
use App\Models\Doctor;
use App\Models\DoctorPayout;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\RecurringExpense;
use App\Services\RecurringExpenseService;
use App\Services\SettlementService;
use App\Support\Activity;
use App\Support\DoctorBooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * المالية (Phase G): percentage rules, charges, monthly settlement, payouts.
 * Everything here is super_admin only, except GET /my-settlement for doctors.
 */
class FinanceController extends Controller
{
    private const PERIOD = ['required', 'date_format:Y-m'];

    // ---- settlement ----------------------------------------------------------

    /** GET /settlements?period=YYYY-MM */
    public function settlements(Request $request, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $period = $request->validate(['period' => self::PERIOD])['period'];

        return response()->json(['data' => $s->forPeriod($period)]);
    }

    /** GET /my-settlement?period=YYYY-MM — a doctor's own figures (read-only). */
    public function mySettlement(Request $request, SettlementService $s): JsonResponse
    {
        $doctorId = DoctorBooks::for($request->user())->currentDoctorId();
        abort_unless($doctorId, 403, 'حسابك غير مرتبط بطبيب');
        $period = $request->validate(['period' => self::PERIOD])['period'];

        $data = $s->forPeriod($period, $doctorId);
        $data['rows'] = array_map(fn ($r) => collect($r)->except(['details'])->all(), $data['rows']);

        return response()->json(['data' => $data]);
    }

    /** POST /settlements/close {period} */
    public function close(Request $request, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $period = $request->validate(['period' => self::PERIOD])['period'];
        $tz = config('clinic.timezone');
        if ($period >= now($tz)->format('Y-m')) {
            throw ValidationException::withMessages(['period' => ['لا يمكن إغلاق الشهر الحالي قبل انتهائه']]);
        }
        if ($s->isClosed($period)) {
            throw ValidationException::withMessages(['period' => ['هذا الشهر مغلق مسبقاً']]);
        }
        $n = $s->close($period, $request->user()->id);
        Activity::log('updated', 'settings', null, 'أغلق التسوية الشهرية لشهر '.$period.' ('.$n.' سطر)', ['is_money' => true]);

        return response()->json(['data' => $s->forPeriod($period)]);
    }

    /** POST /settlements/reopen {period} */
    public function reopen(Request $request, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $period = $request->validate(['period' => self::PERIOD])['period'];
        $s->reopen($period);
        Activity::log('updated', 'settings', null, 'أعاد فتح التسوية الشهرية لشهر '.$period, ['is_money' => true]);

        return response()->json(['data' => $s->forPeriod($period)]);
    }

    // ---- percentage rules ----------------------------------------------------

    public function rules(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => CompensationRule::with(['doctor:id,full_name', 'specialty:id,name_ar'])
            ->orderBy('doctor_id')->orderByDesc('effective_from')->get()]);
    }

    public function storeRule(Request $request): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate([
            'doctor_id' => ['required', 'uuid', 'exists:doctors,id'],
            'specialty_id' => ['nullable', 'uuid', 'exists:specialties,id'],
            'percent' => ['required', 'numeric', 'between:0,100'],
            'effective_from' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        // A new rule ends the previous open rule of the same doctor/specialty.
        CompensationRule::where('doctor_id', $data['doctor_id'])
            ->where('specialty_id', $data['specialty_id'] ?? null)
            ->whereNull('effective_to')
            ->where('effective_from', '<', $data['effective_from'])
            ->update(['effective_to' => Carbon::parse($data['effective_from'])->subDay()->toDateString()]);

        $rule = CompensationRule::create($data);
        Activity::log('created', 'settings', $rule->id,
            'حدد نسبة '.Activity::doctorName(Doctor::withTrashed()->whereKey($rule->doctor_id)->value('full_name')).' '.rtrim(rtrim(number_format($rule->percent, 2), '0'), '.').'% اعتباراً من '.$rule->effective_from->format('Y-m-d'),
            ['doctor_id' => $rule->doctor_id, 'is_money' => true]);

        return response()->json(['data' => $rule->load(['doctor:id,full_name', 'specialty:id,name_ar'])], 201);
    }

    public function destroyRule(Request $request, CompensationRule $rule): JsonResponse
    {
        $this->admin($request);
        $rule->delete();
        Activity::log('deleted', 'settings', $rule->id,
            'حذف نسبة '.Activity::doctorName(Doctor::withTrashed()->whereKey($rule->doctor_id)->value('full_name')).' ('.$rule->percent.'%)',
            ['doctor_id' => $rule->doctor_id, 'is_money' => true]);

        return response()->json(null, 204);
    }

    // ---- expense categories --------------------------------------------------

    public function categories(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => ExpenseCategory::orderBy('name')->get()]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => ExpenseCategory::create($this->validCategory($request))], 201);
    }

    public function updateCategory(Request $request, ExpenseCategory $category): JsonResponse
    {
        $this->admin($request);
        $category->update($this->validCategory($request, true));

        return response()->json(['data' => $category]);
    }

    // ---- expenses ---------------------------------------------------------------

    /** GET /expenses?period=YYYY-MM */
    public function expenses(Request $request): JsonResponse
    {
        $this->admin($request);
        $period = $request->validate(['period' => self::PERIOD])['period'];
        [$from, $to] = app(SettlementService::class)->range($period);

        $rows = Expense::with(['category:id,name', 'doctor:id,full_name', 'specialty:id,name_ar'])
            ->whereBetween('spent_at', [$from->toDateString(), $to->toDateString()])
            ->orderByDesc('spent_at')->get();

        return response()->json([
            'data' => $rows,
            'totals' => $rows->groupBy('currency')->map(fn ($r) => round($r->sum('amount'), 2)),
        ]);
    }

    public function storeExpense(Request $request, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $data = $this->validExpense($request);
        $this->assertOpen($s, $data['spent_at']);
        $expense = Expense::create($data + ['created_by' => $request->user()->id]);
        Activity::log('created', 'settings', $expense->id,
            'سجّل مصروف «'.$expense->category->name.'» '.Activity::money($expense->amount, $expense->currency).' بتاريخ '.$expense->spent_at->format('Y-m-d'),
            ['doctor_id' => $expense->doctor_id, 'is_money' => true]);

        return response()->json(['data' => $expense->load(['category:id,name', 'doctor:id,full_name', 'specialty:id,name_ar'])], 201);
    }

    public function updateExpense(Request $request, Expense $expense, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $this->assertOpen($s, $expense->spent_at);
        $data = $this->validExpense($request, true);
        if (isset($data['spent_at'])) {
            $this->assertOpen($s, $data['spent_at']);
        }
        $old = $expense->amount;
        $expense->update($data);
        Activity::log('updated', 'settings', $expense->id,
            'عدّل مصروف «'.$expense->category->name.'» من '.Activity::money($old, $expense->currency).' إلى '.Activity::money($expense->amount, $expense->currency),
            ['doctor_id' => $expense->doctor_id, 'is_money' => true]);

        return response()->json(['data' => $expense->load(['category:id,name', 'doctor:id,full_name', 'specialty:id,name_ar'])]);
    }

    public function destroyExpense(Request $request, Expense $expense, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $this->assertOpen($s, $expense->spent_at);
        $expense->delete();
        Activity::log('deleted', 'settings', $expense->id,
            'حذف مصروف «'.$expense->category?->name.'» '.Activity::money($expense->amount, $expense->currency),
            ['doctor_id' => $expense->doctor_id, 'is_money' => true]);

        return response()->json(null, 204);
    }

    // ---- recurring expenses ----------------------------------------------------

    /** GET /recurring-expenses?period=YYYY-MM — each row says whether it is posted for that month. */
    public function recurring(Request $request, RecurringExpenseService $service): JsonResponse
    {
        $this->admin($request);
        $period = $request->validate(['period' => ['nullable', 'date_format:Y-m']])['period']
            ?? now(config('clinic.timezone'))->format('Y-m');
        $posted = $service->postedIds($period);
        $rows = RecurringExpense::with('category:id,name')->orderByDesc('is_active')->get()
            ->each(fn (RecurringExpense $r) => $r->setAttribute('posted', $posted->contains($r->id)));

        return response()->json(['data' => $rows, 'period' => $period]);
    }

    /** POST /recurring-expenses/generate {period} — the monthly button (replaces the cron job). */
    public function generateRecurring(Request $request, RecurringExpenseService $service, SettlementService $s): JsonResponse
    {
        $this->admin($request);
        $period = $request->validate(['period' => self::PERIOD])['period'];
        if ($s->isClosed($period)) {
            throw ValidationException::withMessages(['period' => ['شهر '.$period.' مغلق: أعد فتحه من التسوية الشهرية أولاً']]);
        }
        $created = $service->generate($period, $request->user()->id);
        if ($created) {
            Activity::log('created', 'settings', null, 'أضاف '.$created.' من المصاريف الشهرية الثابتة لشهر '.$period, ['is_money' => true]);
        }

        return response()->json(['created' => $created, 'period' => $period]);
    }

    public function storeRecurring(Request $request): JsonResponse
    {
        $this->admin($request);
        $data = collect($this->validExpense($request))->except('spent_at')->all();

        return response()->json(['data' => RecurringExpense::create($data + ['is_active' => true])->load('category:id,name')], 201);
    }

    public function updateRecurring(Request $request, RecurringExpense $recurring): JsonResponse
    {
        $this->admin($request);
        $data = collect($this->validExpense($request, true))->except('spent_at')->all();
        $data += $request->validate(['is_active' => ['sometimes', 'boolean']]);
        $recurring->update($data);

        return response()->json(['data' => $recurring->load('category:id,name')]);
    }

    public function destroyRecurring(Request $request, RecurringExpense $recurring): JsonResponse
    {
        $this->admin($request);
        $recurring->delete();

        return response()->json(null, 204);
    }

    // ---- payouts ---------------------------------------------------------------------

    /** GET /payouts?period=&doctor_id= */
    public function payouts(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => DoctorPayout::with('doctor:id,full_name')
            ->when($request->query('period'), fn ($q, $p) => $q->where('period', $p))
            ->when($request->query('doctor_id'), fn ($q, $d) => $q->where('doctor_id', $d))
            ->orderByDesc('paid_at')->get()]);
    }

    public function storePayout(Request $request): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate([
            'doctor_id' => ['required', 'uuid', 'exists:doctors,id'],
            'period' => ['nullable', 'date_format:Y-m'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'currency' => ['required', Rule::in(['SYP', 'USD'])],
            'paid_at' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $payout = DoctorPayout::create($data + ['created_by' => $request->user()->id]);
        Activity::log('created', 'settings', $payout->id,
            'دفع لـ'.Activity::doctorName(Doctor::withTrashed()->whereKey($payout->doctor_id)->value('full_name')).' '.Activity::money($payout->amount, $payout->currency)
            .($payout->period ? ' عن شهر '.$payout->period : ''),
            ['doctor_id' => $payout->doctor_id, 'is_money' => true]);

        return response()->json(['data' => $payout->load('doctor:id,full_name')], 201);
    }

    public function destroyPayout(Request $request, DoctorPayout $payout): JsonResponse
    {
        $this->admin($request);
        $payout->delete();
        Activity::log('deleted', 'settings', $payout->id,
            'حذف دفعة لـ'.Activity::doctorName(Doctor::withTrashed()->whereKey($payout->doctor_id)->value('full_name')).' '.Activity::money($payout->amount, $payout->currency),
            ['doctor_id' => $payout->doctor_id, 'is_money' => true]);

        return response()->json(null, 204);
    }

    // ---- helpers -----------------------------------------------------------------

    private function admin(Request $request): void
    {
        abort_unless($request->user()->isSuperAdmin(), 403, 'المالية للمدير فقط');
    }

    private function validCategory(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:100'],
            'default_allocation' => ['sometimes', Rule::in(ExpenseCategory::ALLOCATIONS)],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function validExpense(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'category_id' => [$req, 'uuid', 'exists:expense_categories,id'],
            'amount' => [$req, 'numeric', 'gt:0'],
            'currency' => [$req, Rule::in(['SYP', 'USD'])],
            'spent_at' => [$partial ? 'sometimes' : 'nullable', 'date'],
            'allocation' => [$req, Rule::in(ExpenseCategory::ALLOCATIONS)],
            'doctor_id' => ['nullable', 'uuid', 'exists:doctors,id', 'required_if:allocation,doctor'],
            'specialty_id' => ['nullable', 'uuid', 'exists:specialties,id', 'required_if:allocation,specialty'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        if (! $partial) {
            $data['spent_at'] ??= now(config('clinic.timezone'))->toDateString();
        }
        // Keep the targets consistent with the allocation.
        if (isset($data['allocation'])) {
            if ($data['allocation'] !== 'doctor') {
                $data['doctor_id'] = null;
            }
            if ($data['allocation'] !== 'specialty') {
                $data['specialty_id'] = null;
            }
        }

        return $data;
    }

    private function assertOpen(SettlementService $s, mixed $date): void
    {
        $period = Carbon::parse($date)->format('Y-m');
        if ($s->isClosed($period)) {
            throw ValidationException::withMessages(['spent_at' => ['شهر '.$period.' مغلق: أعد فتحه من التسوية الشهرية أولاً']]);
        }
    }
}
