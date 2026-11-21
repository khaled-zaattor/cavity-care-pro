<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * New readable activity log (docs/LARAVEL_MIGRATION_PLAN.md §2.5).
 * One row per meaningful action, with a ready-made Arabic sentence.
 * patient_id / doctor_id are copied in so the page can filter without joins
 * and keep working after the patient or doctor is deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('user_name')->nullable(); // kept if the user is deleted later
            $table->string('event', 20);             // created | updated | deleted | imported
            $table->string('subject_type', 40);      // appointment | payment | treatment_record | ...
            $table->uuid('subject_id')->nullable();
            $table->uuid('patient_id')->nullable()->index();
            $table->uuid('doctor_id')->nullable()->index();
            $table->text('description');
            $table->json('properties')->nullable();  // old/new values for edits
            $table->boolean('is_money')->default(false);
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['subject_type', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
