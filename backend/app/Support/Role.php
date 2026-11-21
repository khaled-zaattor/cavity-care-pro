<?php

namespace App\Support;

final class Role
{
    public const SUPER_ADMIN = 'super_admin';

    public const DOCTOR = 'doctor';

    public const ASSISTANT = 'dentist_assistant';

    public const RECEPTIONIST = 'receptionist';

    public const ALL = [self::SUPER_ADMIN, self::DOCTOR, self::ASSISTANT, self::RECEPTIONIST];
}
