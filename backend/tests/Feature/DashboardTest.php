<?php

namespace Tests\Feature;

use App\Models\Doctor;
use App\Models\Treatment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    public function test_dashboard_contents_by_role_and_books(): void
    {
        $this->buildClinic();

        $this->actingAs($this->receptionist)->getJson('/dashboard')->assertOk()
            ->assertJsonPath('data.today.appointments', 2)   // reception sees every doctor's schedule
            ->assertJsonMissingPath('data.admin')->assertJsonMissingPath('data.doctor');

        $this->actingAs($this->assistant)->getJson('/dashboard')->assertJsonPath('data.today.appointments', 1);

        $this->actingAs($this->kidsDoctorUser)->getJson('/dashboard')->assertOk()
            ->assertJsonPath('data.today.appointments', 1)
            ->assertJsonPath('data.doctor.month.total_payments_syp', 50000);

        $admin = $this->actingAs($this->admin)->getJson('/dashboard')->assertOk()->json('data.admin');
        $this->assertCount(2, $admin['by_specialty']);
        $this->assertSame('Shared Patient', $admin['top_debtors'][0]['full_name']);
        $this->assertEquals(100000, $admin['top_debtors'][0]['balance']);

        $this->actingAs($this->receptionist)->getJson("/payments/{$this->clinicPayment->id}")->assertOk()
            ->assertJsonPath('data.patient.full_name', 'Shared Patient')->assertJsonStructure(['clinic']);
        $this->actingAs($this->receptionist)->getJson("/payments/{$this->kidsPayment->id}")->assertForbidden();
    }

    public function test_pediatrics_setup_command(): void
    {
        $this->buildClinic();
        $doctor = Doctor::create(['full_name' => 'د. سمر']);

        $this->artisan('clinic:setup-pediatrics', ['doctor' => 'د. سمر', '--price' => 50000, '--own-books' => true])->assertSuccessful();
        $this->artisan('clinic:setup-pediatrics', ['doctor' => 'د. سمر'])->assertSuccessful(); // idempotent

        $doctor->refresh();
        $this->assertTrue($doctor->has_own_books);
        $this->assertSame('pediatrics', $doctor->primarySpecialty()->code);
        $t = Treatment::where('doctor_id', $doctor->id)->sole();
        $this->assertSame('معاينة وفحص', $t->name);
        $this->assertSame(50000.0, $t->subTreatments()->sole()->estimated_cost_syp);
    }
}
