<?php

namespace App\Console\Commands;

use App\Models\Expense;
use App\Models\RecurringExpense;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Turn active monthly templates (rent…) into expenses dated the 1st of the
 * month. Safe to run repeatedly: each template is generated once per month.
 * Scheduled on the 1st (routes/console.php).
 */
class GenerateRecurringExpenses extends Command
{
    protected $signature = 'clinic:recurring-expenses {--period= : YYYY-MM (default: current month, clinic time)}';

    protected $description = 'Create this month\'s expenses from the active recurring templates';

    public function handle(): int
    {
        $period = $this->option('period') ?: now(config('clinic.timezone'))->format('Y-m');
        $created = 0;

        RecurringExpense::where('is_active', true)
            ->where(fn ($q) => $q->whereNull('last_generated_period')->orWhere('last_generated_period', '<', $period))
            ->get()
            ->each(function (RecurringExpense $r) use ($period, &$created) {
                DB::transaction(function () use ($r, $period, &$created) {
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
                    ]);
                    $r->update(['last_generated_period' => $period]);
                    $created++;
                });
            });

        $this->info("Created $created expense(s) for $period.");

        return self::SUCCESS;
    }
}
