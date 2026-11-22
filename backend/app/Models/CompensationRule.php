<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** "Dr X gets N% (of specialty S, or all) from date A to date B." */
class CompensationRule extends Model
{
    use HasUuids;

    protected $table = 'doctor_compensation_rules';

    protected $fillable = ['doctor_id', 'specialty_id', 'percent', 'effective_from', 'effective_to', 'notes'];

    protected function casts(): array
    {
        return ['percent' => 'float', 'effective_from' => 'date:Y-m-d', 'effective_to' => 'date:Y-m-d'];
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }
}
