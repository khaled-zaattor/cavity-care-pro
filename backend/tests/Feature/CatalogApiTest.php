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

    public function test_catalog_listing_follows_books_rules(): void
    {
        $this->actingAs($this->assistant)->getJson('/treatments')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->clinicTreatment->id);
        $this->actingAs($this->kidsDoctorUser)->getJson('/treatments')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->kidsTreatment->id);
        $this->actingAs($this->receptionist)->getJson('/treatments')->assertJsonCount(2, 'data');
    }

    public function test_independent_doctor_creates_into_own_catalog_only(): void
    {
        $kids = Specialty::where('code', 'pediatrics')->first();

        $this->actingAs($this->kidsDoctorUser)->postJson('/treatments', [
            'name' => 'لقاح', 'specialty_id' => $kids->id, 'doctor_id' => null,
        ])->assertCreated()->assertJsonPath('data.doctor_id', $this->kidsDoctor->id);

        $this->actingAs($this->kidsDoctorUser)->patchJson("/treatments/{$this->clinicTreatment->id}", ['name' => 'x'])->assertForbidden();
        $this->actingAs($this->clinicDoctorUser)->postJson('/treatments', ['name' => 'x', 'specialty_id' => $kids->id])->assertForbidden();
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
