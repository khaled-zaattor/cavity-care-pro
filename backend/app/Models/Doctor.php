<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Doctor extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'user_id', 'full_name', 'email', 'phone_number', 'legacy_specialty',
        'has_own_books', 'print_header', 'signature_path',
    ];

    protected function casts(): array
    {
        return ['has_own_books' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function specialties(): BelongsToMany
    {
        return $this->belongsToMany(Specialty::class)->withPivot('is_primary');
    }

    public function primarySpecialty(): ?Specialty
    {
        return $this->specialties->firstWhere('pivot.is_primary', true) ?? $this->specialties->first();
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function treatments(): HasMany
    {
        return $this->hasMany(Treatment::class);
    }
}
