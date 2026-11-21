<?php

namespace App\Policies;

use App\Models\Treatment;
use App\Models\User;
use App\Support\DoctorBooks;
use App\Support\Permissions;

/**
 * Treatment catalog.
 *  - read: role matrix AND can_read_treatment_catalog(doctor_id)
 *  - write: super_admin, or an independent doctor on their OWN catalog
 *    ("Independent doctors manage own treatments" policy in Supabase).
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
        return Permissions::allows($user, 'treatments', 'view')
            && DoctorBooks::for($user)->canReadCatalog($treatment->doctor_id);
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
        $books = DoctorBooks::for($user);

        if (Permissions::allows($user, 'treatments', $ability)) {
            return $books->canSeeBooks($treatment->doctor_id);
        }

        return $books->isIndependentDoctor()
            && $treatment->doctor_id !== null
            && $treatment->doctor_id === $books->currentDoctorId();
    }
}
