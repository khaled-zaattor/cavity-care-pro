<?php

namespace App\Services;

use App\Models\Expense;
use App\Models\RecurringExpense;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Turns the active monthly templates (rent…) into expenses dated the 1st of
 * a month. The admin runs it from المالية (no cron job needed); safe to run
 * again: a template is posted at most once per month, and any month can be
 * posted later (a forgotten month is not skipped).
 */
class RecurringExpenseService
{
    /** Active templates not yet posted for $period (YYYY-MM). */
    public function pending(string $period): Collection
    {
        $posted = $this->postedIds($period);

        return RecurringExpense::where('is_active', true)->get()
            ->reject(fn (RecurringExpense $r) => $posted->contains($r->id))
            ->values();
    }

    /** IDs of the templates that already have an expense in $period. */
    public function postedIds(string $period): Collection
    {
        return Expense::whereNotNull('recurring_expense_id')
            ->whereDate('spent_at', $period.'-01')
            ->pluck('recurring_expense_id');
    }

    /** @return int number of expenses created */
    public function generate(string $period, ?string $userId = null): int
    {
        $created = 0;
        foreach ($this->pending($period) as $r) {
            DB::transaction(function () use ($r, $period, $userId, &$created) {
                Expense::create([
                    'category_id' => $r->category_id,
                    'amount' => $r->amount,
                    'currency' => $r->currency,
                    'spent_at' => $period.'-01',
                    'allocation' => $r->allocation,
                    'doctor_id' => $r->doctor_id,
                    'specialty_id' => $r->specialty_id,
                    'recurring_expense_id' => $r->id,
                    'notes' => $r->notes,
                    'created_by' => $userId,
                ]);
                if (! $r->last_generated_period || $r->last_generated_period < $period) {
                    $r->update(['last_generated_period' => $period]);
                }
                $created++;
            });
        }

        return $created;
    }
}
