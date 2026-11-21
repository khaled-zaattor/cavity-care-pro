<?php

namespace App\Policies;

use Illuminate\Database\Eloquent\Model;

/** Role matrix AND the prescribing doctor's books (independent doctors stay private). */
class PrescriptionPolicy extends ClinicPolicy
{
    protected string $resource = 'prescriptions';

    protected string $scope = 'books';

    protected function doctorIdOf(Model $model): ?string
    {
        return $model->doctor_id;
    }
}
