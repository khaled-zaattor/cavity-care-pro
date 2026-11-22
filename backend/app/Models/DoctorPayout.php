<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Money the clinic actually paid a doctor. */
class DoctorPayout extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = ['doctor_id', 'period', 'amount', 'currency', 'paid_at', 'notes', 'created_by'];

    protected function casts(): array
    {
        return ['amount' => 'float', 'paid_at' => 'date:Y-m-d'];
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }
}
