<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UnfinishedSubTreatment extends Model
{
    use HasUuids;

    protected $fillable = [
        'patient_id', 'treatment_id', 'sub_treatment_id', 'tooth_number', 'last_appointment_id',
        'is_marked_complete', 'notes', 'started_at',
    ];

    protected function casts(): array
    {
        return ['is_marked_complete' => 'boolean', 'started_at' => 'datetime'];
    }

    public function treatment(): BelongsTo
    {
        return $this->belongsTo(Treatment::class);
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->whereHas('treatment', fn (Builder $q) => DoctorBooks::for($user)->scopeBooks($q, 'treatments.doctor_id'));
    }
}
