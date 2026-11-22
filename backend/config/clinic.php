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

    // A doctor's appointments closer than this get a double-booking warning.
    'slot_minutes' => (int) env('APPOINTMENT_SLOT_MINUTES', 15),

    // php artisan clinic:backup (scheduled daily)
    'mysqldump_path' => env('MYSQLDUMP_PATH', 'mysqldump'),
    'mysql_path' => env('MYSQL_PATH', 'mysql'),
    'backup_keep_days' => (int) env('BACKUP_KEEP_DAYS', 14),

    // Patient files (x-rays, lab results…). PHP's upload_max_filesize must allow this too
    // (backend/public/.user.ini on the shared host).
    'upload_max_mb' => (int) env('UPLOAD_MAX_MB', 20),

    // Admin dashboard warns when the storage disk is this full.
    'disk_warning_percent' => (int) env('DISK_WARNING_PERCENT', 80),

    // Phase G: monthly doctor settlement
    'finance' => [
        // A month's loss (charges > revenue) reduces the next month's net.
        'carry_losses' => (bool) env('FINANCE_CARRY_LOSSES', false),
        // Independent doctors keep separate books: by default they do not carry rent etc.
        'independent_share_clinic_expenses' => (bool) env('FINANCE_INDEPENDENT_SHARE_EXPENSES', false),
        // Edits to payments/treatment costs older than this need super_admin (plan §3.6).
        'lock_after_days' => (int) env('FINANCE_LOCK_AFTER_DAYS', 7),
    ],

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
        // Phase E: doctors write prescriptions; anyone may view/print (reception hands them out).
        'medicines' => ['view' => $all, 'create' => [$S, $D], 'update' => [$S, $D], 'delete' => [$S, $D]],
        'prescriptions' => ['view' => $all, 'create' => [$S, $D], 'update' => [$S, $D], 'delete' => [$S, $D]],
        'prescription_templates' => ['view' => [$S, $D], 'create' => [$S, $D], 'update' => [$S, $D], 'delete' => [$S, $D]],
        'clinic_settings' => ['view' => $all, 'create' => [$S], 'update' => [$S], 'delete' => [$S]],
        // Phase F: reception may scan/upload what patients bring; only doctors/admin delete.
        'patient_files' => ['view' => $all, 'create' => $all, 'update' => $medical, 'delete' => [$S, $D]],
    ],

];
