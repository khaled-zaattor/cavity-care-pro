<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase G (plan §2.2, decisions 2026-11-20):
 *  - doctors are paid a fixed percentage per doctor (optionally per specialty)
 *    of the payments COLLECTED in the month
 *  - all charges are deducted first: direct charges of the doctor + a share
 *    of clinic-wide charges (rent, electricity…) split by WORK HOURS
 *  - attendance (check-in/out) gives the hours
 *  - a month can be closed: the computed figures are frozen
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('doctor_attendances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->date('date');                       // clinic-local day
            $table->dateTime('check_in');
            $table->dateTime('check_out')->nullable();
            $table->unsignedInteger('minutes')->nullable(); // filled on check-out
            $table->string('source', 20)->default('live'); // live | manual
            $table->foreignUuid('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notes', 500)->nullable();
            $table->timestamps();
            $table->index(['doctor_id', 'date']);
        });

        Schema::create('doctor_compensation_rules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->nullOnDelete(); // null = all
            $table->decimal('percent', 5, 2);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->string('notes', 500)->nullable();
            $table->timestamps();
            $table->index(['doctor_id', 'effective_from']);
        });

        Schema::create('expense_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('default_allocation', 20)->default('clinic_wide'); // clinic_wide | specialty | doctor
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('category_id')->constrained('expense_categories')->restrictOnDelete();
            $table->decimal('amount', 14, 2);
            $table->char('currency', 3)->default('SYP');
            $table->date('spent_at');
            $table->string('allocation', 20)->default('clinic_wide');
            $table->foreignUuid('doctor_id')->nullable()->constrained('doctors')->nullOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->nullOnDelete();
            $table->foreignUuid('recurring_expense_id')->nullable();
            $table->string('notes', 1000)->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index('spent_at');
        });

        // Monthly templates (rent…) turned into expenses on the 1st by the scheduler.
        Schema::create('recurring_expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('category_id')->constrained('expense_categories')->restrictOnDelete();
            $table->decimal('amount', 14, 2);
            $table->char('currency', 3)->default('SYP');
            $table->string('allocation', 20)->default('clinic_wide');
            $table->foreignUuid('doctor_id')->nullable()->constrained('doctors')->nullOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->nullOnDelete();
            $table->string('notes', 1000)->nullable();
            $table->boolean('is_active')->default(true);
            $table->char('last_generated_period', 7)->nullable(); // YYYY-MM
            $table->timestamps();
        });

        // Frozen figures of a closed month (one row per doctor and currency).
        Schema::create('settlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->char('period', 7);  // YYYY-MM
            $table->char('currency', 3);
            $table->decimal('revenue', 14, 2);
            $table->decimal('direct_expenses', 14, 2);
            $table->decimal('allocated_expenses', 14, 2);
            $table->decimal('carried_loss', 14, 2)->default(0);
            $table->decimal('net', 14, 2);
            $table->decimal('doctor_share', 14, 2);
            $table->decimal('clinic_share', 14, 2);
            $table->decimal('hours', 8, 2)->default(0);
            $table->json('details')->nullable();
            $table->dateTime('closed_at');
            $table->foreignUuid('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['doctor_id', 'period', 'currency']);
        });

        Schema::create('doctor_payouts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->char('period', 7)->nullable(); // which month it settles
            $table->decimal('amount', 14, 2);
            $table->char('currency', 3)->default('SYP');
            $table->date('paid_at');
            $table->string('notes', 1000)->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['doctor_id', 'period']);
        });
    }

    public function down(): void
    {
        foreach (['doctor_payouts', 'settlements', 'recurring_expenses', 'expenses', 'expense_categories', 'doctor_compensation_rules', 'doctor_attendances'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
