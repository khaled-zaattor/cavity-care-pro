<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase F (plan §2.4): x-rays, lab tests, reports, photos per patient.
 * Files live on the private disk (storage/app/private/patients/<patient>/),
 * never in public_html; they are served through an authorised controller.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_files', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignUuid('doctor_id')->nullable()->constrained('doctors')->nullOnDelete();
            $table->foreignUuid('specialty_id')->nullable()->constrained('specialties')->nullOnDelete();
            $table->foreignUuid('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            // xray | radiology | lab_test | report | photo | prescription_scan | other
            $table->string('category', 30)->default('other');
            $table->string('title');
            $table->date('taken_at')->nullable();
            $table->text('notes')->nullable();
            $table->string('disk', 30)->default('local');
            $table->string('path');
            $table->string('thumbnail_path')->nullable();
            $table->string('original_name');
            $table->string('mime', 100);
            $table->unsignedBigInteger('size');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['patient_id', 'taken_at']);
            $table->index(['patient_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_files');
    }
};
