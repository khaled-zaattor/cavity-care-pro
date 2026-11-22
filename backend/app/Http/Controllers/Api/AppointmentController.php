<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Services\AppointmentDeletion;
use App\Services\TreatmentFlowService;
use App\Support\Activity;
use App\Support\DoctorBooks;
use App\Support\MoneyLock;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Appointments.tsx (+ the appointment parts of PatientProfile and WaitingList). */
class AppointmentController extends Controller
{
    private const WITH = ['patient:id,full_name,phone_number', 'doctor:id,full_name', 'specialty:id,name_ar,is_dental,color'];

    /**
     * GET /appointments?doctor_id=&patient_id=&patient_name=&status=&from=&to=&upcoming=1&page=&per_page=
     * from/to are ISO datetimes (the browser sends its local day boundaries).
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Appointment::class);
        $perPage = min(max((int) $request->query('per_page', 100), 1), 5000);

        $query = Appointment::query()
            ->visibleTo($request->user())
            ->with(self::WITH)
            ->when($request->query('doctor_id'), fn (Builder $q, $id) => $q->where('doctor_id', $id))
            ->when($request->query('patient_id'), fn (Builder $q, $id) => $q->where('patient_id', $id))
            ->when($request->query('specialty_id'), fn (Builder $q, $id) => $q->where('specialty_id', $id))
            ->when($request->query('status'), fn (Builder $q, $s) => $q->where('status', $s))
            ->when($request->query('patient_name'), fn (Builder $q, $n) => $q->whereHas('patient', fn ($p) => $p->where('full_name', 'like', "%$n%")))
            ->when($request->query('from'), fn (Builder $q, $d) => $q->where('scheduled_at', '>=', Carbon::parse($d)->utc()))
            ->when($request->query('to'), fn (Builder $q, $d) => $q->where('scheduled_at', '<=', Carbon::parse($d)->utc()))
            ->when($request->boolean('upcoming'), fn (Builder $q) => $q->where('scheduled_at', '>=', now()))
            ->orderBy('scheduled_at', $request->boolean('upcoming') ? 'asc' : 'desc');

        return response()->json($query->paginate($perPage));
    }

    /** GET /appointments/today — the waiting room's "today's appointments" (clinic local day). */
    public function today(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Appointment::class);
        $tz = config('clinic.timezone');
        $start = now($tz)->startOfDay()->utc();

