<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentTreatmentStep;
use App\Models\Payment;
use App\Models\SubTreatment;
use App\Models\SubTreatmentStep;
use App\Models\Treatment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\UnfinishedSubTreatment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The three "treat the patient" actions from Appointments.tsx, each one
 * transaction (they used to be 5–7 separate browser calls):
 *   F1 record()      — record a new treatment in an appointment
 *   F2 resume()      — continue an unfinished multi-step treatment
 *   F3 executePlan() — carry out a planned treatment
 * Behaviour matches the old screens, with these fixes:
 *   - matching on tooth works when tooth_number is NULL (non-dental)
 *   - resume no longer appends notes twice when the original record is in
 *     the current appointment
 *   - executePlan looks up previous notes for THIS patient only
 *   - non-dental / not_related treatments never store a tooth
 *   - the catalog must belong to the appointment's doctor books
 */
class TreatmentFlowService
{
    // ------------------------------------------------------------------
    // F1
    // ------------------------------------------------------------------

    /**
     * @param  array{treatment_id: string, sub_treatment_id: string, tooth_numbers?: string[], actual_cost_syp?: float|null,
     *               actual_cost_usd?: float|null, payment_amount?: float|null, payment_currency?: string|null,
     *               notes?: string|null, treatment_notes?: string|null, step_ids?: string[]}  $data
     */
    public function record(Appointment $appointment, array $data, User $user): TreatmentRecord
    {
        [$treatment, $sub] = $this->catalogFor($appointment, $data['treatment_id'], $data['sub_treatment_id']);
        $tooth = $this->tooth($treatment, $sub, $data['tooth_numbers'] ?? []);

        return DB::transaction(function () use ($appointment, $data, $user, $treatment, $sub, $tooth) {
            $doneHere = $this->completedStepIds($appointment, $sub);
            $newSteps = $this->validSteps($sub, $data['step_ids'] ?? [], $doneHere);
            $isCompleted = $this->allDone($sub, [...$doneHere, ...$newSteps]);

            $record = $this->createRecord($appointment, $treatment, $sub, $tooth, [
                'actual_cost_syp' => (float) ($data['actual_cost_syp'] ?? 0),
                'actual_cost_usd' => (float) ($data['actual_cost_usd'] ?? 0),
                'is_completed' => $isCompleted,
                'treatment_notes' => $this->blankToNull($data['treatment_notes'] ?? null),
            ]);

            $this->afterTreatment($appointment, $user, $treatment, $sub, $tooth, $newSteps, $isCompleted, $data);

            return $record;
        });
    }

    // ------------------------------------------------------------------
    // F2
    // ------------------------------------------------------------------

    /** @param array{step_ids: string[], notes?: string|null} $data */
    public function resume(Appointment $appointment, TreatmentRecord $original, array $data): TreatmentRecord
    {
        if ($original->patient_id !== $appointment->patient_id) {
            throw ValidationException::withMessages(['treatment_record_id' => ['هذا العلاج لا يخص مريض الموعد']]);
        }
        $sub = SubTreatment::findOrFail($original->sub_treatment_id);
        $treatment = Treatment::withTrashed()->findOrFail($original->treatment_id);
        $notes = $this->blankToNull($data['notes'] ?? null);
        $stamp = $this->localDate();

        return DB::transaction(function () use ($appointment, $original, $sub, $treatment, $data, $notes, $stamp) {
            // Steps already done for this patient+treatment+tooth in ANY appointment, plus this one.
            $previous = $this->completedStepIdsForKey($appointment, $original);
            $newSteps = $this->validSteps($sub, $data['step_ids'] ?? [], $previous);
            if ($newSteps === []) {
                throw ValidationException::withMessages(['step_ids' => ['اختر خطوة واحدة على الأقل']]);
            }
            $this->insertSteps($appointment, $newSteps);
            $allDone = $sub->steps()->exists() && $this->allDone($sub, [...$previous, ...$newSteps]);

            // 1. The original (first) record.
            if ($notes !== null || $allDone) {
                if ($notes !== null) {
                    $original->treatment_notes = $original->treatment_notes
                        ? $original->treatment_notes."\n\n--- $stamp ---\n".$notes
                        : $notes;
                }
                $original->is_completed = $allDone;
                $original->save();
            }

            // 2. A record in the current appointment (skip if it IS the original).
            $current = $this->sameKey(TreatmentRecord::query(), $original)
                ->where('appointment_id', $appointment->id)
                ->first();

            if ($current && $current->id !== $original->id) {
                $current->is_completed = $allDone;
                if ($notes !== null) {
                    $current->treatment_notes = $current->treatment_notes ? $current->treatment_notes."\n".$notes : $notes;
                }
                $current->save();
            } elseif (! $current) {
                $current = $this->createRecord($appointment, $treatment, $sub, $original->tooth_number, [
                    'actual_cost_syp' => 0,
                    'actual_cost_usd' => 0,
                    'is_completed' => $allDone,
                    'treatment_notes' => $notes ?? "استكمال العلاج - $stamp",
                ]);
            }

            // 3. Unfinished tracker.
            $unfinished = $this->sameKey(UnfinishedSubTreatment::query(), $original);
            $allDone
                ? $unfinished->delete()
                : $unfinished->update(['last_appointment_id' => $appointment->id]);

            return $current->fresh();
        });
    }

