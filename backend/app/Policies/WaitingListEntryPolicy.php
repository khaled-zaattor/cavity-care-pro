<?php

namespace App\Policies;

class WaitingListEntryPolicy extends ClinicPolicy
{
    protected string $resource = 'waiting_list';

    protected string $scope = 'none';
}
