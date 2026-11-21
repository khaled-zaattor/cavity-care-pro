<?php

namespace App\Console\Commands;

use App\Import\SupabaseImporter;
use Illuminate\Console\Command;

class ImportSupabase extends Command
{
    protected $signature = 'import:supabase
        {--fresh : Empty the Laravel clinic tables (and users) first — use for the final cutover run}
        {--force : Allow --fresh when APP_ENV=production}';

    protected $description = 'Copy all data from Supabase into the Laravel database (same IDs, idempotent)';

    public function handle(): int
    {
        $fresh = (bool) $this->option('fresh');

        if ($fresh && app()->isProduction() && ! $this->option('force')) {
            $this->error('--fresh empties the production database first. Re-run with --force if that is intended.');

            return self::FAILURE;
        }

        $this->info('Source: '.config('import.source_connection').'  →  Target: '.config('database.default').' ('.config('database.connections.'.config('database.default').'.database').')');

        $report = (new SupabaseImporter(fn (string $line) => $this->line($line, verbosity: 'v')))->run($fresh);

        $rows = [];
        $skipped = 0;
        foreach ($report as $table => $r) {
            $rows[] = [$table, $r['read'], $r['written'], count($r['skipped'])];
            $skipped += count($r['skipped']);
        }
        $this->table(['table', 'read', 'written', 'skipped'], $rows);

        foreach ($report as $table => $r) {
            foreach ($r['skipped'] as $line) {
                $this->warn("skipped $table $line");
            }
            foreach ($r['notes'] ?? [] as $line) {
                $this->comment("note $table: $line");
            }
        }

        $skipped === 0
            ? $this->info('Import finished with no skipped rows. Now run: php artisan import:verify')
            : $this->warn("Import finished with $skipped skipped rows (listed above). Run php artisan import:verify.");

        return self::SUCCESS;
    }
}
