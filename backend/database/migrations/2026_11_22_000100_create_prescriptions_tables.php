<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase E (plan §2.3): medicines catalog, prescriptions, per-doctor
 * templates, and clinic settings for the printed A4 header.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medicines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('trade_name');
            $table->string('generic_name')->nullable();
            $table->string('form', 50)->nullable();       // tablet, syrup, drops, injection, cream, mouthwash…
            $table->string('strength', 100)->nullable();  // 500 mg, 250 mg/5 ml…
            $table->string('default_dose', 100)->nullable();
            $table->string('default_frequency', 100)->nullable();
            $table->string('default_duration', 100)->nullable();
            $table->text('notes')->nullable();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('trade_name');
            $table->index('generic_name');
        });

        Schema::create('prescriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedInteger('number')->unique(); // printed, sequential
            $table->foreignUuid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUuid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->nullOnDelete();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('diagnosis')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('issued_at');
            $table->dateTime('printed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['patient_id', 'issued_at']);
            $table->index(['doctor_id', 'issued_at']);
        });

        Schema::create('prescription_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('prescription_id')->constrained('prescriptions')->cascadeOnDelete();
            $table->foreignUuid('medicine_id')->nullable()->constrained('medicines')->nullOnDelete();
            $table->string('medicine_name'); // snapshot, also for medicines typed freely
            $table->string('dose', 100)->nullable();
            $table->string('frequency', 100)->nullable();
            $table->string('duration', 100)->nullable();
            $table->string('route', 50)->nullable();
            $table->string('quantity', 50)->nullable();
            $table->text('instructions')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('prescription_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->string('name');
            $table->text('diagnosis')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('prescription_template_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('prescription_template_id')->constrained('prescription_templates')->cascadeOnDelete();
            $table->foreignUuid('medicine_id')->nullable()->constrained('medicines')->nullOnDelete();
            $table->string('medicine_name');
            $table->string('dose', 100)->nullable();
            $table->string('frequency', 100)->nullable();
            $table->string('duration', 100)->nullable();
            $table->string('route', 50)->nullable();
            $table->string('quantity', 50)->nullable();
            $table->text('instructions')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // Simple key → value store (clinic name, address, phone, logo path…).
        Schema::create('clinic_settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['clinic_settings', 'prescription_template_items', 'prescription_templates', 'prescription_items', 'prescriptions', 'medicines'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
