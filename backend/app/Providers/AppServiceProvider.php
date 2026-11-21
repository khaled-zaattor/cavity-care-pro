<?php

namespace App\Providers;

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
        // سجل النشاطات: one readable line per meaningful change.
        foreach ([
            \App\Models\Appointment::class, \App\Models\Payment::class, \App\Models\TreatmentRecord::class,
            \App\Models\TreatmentPlan::class, \App\Models\Patient::class, \App\Models\Doctor::class, \App\Models\User::class,
        ] as $model) {
            $model::observe(\App\Observers\ActivityObserver::class);
        }
    }
}
