<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

/**
 * Load a .sql or .sql.gz dump into the configured MySQL database.
 * Used to restore a clinic:backup file, and on cutover night to load the
 * verified import made on another machine (deploy/README.md).
 * The password goes through MYSQL_PWD, never the command line.
 */
class RestoreDatabase extends Command
{
    protected $signature = 'clinic:restore {file : Path to a .sql or .sql.gz dump} {--force : Skip the confirmation}';

    protected $description = 'Replace the database contents with a dump file (.sql / .sql.gz)';

    public function handle(): int
    {
        $file = $this->argument('file');
        if (! is_file($file)) {
            $this->error("File not found: $file");

            return self::FAILURE;
        }

        $db = config('database.connections.'.config('database.default'));
        if (! in_array($db['driver'] ?? null, ['mysql', 'mariadb'], true)) {
            $this->error('clinic:restore only supports MySQL/MariaDB.');

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm("This REPLACES the data in database '{$db['database']}' with ".basename($file).'. Continue?')) {
            return self::FAILURE;
        }

        $mysql = new Process([
            config('clinic.mysql_path'),
            '--host='.$db['host'],
            '--port='.$db['port'],
            '--user='.$db['username'],
            '--default-character-set=utf8mb4',
            $db['database'],
        ], null, ['MYSQL_PWD' => (string) $db['password']], null, 1800);

        $gz = str_ends_with($file, '.gz');
        $in = $gz ? gzopen($file, 'rb') : fopen($file, 'rb');
        $mysql->setInput((function () use ($in, $gz) {
            while (! ($gz ? gzeof($in) : feof($in))) {
                yield $gz ? gzread($in, 1 << 20) : fread($in, 1 << 20);
            }
        })());
        $mysql->run();
        $gz ? gzclose($in) : fclose($in);

        if (! $mysql->isSuccessful()) {
            $this->error('mysql failed: '.trim($mysql->getErrorOutput()));

            return self::FAILURE;
        }

        $this->info('Restored '.basename($file)." into {$db['database']}.");

        return self::SUCCESS;
    }
}
