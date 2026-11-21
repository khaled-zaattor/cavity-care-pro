<?php

namespace App\Support;

use App\Models\User;

final class Permissions
{
    /** May this user's role perform $ability (view|create|update|delete) on $resource? */
    public static function allows(User $user, string $resource, string $ability): bool
    {
        if (! $user->is_active || $user->role === null) {
            return false;
        }

        $roles = config("clinic.permissions.$resource.$ability", []);

        return in_array($user->role, $roles, true);
    }
}
