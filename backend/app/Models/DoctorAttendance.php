<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One check-in/check-out span of a doctor (minutes filled on check-out). */
class DoctorAttendance extends Model
{
    use HasUuids;

    protected $fillable = ['doctor_id', 'date', 'check_in', 'check_out', 'minutes', 'source', 'entered_by', 'notes'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'check_in' => 'datetime', 'check_out' => 'datetime', 'minutes' => 'integer'];
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    /** Recompute minutes from the two times. */
    public function syncMinutes(): void
    {
        $this->minutes = $this->check_out ? max(0, (int) round($this->check_in->diffInMinutes($this->check_out, true))) : null;
    }
}
