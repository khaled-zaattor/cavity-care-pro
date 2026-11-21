<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubTreatmentStep extends Model
{
    use HasUuids;

    protected $fillable = ['sub_treatment_id', 'step_name', 'step_description', 'step_order', 'completion_percentage'];

    protected function casts(): array
    {
        return ['step_order' => 'integer', 'completion_percentage' => 'float'];
    }

    public function subTreatment(): BelongsTo
    {
        return $this->belongsTo(SubTreatment::class);
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->whereHas('subTreatment', fn (Builder $q) => $q->visibleTo($user));
    }
}
