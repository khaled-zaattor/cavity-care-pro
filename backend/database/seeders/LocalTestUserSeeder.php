<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Local development only: a super admin for clicking through the app.
 * Credentials come from backend/.env (LOCAL_TEST_ADMIN_EMAIL / _PASSWORD),
 * never from real staff accounts. `import:supabase --fresh` removes it.
 *
 *   php artisan db:seed --class=LocalTestUserSeeder
 */
class LocalTestUserSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->isProduction()) {
            throw new RuntimeException('LocalTestUserSeeder must not run in production.');
        }

        $email = env('LOCAL_TEST_ADMIN_EMAIL');
        $password = env('LOCAL_TEST_ADMIN_PASSWORD');
        if (! $email || ! $password) {
            throw new RuntimeException('Set LOCAL_TEST_ADMIN_EMAIL and LOCAL_TEST_ADMIN_PASSWORD in backend/.env');
        }

        User::updateOrCreate(['email' => $email], [
            'full_name' => 'Local Test Admin',
            'role' => 'super_admin',
            'is_active' => true,
            'password' => $password,
        ]);
    }
}
