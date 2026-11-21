<?php

/*
|--------------------------------------------------------------------------
| Role matrix: which roles may do what, per resource
|--------------------------------------------------------------------------
| Port of the PERMISSIVE Supabase RLS policies (latest state across
| supabase/migrations). The independent-doctor rules (RESTRICTIVE policies)
| are applied on top of this by App\Support\DoctorBooks in each policy.
|
| S = super_admin, D = doctor, A = dentist_assistant, R = receptionist
*/

$S = 'super_admin';
$D = 'doctor';
$A = 'dentist_assistant';
$R = 'receptionist';
$all = [$S, $D, $A, $R];
$medical = [$S, $D, $A];

return [

    // The database stores UTC; day boundaries ("today", reports) and dates
    // written into notes use the clinic's local time.
    'timezone' => env('CLINIC_TIMEZONE', 'Asia/Damascus'),

    'permissions' => [
        'patients' => ['view' => $all, 'create' => $all, 'update' => $all, 'delete' => [$S]],
        'doctors' => ['view' => $all, 'create' => [$S], 'update' => [$S], 'delete' => [$S]],
        'specialties' => ['view' => $all, 'create' => [$S], 'update' => [$S], 'delete' => [$S]],
        'appointments' => ['view' => $all, 'create' => $all, 'update' => $all, 'delete' => $all],
        'payments' => ['view' => $all, 'create' => $all, 'update' => $all, 'delete' => $medical],
        'treatment_records' => ['view' => $all, 'create' => $medical, 'update' => $medical, 'delete' => $medical],
        'treatment_plans' => ['view' => $all, 'create' => $medical, 'update' => $medical, 'delete' => $medical],
        'appointment_treatment_steps' => ['view' => $all, 'create' => $medical, 'update' => $medical, 'delete' => $medical],
        'unfinished_sub_treatments' => ['view' => $all, 'create' => $medical, 'update' => $medical, 'delete' => $medical],
        // Catalog writes: super_admin; independent doctors manage their own
        // catalog (handled in TreatmentPolicy, not here).
        'treatments' => ['view' => $all, 'create' => [$S], 'update' => [$S], 'delete' => [$S]],
        'waiting_list' => ['view' => $all, 'create' => $all, 'update' => $all, 'delete' => [$S]],
        'activity_logs' => ['view' => [$S], 'create' => [], 'update' => [], 'delete' => [$S]],
        'users' => ['view' => [$S], 'create' => [$S], 'update' => [$S], 'delete' => [$S]],
        'role_permissions' => ['view' => $all, 'create' => [$S], 'update' => [$S], 'delete' => [$S]],
    ],

];
