<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class ActivityLogPolicy extends ClinicPolicy
{
    protected string $resource = 'activity_logs';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->doctor_id;
    }
}
