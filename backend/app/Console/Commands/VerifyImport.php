<?php

namespace App\Console\Commands;

use App\Import\SupabaseVerifier;
use Illuminate\Console\Command;

class VerifyImport extends Command
{
    protected $signature = 'import:verify';

    protected $description = 'Compare Supabase and Laravel: row counts and every patient/doctor balance per currency';

    public function handle(): int
    {
        $result = (new SupabaseVerifier)->run();

        $this->table(['table', 'Supabase', 'Laravel', ''], array_map(fn ($c) => [
            $c['table'], $c['source'], $c['target'], $c['source'] === $c['target'] ? 'OK' : 'DIFF',
        ], $result['counts']));

        if ($result['problems'] === []) {
            $this->info('✔ Verified: row counts and every patient and doctor balance match exactly.');

            return self::SUCCESS;
        }

        $this->error(count($result['problems']).' problem(s):');
        foreach ($result['problems'] as $problem) {
            $this->line("  - $problem");
        }

        return self::FAILURE;
    }
}
