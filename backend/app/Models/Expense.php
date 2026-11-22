<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A charge: clinic_wide (split by work hours), specialty (split among that
 * specialty's doctors by hours) or doctor (charged to one doctor).
 */
class Expense extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'category_id', 'amount', 'currency', 'spent_at', 'allocation', 'doctor_id', 'specialty_id',
        'recurring_expense_id', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return ['amount' => 'float', 'spent_at' => 'date:Y-m-d'];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class);
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
