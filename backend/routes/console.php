<?php

use Illuminate\Support\Facades\Schedule;

/*
| Optional scheduled tasks — they run only if the host has the cron entry
|   * * * * * cd /path/to/app/current && php artisan schedule:run >> /dev/null 2>&1
| The clinic's Hostinger setup has NO cron job: the host backs up the database
| daily, and the admin posts the monthly fixed expenses with the button in
| المالية (POST /recurring-expenses/generate). Both commands still work by hand.
*/

// Daily database backup at 03:00 clinic time, keeping 14 days.
Schedule::command('clinic:backup')
    ->dailyAt('03:00')
    ->timezone(config('clinic.timezone'))
    ->withoutOverlapping()
    ->onOneServer();

// Monthly charges (rent…) from the recurring templates, on the 1st.
Schedule::command('clinic:recurring-expenses')
    ->monthlyOn(1, '00:30')
    ->timezone(config('clinic.timezone'))
    ->withoutOverlapping();
