<?php

namespace App\Policies;

class DoctorPolicy extends ClinicPolicy
{
    protected string $resource = 'doctors';

    protected string $scope = 'none';
}
