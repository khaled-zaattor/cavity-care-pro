<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class TreatmentRecordPolicy extends ClinicPolicy
{
    protected string $resource = 'treatment_records';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->doctor_id;
    }
}