    // ------------------------------------------------------------------
    // F3
    // ------------------------------------------------------------------

    /** @param array<string, mixed> $data same keys as record() minus treatment/tooth */
    public function executePlan(Appointment $appointment, TreatmentPlan $plan, array $data, User $user): TreatmentRecord
    {
        if ($plan->patient_id !== $appointment->patient_id) {
            throw ValidationException::withMessages(['treatment_plan_id' => ['هذه الخطة لا تخص مريض الموعد']]);
        }
        if ($plan->is_executed) {
            throw ValidationException::withMessages(['treatment_plan_id' => ['تم تنفيذ هذه الخطة مسبقاً']]);
        }
        [$treatment, $sub] = $this->catalogFor($appointment, $plan->treatment_id, $plan->sub_treatment_id);
        $tooth = $this->blankToNull($plan->tooth_number);

        return DB::transaction(function () use ($appointment, $plan, $data, $user, $treatment, $sub, $tooth) {
            $doneHere = $this->completedStepIds($appointment, $sub);
            $newSteps = $this->validSteps($sub, $data['step_ids'] ?? [], $doneHere);
            $isCompleted = $this->allDone($sub, [...$doneHere, ...$newSteps]);

            $notes = $this->blankToNull($data['treatment_notes'] ?? null);
            if ($notes !== null) {
                $previous = $this->sameKey(TreatmentRecord::query(), (object) [
                    'patient_id' => $appointment->patient_id, 'treatment_id' => $plan->treatment_id,
                    'sub_treatment_id' => $plan->sub_treatment_id, 'tooth_number' => $tooth,
                ])->latest('performed_at')->value('treatment_notes');
                if ($previous) {
                    $notes = $previous."\n\n--- {$this->localDate()} ---\n".$notes;
                }
            }

            $record = $this->createRecord($appointment, $treatment, $sub, $tooth, [
                'actual_cost_syp' => (float) ($data['actual_cost_syp'] ?? 0),
                'actual_cost_usd' => (float) ($data['actual_cost_usd'] ?? 0),
                'is_completed' => $isCompleted,
                'treatment_notes' => $notes,
            ]);

            $this->afterTreatment($appointment, $user, $treatment, $sub, $tooth, $newSteps, $isCompleted, $data);

            $plan->update(['is_executed' => true, 'executed_at' => now(), 'appointment_id' => $appointment->id]);

            return $record;
        });
    }

    // ------------------------------------------------------------------
    // Steps progress for the resume dialog
    // ------------------------------------------------------------------

