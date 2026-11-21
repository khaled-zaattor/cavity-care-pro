<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Medicine;
use App\Models\Prescription;
use App\Models\PrescriptionTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

class PrescriptionApiTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    private Medicine $amox;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
        $this->amox = Medicine::create(['trade_name' => 'Amoxil', 'generic_name' => 'Amoxicillin', 'form' => 'capsule', 'strength' => '500 mg']);
    }

    private function prescribe($user, array $extra = []): TestResponse
    {
        return $this->actingAs($user)->postJson('/prescriptions', array_merge([
            'patient_id' => $this->clinicAppointment->patient_id,
            'diagnosis' => 'التهاب لثة',
            'items' => [
                ['medicine_id' => $this->amox->id, 'dose' => '1 كبسولة', 'frequency' => '3 مرات يومياً', 'duration' => '7 أيام'],
                ['medicine_name' => 'غسول كلورهيكسيدين', 'instructions' => 'مضمضة بعد الطعام'],
            ],
        ], $extra));
    }

    public function test_doctor_writes_numbered_prescriptions_with_catalog_and_free_text_medicines(): void
    {
        $first = $this->prescribe($this->clinicDoctorUser)->assertCreated();
        $first->assertJsonPath('data.number', 1)
            ->assertJsonPath('data.doctor_id', $this->clinicDoctor->id)
            ->assertJsonPath('data.items.0.medicine_name', 'Amoxil 500 mg')   // snapshot from catalog
            ->assertJsonPath('data.items.1.medicine_name', 'غسول كلورهيكسيدين') // typed freely
            ->assertJsonPath('data.specialty_id', $this->clinicAppointment->specialty_id);

        $this->prescribe($this->clinicDoctorUser)->assertJsonPath('data.number', 2);

        $log = ActivityLog::where('subject_type', 'prescription')->latest('created_at')->first();
        $this->assertStringContainsString('كتب الوصفة رقم', $log->description);
        $this->assertStringContainsString('Amoxil 500 mg، غسول كلورهيكسيدين', $log->description);

        // catalog changes later do not rewrite the printed prescription
        $this->amox->update(['trade_name' => 'Amoxil Forte']);
        $this->assertSame('Amoxil 500 mg', Prescription::where('number', 1)->first()->items()->first()->medicine_name);
    }

    public function test_who_may_write_and_who_may_print(): void
    {
        $this->prescribe($this->assistant)->assertForbidden();
        $this->prescribe($this->receptionist)->assertForbidden();
        $this->prescribe($this->admin)->assertStatus(422)->assertJsonValidationErrors('doctor_id'); // admin must choose
        $id = $this->prescribe($this->admin, ['doctor_id' => $this->clinicDoctor->id])->assertCreated()->json('data.id');

        // reception can open/print it, with the clinic header data
        $this->actingAs($this->receptionist)->getJson("/prescriptions/$id")->assertOk()->assertJsonStructure(['data' => ['items', 'patient', 'doctor'], 'clinic']);
        $this->actingAs($this->receptionist)->postJson("/prescriptions/$id/printed")->assertOk();
        $this->assertNotNull(Prescription::find($id)->printed_at);
        $this->actingAs($this->receptionist)->deleteJson("/prescriptions/$id")->assertForbidden();
    }

    public function test_independent_doctor_prescriptions_stay_in_their_books(): void
    {
        $id = $this->prescribe($this->kidsDoctorUser)->assertCreated()->assertJsonPath('data.doctor_id', $this->kidsDoctor->id)->json('data.id');

        $this->actingAs($this->assistant)->getJson("/prescriptions/$id")->assertForbidden();
        $this->actingAs($this->assistant)->getJson('/prescriptions?patient_id='.$this->clinicAppointment->patient_id)->assertJsonPath('total', 0);
        $this->actingAs($this->clinicDoctorUser)->patchJson("/prescriptions/$id", ['notes' => 'x'])->assertForbidden();
        $this->actingAs($this->admin)->getJson("/prescriptions/$id")->assertOk();
    }

    public function test_edit_replaces_items_and_delete_is_soft(): void
    {
        $id = $this->prescribe($this->clinicDoctorUser)->json('data.id');

        $this->actingAs($this->clinicDoctorUser)->patchJson("/prescriptions/$id", [
            'items' => [['medicine_name' => 'Ibuprofen 400 mg', 'frequency' => 'عند اللزوم']],
        ])->assertOk()->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.medicine_name', 'Ibuprofen 400 mg');

        $this->actingAs($this->clinicDoctorUser)->deleteJson("/prescriptions/$id")->assertNoContent();
        $this->assertSoftDeleted('prescriptions', ['id' => $id]);
        // a deleted number is never reused
        $this->prescribe($this->clinicDoctorUser)->assertJsonPath('data.number', 2);
    }

    public function test_templates_belong_to_their_doctor(): void
    {
        $id = $this->actingAs($this->kidsDoctorUser)->postJson('/prescription-templates', [
            'name' => 'خافض حرارة أطفال',
            'items' => [['medicine_name' => 'Paracetamol syrup 120 mg/5 ml', 'dose' => 'حسب الوزن']],
        ])->assertCreated()->assertJsonPath('data.doctor_id', $this->kidsDoctor->id)->json('data.id');

        $this->actingAs($this->kidsDoctorUser)->getJson('/prescription-templates')->assertJsonCount(1, 'data');
        $this->actingAs($this->clinicDoctorUser)->getJson('/prescription-templates')->assertJsonCount(0, 'data');
        $this->actingAs($this->clinicDoctorUser)->deleteJson("/prescription-templates/$id")->assertForbidden();
        $this->actingAs($this->assistant)->getJson('/prescription-templates')->assertForbidden();
        $this->actingAs($this->admin)->deleteJson("/prescription-templates/$id")->assertNoContent();
        $this->assertSame(0, PrescriptionTemplate::count());
    }

    public function test_medicines_catalog_rules(): void
    {
        $this->actingAs($this->clinicDoctorUser)->postJson('/medicines', ['trade_name' => 'Brufen', 'strength' => '400 mg'])->assertCreated();
        $this->actingAs($this->receptionist)->postJson('/medicines', ['trade_name' => 'X'])->assertForbidden();
        $this->actingAs($this->receptionist)->getJson('/medicines?q=amox')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->receptionist)->getJson('/medicines?q=Amoxicillin')->assertJsonCount(1, 'data'); // generic name
    }

    public function test_clinic_settings_and_logo(): void
    {
        Storage::fake('local');

        $this->actingAs($this->receptionist)->putJson('/clinic-settings', ['clinic_name' => 'x'])->assertForbidden();
        $this->actingAs($this->admin)->putJson('/clinic-settings', [
            'clinic_name' => 'مركز كافيتي الطبي', 'clinic_phone' => '011 123 4567',
        ])->assertOk()->assertJsonPath('data.clinic_name', 'مركز كافيتي الطبي')->assertJsonPath('data.has_logo', false);

        $this->actingAs($this->admin)->post('/clinic-settings/logo', ['logo' => UploadedFile::fake()->image('logo.png', 200, 200)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.has_logo', true);
        $this->actingAs($this->receptionist)->get('/clinic-settings/logo')->assertOk();
        $this->actingAs($this->receptionist)->getJson('/clinic-settings')->assertJsonMissingPath('data.logo_path');
    }
}
