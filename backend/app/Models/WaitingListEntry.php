<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Shared waiting room: visible to every staff role. */
class WaitingListEntry extends Model
{
    use HasUuids;

    protected $table = 'waiting_list';

    protected $fillable = [
        'patient_id', 'appointment_id', 'doctor_id', 'clinic_arrival_time', 'examination_room_entry_time', 'status',
    ];

    protected function casts(): array
    {
        return ['clinic_arrival_time' => 'datetime', 'examination_room_entry_time' => 'datetime'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }
}
