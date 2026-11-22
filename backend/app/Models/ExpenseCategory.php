<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ExpenseCategory extends Model
{
    use HasUuids;

    public const ALLOCATIONS = ['clinic_wide', 'specialty', 'doctor'];

    protected $fillable = ['name', 'default_allocation', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
