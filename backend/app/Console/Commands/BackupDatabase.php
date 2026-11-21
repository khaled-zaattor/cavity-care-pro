<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

/**
 * Daily MySQL dump (gzip) into storage/app/private/backups, keeping the last
 * N days. Scheduled in routes/console.php; on the server a single cron line
 * runs `php artisan schedule:run` every minute.
 *
 * The password is passed through MYSQL_PWD (never on the command line, so it
 * does not show in the process list).
 *
 * Copy the backups off the server regularly (plan §3.7) — a backup that lives
 * only on the same disk does not survive losing the hosting account.
 */
class BackupDatabase extends Command
{
    protected $signature = 'clinic:backup {--keep= : Days to keep (default from config clinic.backup_keep_days)}';

    protected $description = 'Dump the MySQL database to storage/app/private/backups (gzip) and prune old dumps';

    public function handle(): int
    {
        $db = config('database.connections.'.config('database.default'));
        if (($db['driver'] ?? null) !== 'mysql' && ($db['driver'] ?? null) !== 'mariadb') {
            $this->error('clinic:backup only supports MySQL/MariaDB.');

            return self::FAILURE;
        }

        $dir = storage_path('app/private/backups');
        File::ensureDirectoryExists($dir);
        $file = $dir.'/'.$db['database'].'-'.now(config('clinic.timezone'))->format('Ymd-His').'.sql.gz';

        $dump = new Process([
            config('clinic.mysqldump_path'),
            '--host='.$db['host'],
            '--port='.$db['port'],
            '--user='.$db['username'],
            '--single-transaction',
            '--quick',
            '--routines',
            '--no-tablespaces',
            '--default-character-set=utf8mb4',
            $db['database'],
        ], null, ['MYSQL_PWD' => (string) $db['password']], null, 600);

        $out = gzopen($file, 'wb6');
        $dump->run(function ($type, $buffer) use ($out) {
            if ($type === Process::OUT) {
                gzwrite($out, $buffer);
            }
        });
        gzclose($out);

        if (! $dump->isSuccessful()) {
            File::delete($file);
            $this->error('mysqldump failed: '.trim($dump->getErrorOutput()));

            return self::FAILURE;
        }

        $keep = (int) ($this->option('keep') ?? config('clinic.backup_keep_days'));
        $pruned = 0;
        foreach (File::glob($dir.'/*.sql.gz') as $old) {
            if (filemtime($old) < now()->subDays($keep)->getTimestamp()) {
                File::delete($old);
                $pruned++;
            }
        }

        $this->info(sprintf('Backup written: %s (%s KB). Pruned %d old file(s).', basename($file), number_format(filesize($file) / 1024), $pruned));

        return self::SUCCESS;
    }
}
