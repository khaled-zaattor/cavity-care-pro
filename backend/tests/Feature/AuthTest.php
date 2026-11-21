<?php

namespace Tests\Feature;

use App\Models\Doctor;
use App\Models\User;
use App\Support\LegacyPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const SPA = ['Origin' => 'http://localhost:8080', 'Referer' => 'http://localhost:8080/'];

    /** Simulates a user imported from Supabase with a Go-style "$2a$" hash. */
    private function importedUser(string $password, array $attrs = []): User
    {
        $goStyle = '$2a$'.substr(password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]), 4);

        $user = User::factory()->create($attrs);
        // Bypass the "hashed" cast, exactly like the import does.
        DB::table('users')->where('id', $user->id)->update(['password' => LegacyPassword::normalize($goStyle)]);

        return $user->fresh();
    }

    public function test_legacy_supabase_hash_is_accepted_after_normalizing(): void
    {
        $goStyle = '$2a$'.substr(password_hash('secret-123', PASSWORD_BCRYPT), 4);

        $this->assertStringStartsWith('$2y$', LegacyPassword::normalize($goStyle));
        $this->assertTrue(Hash::check('secret-123', LegacyPassword::normalize($goStyle)));
        $this->assertFalse(Hash::check('wrong', LegacyPassword::normalize($goStyle)));
    }

    public function test_imported_user_logs_in_with_existing_password_and_gets_profile(): void
    {
        $user = $this->importedUser('old-password', ['email' => 'kids@example.com', 'role' => 'doctor']);
        $doctor = Doctor::create(['full_name' => 'Kids Doctor', 'user_id' => $user->id, 'has_own_books' => true]);

        $this->withHeaders(self::SPA)->postJson('/auth/login', ['email' => 'KIDS@example.com ', 'password' => 'old-password'])
            ->assertOk()
            ->assertJsonPath('user.email', 'kids@example.com')
            ->assertJsonPath('user.role', 'doctor')
            ->assertJsonPath('user.doctor_id', $doctor->id)
            ->assertJsonPath('user.is_independent_doctor', true);

        $this->withHeaders(self::SPA)->getJson('/auth/me')->assertOk()->assertJsonPath('user.id', $user->id);

        // cost-10 Supabase hash was upgraded on login
        $this->assertFalse(Hash::needsRehash($user->fresh()->password));
        $this->assertNotNull($user->fresh()->last_login_at);
    }

    public function test_wrong_password_is_rejected(): void
    {
        $this->importedUser('right', ['email' => 'a@example.com']);

        $this->withHeaders(self::SPA)->postJson('/auth/login', ['email' => 'a@example.com', 'password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertGuest('web');
    }

    public function test_inactive_user_cannot_log_in(): void
    {
        $this->importedUser('right', ['email' => 'off@example.com', 'is_active' => false]);

        $this->withHeaders(self::SPA)->postJson('/auth/login', ['email' => 'off@example.com', 'password' => 'right'])
            ->assertStatus(422);
    }

    public function test_guest_gets_401_and_logout_ends_session(): void
    {
        $this->withHeaders(self::SPA)->getJson('/auth/me')->assertUnauthorized();

        $this->importedUser('pw-12345', ['email' => 'b@example.com']);
        $this->withHeaders(self::SPA)->postJson('/auth/login', ['email' => 'b@example.com', 'password' => 'pw-12345'])->assertOk();
        $this->withHeaders(self::SPA)->postJson('/auth/logout')->assertOk();
        $this->assertGuest('web');
    }

    public function test_login_is_rate_limited(): void
    {
        $this->importedUser('right', ['email' => 'c@example.com']);
        for ($i = 0; $i < 5; $i++) {
            $this->withHeaders(self::SPA)->postJson('/auth/login', ['email' => 'c@example.com', 'password' => 'wrong'])->assertStatus(422);
        }
        $this->withHeaders(self::SPA)->postJson('/auth/login', ['email' => 'c@example.com', 'password' => 'right'])->assertStatus(429);
    }
}
