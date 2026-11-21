<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TreatmentPlan extends Model
{
    use HasUuids;

    protected $fillable = [
        'patient_id', 'treatment_id', 'sub_treatment_id', 'tooth_number', 'appointment_id', 'is_executed', 'executed_at',
    ];

    protected function casts(): array
    {
        return ['is_executed' => 'boolean', 'executed_at' => 'datetime'];
    }

    public function treatment(): BelongsTo
    {
        return $this->belongsTo(Treatment::class);
    }

    /** Scoped by the treatment's catalog owner (books rule, as in Supabase). */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->whereHas('treatment', fn (Builder $q) => DoctorBooks::for($user)->scopeBooks($q, 'treatments.doctor_id'));
    }
}
