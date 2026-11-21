<?php

namespace App\Policies;

use App\Models\PrescriptionTemplate;
use App\Models\User;
use App\Support\DoctorBooks;
use App\Support\Permissions;

/** A doctor manages their own templates; super_admin manages all. */
class PrescriptionTemplatePolicy
{
    public function viewAny(User $user): bool
    {
        return Permissions::allows($user, 'prescription_templates', 'view');
    }

    public function create(User $user): bool
    {
        return Permissions::allows($user, 'prescription_templates', 'create');
    }

    public function update(User $user, PrescriptionTemplate $template): bool
    {
        return Permissions::allows($user, 'prescription_templates', 'update') && $this->owns($user, $template);
    }

    public function delete(User $user, PrescriptionTemplate $template): bool
    {
        return Permissions::allows($user, 'prescription_templates', 'delete') && $this->owns($user, $template);
    }

    private function owns(User $user, PrescriptionTemplate $template): bool
    {
        return $user->isSuperAdmin() || $template->doctor_id === DoctorBooks::for($user)->currentDoctorId();
    }
}
