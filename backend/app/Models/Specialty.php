<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Specialty extends Model
{
    use HasUuids;

    protected $fillable = ['name_ar', 'name_en', 'code', 'is_dental', 'color', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return ['is_dental' => 'boolean', 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    public function doctors(): BelongsToMany
    {
        return $this->belongsToMany(Doctor::class)->withPivot('is_primary');
    }

    public function treatments(): HasMany
    {
        return $this->hasMany(Treatment::class);
    }
}
