<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appointment extends Model
{
    use HasUuids;

    protected $fillable = ['patient_id', 'doctor_id', 'specialty_id', 'scheduled_at', 'status', 'notes'];

    protected function casts(): array
    {
        return ['scheduled_at' => 'datetime'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    public function treatmentRecords(): HasMany
    {
        return $this->hasMany(TreatmentRecord::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /** Schedule visibility (Supabase can_see_doctor_schedule). */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return DoctorBooks::for($user)->scopeSchedule($query, 'appointments.doctor_id');
    }
}
