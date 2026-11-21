<?php

namespace App\Providers;

use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\User;
use App\Observers\ActivityObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login throttle. Defined here, not in bootstrap/app.php's routing
        // callback: that callback is skipped once routes are cached
        // (php artisan route:cache on the server), which broke every login.
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute(20)->by($request->ip()),
        ]);

        // سجل النشاطات: one readable line per meaningful change.
        foreach ([
            Appointment::class, Payment::class, TreatmentRecord::class,
            TreatmentPlan::class, Patient::class, Doctor::class, User::class,
        ] as $model) {
            $model::observe(ActivityObserver::class);
        }
    }
}
