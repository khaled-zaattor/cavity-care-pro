<?php

namespace App\Policies;

class SpecialtyPolicy extends ClinicPolicy
{
    protected string $resource = 'specialties';

    protected string $scope = 'none';
}
