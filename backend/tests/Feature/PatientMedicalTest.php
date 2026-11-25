<?php

namespace Tests\Feature;

use App\Models\Medicine;
use App\Models\PatientFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

/** الملف النسائي + السجل الطبي (latest echo, medicines taken). */
class PatientMedicalTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
    }

    public function test_gynecology_profile_is_saved_and_read(): void
    {
        $patient = $this->clinicAppointment->patient;
        $this->actingAs($this->kidsDoctorUser)->getJson("/patients/{$patient->id}/gynecology-profile")
            ->assertOk()->assertJsonPath('data', null);

        $this->actingAs($this->kidsDoctorUser)->putJson("/patients/{$patient->id}/gynecology-profile", [
            'is_smoker' => false, 'marital_status' => 'married', 'pregnancies' => 3, 'living_children' => 2,
            'abortions' => 1, 'preterm_births' => 0, 'allergy_history' => 'بنسلين', 'weight_kg' => 64.5, 'blood_pressure' => '120 / 80',
        ])->assertOk()->assertJsonPath('data.blood_pressure', '120/80')->assertJsonPath('data.living_children', 2);

        // partial update keeps the rest
        $this->actingAs($this->receptionist)->putJson("/patients/{$patient->id}/gynecology-profile", ['weight_kg' => 65])
            ->assertOk()->assertJsonPath('data.weight_kg', 65)->assertJsonPath('data.marital_status', 'married');

        $this->actingAs($this->admin)->putJson("/patients/{$patient->id}/gynecology-profile", ['blood_pressure' => 'high'])
            ->assertStatus(422);
        $this->actingAs($this->admin)->putJson("/patients/{$patient->id}/gynecology-profile", ['marital_status' => 'other'])
            ->assertStatus(422);
    }

    public function test_medical_summary_shows_latest_echo_and_medicines(): void
    {
        $patient = $this->clinicAppointment->patient;
        $file = fn (string $category, string $day) => PatientFile::create([
            'patient_id' => $patient->id, 'category' => $category, 'title' => "$category $day", 'taken_at' => $day,
            'path' => 'x', 'original_name' => 'x.jpg', 'mime' => 'image/jpeg', 'size' => 1,
        ]);
        $file('echo_gyn', '2026-01-10');
        $newestGyn = $file('echo_gyn', '2026-03-01');
        $file('xray', '2026-04-01');

        $med = Medicine::create(['trade_name' => 'Duphaston', 'strength' => '10 mg']);
        $this->actingAs($this->kidsDoctorUser)->postJson('/prescriptions', [
            'patient_id' => $patient->id,
            'items' => [['medicine_id' => $med->id, 'medicine_name' => 'Duphaston 10 mg', 'dose' => 'حبة', 'frequency' => 'مرتين يومياً']],
        ])->assertCreated();

        $res = $this->actingAs($this->clinicDoctorUser)->getJson("/patients/{$patient->id}/medical-summary")->assertOk();
        $res->assertJsonPath('data.latest_echo.echo_gyn.id', $newestGyn->id)
            ->assertJsonPath('data.latest_echo.echo_abdominal', null)
            ->assertJsonCount(1, 'data.medications')
            ->assertJsonPath('data.medications.0.medicine_name', 'Duphaston 10 mg')
            ->assertJsonPath('data.medications.0.doctor_name', 'Kids Doctor');
    }
}
