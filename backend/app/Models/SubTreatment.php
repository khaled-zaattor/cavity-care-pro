<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubTreatment extends Model
{
    use HasUuids;

    protected $fillable = ['treatment_id', 'name', 'estimated_cost_syp', 'estimated_cost_usd', 'tooth_association'];

    protected function casts(): array
    {
        return ['estimated_cost_syp' => 'float', 'estimated_cost_usd' => 'float'];
    }

    public function treatment(): BelongsTo
    {
        return $this->belongsTo(Treatment::class);
    }

    public function steps(): HasMany
    {
        return $this->hasMany(SubTreatmentStep::class)->orderBy('step_order');
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->whereHas('treatment', fn (Builder $q) => $q->visibleTo($user));
    }
}
