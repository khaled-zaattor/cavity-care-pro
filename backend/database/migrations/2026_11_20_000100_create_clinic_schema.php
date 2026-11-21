<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror of the Supabase public schema (same table names, columns and UUIDs)
 * plus the additions from docs/LARAVEL_MIGRATION_PLAN.md §2.1–2.2:
 *   - specialties + doctor_specialty
 *   - treatments.specialty_id, appointments.specialty_id
 *   - doctor/patient/specialty snapshots on treatment_records and payments
 *   - nullable tooth_number for non-dental records
 *   - soft deletes on clinical and financial rows
 *
 * Money columns are DECIMAL(14,2): SYP amounts reach millions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('role', ['super_admin', 'doctor', 'dentist_assistant', 'receptionist']);
            $table->string('resource');
            $table->boolean('can_create')->default(false);
            $table->boolean('can_update')->default(false);
            $table->boolean('can_delete')->default(false);
            $table->timestamps();
            $table->unique(['role', 'resource']);
        });

        Schema::create('specialties', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name_ar');
            $table->string('name_en')->nullable();
            $table->string('code', 50)->nullable()->unique();
            $table->boolean('is_dental')->default(false);
            $table->string('color', 20)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('doctors', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('full_name');
            $table->string('email')->nullable();
            $table->string('phone_number')->nullable();
            // Old free-text doctors.specialty, kept until the import is verified.
            $table->string('legacy_specialty')->nullable();
            // Independent doctor: own catalog, own money (see DoctorBooks).
            $table->boolean('has_own_books')->default(false);
            $table->text('print_header')->nullable();
            $table->string('signature_path')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('doctor_specialty', function (Blueprint $table) {
            $table->foreignUuid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->foreignUuid('specialty_id')->constrained('specialties')->restrictOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->primary(['doctor_id', 'specialty_id']);
        });

        Schema::create('patients', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('full_name');
            $table->date('date_of_birth')->nullable();
            $table->string('phone_number')->nullable()->index();
            $table->text('address')->nullable();
            $table->string('contact')->nullable();
            $table->string('job')->nullable();
            $table->text('medical_notes')->nullable();
            $table->foreignUuid('accessed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_accessed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index('full_name');
        });

        Schema::create('treatments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->text('description')->nullable();
            // NULL = clinic catalog; set = that independent doctor's private catalog.
            $table->foreignUuid('doctor_id')->nullable()->constrained('doctors')->restrictOnDelete();
            $table->foreignUuid('specialty_id')->constrained('specialties')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('sub_treatments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('treatment_id')->constrained('treatments')->cascadeOnDelete();
            $table->string('name');
            $table->decimal('estimated_cost_syp', 14, 2)->nullable();
            $table->decimal('estimated_cost_usd', 14, 2)->nullable();
            $table->enum('tooth_association', ['not_related', 'single_tooth', 'multiple_teeth'])->default('not_related');
            $table->timestamps();
        });

        Schema::create('sub_treatment_steps', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sub_treatment_id')->constrained('sub_treatments')->cascadeOnDelete();
            $table->string('step_name');
            $table->text('step_description')->nullable();
            $table->integer('step_order');
            $table->decimal('completion_percentage', 5, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('appointments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUuid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->restrictOnDelete();
            $table->dateTime('scheduled_at');
            $table->enum('status', ['Scheduled', 'Completed', 'Cancelled'])->default('Scheduled');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['doctor_id', 'scheduled_at']);
            $table->index('scheduled_at');
        });

        Schema::create('treatment_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            // Snapshots so money reports are a single GROUP BY.
            $table->foreignUuid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUuid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->restrictOnDelete();
            $table->foreignUuid('treatment_id')->constrained('treatments')->restrictOnDelete();
            $table->foreignUuid('sub_treatment_id')->constrained('sub_treatments')->restrictOnDelete();
            $table->string('tooth_number')->nullable(); // NULL for non-dental
            $table->decimal('actual_cost_syp', 14, 2)->nullable();
            $table->decimal('actual_cost_usd', 14, 2)->nullable();
            $table->boolean('is_completed')->default(false);
            $table->dateTime('performed_at');
            $table->text('treatment_notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['doctor_id', 'performed_at']);
            $table->index(['patient_id']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Required: no payment without an appointment (decision 2026-11-20).
            $table->foreignUuid('appointment_id')->constrained('appointments')->restrictOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUuid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->restrictOnDelete();
            $table->decimal('amount', 14, 2);
            $table->char('currency', 3)->default('SYP');
            $table->string('method', 30)->nullable();
            $table->foreignUuid('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->dateTime('paid_at');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['doctor_id', 'paid_at']);
            $table->index(['patient_id']);
        });

        Schema::create('treatment_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('treatment_id')->constrained('treatments')->restrictOnDelete();
            $table->foreignUuid('sub_treatment_id')->constrained('sub_treatments')->restrictOnDelete();
            $table->string('tooth_number')->nullable();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->boolean('is_executed')->default(false);
            $table->dateTime('executed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('appointment_treatment_steps', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->foreignUuid('sub_treatment_step_id')->constrained('sub_treatment_steps')->cascadeOnDelete();
            $table->boolean('is_completed')->default(false);
            $table->dateTime('completed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('unfinished_sub_treatments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('treatment_id')->constrained('treatments')->restrictOnDelete();
            $table->foreignUuid('sub_treatment_id')->constrained('sub_treatments')->restrictOnDelete();
            $table->string('tooth_number')->nullable();
            $table->foreignUuid('last_appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->boolean('is_marked_complete')->default(false);
            $table->text('notes')->nullable();
            $table->dateTime('started_at')->nullable();
            $table->timestamps();
        });

        Schema::create('waiting_list', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignUuid('doctor_id')->nullable()->constrained('doctors')->nullOnDelete();
            $table->dateTime('clinic_arrival_time');
            $table->dateTime('examination_room_entry_time')->nullable();
            $table->enum('status', ['waiting', 'in_examination', 'completed'])->default('waiting');
            $table->timestamps();
            $table->index(['status', 'clinic_arrival_time']);
        });

    }

    public function down(): void
    {
        foreach ([
            'waiting_list', 'unfinished_sub_treatments', 'appointment_treatment_steps',
            'treatment_plans', 'payments', 'treatment_records', 'appointments', 'sub_treatment_steps',
            'sub_treatments', 'treatments', 'patients', 'doctor_specialty', 'doctors', 'specialties',
            'role_permissions',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
