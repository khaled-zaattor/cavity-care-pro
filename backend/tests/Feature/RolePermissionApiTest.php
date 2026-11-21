<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Port of Supabase migration 20261119074946: role toggles are visible for your own role only. */
class RolePermissionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['doctor', 'receptionist', 'dentist_assistant'] as $role) {
            RolePermission::create(['role' => $role, 'resource' => 'payments', 'can_create' => true]);
        }
    }

    public function test_staff_see_only_their_own_role(): void
    {
        $doctor = User::factory()->create(['role' => 'doctor']);

        $this->actingAs($doctor)->getJson('/role-permissions')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.role', 'doctor');

        // asking for another role does not widen it
        $this->actingAs($doctor)->getJson('/role-permissions?role=receptionist')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_super_admin_sees_every_role_and_only_admin_edits(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($admin)->getJson('/role-permissions')->assertJsonCount(3, 'data');
        $this->actingAs($admin)->getJson('/role-permissions?role=receptionist')->assertJsonCount(1, 'data');

        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $this->actingAs($receptionist)->putJson('/role-permissions', ['role' => 'receptionist', 'resource' => 'payments', 'can_delete' => true])
            ->assertForbidden();
    }

    public function test_user_without_role_sees_nothing(): void
    {
        $noRole = User::factory()->create(['role' => null]);
        $this->actingAs($noRole)->getJson('/role-permissions')->assertForbidden();
    }
}
