<?php

namespace App\Policies;

class RolePermissionPolicy extends ClinicPolicy
{
    protected string $resource = 'role_permissions';

    protected string $scope = 'none';
}
