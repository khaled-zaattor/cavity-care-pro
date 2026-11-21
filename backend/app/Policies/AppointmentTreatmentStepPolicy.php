<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class AppointmentTreatmentStepPolicy extends ClinicPolicy
{
    protected string $resource = 'appointment_treatment_steps';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->appointment?->doctor_id;
    }
}
