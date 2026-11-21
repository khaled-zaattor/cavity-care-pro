<?php

namespace App\Policies;

use App\Models\SubTreatmentStep;
use App\Models\User;

/** Same rules as the grand-parent treatment. */
class SubTreatmentStepPolicy
{
    public function __construct(private readonly TreatmentPolicy $treatments) {}

    public function viewAny(User $user): bool
    {
        return $this->treatments->viewAny($user);
    }

    public function view(User $user, SubTreatmentStep $step): bool
    {
        return $this->treatments->view($user, $step->subTreatment->treatment);
    }

    public function create(User $user): bool
    {
        return $this->treatments->create($user);
    }

    public function store(User $user, SubTreatmentStep $step): bool
    {
        return $this->treatments->canWrite($user, $step->subTreatment->treatment, 'create');
    }

    public function update(User $user, SubTreatmentStep $step): bool
    {
        return $this->treatments->canWrite($user, $step->subTreatment->treatment, 'update');
    }

    public function delete(User $user, SubTreatmentStep $step): bool
    {
        return $this->treatments->canWrite($user, $step->subTreatment->treatment, 'delete');
    }
}
