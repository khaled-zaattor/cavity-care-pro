<?php

namespace App\Support;

use App\Models\Doctor;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Independent-doctor ("own books") visibility rules.
 *
 * Exact port of the Supabase helpers in
 * supabase/migrations/20261119120000_independent_doctors.sql:
 *
 *   can_see_doctor_books(doc)     -> canSeeBooks()   / scopeBooks()
 *   can_see_doctor_schedule(doc)  -> canSeeSchedule()/ scopeSchedule()
 *   can_read_treatment_catalog()  -> canReadCatalog()/ scopeCatalog()
 *
 * A NULL doctor id means "clinic" (e.g. the clinic treatment catalog).
 */
final class DoctorBooks
{
    /** @var array<string, self> per-request cache keyed by user id */
    private static array $instances = [];

    /** @var string[]|null ids of doctors with has_own_books */
    private ?array $independentIds = null;

    private ?Doctor $doctor;

    private function __construct(private readonly User $user)
    {
        $this->doctor = $user->doctor()->first();
    }

    public static function for(User $user): self
    {
        return self::$instances[$user->getKey()] ??= new self($user);
    }

    /** Call after changing doctors.has_own_books / user links (and between tests). */
    public static function flush(): void
    {
        self::$instances = [];
    }

    public function currentDoctorId(): ?string
    {
        return $this->doctor?->getKey();
    }

    /** @var string[]|null */
    private ?array $specialtyIds = null;

    /** Specialties of the logged-in doctor (empty when the user is not a doctor). */
    public function currentSpecialtyIds(): array
    {
        return $this->specialtyIds ??= $this->doctor
            ? $this->doctor->specialties()->pluck('specialties.id')->all()
            : [];
    }

    /**
     * Treatment catalog (2026-11-25): split by specialty only. A doctor sees
     * the treatments of their specialties; admin, reception and assistants
     * see every specialty. A doctor with no specialty set sees everything.
     */
    public function catalogSpecialtyIds(): ?array
    {
        if ($this->user->isSuperAdmin() || ! $this->user->hasRole(Role::DOCTOR)) {
            return null;
        }
        $ids = $this->currentSpecialtyIds();

        return $ids === [] ? null : $ids;
    }

    public function isIndependentDoctor(): bool
    {
        return (bool) $this->doctor?->has_own_books;
    }

    /** @return string[] */
    private function independentDoctorIds(): array
    {
        return $this->independentIds ??= Doctor::withTrashed()
            ->where('has_own_books', true)
            ->pluck('id')
            ->all();
    }

    // ------------------------------------------------------------------
    // Single-row checks (used by policies)
    // ------------------------------------------------------------------

    public function canSeeBooks(?string $doctorId): bool
    {
        if ($this->user->isSuperAdmin()) {
            return true;
        }
        if ($doctorId !== null && $doctorId === $this->currentDoctorId()) {
            return true;
        }
        if ($this->isIndependentDoctor()) {
            return false;
        }

        return $doctorId === null || ! in_array($doctorId, $this->independentDoctorIds(), true);
    }

    public function canSeeSchedule(?string $doctorId): bool
    {
        return $this->canSeeBooks($doctorId) || $this->user->hasRole(Role::RECEPTIONIST);
    }

    public function canReadCatalog(?string $doctorId): bool
    {
        return $this->canSeeBooks($doctorId) || $this->user->hasRole(Role::RECEPTIONIST);
    }

    // ------------------------------------------------------------------
    // Query scopes (used for listings) — same logic as SQL WHERE clauses
    // ------------------------------------------------------------------

    public function scopeBooks(Builder $query, string $column): Builder
    {
        if ($this->user->isSuperAdmin()) {
            return $query;
        }

        if ($this->isIndependentDoctor()) {
            return $query->where($column, $this->currentDoctorId());
        }

        $hidden = array_values(array_diff($this->independentDoctorIds(), array_filter([$this->currentDoctorId()])));
        if ($hidden === []) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q->whereNull($column)->orWhereNotIn($column, $hidden));
    }

    public function scopeSchedule(Builder $query, string $column): Builder
    {
        return $this->user->hasRole(Role::RECEPTIONIST) ? $query : $this->scopeBooks($query, $column);
    }

    public function scopeCatalog(Builder $query, string $column): Builder
    {
        return $this->user->hasRole(Role::RECEPTIONIST) ? $query : $this->scopeBooks($query, $column);
    }
}
