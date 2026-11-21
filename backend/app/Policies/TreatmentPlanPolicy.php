<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class TreatmentPlanPolicy extends ClinicPolicy
{
    protected string $resource = 'treatment_plans';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->treatment?->doctor_id;
    }
}
