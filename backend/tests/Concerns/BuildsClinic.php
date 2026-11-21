<?php

namespace Tests\Concerns;

use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\Specialty;
use App\Models\SubTreatment;
use App\Models\Treatment;
use App\Models\TreatmentRecord;
use App\Models\User;

/**
 * A small clinic: one clinic dentist (C) and one independent children's
 * doctor (K, has_own_books) sharing one patient, each with an appointment,
 * a treatment record and a payment.
 */
trait BuildsClinic
{
    protected User $admin;

    protected User $clinicDoctorUser;

    protected User $assistant;

    protected User $receptionist;

    protected User $kidsDoctorUser;

    protected Doctor $clinicDoctor;

    protected Doctor $kidsDoctor;

    protected Treatment $clinicTreatment;

    protected Treatment $kidsTreatment;

    protected Appointment $clinicAppointment;

    protected Appointment $kidsAppointment;

    protected Payment $clinicPayment;

    protected Payment $kidsPayment;

    protected function buildClinic(): void
    {
        $this->admin = User::factory()->create(['role' => 'super_admin']);
        $this->clinicDoctorUser = User::factory()->create(['role' => 'doctor']);
        $this->assistant = User::factory()->create(['role' => 'dentist_assistant']);
        $this->receptionist = User::factory()->create(['role' => 'receptionist']);
        $this->kidsDoctorUser = User::factory()->create(['role' => 'doctor']);

        $dental = Specialty::create(['name_ar' => 'طب الأسنان', 'code' => 'dental', 'is_dental' => true]);
        $kids = Specialty::create(['name_ar' => 'طب الأطفال', 'code' => 'pediatrics', 'is_dental' => false]);

        $this->clinicDoctor = Doctor::create(['full_name' => 'Clinic Dentist', 'user_id' => $this->clinicDoctorUser->id]);
        $this->kidsDoctor = Doctor::create(['full_name' => 'Kids Doctor', 'user_id' => $this->kidsDoctorUser->id, 'has_own_books' => true]);
        $this->clinicDoctor->specialties()->attach($dental->id, ['is_primary' => true]);
        $this->kidsDoctor->specialties()->attach($kids->id, ['is_primary' => true]);

        $this->clinicTreatment = Treatment::create(['name' => 'حشوة', 'specialty_id' => $dental->id]);
        $this->kidsTreatment = Treatment::create(['name' => 'معاينة وفحص', 'specialty_id' => $kids->id, 'doctor_id' => $this->kidsDoctor->id]);
        $clinicSub = SubTreatment::create(['treatment_id' => $this->clinicTreatment->id, 'name' => 'حشوة ضوئية', 'tooth_association' => 'single_tooth']);
        $kidsSub = SubTreatment::create(['treatment_id' => $this->kidsTreatment->id, 'name' => 'معاينة']);

        $patient = Patient::create(['full_name' => 'Shared Patient']);

        [$this->clinicAppointment, $this->clinicPayment] = $this->visit($patient, $this->clinicDoctor, $dental, $this->clinicTreatment, $clinicSub, '16');
        [$this->kidsAppointment, $this->kidsPayment] = $this->visit($patient, $this->kidsDoctor, $kids, $this->kidsTreatment, $kidsSub, null);
    }

    private function visit(Patient $patient, Doctor $doctor, Specialty $specialty, Treatment $treatment, SubTreatment $sub, ?string $tooth): array
    {
        $appointment = Appointment::create([
            'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'specialty_id' => $specialty->id,
            'scheduled_at' => now(), 'status' => 'Completed',
        ]);
        TreatmentRecord::create([
            'appointment_id' => $appointment->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id,
            'specialty_id' => $specialty->id, 'treatment_id' => $treatment->id, 'sub_treatment_id' => $sub->id,
            'tooth_number' => $tooth, 'actual_cost_syp' => 100000, 'performed_at' => now(), 'is_completed' => true,
        ]);
        $payment = Payment::create([
            'appointment_id' => $appointment->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id,
            'specialty_id' => $specialty->id, 'amount' => 50000, 'currency' => 'SYP', 'paid_at' => now(),
        ]);

        return [$appointment, $payment];
    }
}
