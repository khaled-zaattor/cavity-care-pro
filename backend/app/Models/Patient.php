<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Patients are shared by every doctor (including independent ones). */
class Patient extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'full_name', 'date_of_birth', 'phone_number', 'address', 'contact', 'job',
        'medical_notes', 'accessed_by_user_id', 'last_accessed_at',
    ];

    protected function casts(): array
    {
        return ['date_of_birth' => 'date', 'last_accessed_at' => 'datetime'];
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function treatmentRecords(): HasMany
    {
        return $this->hasMany(TreatmentRecord::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
