<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\PatientFile;
use App\Models\Specialty;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

class PatientFileApiTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    private string $patientId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->buildClinic();
        $this->patientId = $this->clinicAppointment->patient_id;
    }

    private function upload($user, UploadedFile $file, array $extra = [])
    {
        return $this->actingAs($user)->post("/patients/{$this->patientId}/files",
            array_merge(['file' => $file, 'category' => 'xray'], $extra), ['Accept' => 'application/json']);
    }

    public function test_upload_image_makes_private_file_and_thumbnail(): void
    {
        $res = $this->upload($this->receptionist, UploadedFile::fake()->image('panorama.jpg', 1600, 900), [
            'title' => 'بانوراما قبل العلاج', 'appointment_id' => $this->clinicAppointment->id,
        ])->assertCreated()
            ->assertJsonPath('data.title', 'بانوراما قبل العلاج')
            ->assertJsonPath('data.is_image', true)
            ->assertJsonPath('data.has_thumbnail', true)
            ->assertJsonPath('data.doctor_id', $this->clinicDoctor->id)        // from the appointment
            ->assertJsonMissingPath('data.path');                            // storage path is never exposed

        $file = PatientFile::findOrFail($res->json('data.id'));
        $this->assertStringStartsWith("patients/{$this->patientId}/", $file->path);
        Storage::disk('local')->assertExists($file->path);
        Storage::disk('local')->assertExists($file->thumbnail_path);
        $this->assertLessThanOrEqual(480, getimagesizefromstring(Storage::disk('local')->get($file->thumbnail_path))[0]);

        $this->actingAs($this->kidsDoctorUser)->get("/patient-files/{$file->id}/content")->assertOk();   // shared history
        $this->actingAs($this->assistant)->get("/patient-files/{$file->id}/thumbnail")->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        $log = ActivityLog::where('subject_type', 'patient_file')->sole();
        $this->assertSame($this->patientId, $log->patient_id);
        $this->assertStringContainsString('رفع صورة أشعة «بانوراما قبل العلاج»', $log->description);
    }

    public function test_pdf_without_thumbnail_and_bad_files_rejected(): void
    {
        $this->upload($this->assistant, UploadedFile::fake()->create('cbc.pdf', 300, 'application/pdf'), ['category' => 'lab_test'])
            ->assertCreated()->assertJsonPath('data.is_image', false)->assertJsonPath('data.has_thumbnail', false)
            ->assertJsonPath('data.title', 'cbc');

        $this->upload($this->assistant, UploadedFile::fake()->create('virus.exe', 10, 'application/x-msdownload'))->assertStatus(422);
        $this->upload($this->assistant, UploadedFile::fake()->create('huge.pdf', 30 * 1024, 'application/pdf'))->assertStatus(422);
        $this->upload($this->assistant, UploadedFile::fake()->image('x.png'), ['category' => 'nonsense'])->assertStatus(422);
        $this->upload($this->assistant, UploadedFile::fake()->image('x.png'), ['taken_at' => now()->addDays(5)->toDateString()])->assertStatus(422);
    }

    public function test_edit_and_delete_rules(): void
    {
        $id = $this->upload($this->receptionist, UploadedFile::fake()->image('a.png'))->json('data.id');

        $this->actingAs($this->receptionist)->patchJson("/patient-files/$id", ['title' => 'x'])->assertForbidden();
        $this->actingAs($this->assistant)->patchJson("/patient-files/$id", ['title' => 'صورة ذروية 16', 'category' => 'radiology'])
            ->assertOk()->assertJsonPath('data.category', 'radiology');

        $this->actingAs($this->receptionist)->deleteJson("/patient-files/$id")->assertForbidden();
        $this->actingAs($this->clinicDoctorUser)->deleteJson("/patient-files/$id")->assertNoContent();
        $this->assertSoftDeleted('patient_files', ['id' => $id]);
        Storage::disk('local')->assertExists(PatientFile::withTrashed()->find($id)->path); // kept for restore
        $this->actingAs($this->admin)->getJson("/patients/{$this->patientId}/files")->assertJsonCount(0, 'data');
    }

    public function test_timeline_merges_sources_and_respects_books(): void
    {
        $this->upload($this->receptionist, UploadedFile::fake()->image('a.png'));
        $this->actingAs($this->clinicDoctorUser)->postJson('/prescriptions', [
            'patient_id' => $this->patientId, 'items' => [['medicine_name' => 'Brufen 400 mg']],
        ])->assertCreated();

        $types = collect($this->actingAs($this->admin)->getJson("/patients/{$this->patientId}/timeline")->assertOk()->json('data'))
            ->countBy('type')->all();
        // fixture: 2 appointments, 2 records, 2 payments (clinic + kids doctor) + 1 prescription + 1 file
        $this->assertEquals(['appointment' => 2, 'treatment' => 2, 'payment' => 2, 'prescription' => 1, 'file' => 1], $types);

        // the assistant does not see the children's doctor's visit or money
        $assistant = collect($this->actingAs($this->assistant)->getJson("/patients/{$this->patientId}/timeline")->json('data'));
        $this->assertSame(1, $assistant->where('type', 'payment')->count());
        $this->assertSame(1, $assistant->where('type', 'appointment')->count());

        // specialty filter + newest first
        $kids = Specialty::where('code', 'pediatrics')->first();
        $res = $this->actingAs($this->admin)->getJson("/patients/{$this->patientId}/timeline?specialty_id={$kids->id}")->json('data');
        $this->assertNotEmpty($res);
        $this->assertTrue(collect($res)->every(fn ($e) => ($e['specialty']['id'] ?? null) === $kids->id));
        $dates = array_column($res, 'at');
        $sorted = $dates;
        rsort($sorted);
        $this->assertSame($sorted, $dates);

        // type filter
        $this->actingAs($this->admin)->getJson("/patients/{$this->patientId}/timeline?types=file")->assertJsonCount(1, 'data');
    }

    public function test_storage_usage_is_admin_only(): void
    {
        $this->upload($this->receptionist, UploadedFile::fake()->image('a.png'));
        $this->actingAs($this->receptionist)->getJson('/admin/storage')->assertForbidden();
        $this->actingAs($this->admin)->getJson('/admin/storage')->assertOk()
            ->assertJsonPath('data.files_count', 1)
            ->assertJsonStructure(['data' => ['files_bytes', 'disk_free_bytes', 'disk_used_percent', 'warning']]);
    }
}
