<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Appointment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

class ActivityLogTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
        ActivityLog::query()->delete(); // fixtures are not user actions
    }

    public function test_appointment_payment_and_deletion_are_logged_as_readable_sentences(): void
    {
        $patient = $this->clinicAppointment->patient;
        $this->clinicDoctorUser->update(['full_name' => 'أحمد']);
        ActivityLog::query()->delete();

        $id = $this->actingAs($this->receptionist)->postJson('/appointments', [
            'patient_id' => $patient->id, 'doctor_id' => $this->clinicDoctor->id, 'scheduled_at' => '2026-12-01T10:00',
        ])->assertCreated()->json('data.id');

        $this->actingAs($this->clinicDoctorUser)->postJson('/payments', [
            'appointment_id' => $id, 'amount' => 50000, 'currency' => 'SYP',
        ])->assertCreated();

        $this->actingAs($this->admin)->patchJson("/appointments/$id", ['status' => 'Cancelled'])->assertOk();
        $this->actingAs($this->admin)->patchJson("/appointments/$id", ['notes' => 'x'])->assertOk(); // not logged
        $this->actingAs($this->admin)->deleteJson("/appointments/$id")->assertNoContent();

        $lines = ActivityLog::orderBy('created_at')->orderBy('id')->get();
        $this->assertCount(4, $lines);

        $created = $lines->firstWhere('event', 'created');
        $this->assertStringContainsString('حجز موعداً للمريض '.$patient->full_name, $created->description);
        $this->assertStringContainsString('2026-12-01 10:00', $created->description); // clinic time
        $this->assertSame($patient->id, $created->patient_id);

        $payment = $lines->firstWhere('subject_type', 'payment');
        $this->assertStringStartsWith('د. أحمد سجّل دفعة 50,000 ل.س للمريض', $payment->description);
        $this->assertTrue($payment->is_money);

        $this->assertNotNull($lines->first(fn ($l) => str_contains($l->description, 'ألغى موعد المريض')));

        $deleted = $lines->firstWhere('event', 'deleted');
        $this->assertStringContainsString('1 دفعة بمجموع 50,000 ل.س', $deleted->description);
        $this->assertTrue($deleted->is_money);
    }

    public function test_page_is_admin_only_and_filters_work(): void
    {
        $patient = $this->clinicAppointment->patient;
        $this->actingAs($this->receptionist)->postJson('/patients', ['full_name' => 'سارة'])->assertCreated();
        $this->actingAs($this->receptionist)->patchJson("/patients/{$patient->id}", ['phone_number' => '0999'])->assertOk();
        $this->actingAs($this->admin)->deleteJson("/payments/{$this->clinicPayment->id}")->assertNoContent();

        $this->actingAs($this->receptionist)->getJson('/activity-logs')->assertForbidden();

        $this->actingAs($this->admin)->getJson('/activity-logs')->assertOk()->assertJsonPath('total', 3);
        $this->actingAs($this->admin)->getJson('/activity-logs?important=1')
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.subject_type', 'payment');
        $this->actingAs($this->admin)->getJson("/activity-logs?user_id={$this->receptionist->id}")->assertJsonPath('total', 2);
        $this->actingAs($this->admin)->getJson('/activity-logs?search=سارة')->assertJsonPath('total', 1);
        $this->actingAs($this->admin)->getJson('/activity-logs/users')->assertJsonCount(2, 'data');
    }

    public function test_imports_and_login_do_not_flood_the_log(): void
    {
        $this->actingAs($this->receptionist)->postJson('/patients/import', ['rows' => [
            ['full_name' => 'أ'], ['full_name' => 'ب'], ['full_name' => 'ج'],
        ]])->assertOk();

        $this->assertSame(1, ActivityLog::count());
        $this->assertStringContainsString('استورد 3 مريضاً', ActivityLog::first()->description);

        $this->assertSame(0, ActivityLog::where('subject_type', 'appointment')->count());
        Appointment::query()->first()->update(['notes' => 'n']);
        $this->assertSame(0, ActivityLog::where('subject_type', 'appointment')->count());
    }

    public function test_price_list_and_settings_changes_are_logged(): void
    {
        $sub = $this->clinicTreatment->subTreatments()->first();

        // price change → money line naming old and new price
        $this->actingAs($this->admin)->patchJson("/sub-treatments/{$sub->id}", ['estimated_cost_syp' => 250])->assertOk();
        $price = ActivityLog::where('subject_type', 'treatment')->sole();
        $this->assertStringContainsString('عدّل العلاج الفرعي «حشوة ضوئية» في «حشوة»: السعر من', $price->description);
        $this->assertStringContainsString('إلى 250 ل.س', $price->description);
        $this->assertTrue($price->is_money);

        // saving the same price again is not a change
        $this->actingAs($this->admin)->patchJson("/sub-treatments/{$sub->id}", ['estimated_cost_syp' => 250])->assertOk();
        $this->assertSame(1, ActivityLog::where('subject_type', 'treatment')->count());

        // role permission toggle (first save creates the row) and a specialty
        $this->actingAs($this->admin)->putJson('/role-permissions', ['role' => 'receptionist', 'resource' => 'payments', 'can_delete' => true])->assertOk();
        $this->actingAs($this->admin)->putJson('/role-permissions', ['role' => 'receptionist', 'resource' => 'payments', 'can_delete' => false])->assertOk();
        $perms = ActivityLog::where('subject_type', 'settings')->orderBy('created_at')->orderBy('id')->pluck('description');
        $this->assertCount(2, $perms);
        $this->assertTrue($perms->contains(fn ($d) => str_contains($d, 'غيّر صلاحيات دور موظف استقبال على «payments»: سمح بـالحذف')));
        $this->assertTrue($perms->contains(fn ($d) => str_contains($d, 'منع الحذف')));

        $this->actingAs($this->admin)->postJson('/specialties', ['name_ar' => 'جلدية'])->assertCreated();
        $this->assertSame(1, ActivityLog::where('description', 'like', '%أضاف التخصص جلدية%')->count());
    }

    public function test_patient_history_filter(): void
    {
        $patient = $this->clinicAppointment->patient;
        $this->actingAs($this->receptionist)->patchJson("/patients/{$patient->id}", ['phone_number' => '0999'])->assertOk();
        $this->actingAs($this->admin)->postJson('/payments', [
            'appointment_id' => $this->clinicAppointment->id, 'amount' => 10, 'currency' => 'USD',
        ])->assertCreated();
        $this->actingAs($this->receptionist)->postJson('/patients', ['full_name' => 'مريض آخر'])->assertCreated();

        $this->actingAs($this->admin)->getJson("/activity-logs?patient_id={$patient->id}")
            ->assertOk()->assertJsonPath('total', 2);
    }
}
