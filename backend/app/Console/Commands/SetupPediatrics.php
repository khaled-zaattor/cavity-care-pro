<?php

namespace App\Console\Commands;

use App\Models\Doctor;
use App\Models\Specialty;
use App\Models\SubTreatment;
use App\Models\Treatment;
use Illuminate\Console\Command;

/**
 * Phase H (decision 2026-11-20): the children's doctor starts with a simple
 * catalog — «معاينة وفحص». Run after creating the doctor (and their login):
 *
 *   php artisan clinic:setup-pediatrics "د. سمر"            # by name
 *   php artisan clinic:setup-pediatrics <doctor-uuid> --price=50000
 *
 * Gives the doctor the طب الأطفال specialty and, if they keep their own books,
 * creates the treatment in THEIR catalog (otherwise in the clinic catalog).
 * Safe to run again.
 */
class SetupPediatrics extends Command
{
    protected $signature = 'clinic:setup-pediatrics {doctor : Doctor id or exact full name}
        {--price= : Default price in SYP for the examination}
        {--own-books : Also mark the doctor as keeping separate books}';

    protected $description = 'Give the children\'s doctor the pediatrics specialty and a starter catalog (معاينة وفحص)';

    public function handle(): int
    {
        $key = $this->argument('doctor');
        $doctor = Doctor::whereKey($key)->first() ?? Doctor::where('full_name', $key)->first();
        if (! $doctor) {
            $this->error("Doctor not found: $key");

            return self::FAILURE;
        }
        $kids = Specialty::where('code', 'pediatrics')->first();
        if (! $kids) {
            $this->error('Specialty "pediatrics" missing: run php artisan db:seed first.');

            return self::FAILURE;
        }

        if ($this->option('own-books')) {
            $doctor->update(['has_own_books' => true]);
        }
        $isPrimary = ! $doctor->specialties()->exists();
        $doctor->specialties()->syncWithoutDetaching([$kids->id => ['is_primary' => $isPrimary]]);

        $owner = $doctor->has_own_books ? $doctor->id : null;
        $treatment = Treatment::firstOrCreate(
            ['name' => 'معاينة وفحص', 'doctor_id' => $owner, 'specialty_id' => $kids->id],
            ['description' => 'كشف طبيب الأطفال']
        );
        $price = $this->option('price') !== null ? (float) $this->option('price') : null;
        $sub = SubTreatment::firstOrCreate(
            ['treatment_id' => $treatment->id, 'name' => 'معاينة وفحص'],
            ['tooth_association' => 'not_related', 'estimated_cost_syp' => $price]
        );
        if ($price !== null && (float) $sub->estimated_cost_syp !== $price) {
            $sub->update(['estimated_cost_syp' => $price]);
        }

        $this->info(sprintf('%s: specialty طب الأطفال%s, catalog «معاينة وفحص» in the %s catalog.',
            $doctor->full_name, $isPrimary ? ' (primary)' : '', $owner ? "doctor's own" : 'clinic'));

        return self::SUCCESS;
    }
}
