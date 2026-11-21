<?php

namespace App\Policies;

/** Patient files are shared clinical history (like patients); see config/clinic.php. */
class PatientFilePolicy extends ClinicPolicy
{
    protected string $resource = 'patient_files';
}
