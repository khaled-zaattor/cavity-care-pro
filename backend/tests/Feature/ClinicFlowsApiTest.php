<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\SubTreatment;
use App\Models\SubTreatmentStep;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\UnfinishedSubTreatment;
use App\Models\WaitingListEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

class ClinicFlowsApiTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    private Patient $patient;

    private SubTreatment $fill;

    private SubTreatment $exam;

    /** @var SubTreatmentStep[] */
    private array $steps;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
        $this->patient = $this->clinicAppointment->patient;
        $this->fill = $this->clinicTreatment->subTreatments()->first();
        $this->exam = $this->kidsTreatment->subTreatments()->first();
        $this->steps = [
            SubTreatmentStep::create(['sub_treatment_id' => $this->fill->id, 'step_name' => 'تحضير', 'step_order' => 1]),
            SubTreatmentStep::create(['sub_treatment_id' => $this->fill->id, 'step_name' => 'حشو', 'step_order' => 2]),
        ];
    }

    private function scheduled(string $doctor = 'clinic'): Appointment
    {
        return Appointment::create([
            'patient_id' => $this->patient->id,
            'doctor_id' => $doctor === 'clinic' ? $this->clinicDoctor->id : $this->kidsDoctor->id,
            'specialty_id' => $doctor === 'clinic' ? $this->clinicAppointment->specialty_id : $this->kidsAppointment->specialty_id,
            'scheduled_at' => now(),
            'status' => 'Scheduled',
        ]);
    }

    // ---- patients ----------------------------------------------------------

    public function test_patients_duplicate_name_paging_and_import(): void
    {
        $this->actingAs($this->receptionist)->postJson('/patients', ['full_name' => '  shared PATIENT '])
            ->assertStatus(422)->assertJsonValidationErrors('full_name');

        $this->actingAs($this->receptionist)->postJson('/patients', ['full_name' => 'سارة', 'phone_number' => '0933'])->assertCreated();
        $this->actingAs($this->receptionist)->getJson('/patients?filter=no_appointments')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.full_name', 'سارة');
        $this->actingAs($this->receptionist)->getJson('/patients/search?q=093')->assertJsonCount(1, 'data');

        $this->actingAs($this->receptionist)->postJson('/patients/import', ['rows' => [
            ['full_name' => 'سارة'], ['full_name' => 'جديد'], ['full_name' => 'جديد '],
        ]])->assertOk()->assertJson(['inserted' => 1, 'skipped' => 2]);

        $this->actingAs($this->clinicDoctorUser)->deleteJson("/patients/{$this->patient->id}")->assertForbidden();
    }

    // ---- appointments ------------------------------------------------------

    public function test_appointment_defaults_specialty_and_independent_doctor_books_only_self(): void
    {
        $this->actingAs($this->receptionist)->postJson('/appointments', [
            'patient_id' => $this->patient->id, 'doctor_id' => $this->kidsDoctor->id, 'scheduled_at' => '2026-12-01T10:00',
        ])->assertCreated()
            ->assertJsonPath('data.specialty_id', $this->kidsAppointment->specialty_id)
            // bare local time = clinic time (Damascus, UTC+3)
            ->assertJsonPath('data.scheduled_at', '2026-12-01T07:00:00.000000Z');

        $this->actingAs($this->kidsDoctorUser)->postJson('/appointments', [
            'patient_id' => $this->patient->id, 'doctor_id' => $this->clinicDoctor->id, 'scheduled_at' => now()->toIso8601String(),
        ])->assertStatus(422);

        // assistant does not see the kids doctor's appointments
        $this->actingAs($this->assistant)->getJson("/appointments?patient_id={$this->patient->id}")->assertJsonPath('total', 1);
    }

    // ---- F1 record ---------------------------------------------------------

    public function test_record_treatment_partial_steps_with_payment_in_one_call(): void
    {
        $a = $this->scheduled();

        $this->actingAs($this->assistant)->postJson("/appointments/{$a->id}/treatments", [
            'treatment_id' => $this->clinicTreatment->id, 'sub_treatment_id' => $this->fill->id,
            'tooth_numbers' => ['16'], 'actual_cost_syp' => 200000, 'payment_amount' => 75000, 'payment_currency' => 'SYP',
            'notes' => 'ملاحظة الموعد', 'step_ids' => [$this->steps[0]->id],
        ])->assertCreated()->assertJsonPath('data.is_completed', false)->assertJsonPath('data.tooth_number', '16');

        $this->assertSame('ملاحظة الموعد', $a->fresh()->notes);
        $payment = Payment::where('appointment_id', $a->id)->sole();
        $this->assertSame($this->clinicDoctor->id, $payment->doctor_id);
        $this->assertSame($this->assistant->id, $payment->received_by);
        $this->assertSame(1, UnfinishedSubTreatment::where('last_appointment_id', $a->id)->count());
    }

    public function test_record_treatment_rules(): void
    {
        $a = $this->scheduled();
        // single_tooth: max one tooth
        $this->actingAs($this->assistant)->postJson("/appointments/{$a->id}/treatments", [
            'treatment_id' => $this->clinicTreatment->id, 'sub_treatment_id' => $this->fill->id, 'tooth_numbers' => ['16', '17'],
        ])->assertStatus(422);
        // kids catalog on a clinic doctor's appointment
        $this->actingAs($this->admin)->postJson("/appointments/{$a->id}/treatments", [
            'treatment_id' => $this->kidsTreatment->id, 'sub_treatment_id' => $this->exam->id,
        ])->assertStatus(422);
        // receptionist cannot record treatments
        $this->actingAs($this->receptionist)->postJson("/appointments/{$a->id}/treatments", [
            'treatment_id' => $this->clinicTreatment->id, 'sub_treatment_id' => $this->fill->id,
        ])->assertForbidden();
        // non-dental: tooth ignored, no steps = completed
        $k = $this->scheduled('kids');
        $this->actingAs($this->kidsDoctorUser)->postJson("/appointments/{$k->id}/treatments", [
            'treatment_id' => $this->kidsTreatment->id, 'sub_treatment_id' => $this->exam->id, 'tooth_numbers' => ['11'],
        ])->assertCreated()->assertJsonPath('data.tooth_number', null)->assertJsonPath('data.is_completed', true);
        // completed appointment is locked
        $this->actingAs($this->admin)->postJson("/appointments/{$this->clinicAppointment->id}/treatments", [
            'treatment_id' => $this->clinicTreatment->id, 'sub_treatment_id' => $this->fill->id,
        ])->assertStatus(422);
    }

    // ---- F2 resume ---------------------------------------------------------

    public function test_resume_completes_treatment_across_sessions(): void
    {
        $first = $this->scheduled();
        $id = $this->actingAs($this->assistant)->postJson("/appointments/{$first->id}/treatments", [
            'treatment_id' => $this->clinicTreatment->id, 'sub_treatment_id' => $this->fill->id,
            'tooth_numbers' => ['26'], 'step_ids' => [$this->steps[0]->id], 'treatment_notes' => 'بداية',
        ])->json('data.id');

        $second = $this->scheduled();
        $this->actingAs($this->assistant)->getJson("/appointments/{$second->id}/completed-steps?treatment_record_id=$id")
            ->assertJsonPath('data', [$this->steps[0]->id]);
        $this->actingAs($this->assistant)->getJson("/patients/{$this->patient->id}/treatment-records?incomplete=1")
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.executed_steps', ['تحضير']);

        $this->actingAs($this->assistant)->postJson("/appointments/{$second->id}/resume", [
            'treatment_record_id' => $id, 'step_ids' => [$this->steps[1]->id], 'notes' => 'انتهى',
        ])->assertOk()->assertJsonPath('data.is_completed', true)->assertJsonPath('data.appointment_id', $second->id);

        $original = TreatmentRecord::find($id);
        $this->assertTrue($original->is_completed);
        $this->assertStringContainsString("بداية\n\n---", $original->treatment_notes);
        $this->assertSame(0, UnfinishedSubTreatment::count());
    }

    // ---- F3 plan -----------------------------------------------------------

    public function test_execute_plan_once_and_deleting_the_appointment_reopens_it(): void
    {
        $planId = $this->actingAs($this->clinicDoctorUser)->postJson('/treatment-plans', [
            'patient_id' => $this->patient->id, 'treatment_id' => $this->clinicTreatment->id,
            'sub_treatment_id' => $this->fill->id, 'tooth_numbers' => ['36'],
        ])->assertCreated()->json('data.id');

        $a = $this->scheduled();
        $this->actingAs($this->clinicDoctorUser)->postJson("/appointments/{$a->id}/execute-plan", [
            'treatment_plan_id' => $planId, 'actual_cost_syp' => 100, 'step_ids' => array_map(fn ($s) => $s->id, $this->steps),
            'payment_amount' => 10, 'payment_currency' => 'USD',
        ])->assertCreated()->assertJsonPath('data.tooth_number', '36')->assertJsonPath('data.is_completed', true);
        $this->assertTrue(TreatmentPlan::find($planId)->is_executed);

        $this->actingAs($this->clinicDoctorUser)->postJson("/appointments/{$a->id}/execute-plan", ['treatment_plan_id' => $planId])
            ->assertStatus(422);

        $this->actingAs($this->receptionist)->deleteJson("/appointments/{$a->id}")->assertNoContent();
        $this->assertFalse(TreatmentPlan::find($planId)->is_executed);
        $this->assertSame(0, Payment::withTrashed()->where('appointment_id', $a->id)->count());
    }

    // ---- money ---------------------------------------------------------------

    public function test_balance_is_split_by_books_and_hidden_across_books(): void
    {
        // fixture: each doctor charged 100000 SYP, paid 50000 SYP
        $this->actingAs($this->admin)->getJson("/patients/{$this->patient->id}/balance")
            ->assertOk()
            ->assertJsonPath('data.syp', 100000)
            ->assertJsonPath('data.total_paid_syp', 100000)
            ->assertJsonCount(2, 'data.by_books')
            ->assertJsonCount(2, 'data.by_specialty');

        $this->actingAs($this->assistant)->getJson("/patients/{$this->patient->id}/balance")
            ->assertJsonPath('data.syp', 50000)->assertJsonCount(1, 'data.by_books');
        $this->actingAs($this->kidsDoctorUser)->getJson("/patients/{$this->patient->id}/payments")
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.doctor_id', $this->kidsDoctor->id);
    }

    public function test_payments_edit_and_role_rules(): void
    {
        $this->actingAs($this->receptionist)->postJson('/payments', [
            'appointment_id' => $this->clinicAppointment->id, 'amount' => 1000, 'currency' => 'USD',
        ])->assertCreated()->assertJsonPath('data.specialty_id', $this->clinicAppointment->specialty_id);

        $this->actingAs($this->receptionist)->postJson('/payments', [
            'appointment_id' => $this->kidsAppointment->id, 'amount' => 1000, 'currency' => 'SYP',
        ])->assertForbidden();

        $this->actingAs($this->receptionist)->deleteJson("/payments/{$this->clinicPayment->id}")->assertForbidden();
        $this->actingAs($this->assistant)->patchJson("/payments/{$this->clinicPayment->id}", ['amount' => 60000])->assertOk();
        $this->actingAs($this->assistant)->deleteJson("/payments/{$this->clinicPayment->id}")->assertNoContent();
        $this->assertSoftDeleted($this->clinicPayment);
    }

    public function test_stats_and_revenue_report(): void
    {
        $range = 'from='.urlencode(now()->subDay()->toIso8601String()).'&to='.urlencode(now()->addDay()->toIso8601String());

        $this->actingAs($this->admin)->getJson("/stats?$range")->assertOk()
            ->assertJsonPath('data.treatment_cost_syp', 200000)->assertJsonPath('data.total_payments_syp', 100000);
        $this->actingAs($this->admin)->getJson("/stats?$range&books=clinic")
            ->assertJsonPath('data.treatment_cost_syp', 100000);
        $this->actingAs($this->kidsDoctorUser)->getJson("/stats?$range&books=all")
            ->assertJsonPath('data.total_payments_syp', 50000)->assertJsonPath('data.new_patients_count', null);

        $this->actingAs($this->admin)->getJson("/reports/revenue?$range&group_by=specialty")->assertOk()
            ->assertJsonCount(2, 'data.rows')
            ->assertJsonPath('data.totals.collected_syp', 100000)
            ->assertJsonPath('data.totals.charged_syp', 200000);
        $this->actingAs($this->assistant)->getJson("/reports/revenue?$range")->assertForbidden();
    }

    public function test_bulk_delete_preview_totals_per_currency(): void
    {
        Payment::create([
            'appointment_id' => $this->clinicAppointment->id, 'patient_id' => $this->patient->id, 'doctor_id' => $this->clinicDoctor->id,
            'amount' => 20, 'currency' => 'USD', 'paid_at' => now(),
        ]);
        $range = 'from='.urlencode(now()->subDay()->toIso8601String()).'&to='.urlencode(now()->addDay()->toIso8601String());

        // assistant cannot see the kids doctor's appointment, so it is not in the preview
        $this->actingAs($this->assistant)->getJson("/appointments/bulk-delete-preview?$range")->assertOk()
            ->assertJsonCount(1, 'appointments')
            ->assertJsonPath('totals.payments_syp', 50000)
            ->assertJsonPath('totals.payments_usd', 20);
    }

    // ---- waiting room ------------------------------------------------------

    public function test_waiting_list_links_todays_appointment(): void
    {
        $a = $this->scheduled('kids');
        $id = $this->actingAs($this->receptionist)->postJson('/waiting-list', ['patient_id' => $this->patient->id])
            ->assertCreated()->json('data.id');
        $this->assertNotNull(WaitingListEntry::find($id)->appointment_id);

        $this->actingAs($this->receptionist)->patchJson("/waiting-list/$id", ['action' => 'enter_exam'])
            ->assertJsonPath('data.status', 'in_examination');
        $this->actingAs($this->receptionist)->getJson('/waiting-list?active=1')->assertJsonCount(1, 'data');
        $this->actingAs($this->receptionist)->postJson('/waiting-list/complete-in-exam')->assertJson(['updated' => 1]);
        $this->actingAs($this->receptionist)->postJson('/waiting-list/clear-completed')->assertForbidden();
        $this->actingAs($this->admin)->postJson('/waiting-list/clear-completed')->assertJson(['deleted' => 1]);
    }
}
