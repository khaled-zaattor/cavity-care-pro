<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class TreatmentRecord extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'appointment_id', 'patient_id', 'doctor_id', 'specialty_id', 'treatment_id', 'sub_treatment_id',
        'tooth_number', 'actual_cost_syp', 'actual_cost_usd', 'is_completed', 'performed_at', 'treatment_notes',
    ];

    protected function casts(): array
    {
        return [
            'actual_cost_syp' => 'float',
            'actual_cost_usd' => 'float',
            'is_completed' => 'boolean',
            'performed_at' => 'datetime',
        ];
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    public function treatment(): BelongsTo
    {
        return $this->belongsTo(Treatment::class);
    }

    public function subTreatment(): BelongsTo
    {
        return $this->belongsTo(SubTreatment::class);
    }

    /** Books visibility (Supabase can_see_doctor_books) on the doctor snapshot. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return DoctorBooks::for($user)->scopeBooks($query, 'treatment_records.doctor_id');
    }
}
