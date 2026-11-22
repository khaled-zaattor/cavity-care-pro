<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Monthly template (rent…): php artisan clinic:recurring-expenses copies it on the 1st. */
class RecurringExpense extends Model
{
    use HasUuids;

    protected $fillable = [
        'category_id', 'amount', 'currency', 'allocation', 'doctor_id', 'specialty_id', 'notes', 'is_active', 'last_generated_period',
    ];

    protected function casts(): array
    {
        return ['amount' => 'float', 'is_active' => 'boolean'];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class);
    }
}
