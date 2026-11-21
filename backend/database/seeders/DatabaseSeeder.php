<?php

namespace Database\Seeders;

use App\Models\Specialty;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Reference data only — safe to run on production (idempotent).
     * Users, doctors and clinical data come from the Supabase import.
     */
    public function run(): void
    {
        Specialty::updateOrCreate(['code' => 'dental'], [
            'name_ar' => 'طب الأسنان', 'name_en' => 'Dentistry', 'is_dental' => true, 'color' => '#0ea5e9', 'sort_order' => 1,
        ]);
        Specialty::updateOrCreate(['code' => 'pediatrics'], [
            'name_ar' => 'طب الأطفال', 'name_en' => 'Pediatrics', 'is_dental' => false, 'color' => '#22c55e', 'sort_order' => 2,
        ]);
    }
}
