<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\CompensationRule;
use App\Models\Doctor;
use App\Models\DoctorAttendance;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Payment;
use App\Models\RecurringExpense;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

/**
 * The settlement rule confirmed on 2026-11-20:
 * all charges are deducted first, then the doctor's own percentage applies;
 * clinic-wide charges are split by work hours; revenue = collected payments.
 */
class SettlementTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    private const PERIOD = '2026-10';

    private Doctor $second;

    private ExpenseCategory $rent;

    private ExpenseCategory $lab;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->buildClinic();
        // the fixture's own payments are dated "now" (November) and do not affect October

        $this->second = Doctor::create(['full_name' => 'Second Dentist']);
        $this->second->specialties()->attach($this->clinicAppointment->specialty_id, ['is_primary' => true]);

        $this->rent = ExpenseCategory::create(['name' => 'إيجار']);
        $this->lab = ExpenseCategory::create(['name' => 'مخبر', 'default_allocation' => 'doctor']);

        // October: A (clinic dentist) worked 120 h, B 40 h; K is independent.
        $this->hours($this->clinicDoctor, 120);
        $this->hours($this->second, 40);
        $this->hours($this->kidsDoctor, 60);

        $this->collect($this->clinicDoctor, 1_000_000);
        $this->collect($this->second, 400_000);
        $this->collect($this->kidsDoctor, 200_000);
        $this->collect($this->clinicDoctor, 300, 'USD');

        $this->rule($this->clinicDoctor, 40);
        $this->rule($this->second, 50);
        $this->rule($this->kidsDoctor, 30);

        // rent 200,000 split 120:40 → A 150,000, B 50,000; A also has 150,000 of lab work
        Expense::create(['category_id' => $this->rent->id, 'amount' => 200_000, 'currency' => 'SYP', 'spent_at' => '2026-10-01', 'allocation' => 'clinic_wide']);
        Expense::create(['category_id' => $this->lab->id, 'amount' => 150_000, 'currency' => 'SYP', 'spent_at' => '2026-10-12', 'allocation' => 'doctor', 'doctor_id' => $this->clinicDoctor->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function hours(Doctor $d, int $h): void
    {
        DoctorAttendance::create(['doctor_id' => $d->id, 'date' => '2026-10-05', 'check_in' => '2026-10-05 06:00:00', 'check_out' => '2026-10-05 07:00:00', 'minutes' => $h * 60]);
    }

    private function collect(Doctor $d, float $amount, string $cur = 'SYP'): void
    {
        $a = Appointment::create([
            'patient_id' => $this->clinicAppointment->patient_id, 'doctor_id' => $d->id,
            'specialty_id' => $d->specialties()->first()?->id, 'scheduled_at' => '2026-10-10 08:00:00', 'status' => 'Completed',
        ]);
        Payment::create([
            'appointment_id' => $a->id, 'patient_id' => $a->patient_id, 'doctor_id' => $d->id, 'specialty_id' => $a->specialty_id,
            'amount' => $amount, 'currency' => $cur, 'paid_at' => '2026-10-10 09:00:00',
        ]);
    }

    private function rule(Doctor $d, float $percent, ?string $specialtyId = null): void
    {
        CompensationRule::create(['doctor_id' => $d->id, 'specialty_id' => $specialtyId, 'percent' => $percent, 'effective_from' => '2026-01-01']);
    }

    private function row(array $data, Doctor $d, string $cur = 'SYP'): array
    {
        return collect($data['rows'])->first(fn ($r) => $r['doctor_id'] === $d->id && $r['currency'] === $cur);
    }

    public function test_the_confirmed_example_all_charges_first_then_percentage(): void
    {
        $data = $this->actingAs($this->admin)->getJson('/settlements?period='.self::PERIOD)->assertOk()->json('data');
        $this->assertSame('hours', $data['allocation_basis']);

        $a = $this->row($data, $this->clinicDoctor);
        $this->assertEquals(1_000_000, $a['revenue']);
        $this->assertEquals(150_000, $a['direct_expenses']);
        $this->assertEquals(150_000, $a['allocated_expenses']);   // 200,000 × 120/160
        $this->assertEquals(700_000, $a['net']);
        $this->assertEquals(280_000, $a['doctor_share']);          // (1,000,000 − 300,000) × 40%
        $this->assertEquals(420_000, $a['clinic_share']);

        $b = $this->row($data, $this->second);
        $this->assertEquals(50_000, $b['allocated_expenses']);     // 200,000 × 40/160
        $this->assertEquals(175_000, $b['doctor_share']);          // 350,000 × 50%

        // independent doctor: own books, no share of the clinic's rent
        $k = $this->row($data, $this->kidsDoctor);
        $this->assertEquals(0, $k['allocated_expenses']);
        $this->assertEquals(60_000, $k['doctor_share']);

        // USD is settled separately: no charges in USD
        $this->assertEquals(120, $this->row($data, $this->clinicDoctor, 'USD')['doctor_share']);
    }

    public function test_payouts_close_month_and_frozen_figures(): void
    {
        $this->actingAs($this->admin)->postJson('/payouts', [
            'doctor_id' => $this->clinicDoctor->id, 'period' => self::PERIOD, 'amount' => 100_000, 'currency' => 'SYP', 'paid_at' => '2026-11-02',
        ])->assertCreated();

        $data = $this->actingAs($this->admin)->postJson('/settlements/close', ['period' => self::PERIOD])->assertOk()->json('data');
        $this->assertTrue($data['closed']);
        $a = $this->row($data, $this->clinicDoctor);
        $this->assertEquals(100_000, $a['paid']);
        $this->assertEquals(180_000, $a['owed']);

        // closed month: no changes to its charges or attendance; figures stay frozen
        $expense = Expense::first();
        $this->actingAs($this->admin)->patchJson("/expenses/{$expense->id}", ['amount' => 1])->assertStatus(422);
        $this->actingAs($this->admin)->postJson('/expenses', [
            'category_id' => $this->rent->id, 'amount' => 5, 'currency' => 'SYP', 'spent_at' => '2026-10-20', 'allocation' => 'clinic_wide',
        ])->assertStatus(422);
        Payment::where('doctor_id', $this->clinicDoctor->id)->where('currency', 'SYP')->first()->update(['amount' => 5]);
        $this->assertEquals(280_000, $this->row($this->actingAs($this->admin)->getJson('/settlements?period='.self::PERIOD)->json('data'), $this->clinicDoctor)['doctor_share']);

        // the current month cannot be closed; reopening recomputes
        $this->actingAs($this->admin)->postJson('/settlements/close', ['period' => '2026-11'])->assertStatus(422);
        $re = $this->actingAs($this->admin)->postJson('/settlements/reopen', ['period' => self::PERIOD])->assertOk()->json('data');
        $this->assertFalse($re['closed']);
        $this->assertEquals(0, $this->row($re, $this->clinicDoctor)['doctor_share']); // now 5 − 300,000 < 0 → 0
    }

    public function test_percentage_per_specialty_and_dated_rules(): void
    {
        $kids = $this->kidsAppointment->specialty_id;
        $this->clinicDoctor->specialties()->attach($kids, ['is_primary' => false]);
        // A also earned 100,000 in pediatrics, paid at 60% for that specialty
        $a = Appointment::create(['patient_id' => $this->clinicAppointment->patient_id, 'doctor_id' => $this->clinicDoctor->id, 'specialty_id' => $kids, 'scheduled_at' => '2026-10-11 08:00:00', 'status' => 'Completed']);
        Payment::create(['appointment_id' => $a->id, 'patient_id' => $a->patient_id, 'doctor_id' => $this->clinicDoctor->id, 'specialty_id' => $kids, 'amount' => 100_000, 'currency' => 'SYP', 'paid_at' => '2026-10-11 09:00:00']);
        $this->rule($this->clinicDoctor, 60, $kids);

        // a later rule (from November) must not affect October
        $this->actingAs($this->admin)->postJson('/compensation-rules', [
            'doctor_id' => $this->clinicDoctor->id, 'percent' => 10, 'effective_from' => '2026-11-01',
        ])->assertCreated();

        $row = $this->row($this->actingAs($this->admin)->getJson('/settlements?period='.self::PERIOD)->json('data'), $this->clinicDoctor);
        // net 800,000 split by revenue 1,000,000 : 100,000 → 727,272.73 × 40% + 72,727.27 × 60%
        $this->assertEqualsWithDelta(290_909.09 + 43_636.36, $row['doctor_share'], 0.02);
    }

    public function test_without_attendance_shared_charges_split_by_revenue_with_a_warning(): void
    {
        DoctorAttendance::query()->delete();
        $data = $this->actingAs($this->admin)->getJson('/settlements?period='.self::PERIOD)->json('data');

        $this->assertSame('revenue', $data['allocation_basis']);
        $this->assertNotEmpty($data['warnings']);
        // rent 200,000 by revenue among clinic doctors 1,000,000 : 400,000
        $this->assertEqualsWithDelta(142_857.14, $this->row($data, $this->clinicDoctor)['allocated_expenses'], 0.02);
    }

    public function test_who_sees_what(): void
    {
        $this->actingAs($this->assistant)->getJson('/settlements?period='.self::PERIOD)->assertForbidden();
        $this->actingAs($this->clinicDoctorUser)->getJson('/settlements?period='.self::PERIOD)->assertForbidden();

        $mine = $this->actingAs($this->clinicDoctorUser)->getJson('/my-settlement?period='.self::PERIOD)->assertOk()->json('data.rows');
        $this->assertCount(2, $mine); // SYP + USD, own rows only
        $this->assertTrue(collect($mine)->every(fn ($r) => $r['doctor_id'] === $this->clinicDoctor->id));
        $this->assertArrayNotHasKey('details', $mine[0]);
    }

    public function test_attendance_check_in_out_and_rules(): void
    {
        Carbon::setTestNow('2026-11-15 06:00:00'); // 09:00 Damascus
        $this->actingAs($this->receptionist)->postJson('/attendance/check-in', ['doctor_id' => $this->second->id])->assertCreated();
        $this->actingAs($this->receptionist)->postJson('/attendance/check-in', ['doctor_id' => $this->second->id])->assertStatus(422);

        // a doctor clocks only themselves; assistants cannot clock
        $this->actingAs($this->clinicDoctorUser)->postJson('/attendance/check-in', ['doctor_id' => $this->second->id])->assertForbidden();
        $this->actingAs($this->clinicDoctorUser)->postJson('/attendance/check-in')->assertCreated();
        $this->actingAs($this->assistant)->postJson('/attendance/check-in', ['doctor_id' => $this->second->id])->assertForbidden();

        Carbon::setTestNow('2026-11-15 10:30:00');
        $row = $this->actingAs($this->receptionist)->postJson('/attendance/check-out', ['doctor_id' => $this->second->id])->assertOk()->json('data');
        $this->assertSame(270, $row['minutes']); // 4 h 30

        $today = collect($this->actingAs($this->receptionist)->getJson('/attendance/today')->json('data'));
        $this->assertTrue($today->firstWhere('doctor_id', $this->clinicDoctor->id)['checked_in']);
        $this->assertSame(270, $today->firstWhere('doctor_id', $this->second->id)['today_minutes']);

        // corrections: admin only, and logged
        $id = DoctorAttendance::where('doctor_id', $this->second->id)->where('date', '2026-11-15')->value('id');
        $this->actingAs($this->receptionist)->patchJson("/attendance/$id", ['check_in' => '08:00', 'check_out' => '14:00'])->assertForbidden();
        $this->actingAs($this->admin)->patchJson("/attendance/$id", ['check_in' => '08:00', 'check_out' => '14:00'])
            ->assertOk()->assertJsonPath('data.minutes', 360);
        $this->actingAs($this->admin)->patchJson("/attendance/$id", ['check_in' => '15:00', 'check_out' => '14:00'])->assertStatus(422);
    }

    public function test_recurring_expenses_are_generated_once_per_month(): void
    {
        RecurringExpense::create(['category_id' => $this->rent->id, 'amount' => 500_000, 'currency' => 'SYP', 'allocation' => 'clinic_wide', 'is_active' => true]);

        $this->artisan('clinic:recurring-expenses', ['--period' => '2026-12'])->assertSuccessful();
        $this->artisan('clinic:recurring-expenses', ['--period' => '2026-12'])->assertSuccessful();

        $this->assertSame(1, Expense::where('spent_at', '2026-12-01')->count());
        $this->assertEquals(500_000, Expense::where('spent_at', '2026-12-01')->value('amount'));
    }
}
