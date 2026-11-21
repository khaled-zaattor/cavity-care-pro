<?php

namespace App\Policies;

use App\Models\User;
use App\Support\Permissions;

/** User administration: super_admin only. */
class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return Permissions::allows($user, 'users', 'view');
    }

    public function create(User $user): bool
    {
        return Permissions::allows($user, 'users', 'create');
    }

    public function update(User $user, User $target): bool
    {
        return Permissions::allows($user, 'users', 'update');
    }

    public function resetPassword(User $user, User $target): bool
    {
        return Permissions::allows($user, 'users', 'update');
    }
}
