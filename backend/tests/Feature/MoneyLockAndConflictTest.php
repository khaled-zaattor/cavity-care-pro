<?php

namespace Tests\Feature;

use App\Models\Settlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

/** Plan §3.6 (old money locked) and §3.4 (double-booking warning). */
class MoneyLockAndConflictTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
    }

    public function test_payments_older_than_the_lock_need_the_admin(): void
    {
        $this->clinicPayment->update(['paid_at' => now()->subDays(10)]);

        $this->actingAs($this->assistant)->patchJson("/payments/{$this->clinicPayment->id}", ['amount' => 1])
            ->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->actingAs($this->assistant)->deleteJson("/payments/{$this->clinicPayment->id}")->assertStatus(422);
        $this->actingAs($this->admin)->patchJson("/payments/{$this->clinicPayment->id}", ['amount' => 60000])->assertOk();

        // same for treatment costs, but completing an old record is still allowed
        $record = $this->clinicAppointment->treatmentRecords()->first();
        $record->update(['performed_at' => now()->subDays(10)]);
        $this->actingAs($this->assistant)->patchJson("/treatment-records/{$record->id}", ['actual_cost_syp' => 1])->assertStatus(422);
        $this->actingAs($this->assistant)->patchJson("/treatment-records/{$record->id}", ['is_completed' => false])->assertOk();

        // deleting the appointment would delete the old payment too
        $this->actingAs($this->receptionist)->deleteJson("/appointments/{$this->clinicAppointment->id}")->assertStatus(422);
    }

    public function test_nobody_edits_money_of_a_closed_month(): void
    {
        $this->clinicPayment->update(['paid_at' => '2026-01-15 10:00:00']);
        Settlement::create([
            'doctor_id' => $this->clinicDoctor->id, 'period' => '2026-01', 'currency' => 'SYP', 'revenue' => 0, 'direct_expenses' => 0,
            'allocated_expenses' => 0, 'net' => 0, 'doctor_share' => 0, 'clinic_share' => 0, 'closed_at' => now(),
        ]);

        $this->actingAs($this->admin)->patchJson("/payments/{$this->clinicPayment->id}", ['amount' => 1])
            ->assertStatus(422)->assertJsonPath('errors.amount.0', fn ($m) => str_contains($m, 'مغلق'));
    }

    public function test_double_booking_returns_a_warning_not_an_error(): void
    {
        $at = Carbon::parse('2026-12-01 10:00:00', 'Asia/Damascus');
        $this->actingAs($this->receptionist)->postJson('/appointments', [
            'patient_id' => $this->clinicAppointment->patient_id, 'doctor_id' => $this->clinicDoctor->id, 'scheduled_at' => $at->toIso8601String(),
        ])->assertCreated()->assertJsonCount(0, 'data.conflicts');

        $this->actingAs($this->receptionist)->postJson('/appointments', [
            'patient_id' => $this->clinicAppointment->patient_id, 'doctor_id' => $this->clinicDoctor->id, 'scheduled_at' => $at->copy()->addMinutes(10)->toIso8601String(),
        ])->assertCreated()->assertJsonCount(1, 'data.conflicts')->assertJsonPath('data.conflicts.0.patient_name', 'Shared Patient');

        // 15 minutes later is a free slot; another doctor at the same time is fine
        $this->actingAs($this->receptionist)->postJson('/appointments', [
            'patient_id' => $this->clinicAppointment->patient_id, 'doctor_id' => $this->clinicDoctor->id, 'scheduled_at' => $at->copy()->addMinutes(25)->toIso8601String(),
        ])->assertJsonCount(0, 'data.conflicts');
        $this->actingAs($this->receptionist)->postJson('/appointments', [
            'patient_id' => $this->clinicAppointment->patient_id, 'doctor_id' => $this->kidsDoctor->id, 'scheduled_at' => $at->toIso8601String(),
        ])->assertJsonCount(0, 'data.conflicts');
    }
}
