<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class UnfinishedSubTreatmentPolicy extends ClinicPolicy
{
    protected string $resource = 'unfinished_sub_treatments';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->treatment?->doctor_id;
    }
}
