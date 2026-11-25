<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\TreatmentRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsClinic;
use Tests\TestCase;

/**
 * Every rule of supabase/migrations/20261119120000_independent_doctors.sql,
 * re-checked against the Laravel port (DoctorBooks + policies).
 */
class DoctorBooksTest extends TestCase
{
    use BuildsClinic, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildClinic();
    }

    /** @return string[] */
    private function visibleIds(string $model, User $user): array
    {
        return $model::query()->visibleTo($user)->pluck('id')->sort()->values()->all();
    }

    private function ids(...$models): array
    {
        return collect($models)->pluck('id')->sort()->values()->all();
    }

    public function test_super_admin_sees_every_doctors_money(): void
    {
        $this->assertSame($this->ids($this->clinicPayment, $this->kidsPayment), $this->visibleIds(Payment::class, $this->admin));
        $this->assertCount(2, TreatmentRecord::query()->visibleTo($this->admin)->get());
    }

    public function test_clinic_staff_do_not_see_independent_doctors_money(): void
    {
        foreach ([$this->assistant, $this->clinicDoctorUser, $this->receptionist] as $user) {
            $this->assertSame($this->ids($this->clinicPayment), $this->visibleIds(Payment::class, $user), $user->role);
            $this->assertCount(1, TreatmentRecord::query()->visibleTo($user)->get(), $user->role);
        }
    }

    public function test_independent_doctor_sees_only_own_money(): void
    {
        $this->assertSame($this->ids($this->kidsPayment), $this->visibleIds(Payment::class, $this->kidsDoctorUser));
        $this->assertCount(1, TreatmentRecord::query()->visibleTo($this->kidsDoctorUser)->get());
    }

    public function test_receptionist_sees_every_schedule_but_clinic_staff_do_not(): void
    {
        $both = $this->ids($this->clinicAppointment, $this->kidsAppointment);
        $this->assertSame($both, $this->visibleIds(Appointment::class, $this->receptionist));
        $this->assertSame($both, $this->visibleIds(Appointment::class, $this->admin));
        $this->assertSame($this->ids($this->clinicAppointment), $this->visibleIds(Appointment::class, $this->assistant));
        $this->assertSame($this->ids($this->kidsAppointment), $this->visibleIds(Appointment::class, $this->kidsDoctorUser));
    }

    public function test_treatment_catalog_visibility(): void
    {
        // catalog is split by specialty only: a doctor sees their specialties
        $this->assertSame($this->ids($this->clinicTreatment), $this->visibleIds(Treatment::class, $this->clinicDoctorUser));
        $this->assertSame($this->ids($this->kidsTreatment), $this->visibleIds(Treatment::class, $this->kidsDoctorUser));
        // admin, reception and assistants see every specialty
        $both = $this->ids($this->clinicTreatment, $this->kidsTreatment);
        foreach ([$this->admin, $this->receptionist, $this->assistant] as $user) {
            $this->assertSame($both, $this->visibleIds(Treatment::class, $user), $user->role);
        }
    }

    public function test_single_row_policies_match_the_scopes(): void
    {
        $this->assertTrue($this->receptionist->can('view', $this->kidsAppointment));
        $this->assertFalse($this->receptionist->can('view', $this->kidsPayment));
        $this->assertFalse($this->assistant->can('view', $this->kidsAppointment));
        $this->assertTrue($this->kidsDoctorUser->can('view', $this->kidsPayment));
        $this->assertFalse($this->kidsDoctorUser->can('view', $this->clinicPayment));
        $this->assertTrue($this->admin->can('view', $this->kidsPayment));
    }

    public function test_role_matrix_for_payments(): void
    {
        // delete: super_admin, doctor, assistant — not receptionist
        $this->assertTrue($this->assistant->can('delete', $this->clinicPayment));
        $this->assertFalse($this->receptionist->can('delete', $this->clinicPayment));
        // ...and never outside one's books
        $this->assertFalse($this->assistant->can('delete', $this->kidsPayment));
        $this->assertTrue($this->kidsDoctorUser->can('delete', $this->kidsPayment));
    }

    public function test_catalog_writes(): void
    {
        $kidsNew = new Treatment(['name' => 'x', 'specialty_id' => $this->kidsTreatment->specialty_id]);
        $dentalNew = new Treatment(['name' => 'y', 'specialty_id' => $this->clinicTreatment->specialty_id]);

        // independent doctor manages the treatments of their own specialty
        $this->assertTrue($this->kidsDoctorUser->can('create', Treatment::class));
        $this->assertTrue($this->kidsDoctorUser->can('store', $kidsNew));
        $this->assertTrue($this->kidsDoctorUser->can('update', $this->kidsTreatment));
        $this->assertFalse($this->kidsDoctorUser->can('store', $dentalNew));
        $this->assertFalse($this->kidsDoctorUser->can('update', $this->clinicTreatment));

        // clinic staff cannot edit the catalog; super_admin can edit everything
        $this->assertFalse($this->assistant->can('create', Treatment::class));
        $this->assertFalse($this->clinicDoctorUser->can('update', $this->clinicTreatment));
        $this->assertTrue($this->admin->can('update', $this->kidsTreatment));
        $this->assertTrue($this->admin->can('store', $dentalNew));
    }

    public function test_patients_are_shared_and_only_admin_deletes_them(): void
    {
        $patient = $this->clinicAppointment->patient;
        $this->assertTrue($this->kidsDoctorUser->can('view', $patient));
        $this->assertTrue($this->receptionist->can('update', $patient));
        $this->assertFalse($this->clinicDoctorUser->can('delete', $patient));
        $this->assertTrue($this->admin->can('delete', $patient));
    }

    public function test_inactive_user_has_no_access(): void
    {
        $this->assistant->update(['is_active' => false]);
        $this->assertFalse($this->assistant->can('view', $this->clinicPayment));
        $this->assertFalse($this->assistant->can('viewAny', Payment::class));
    }
}
