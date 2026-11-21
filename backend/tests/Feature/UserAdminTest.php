<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_super_admin_manages_users(): void
    {
        $doctor = User::factory()->create(['role' => 'doctor']);

        $this->actingAs($doctor)->getJson('/admin/users')->assertForbidden();
        $this->actingAs($doctor)->postJson('/admin/users', [
            'email' => 'x@example.com', 'full_name' => 'X', 'role' => 'doctor', 'password' => 'password123',
        ])->assertForbidden();
    }

    public function test_admin_creates_user_and_resets_password(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);

        $id = $this->actingAs($admin)->postJson('/admin/users', [
            'email' => 'New@Example.com', 'full_name' => 'New', 'role' => 'receptionist', 'password' => 'password123',
        ])->assertCreated()->json('data.id');

        $user = User::findOrFail($id);
        $this->assertSame('new@example.com', $user->email);

        $this->actingAs($admin)->postJson("/admin/users/{$id}/reset-password", ['password' => 'brand-new-pass'])->assertOk();
        $this->assertTrue(Hash::check('brand-new-pass', $user->fresh()->password));
    }

    public function test_last_super_admin_cannot_be_demoted_or_disabled(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($admin)->patchJson("/admin/users/{$admin->id}", ['role' => 'doctor'])->assertStatus(422);
        $this->actingAs($admin)->patchJson("/admin/users/{$admin->id}", ['is_active' => false])->assertStatus(422);

        $second = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($admin)->patchJson("/admin/users/{$second->id}", ['role' => 'doctor'])->assertOk();
    }
}
