<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Written only by App\Support\Activity; never edited. */
class ActivityLog extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'user_name', 'event', 'subject_type', 'subject_id', 'patient_id', 'doctor_id',
        'description', 'properties', 'is_money',
    ];

    protected function casts(): array
    {
        return ['properties' => 'array', 'is_money' => 'boolean', 'created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return DoctorBooks::for($user)->scopeBooks($query, 'activity_logs.doctor_id');
    }
}
