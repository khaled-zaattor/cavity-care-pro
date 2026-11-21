<?php

/*
| Supabase -> Laravel import settings (plan §5).
*/

return [

    // Database connection the import reads from (see config/database.php).
    'source_connection' => env('IMPORT_SOURCE_CONNECTION', 'supabase'),

    // Supabase keeps logins in the "auth" schema. Tests point this at a
    // plain table because SQLite has no schemas.
    'users_table' => env('IMPORT_USERS_TABLE', 'auth.users'),

    // Every current doctor and treatment is a dentist (decision 2026-11-20).
    'default_specialty_code' => 'dental',

    'chunk' => 2000,

];
