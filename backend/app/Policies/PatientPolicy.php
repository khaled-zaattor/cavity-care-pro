<?php

namespace App\Policies;

class PatientPolicy extends ClinicPolicy
{
    protected string $resource = 'patients';

    protected string $scope = 'none';
}
