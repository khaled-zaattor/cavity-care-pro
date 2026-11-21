<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Medicine extends Model
{
    use HasUuids;

    protected $fillable = [
        'trade_name', 'generic_name', 'form', 'strength', 'default_dose', 'default_frequency',
        'default_duration', 'notes', 'specialty_id', 'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    /** "Amoxil 500 mg" — the name printed on prescriptions. */
    public function displayName(): string
    {
        return trim($this->trade_name.' '.($this->strength ?? ''));
    }
}
