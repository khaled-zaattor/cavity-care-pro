<?php

namespace Tests\Feature;

use App\Models\Specialty;
use App\Models\SubTreatment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

class CatalogApiTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
    }

    public function test_specialties_are_managed_by_admin_only(): void
    {
        $this->actingAs($this->receptionist)->getJson('/specialties')->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($this->assistant)->postJson('/specialties', ['name_ar' => 'جلدية'])->assertForbidden();

        $id = $this->actingAs($this->admin)->postJson('/specialties', ['name_ar' => 'جلدية', 'is_dental' => false])
            ->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->patchJson("/specialties/$id", ['is_active' => false])->assertOk();
        $this->actingAs($this->admin)->getJson('/specialties')->assertJsonCount(2, 'data');

        // in use → cannot delete
        $dental = Specialty::where('code', 'dental')->first();
        $this->actingAs($this->admin)->deleteJson("/specialties/{$dental->id}")->assertStatus(422);
        $this->actingAs($this->admin)->deleteJson("/specialties/$id")->assertNoContent();
    }

    public function test_doctor_with_several_specialties(): void
    {
        $dental = Specialty::where('code', 'dental')->first();
        $kids = Specialty::where('code', 'pediatrics')->first();

        $res = $this->actingAs($this->admin)->postJson('/doctors', [
            'full_name' => 'د. ليلى', 'specialty_ids' => [$dental->id, $kids->id], 'primary_specialty_id' => $kids->id,
        ])->assertCreated();

        $res->assertJsonPath('data.specialty', 'طب الأطفال')
            ->assertJsonPath('data.primary_specialty_id', $kids->id)
            ->assertJsonCount(2, 'data.specialties');

        $this->actingAs($this->assistant)->postJson('/doctors', ['full_name' => 'x', 'specialty_ids' => [$dental->id]])->assertForbidden();
    }

    /** The catalog is split by specialty only: every doctor of a specialty sees its treatments. */
    public function test_doctors_see_the_treatments_of_their_specialties(): void
    {
        $kids = Specialty::where('code', 'pediatrics')->first();

        // a second doctor of the same specialty, with their own books
        $userId = $this->actingAs($this->admin)->postJson('/admin/users', [
            'email' => 'kids2@clinic.test', 'full_name' => 'د. سمر', 'role' => 'doctor', 'password' => 'Secret-123456',
        ])->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->postJson('/doctors', [
            'full_name' => 'د. سمر', 'specialty_ids' => [$kids->id], 'primary_specialty_id' => $kids->id,
            'user_id' => $userId, 'has_own_books' => true,
        ])->assertCreated();

        // a doctor_id sent by an old screen is ignored: no doctor-owned catalogs
        $treatmentId = $this->actingAs($this->admin)->postJson('/treatments', [
            'name' => 'متابعة', 'specialty_id' => $kids->id, 'doctor_id' => $this->kidsDoctor->id,
        ])->assertCreated()->assertJsonPath('data.doctor_id', null)->json('data.id');

        foreach ([\App\Models\User::find($userId), $this->kidsDoctorUser] as $doctorUser) {
            $this->actingAs($doctorUser)->getJson('/treatments')->assertOk()
                ->assertJsonCount(2, 'data')->assertJsonFragment(['id' => $treatmentId])
                ->assertJsonMissing(['id' => $this->clinicTreatment->id]);
        }
        // the dentist does not get the other specialty mixed in
        $this->actingAs($this->clinicDoctorUser)->getJson('/treatments')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->clinicTreatment->id);
        // admin, reception, assistants: every specialty
        foreach ([$this->admin, $this->receptionist, $this->assistant] as $user) {
            $this->actingAs($user)->getJson('/treatments')->assertJsonCount(3, 'data');
        }
    }

    public function test_independent_doctor_writes_only_in_own_specialty(): void
    {
        $kids = Specialty::where('code', 'pediatrics')->first();
        $dental = Specialty::where('code', 'dental')->first();

        $id = $this->actingAs($this->kidsDoctorUser)->postJson('/treatments', ['name' => 'لقاح', 'specialty_id' => $kids->id])
            ->assertCreated()->assertJsonPath('data.doctor_id', null)->json('data.id');
        $this->actingAs($this->kidsDoctorUser)->postJson('/treatments', ['name' => 'x', 'specialty_id' => $dental->id])->assertForbidden();
        $this->actingAs($this->kidsDoctorUser)->patchJson("/treatments/{$this->clinicTreatment->id}", ['name' => 'x'])->assertForbidden();
        // cannot move own treatment into a specialty they don't practise
        $this->actingAs($this->kidsDoctorUser)->patchJson("/treatments/$id", ['specialty_id' => $dental->id])->assertForbidden();
        // a clinic (not independent) doctor does not edit the catalog
        $this->actingAs($this->clinicDoctorUser)->postJson('/treatments', ['name' => 'x', 'specialty_id' => $dental->id])->assertForbidden();
        // admin moves treatments between specialties
        $this->actingAs($this->admin)->patchJson("/treatments/$id", ['specialty_id' => $dental->id])
            ->assertOk()->assertJsonPath('data.specialty_id', $dental->id);
    }

    public function test_recording_requires_a_treatment_of_the_doctors_specialty(): void
    {
        $sub = $this->clinicTreatment->subTreatments()->first();
        $this->kidsAppointment->update(['status' => 'Scheduled']);
        $this->actingAs($this->admin)->postJson("/appointments/{$this->kidsAppointment->id}/treatments", [
            'treatment_id' => $this->clinicTreatment->id, 'sub_treatment_id' => $sub->id,
        ])->assertStatus(422)->assertJsonValidationErrors('treatment_id');
    }

    public function test_non_dental_sub_treatments_never_get_tooth_options(): void
    {
        $id = $this->actingAs($this->kidsDoctorUser)->postJson('/sub-treatments', [
            'treatment_id' => $this->kidsTreatment->id, 'name' => 'فحص', 'tooth_association' => 'single_tooth', 'estimated_cost_syp' => 50000,
        ])->assertCreated()->assertJsonPath('data.tooth_association', 'not_related')->json('data.id');

        $this->assertSame(50000.0, SubTreatment::find($id)->estimated_cost_syp);

        $this->actingAs($this->admin)->postJson('/sub-treatments', [
            'treatment_id' => $this->clinicTreatment->id, 'name' => 'حشوة', 'tooth_association' => 'multiple_teeth',
        ])->assertCreated()->assertJsonPath('data.tooth_association', 'multiple_teeth');
    }

    public function test_sub_treatment_used_in_records_cannot_be_deleted(): void
    {
        $used = $this->clinicTreatment->subTreatments()->first();
        $this->actingAs($this->admin)->deleteJson("/sub-treatments/{$used->id}")->assertStatus(422);
    }
}
