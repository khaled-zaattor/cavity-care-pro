<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentTreatmentStep;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\UnfinishedSubTreatment;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * PatientProfile.tsx sections + the per-patient lists Appointments.tsx needs.
 * Every list is limited to what the user may see (independent-doctor books).
 */
class PatientHistoryController extends Controller
{
    /** GET /patients/{id}/appointments — history table with doctor, payments and treatments. */
    public function appointments(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);
        $user = $request->user();

        $rows = Appointment::query()->visibleTo($user)
            ->where('patient_id', $patient->id)
            ->with([
                'doctor:id,full_name', 'specialty:id,name_ar,color',
                'payments' => fn ($q) => $q->visibleTo($user)->select('id', 'appointment_id', 'amount', 'currency', 'paid_at'),
                'treatmentRecords' => fn ($q) => $q->visibleTo($user),
                'treatmentRecords.treatment:id,name', 'treatmentRecords.subTreatment:id,name',
            ])
            ->orderByDesc('scheduled_at')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * GET /patients/{id}/treatment-records — "all treatments" table, with the
     * executed steps embedded (was one extra query per row).
     * ?incomplete=1 → the "resume treatment" list: incomplete only, most recent
     * per (treatment, sub-treatment, tooth).
     */
    public function treatmentRecords(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);

        $records = TreatmentRecord::query()->visibleTo($request->user())
            ->where('patient_id', $patient->id)
            ->when($request->boolean('incomplete'), fn ($q) => $q->where('is_completed', false))
            ->with([
                'treatment' => fn ($q) => $q->withTrashed()->select('id', 'name'),
                'subTreatment:id,name,tooth_association',
                'appointment:id,scheduled_at,doctor_id', 'appointment.doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name'),
            ])
            ->orderByDesc('performed_at')
            ->get();

        if ($request->boolean('incomplete')) {
            $records = $records->unique(fn ($r) => $r->treatment_id.'|'.$r->sub_treatment_id.'|'.$r->tooth_number)->values();
        }

        // executed steps per (appointment, sub-treatment)
        $steps = AppointmentTreatmentStep::query()
            ->whereIn('appointment_id', $records->pluck('appointment_id')->unique())
            ->join('sub_treatment_steps as s', 's.id', '=', 'appointment_treatment_steps.sub_treatment_step_id')
            ->get(['appointment_treatment_steps.appointment_id', 's.sub_treatment_id', 's.step_name', 's.step_order'])
            ->groupBy(fn ($s) => $s->appointment_id.'|'.$s->sub_treatment_id);

        $records->each(fn ($r) => $r->setAttribute('executed_steps',
            ($steps[$r->appointment_id.'|'.$r->sub_treatment_id] ?? collect())->sortBy('step_order')->pluck('step_name')->values()));

        return response()->json(['data' => $records]);
    }

    /** GET /patients/{id}/payments */
    public function payments(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);

        $rows = Payment::query()->visibleTo($request->user())
            ->where('patient_id', $patient->id)
            ->with(['appointment:id,scheduled_at,doctor_id', 'appointment.doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name')])
            ->orderByDesc('paid_at')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /** GET /patients/{id}/balance */
    public function balance(Request $request, Patient $patient, BillingService $billing): JsonResponse
    {
        $this->authorize('view', $patient);

        return response()->json(['data' => $billing->patientBalance($patient, $request->user())]);
    }

    /** GET /patients/{id}/treatment-plans?pending=1 */
    public function plans(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);

        $rows = TreatmentPlan::query()->visibleTo($request->user())
            ->where('patient_id', $patient->id)
            ->when($request->boolean('pending'), fn ($q) => $q->where('is_executed', false))
            ->with(['treatment:id,name,doctor_id', 'treatment.subTreatments:id,treatment_id,name,estimated_cost_syp,estimated_cost_usd'])
            ->orderByDesc('created_at')
            ->get()
            ->each(fn ($p) => $p->setAttribute('sub_treatment', $p->treatment?->subTreatments->firstWhere('id', $p->sub_treatment_id)))
            ->each(fn ($p) => $p->treatment?->unsetRelation('subTreatments'));

        return response()->json(['data' => $rows]);
    }

    /** GET /patients/{id}/unfinished — the "unfinished procedures" card, with names joined in. */
    public function unfinished(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);

        $rows = UnfinishedSubTreatment::query()->visibleTo($request->user())
            ->where('patient_id', $patient->id)
            ->where('is_marked_complete', false)
            ->join('treatments as t', 't.id', '=', 'unfinished_sub_treatments.treatment_id')
            ->join('sub_treatments as s', 's.id', '=', 'unfinished_sub_treatments.sub_treatment_id')
            ->orderByDesc('unfinished_sub_treatments.started_at')
            ->get(['unfinished_sub_treatments.*', 't.name as treatment_name', 's.name as sub_treatment_name']);

        return response()->json(['data' => $rows]);
    }
}