    /** @return string[] step ids already done for this record's patient+treatment+tooth (all sessions + $appointment) */
    public function completedStepIdsForKey(Appointment $appointment, TreatmentRecord $record): array
    {
        $appointmentIds = $this->sameKey(TreatmentRecord::query(), $record)->pluck('appointment_id')
            ->push($appointment->id)->unique()->all();

        return AppointmentTreatmentStep::query()
            ->whereIn('appointment_id', $appointmentIds)
            ->whereIn('sub_treatment_step_id', SubTreatmentStep::where('sub_treatment_id', $record->sub_treatment_id)->select('id'))
            ->pluck('sub_treatment_step_id')->unique()->values()->all();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Shared tail of F1 and F3: notes, steps, payment, unfinished tracker. */
    private function afterTreatment(Appointment $appointment, User $user, Treatment $treatment, SubTreatment $sub, ?string $tooth, array $newSteps, bool $isCompleted, array $data): void
    {
        $appointmentNotes = $this->blankToNull($data['notes'] ?? null);
        if ($appointmentNotes !== null) {
            $appointment->update(['notes' => $appointmentNotes]);
        }

        $this->insertSteps($appointment, $newSteps);

        $amount = (float) ($data['payment_amount'] ?? 0);
        if ($amount > 0) {
            if (! $user->can('create', Payment::class)) {
                throw ValidationException::withMessages(['payment_amount' => ['ليس لديك صلاحية تسجيل الدفعات']]);
            }
            $this->createPayment($appointment, $amount, $data['payment_currency'] ?? 'SYP', $user);
        }

        if (! $isCompleted) {
            UnfinishedSubTreatment::create([
                'patient_id' => $appointment->patient_id,
                'treatment_id' => $treatment->id,
                'sub_treatment_id' => $sub->id,
                'tooth_number' => $tooth,
                'last_appointment_id' => $appointment->id,
                'notes' => $appointmentNotes,
                'started_at' => now(),
            ]);
        }
    }

    public function createPayment(Appointment $appointment, float $amount, string $currency, User $user): Payment
    {
        return Payment::create([
            'appointment_id' => $appointment->id,
            'patient_id' => $appointment->patient_id,
            'doctor_id' => $appointment->doctor_id,
            'specialty_id' => $appointment->specialty_id,
            'amount' => $amount,
            'currency' => strtoupper($currency) === 'USD' ? 'USD' : 'SYP',
            'received_by' => $user->id,
            'paid_at' => now(),
        ]);
    }

    private function createRecord(Appointment $appointment, Treatment $treatment, SubTreatment $sub, ?string $tooth, array $extra): TreatmentRecord
    {
        return TreatmentRecord::create([
            'appointment_id' => $appointment->id,
            'patient_id' => $appointment->patient_id,
            'doctor_id' => $appointment->doctor_id,
            'specialty_id' => $treatment->specialty_id ?? $appointment->specialty_id,
            'treatment_id' => $treatment->id,
            'sub_treatment_id' => $sub->id,
            'tooth_number' => $tooth,
            'performed_at' => now(),
            ...$extra,
        ]);
    }

    /** Treatment must belong to one of the appointment doctor's specialties (any, if none is set). */
    private function catalogFor(Appointment $appointment, string $treatmentId, string $subId): array
    {
        $treatment = Treatment::withTrashed()->with('specialty')->findOrFail($treatmentId);
        $sub = SubTreatment::where('treatment_id', $treatment->id)->find($subId);
        if (! $sub) {
            throw ValidationException::withMessages(['sub_treatment_id' => ['العلاج الفرعي لا يتبع هذا العلاج']]);
        }

        $doctor = $appointment->doctor()->withTrashed()->first();
        $specialties = $doctor ? $doctor->specialties()->pluck('specialties.id')->all() : [];
        if ($specialties !== [] && ! in_array($treatment->specialty_id, $specialties, true)) {
            throw ValidationException::withMessages(['treatment_id' => ['هذا العلاج ليس من اختصاص طبيب الموعد']]);
        }

        return [$treatment, $sub];
    }

    private function tooth(Treatment $treatment, SubTreatment $sub, array $teeth): ?string
    {
        $teeth = array_values(array_filter(array_map(fn ($t) => trim((string) $t), $teeth), fn ($t) => $t !== ''));
        if (! $treatment->specialty?->is_dental || $sub->tooth_association === 'not_related' || $teeth === []) {
            return null;
        }
        if ($sub->tooth_association === 'single_tooth' && count($teeth) > 1) {
            throw ValidationException::withMessages(['tooth_numbers' => ['هذا العلاج لسن واحد فقط']]);
        }

        return implode(', ', $teeth); // same "11, 12" format as before
    }

    /** @return string[] */
    private function completedStepIds(Appointment $appointment, SubTreatment $sub): array
    {
        return AppointmentTreatmentStep::query()
            ->where('appointment_id', $appointment->id)
            ->whereIn('sub_treatment_step_id', $sub->steps()->select('id'))
            ->pluck('sub_treatment_step_id')->all();
    }

    /** Requested step ids that belong to the sub-treatment and are not done yet. */
    private function validSteps(SubTreatment $sub, array $requested, array $alreadyDone): array
    {
        $valid = $sub->steps()->pluck('id')->all();
        $bad = array_diff($requested, $valid);
        if ($bad !== []) {
            throw ValidationException::withMessages(['step_ids' => ['خطوات لا تتبع هذا العلاج']]);
        }

        return array_values(array_diff(array_unique($requested), $alreadyDone));
    }

    private function allDone(SubTreatment $sub, array $doneIds): bool
    {
        $all = $sub->steps()->pluck('id')->all();

        return $all === [] || array_diff($all, $doneIds) === [];
    }

    private function insertSteps(Appointment $appointment, array $stepIds): void
    {
        foreach ($stepIds as $id) {
            AppointmentTreatmentStep::create([
                'appointment_id' => $appointment->id,
                'sub_treatment_step_id' => $id,
                'is_completed' => true,
                'completed_at' => now(),
            ]);
        }
    }

    /** patient + treatment + sub-treatment + tooth (NULL-safe). */
    private function sameKey(Builder $query, object $key): Builder
    {
        $query->where('patient_id', $key->patient_id)
            ->where('treatment_id', $key->treatment_id)
            ->where('sub_treatment_id', $key->sub_treatment_id);

        return $key->tooth_number === null
            ? $query->whereNull('tooth_number')
            : $query->where('tooth_number', $key->tooth_number);
    }

    private function localDate(): string
    {
        return now()->setTimezone(config('clinic.timezone'))->format('d/m/Y');
    }

    private function blankToNull(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }
}
