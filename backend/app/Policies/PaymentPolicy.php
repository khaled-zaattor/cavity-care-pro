<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

class PaymentPolicy extends ClinicPolicy
{
    protected string $resource = 'payments';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->doctor_id;
    }
}
