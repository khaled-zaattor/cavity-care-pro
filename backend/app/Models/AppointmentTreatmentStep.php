<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppointmentTreatmentStep extends Model
{
    use HasUuids;

    protected $fillable = ['appointment_id', 'sub_treatment_step_id', 'is_completed', 'completed_at', 'notes'];

    protected function casts(): array
    {
        return ['is_completed' => 'boolean', 'completed_at' => 'datetime'];
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->whereHas('appointment', fn (Builder $q) => DoctorBooks::for($user)->scopeBooks($q, 'appointments.doctor_id'));
    }
}
