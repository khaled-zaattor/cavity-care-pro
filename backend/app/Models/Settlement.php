<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Frozen month figures for one doctor and currency (written when the month is closed). */
class Settlement extends Model
{
    use HasUuids;

    protected $fillable = [
        'doctor_id', 'period', 'currency', 'revenue', 'direct_expenses', 'allocated_expenses', 'carried_loss',
        'net', 'doctor_share', 'clinic_share', 'hours', 'details', 'closed_at', 'closed_by',
    ];

    protected function casts(): array
    {
        return [
            'revenue' => 'float', 'direct_expenses' => 'float', 'allocated_expenses' => 'float', 'carried_loss' => 'float',
            'net' => 'float', 'doctor_share' => 'float', 'clinic_share' => 'float', 'hours' => 'float',
            'details' => 'array', 'closed_at' => 'datetime',
        ];
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }
}
