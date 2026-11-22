<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ClinicSetting;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\UnfinishedSubTreatment;
use App\Models\User;
use App\Services\TreatmentFlowService;
use App\Support\MoneyLock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Single edits to payments, treatment records and plans (PatientProfile, Appointments). */
class MoneyController extends Controller
{
    // ---- payments ------------------------------------------------------

    /** POST /payments {appointment_id, amount, currency} — always tied to an appointment. */
    public function storePayment(Request $request, TreatmentFlowService $flows): JsonResponse
    {
        $data = $request->validate([
            'appointment_id' => ['required', 'uuid', 'exists:appointments,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'currency' => ['required', Rule::in(['SYP', 'USD'])],
        ]);
        $appointment = Appointment::findOrFail($data['appointment_id']);
        $this->authorize('view', $appointment);
        $this->authorize('store', new Payment(['doctor_id' => $appointment->doctor_id]));

        $payment = $flows->createPayment($appointment, (float) $data['amount'], $data['currency'], $request->user());

        return response()->json(['data' => $payment], 201);
    }

    /** GET /payments/{id} — one payment with what a printed receipt needs. */
    public function showPayment(Payment $payment): JsonResponse
    {
        $this->authorize('view', $payment);
        $payment->load([
            'patient' => fn ($q) => $q->withTrashed()->select('id', 'full_name', 'phone_number'),
            'doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name'),
            'appointment:id,scheduled_at,specialty_id', 'appointment.specialty:id,name_ar',
        ]);
        $s = ClinicSetting::all_values();

        return response()->json([
            'data' => $payment,
            'received_by' => User::whereKey($payment->received_by)->value('full_name'),
            'clinic' => [
                'name' => $s['clinic_name'], 'name_en' => $s['clinic_name_en'], 'address' => $s['clinic_address'],
                'phone' => $s['clinic_phone'], 'footer' => $s['prescription_footer'], 'has_logo' => ! empty($s['logo_path']),
            ],
        ]);
    }

    /** GET /appointments/{id}/payments */
    public function appointmentPayments(Request $request, Appointment $appointment): JsonResponse
    {
        $this->authorize('view', $appointment);

        return response()->json(['data' => Payment::query()->visibleTo($request->user())
            ->where('appointment_id', $appointment->id)->orderByDesc('paid_at')->get()]);
    }

    /** PATCH /payments/{id} {amount} — currency stays fixed, as before. */
    public function updatePayment(Request $request, Payment $payment): JsonResponse
    {
        $this->authorize('update', $payment);
        MoneyLock::assertEditable($payment->paid_at, $request->user());
        $payment->update($request->validate(['amount' => ['required', 'numeric', 'gt:0']]));

        return response()->json(['data' => $payment]);
    }

    /** DELETE /payments/{id} — soft delete (can be restored by an admin). */
    public function destroyPayment(Payment $payment): JsonResponse
    {
        $this->authorize('delete', $payment);
        MoneyLock::assertEditable($payment->paid_at, request()->user());
        $payment->delete();

        return response()->json(null, 204);
    }

    // ---- treatment records ------------------------------------------

    /** PATCH /treatment-records/{id} {actual_cost_syp?, actual_cost_usd?, is_completed?, treatment_notes?} */
    public function updateRecord(Request $request, TreatmentRecord $record): JsonResponse
    {
        $this->authorize('update', $record);
        // Costs are money; completing a record or editing notes is not locked.
        if ($request->hasAny(['actual_cost_syp', 'actual_cost_usd'])) {
            MoneyLock::assertEditable($record->performed_at, $request->user(), 'actual_cost_syp');
        }
        $data = $request->validate([
            'actual_cost_syp' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'actual_cost_usd' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'is_completed' => ['sometimes', 'boolean'],
            'treatment_notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);
        foreach (['actual_cost_syp', 'actual_cost_usd'] as $k) {
            if (array_key_exists($k, $data)) {
                $data[$k] = (float) ($data[$k] ?? 0);
            }
        }

        DB::transaction(function () use ($record, $data) {
            $record->update($data);
            // "Mark complete" now also clears the unfinished tracker (it used to stay behind).
            if (($data['is_completed'] ?? false) === true) {
                $this->unfinishedFor($record)->delete();
            }
        });

        return response()->json(['data' => $record]);
    }

    /** DELETE /treatment-records/{id} — soft delete; clears its unfinished tracker if nothing else is open. */
    public function destroyRecord(TreatmentRecord $record): JsonResponse
    {
        $this->authorize('delete', $record);
        MoneyLock::assertEditable($record->performed_at, request()->user(), 'record');

        DB::transaction(function () use ($record) {
            $record->delete();
            $stillOpen = TreatmentRecord::where('patient_id', $record->patient_id)
                ->where('treatment_id', $record->treatment_id)->where('sub_treatment_id', $record->sub_treatment_id)
                ->where(fn ($q) => $record->tooth_number === null ? $q->whereNull('tooth_number') : $q->where('tooth_number', $record->tooth_number))
                ->where('is_completed', false)->exists();
            if (! $stillOpen) {
                $this->unfinishedFor($record)->delete();
            }
        });

        return response()->json(null, 204);
    }

    // ---- treatment plans -------------------------------------------------

    /** POST /treatment-plans {patient_id, treatment_id, sub_treatment_id, tooth_numbers[]} */
    public function storePlan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'patient_id' => ['required', 'uuid', 'exists:patients,id'],
            'treatment_id' => ['required', 'uuid', 'exists:treatments,id'],
            'sub_treatment_id' => ['required', 'uuid', Rule::exists('sub_treatments', 'id')->where('treatment_id', $request->input('treatment_id'))],
            'tooth_numbers' => ['array'],
            'tooth_numbers.*' => ['string', 'max:10'],
        ]);
        $this->authorize('view', Patient::findOrFail($data['patient_id']));
        $this->authorize('view', Treatment::findOrFail($data['treatment_id']));

        $plan = new TreatmentPlan([
            'patient_id' => $data['patient_id'],
            'treatment_id' => $data['treatment_id'],
            'sub_treatment_id' => $data['sub_treatment_id'],
            'tooth_number' => implode(', ', array_filter(array_map('trim', $data['tooth_numbers'] ?? []))) ?: null,
            'is_executed' => false,
        ]);
        $plan->setRelation('treatment', Treatment::find($data['treatment_id']));
        $this->authorize('store', $plan);
        $plan->save();

        return response()->json(['data' => $plan], 201);
    }

    public function destroyPlan(TreatmentPlan $plan): JsonResponse
    {
        $this->authorize('delete', $plan);
        $plan->delete();

        return response()->json(null, 204);
    }

    private function unfinishedFor(TreatmentRecord $record)
    {
        return UnfinishedSubTreatment::where('patient_id', $record->patient_id)
            ->where('treatment_id', $record->treatment_id)->where('sub_treatment_id', $record->sub_treatment_id)
            ->where(fn ($q) => $record->tooth_number === null ? $q->whereNull('tooth_number') : $q->where('tooth_number', $record->tooth_number));
    }
}
