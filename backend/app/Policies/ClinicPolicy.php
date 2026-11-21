<?php

namespace App\Policies;

use App\Models\User;
use App\Support\DoctorBooks;
use App\Support\Permissions;
use Illuminate\Database\Eloquent\Model;

/**
 * Base policy = role matrix (config/clinic.php) AND independent-doctor scope.
 *
 * Subclasses set $resource and implement doctorIdOf() + $scope:
 *   'books'    -> DoctorBooks::canSeeBooks      (money, records)
 *   'schedule' -> DoctorBooks::canSeeSchedule   (appointments)
 *   'none'     -> shared data (patients, waiting room)
 */
abstract class ClinicPolicy
{
    protected string $resource;

    protected string $scope = 'none';

    /** Doctor that owns this row (NULL = clinic). */
    protected function doctorIdOf(Model $model): ?string
    {
        return null;
    }

    protected function inScope(User $user, Model $model): bool
    {
        $books = DoctorBooks::for($user);
        $doctorId = $this->doctorIdOf($model);

        return match ($this->scope) {
            'books' => $books->canSeeBooks($doctorId),
            'schedule' => $books->canSeeSchedule($doctorId),
            default => true,
        };
    }

    public function viewAny(User $user): bool
    {
        return Permissions::allows($user, $this->resource, 'view');
    }

    public function view(User $user, Model $model): bool
    {
        return Permissions::allows($user, $this->resource, 'view') && $this->inScope($user, $model);
    }

    public function create(User $user): bool
    {
        return Permissions::allows($user, $this->resource, 'create');
    }

    /** Check a new row before saving (Supabase WITH CHECK). */
    public function store(User $user, Model $model): bool
    {
        return Permissions::allows($user, $this->resource, 'create') && $this->inScope($user, $model);
    }

    public function update(User $user, Model $model): bool
    {
        return Permissions::allows($user, $this->resource, 'update') && $this->inScope($user, $model);
    }

    public function delete(User $user, Model $model): bool
    {
        return Permissions::allows($user, $this->resource, 'delete') && $this->inScope($user, $model);
    }
}
