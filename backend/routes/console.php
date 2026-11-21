<?php

use Illuminate\Support\Facades\Schedule;

/*
| Scheduled tasks. On the server ONE cron entry drives all of them:
|   * * * * * cd /path/to/app/current && php artisan schedule:run >> /dev/null 2>&1
*/

// Daily database backup at 03:00 clinic time, keeping 14 days.
Schedule::command('clinic:backup')
    ->dailyAt('03:00')
    ->timezone(config('clinic.timezone'))
    ->withoutOverlapping()
    ->onOneServer();
