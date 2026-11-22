<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\Patient;
use App\Models\PatientFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

/** One button: delete duplicate patients that have no appointments (and nothing else). */
class DuplicatePatientsCleanupTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    public function test_cleanup_rules(): void
    {
        $this->buildClinic();
        $real = $this->clinicAppointment->patient;                         // "Shared Patient", has appointments

        $copy1 = Patient::create(['full_name' => 'shared patient ']);        // same name, nothing attached → delete
        $copy2 = Patient::create(['full_name' => 'Shared  Patient']);        // different inner spacing = different name → keep
        $withFile = Patient::create(['full_name' => 'Shared Patient']);      // has a file → keep
        PatientFile::create(['patient_id' => $withFile->id, 'category' => 'xray', 'title' => 'x', 'path' => 'p', 'original_name' => 'x.jpg', 'mime' => 'image/jpeg', 'size' => 1]);

        $a1 = Patient::create(['full_name' => 'سارة أحمد']);                 // three empty copies → keep the oldest
        $a2 = Patient::create(['full_name' => 'سارة أحمد']);
        $a3 = Patient::create(['full_name' => ' سارة أحمد ']);

        $b1 = Patient::create(['full_name' => 'محمد']);                      // empty copy + copy with appointment → delete the empty one
        $b2 = Patient::create(['full_name' => 'محمد']);
        Appointment::create(['patient_id' => $b2->id, 'doctor_id' => $this->clinicDoctor->id, 'scheduled_at' => now(), 'status' => 'Scheduled']);

        $lonely = Patient::create(['full_name' => 'بدون تكرار']);            // not a duplicate → keep
        $samePhone1 = Patient::create(['full_name' => 'ملغية', 'phone_number' => '0991 111 111']);
        $samePhone2 = Patient::create(['full_name' => 'ملغية', 'phone_number' => '0991111111']);   // same phone → delete
        $otherPhone = Patient::create(['full_name' => 'ملغية', 'phone_number' => '0992 222 222']); // different person → keep

        // preview: admin only
        $this->actingAs($this->receptionist)->getJson('/patients/duplicates/cleanup')->assertForbidden();
        $this->actingAs($this->clinicDoctorUser)->postJson('/patients/duplicates/cleanup')->assertForbidden();
        $preview = $this->actingAs($this->admin)->getJson('/patients/duplicates/cleanup')->assertOk()->json();
        $expected = [$copy1->id, $a2->id, $a3->id, $b1->id, $samePhone2->id];
        $this->assertEqualsCanonicalizing($expected, array_column($preview['data'], 'id'));
        $this->assertSame(5, $preview['count']);

        // delete only what was confirmed
        $this->actingAs($this->admin)->postJson('/patients/duplicates/cleanup', ['ids' => $expected])
            ->assertOk()->assertJson(['deleted' => 5]);

        foreach ($expected as $id) {
            $this->assertSoftDeleted('patients', ['id' => $id]); // restorable
        }
        foreach ([$real, $copy2, $withFile, $a1, $b2, $lonely, $samePhone1, $otherPhone] as $kept) {
            $this->assertNotSoftDeleted('patients', ['id' => $kept->id]);
        }

        // one summary line in the activity log, not one per patient
        $this->assertSame(1, ActivityLog::where('subject_type', 'patient')->where('event', 'deleted')->count());

        // nothing left to clean
        $this->actingAs($this->admin)->getJson('/patients/duplicates/cleanup')->assertJson(['count' => 0]);
    }
}
