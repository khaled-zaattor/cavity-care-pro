<?php

namespace App\Policies;

use App\Models\Treatment;
use App\Models\User;
use App\Support\DoctorBooks;
use App\Support\Permissions;

/**
 * Treatment catalog, split by specialty only (2026-11-25).
 *  - read: role matrix AND the treatment's specialty is visible to the user
 *    (a doctor: their specialties; everyone else: all).
 *  - write: role matrix (super_admin), or an independent doctor on a
 *    treatment of one of their own specialties.
 * SubTreatment / SubTreatmentStep policies delegate here via owningTreatment().
 */
class TreatmentPolicy
{
    public function viewAny(User $user): bool
    {
        return Permissions::allows($user, 'treatments', 'view');
    }

    public function view(User $user, Treatment $treatment): bool
    {
        $ids = DoctorBooks::for($user)->catalogSpecialtyIds();

        return Permissions::allows($user, 'treatments', 'view')
            && ($ids === null || in_array($treatment->specialty_id, $ids, true));
    }

    public function create(User $user): bool
    {
        return Permissions::allows($user, 'treatments', 'create')
            || ($user->is_active && DoctorBooks::for($user)->isIndependentDoctor());
    }

    public function store(User $user, Treatment $treatment): bool
    {
        return $this->canWrite($user, $treatment, 'create');
    }

    public function update(User $user, Treatment $treatment): bool
    {
        return $this->canWrite($user, $treatment, 'update');
    }

    public function delete(User $user, Treatment $treatment): bool
    {
        return $this->canWrite($user, $treatment, 'delete');
    }

    public function canWrite(User $user, Treatment $treatment, string $ability): bool
    {
        if (! $user->is_active) {
            return false;
        }
        if (Permissions::allows($user, 'treatments', $ability)) {
            return true;
        }
        $books = DoctorBooks::for($user);

        return $books->isIndependentDoctor()
            && in_array($treatment->specialty_id, $books->currentSpecialtyIds(), true);
    }
}
