<?php

namespace App\Policies;

use App\Models\SubTreatment;
use App\Models\User;

/** Same rules as the parent treatment. */
class SubTreatmentPolicy
{
    public function __construct(private readonly TreatmentPolicy $treatments) {}

    public function viewAny(User $user): bool
    {
        return $this->treatments->viewAny($user);
    }

    public function view(User $user, SubTreatment $sub): bool
    {
        return $this->treatments->view($user, $sub->treatment);
    }

    public function create(User $user): bool
    {
        return $this->treatments->create($user);
    }

    public function store(User $user, SubTreatment $sub): bool
    {
        return $this->treatments->canWrite($user, $sub->treatment, 'create');
    }

    public function update(User $user, SubTreatment $sub): bool
    {
        return $this->treatments->canWrite($user, $sub->treatment, 'update');
    }

    public function delete(User $user, SubTreatment $sub): bool
    {
        return $this->treatments->canWrite($user, $sub->treatment, 'delete');
    }
}
