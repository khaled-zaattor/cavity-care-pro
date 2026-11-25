<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** الملف النسائي: one row per patient, filled by the gynecologist. */
class PatientGynecologyProfile extends Model
{
    use HasUuids;

    public const MARITAL_STATUSES = ['single', 'married'];

    protected $fillable = [
        'patient_id', 'is_smoker', 'marital_status', 'pregnancies', 'living_children', 'abortions',
        'preterm_births', 'medical_history', 'surgical_history', 'family_history', 'allergy_history',
        'medication_history', 'weight_kg', 'blood_pressure', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_smoker' => 'boolean',
            'pregnancies' => 'integer',
            'living_children' => 'integer',
            'abortions' => 'integer',
            'preterm_births' => 'integer',
            'weight_kg' => 'float',
        ];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
