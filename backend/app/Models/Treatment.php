<?php

namespace App\Models;

use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Treatment extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = ['name', 'description', 'doctor_id', 'specialty_id'];

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    public function subTreatments(): HasMany
    {
        return $this->hasMany(SubTreatment::class);
    }

    /** Catalog read visibility: by specialty only (see DoctorBooks::catalogSpecialtyIds). */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        $ids = DoctorBooks::for($user)->catalogSpecialtyIds();

        return $ids === null ? $query : $query->whereIn('treatments.specialty_id', $ids);
    }
}
