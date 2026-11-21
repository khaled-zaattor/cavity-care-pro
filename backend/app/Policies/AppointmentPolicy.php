<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class AppointmentPolicy extends ClinicPolicy
{
    protected string $resource = 'appointments';

    protected string $scope = 'schedule';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->doctor_id;
    }
}