        $rows = Appointment::query()->visibleTo($request->user())
            ->with(self::WITH)
            ->whereBetween('scheduled_at', [$start, $start->copy()->addDay()])
            ->orderBy('scheduled_at')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, Appointment $appointment): JsonResponse
    {
        $this->authorize('view', $appointment);
        $appointment->load([...self::WITH, 'payments', 'treatmentRecords.treatment:id,name', 'treatmentRecords.subTreatment:id,name']);

        return response()->json(['data' => $appointment]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Appointment::class);
        $appointment = new Appointment($this->validated($request));
        $appointment->status ??= 'Scheduled';
        $this->authorize('store', $appointment);
        $appointment->save();

        return response()->json(['data' => $this->withConflicts($appointment->load(self::WITH))], 201);
    }

    public function update(Request $request, Appointment $appointment): JsonResponse
    {
        $this->authorize('update', $appointment);
        $appointment->fill($this->validated($request, true));
        // Moving it to another doctor must stay within what this user may see.
        $this->authorize('store', $appointment);
        $appointment->save();

        return response()->json(['data' => $this->withConflicts($appointment->load(self::WITH))]);
    }

    public function destroy(Appointment $appointment, AppointmentDeletion $deletion): JsonResponse
    {
        $this->authorize('delete', $appointment);
        // Its payments go with it: same lock as editing them (plan §3.6).
        foreach ($appointment->payments as $payment) {
            MoneyLock::assertEditable($payment->paid_at, request()->user(), 'appointment');
        }
        $deletion->delete([$appointment->id]);

        return response()->json(null, 204);
    }

    // ---- bulk delete (by date range) -----------------------------------

    /** GET /appointments/bulk-delete-preview?from=&to= — what would be deleted, totals per currency. */
    public function bulkDeletePreview(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);
        $ids = $this->deletableIds($request, $from, $to);

        $appointments = Appointment::with(self::WITH)->whereIn('id', $ids)->orderBy('scheduled_at')->get();
        $payments = Payment::with(['appointment:id,scheduled_at,patient_id', 'appointment.patient:id,full_name'])->whereIn('appointment_id', $ids)->get();
        $records = TreatmentRecord::with(['treatment:id,name', 'subTreatment:id,name', 'appointment:id,scheduled_at,patient_id', 'appointment.patient:id,full_name'])
            ->whereIn('appointment_id', $ids)->get();

        return response()->json([
            'appointments' => $appointments,
            'payments' => $payments,
            'treatment_records' => $records,
            'totals' => [
                'payments_syp' => round($payments->where('currency', 'SYP')->sum('amount'), 2),
                'payments_usd' => round($payments->where('currency', 'USD')->sum('amount'), 2),
            ],
        ]);
    }

    /** POST /appointments/bulk-delete {from, to} */
    public function bulkDelete(Request $request, AppointmentDeletion $deletion): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['deleted' => $deletion->delete($this->deletableIds($request, $from, $to))]);
    }

    // ---- Excel import ---------------------------------------------------

    /**
     * POST /appointments/import {rows: [{patient_name, doctor_name, scheduled_at, notes, status}]}
     * Names are matched exactly (trimmed, case-insensitive) against ALL patients/doctors.
     */
    public function import(Request $request): JsonResponse
    {
        $this->authorize('create', Appointment::class);
        $data = $request->validate([
            'rows' => ['required', 'array', 'max:5000'],
            'rows.*.patient_name' => ['required', 'string'],
            'rows.*.doctor_name' => ['required', 'string'],
            'rows.*.scheduled_at' => ['required', 'date'],
            'rows.*.notes' => ['nullable', 'string', 'max:2000'],
            'rows.*.status' => ['nullable', Rule::in(['Scheduled', 'Completed', 'Cancelled'])],
        ]);

        $key = fn ($n) => mb_strtolower(trim($n));
        $patients = Patient::pluck('id', 'full_name')->mapWithKeys(fn ($id, $n) => [$key($n) => $id]);
        $doctors = Doctor::with('specialties')->get()->keyBy(fn ($d) => $key($d->full_name));

        $created = 0;
        $failed = [];
        DB::transaction(fn () => Activity::muted(function () use ($data, $request, $key, $patients, $doctors, &$created, &$failed) {
            foreach ($data['rows'] as $i => $row) {
                $patientId = $patients[$key($row['patient_name'])] ?? null;
                $doctor = $doctors[$key($row['doctor_name'])] ?? null;
                if (! $patientId || ! $doctor) {
                    $failed[] = ['row' => $i + 1, 'reason' => ! $patientId ? 'المريض غير موجود' : 'الطبيب غير موجود'];

                    continue;
                }
                $appointment = new Appointment([
                    'patient_id' => $patientId,
                    'doctor_id' => $doctor->id,
                    'specialty_id' => $doctor->primarySpecialty()?->id,
                    'scheduled_at' => Carbon::parse($row['scheduled_at'])->utc(),
                    'notes' => $row['notes'] ?? null,
                    'status' => $row['status'] ?? 'Scheduled',
                ]);
                if (! $request->user()->can('store', $appointment)) {
                    $failed[] = ['row' => $i + 1, 'reason' => 'ليس لديك صلاحية على مواعيد هذا الطبيب'];

                    continue;
                }
                $appointment->save();
                $created++;
            }
        }));
        if ($created > 0) {
            Activity::log('imported', 'appointment', null, "استورد $created موعداً من ملف Excel"
                .($failed ? ' (فشل '.count($failed).' سطراً)' : ''));
        }

        return response()->json(['created' => $created, 'failed' => $failed]);
    }

    // ---- treatment actions (one transaction each) ----------------------

    /** POST /appointments/{id}/treatments  (F1 "تسجيل علاج") */
    public function recordTreatment(Request $request, Appointment $appointment, TreatmentFlowService $flows): JsonResponse
    {
        $this->authorizeTreatment($appointment);
        $data = $request->validate([
            'treatment_id' => ['required', 'uuid'],
            'sub_treatment_id' => ['required', 'uuid'],
            'tooth_numbers' => ['array'],
            'tooth_numbers.*' => ['string', 'max:10'],
            ...$this->moneyAndNotesRules(),
        ]);

        return response()->json(['data' => $flows->record($appointment, $data, $request->user())], 201);
    }

    /** POST /appointments/{id}/resume  (F2 "استكمال العلاج") */
    public function resumeTreatment(Request $request, Appointment $appointment, TreatmentFlowService $flows): JsonResponse
    {
        $this->authorizeTreatment($appointment);
        $data = $request->validate([
            'treatment_record_id' => ['required', 'uuid'],
            'step_ids' => ['required', 'array', 'min:1'],
            'step_ids.*' => ['uuid'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $original = TreatmentRecord::findOrFail($data['treatment_record_id']);
        $this->authorize('update', $original);

        return response()->json(['data' => $flows->resume($appointment, $original, $data)]);
    }

    /** POST /appointments/{id}/execute-plan  (F3 "تنفيذ خطة علاج") */
    public function executePlan(Request $request, Appointment $appointment, TreatmentFlowService $flows): JsonResponse
    {
        $this->authorizeTreatment($appointment);
        $data = $request->validate([
            'treatment_plan_id' => ['required', 'uuid'],
            ...$this->moneyAndNotesRules(),
        ]);
        $plan = TreatmentPlan::findOrFail($data['treatment_plan_id']);
        $this->authorize('update', $plan);

        return response()->json(['data' => $flows->executePlan($appointment, $plan, $data, $request->user())], 201);
    }

    /** GET /appointments/{id}/completed-steps?treatment_record_id= — for the step checkboxes. */
    public function completedSteps(Request $request, Appointment $appointment, TreatmentFlowService $flows): JsonResponse
    {
        $this->authorize('view', $appointment);

        if ($recordId = $request->query('treatment_record_id')) {
            $record = TreatmentRecord::findOrFail($recordId);
            $this->authorize('view', $record);

            return response()->json(['data' => $flows->completedStepIdsForKey($appointment, $record)]);
        }

        return response()->json(['data' => $appointment->getConnection()->table('appointment_treatment_steps')
            ->where('appointment_id', $appointment->id)->pluck('sub_treatment_step_id')]);
    }

    // ---- helpers ---------------------------------------------------------

    private function authorizeTreatment(Appointment $appointment): void
    {
        $this->authorize('view', $appointment);
        $this->authorize('create', TreatmentRecord::class);
        $probe = new TreatmentRecord(['doctor_id' => $appointment->doctor_id]);
        $this->authorize('store', $probe);
        if ($appointment->status !== 'Scheduled') {
            throw ValidationException::withMessages(['appointment' => ['لا يمكن تسجيل علاج على موعد مكتمل أو ملغى']]);
        }
    }

    private function moneyAndNotesRules(): array
    {
        return [
            'actual_cost_syp' => ['nullable', 'numeric', 'min:0'],
            'actual_cost_usd' => ['nullable', 'numeric', 'min:0'],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_currency' => ['nullable', Rule::in(['SYP', 'USD'])],
            'notes' => ['nullable', 'string', 'max:2000'],
            'treatment_notes' => ['nullable', 'string', 'max:5000'],
            'step_ids' => ['array'],
            'step_ids.*' => ['uuid'],
        ];
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'patient_id' => [$req, 'uuid', 'exists:patients,id'],
            'doctor_id' => [$req, 'uuid', 'exists:doctors,id'],
            'specialty_id' => ['nullable', 'uuid', 'exists:specialties,id'],
            'scheduled_at' => [$req, 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::in(['Scheduled', 'Completed', 'Cancelled'])],
        ]);

        if (isset($data['scheduled_at'])) {
            // ISO with offset from the browser -> UTC. A bare "YYYY-MM-DDTHH:mm"
            // is clinic local time (PatientProfile used to send that).
            $data['scheduled_at'] = Carbon::parse($data['scheduled_at'], config('clinic.timezone'))->utc();
        }

        // Default the specialty to the doctor's primary one; it must be one of the doctor's.
        if (isset($data['doctor_id']) || isset($data['specialty_id'])) {
            $doctor = Doctor::with('specialties')->find($data['doctor_id'] ?? $request->route('appointment')?->doctor_id);
            $ids = $doctor?->specialties->pluck('id')->all() ?? [];
            if (! empty($data['specialty_id']) && ! in_array($data['specialty_id'], $ids, true)) {
                throw ValidationException::withMessages(['specialty_id' => ['هذا التخصص ليس من تخصصات الطبيب']]);
            }
            if (empty($data['specialty_id']) && isset($data['doctor_id'])) {
                $data['specialty_id'] = $doctor?->primarySpecialty()?->id;
            }
        }

        // An independent doctor can only book for themselves.
        $books = DoctorBooks::for($request->user());
        if ($books->isIndependentDoctor() && isset($data['doctor_id']) && $data['doctor_id'] !== $books->currentDoctorId()) {
            throw ValidationException::withMessages(['doctor_id' => ['يمكنك حجز مواعيد لنفسك فقط']]);
        }

        return $data;
    }

    private function range(Request $request): array
    {
        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date', 'after_or_equal:from']]);

        return [Carbon::parse($data['from'])->utc(), Carbon::parse($data['to'])->utc()];
    }

    /** @return string[] appointments in range this user may see AND delete */
    /**
     * Plan §3.4: warn (not block) when the doctor already has a scheduled
     * appointment within config('clinic.slot_minutes') of this one.
     */
    private function withConflicts(Appointment $appointment): Appointment
    {
        $slot = (int) config('clinic.slot_minutes');
        $conflicts = $appointment->status === 'Scheduled' ? Appointment::query()
            ->with('patient:id,full_name')
            ->where('doctor_id', $appointment->doctor_id)
            ->where('status', 'Scheduled')
            ->whereKeyNot($appointment->id)
            ->whereBetween('scheduled_at', [$appointment->scheduled_at->copy()->subMinutes($slot - 1), $appointment->scheduled_at->copy()->addMinutes($slot - 1)])
            ->get(['id', 'patient_id', 'scheduled_at'])
            ->map(fn ($c) => ['id' => $c->id, 'patient_name' => $c->patient?->full_name, 'scheduled_at' => $c->scheduled_at])
            : collect();

        return $appointment->setAttribute('conflicts', $conflicts->values());
    }

    private function deletableIds(Request $request, Carbon $from, Carbon $to): array
    {
        $this->authorize('viewAny', Appointment::class);
        $user = $request->user();

        return Appointment::query()->visibleTo($user)->whereBetween('scheduled_at', [$from, $to])->get()
            ->filter(fn (Appointment $a) => $user->can('delete', $a))
            // skip appointments whose payments are locked (closed month / too old for this user)
            ->filter(function (Appointment $a) use ($user) {
                try {
                    foreach ($a->payments as $p) {
                        MoneyLock::assertEditable($p->paid_at, $user);
                    }

                    return true;
                } catch (ValidationException) {
                    return false;
                }
            })
            ->pluck('id')->all();
    }
}
