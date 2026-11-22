<?php

namespace App\Console\Commands;

use App\Services\RecurringExpenseService;
use Illuminate\Console\Command;

/**
 * Same as the «إضافة مصاريف الشهر» button in المالية. Safe to run repeatedly.
 */
class GenerateRecurringExpenses extends Command
{
    protected $signature = 'clinic:recurring-expenses {--period= : YYYY-MM (default: current month, clinic time)}';

    protected $description = 'Create a month\'s expenses from the active recurring templates';

    public function handle(RecurringExpenseService $service): int
    {
        $period = $this->option('period') ?: now(config('clinic.timezone'))->format('Y-m');
        $created = $service->generate($period);
        $this->info("Created $created expense(s) for $period.");

        return self::SUCCESS;
    }
}
