<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 2026-11-25 requests from the clinic:
 *  - Gynecology profile per patient (smoker, marital status, obstetric
 *    history, medical/surgical/family/allergy/drug history, weight, BP).
 *  - The treatment catalog is split by specialty only: every doctor of a
 *    specialty sees that specialty's treatments. Doctor-owned catalogs
 *    (treatments.doctor_id) are folded into the shared catalog. Money stays
 *    separate (doctors.has_own_books is unchanged).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_gynecology_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('patient_id')->unique()->constrained('patients')->cascadeOnDelete();
            $table->boolean('is_smoker')->nullable();
            $table->string('marital_status', 20)->nullable(); // single | married
            $table->unsignedSmallInteger('pregnancies')->nullable();        // عدد الحمول
            $table->unsignedSmallInteger('living_children')->nullable();    // عدد الأولاد الأحياء
            $table->unsignedSmallInteger('abortions')->nullable();          // عدد الإجهاضات
            $table->unsignedSmallInteger('preterm_births')->nullable();     // عدد الولادات الباكرة
            $table->text('medical_history')->nullable();
            $table->text('surgical_history')->nullable();
            $table->text('family_history')->nullable();
            $table->text('allergy_history')->nullable();
            $table->text('medication_history')->nullable();
            $table->decimal('weight_kg', 5, 1)->nullable();
            $table->string('blood_pressure', 20)->nullable();               // e.g. 120/80
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Fold doctor-owned catalogs into the shared, specialty-split catalog.
        // A treatment whose specialty the owner doesn't practise moves to the
        // owner's primary specialty (e.g. a doctor switched from أطفال to نسائي).
        $owned = DB::table('treatments')->whereNotNull('doctor_id')->get(['id', 'doctor_id', 'specialty_id']);
        foreach ($owned as $t) {
            $specialties = DB::table('doctor_specialty')->where('doctor_id', $t->doctor_id)
                ->orderByDesc('is_primary')->pluck('specialty_id')->all();
            $update = ['doctor_id' => null];
            if ($specialties !== [] && ! in_array($t->specialty_id, $specialties, true)) {
                $update['specialty_id'] = $specialties[0];
            }
            DB::table('treatments')->where('id', $t->id)->update($update);
        }
        // Records keep the specialty of the treatment they were made with.
        foreach ($owned as $t) {
            $specialtyId = DB::table('treatments')->where('id', $t->id)->value('specialty_id');
            DB::table('treatment_records')->where('treatment_id', $t->id)->update(['specialty_id' => $specialtyId]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_gynecology_profiles');
    }
};
