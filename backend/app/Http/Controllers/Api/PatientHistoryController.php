<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentTreatmentStep;
use App\Models\Patient;
use App\Models\PatientFile;
use App\Models\Payment;
use App\Models\Prescription;
use App\Models\Specialty;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\UnfinishedSubTreatment;
use App\Services\BillingService;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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

    /**
     * GET /patients/{id}/timeline?specialty_id=&types=appointment,treatment,prescription,file,payment
     * السجل الطبي (plan §2.4): one chronological list of everything about the
     * patient, newest first. Each source keeps its own visibility rules.
     */
    public function timeline(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);
        $user = $request->user();
        $specialty = $request->query('specialty_id');
        $types = array_filter(explode(',', (string) $request->query('types', 'appointment,treatment,prescription,file,payment')));
        $want = fn (string $t) => in_array($t, $types, true);
        $bySpecialty = fn ($q, string $col = 'specialty_id') => $specialty ? $q->where($col, $specialty) : $q;
        $tz = config('clinic.timezone');
        $events = collect();

        $doctorName = fn ($d) => $d ? (str_starts_with($d->full_name, 'د.') ? $d->full_name : 'د. '.$d->full_name) : null;
        $spec = fn ($s) => $s ? ['id' => $s->id, 'name' => $s->name_ar, 'color' => $s->color] : null;

        if ($want('appointment') && $user->can('viewAny', Appointment::class)) {
            $status = ['Scheduled' => 'مجدول', 'Completed' => 'مكتمل', 'Cancelled' => 'ملغى'];
            $bySpecialty(Appointment::query()->visibleTo($user)->where('patient_id', $patient->id))
                ->with(['doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name'), 'specialty:id,name_ar,color'])
                ->get()->each(fn ($a) => $events->push([
                    'type' => 'appointment', 'id' => $a->id, 'at' => $a->scheduled_at,
                    'title' => 'موعد — '.($status[$a->status] ?? $a->status),
                    'detail' => $a->notes, 'doctor' => $doctorName($a->doctor), 'specialty' => $spec($a->specialty),
                    'status' => $a->status,
                ]));
        }

        if ($want('treatment') && $user->can('viewAny', TreatmentRecord::class)) {
            $bySpecialty(TreatmentRecord::query()->visibleTo($user)->where('patient_id', $patient->id))
                ->with([
                    'treatment' => fn ($q) => $q->withTrashed()->select('id', 'name'), 'subTreatment:id,name',
                    'doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name'),
                ])->get()->each(function ($r) use ($events, $doctorName) {
                    $events->push([
                        'type' => 'treatment', 'id' => $r->id, 'at' => $r->performed_at,
                        'title' => trim(($r->treatment?->name ?? 'علاج').($r->subTreatment ? ' — '.$r->subTreatment->name : ''))
                            .($r->tooth_number ? ' (السن '.$r->tooth_number.')' : ''),
                        'detail' => $r->treatment_notes, 'doctor' => $doctorName($r->doctor),
                        'specialty_id' => $r->specialty_id,
                        'completed' => $r->is_completed,
                        'amount_syp' => (float) $r->actual_cost_syp, 'amount_usd' => (float) $r->actual_cost_usd,
                    ]);
                });
        }

        if ($want('prescription') && $user->can('viewAny', Prescription::class)) {
            $bySpecialty(Prescription::query()->visibleTo($user)->where('patient_id', $patient->id))
                ->with(['items:id,prescription_id,medicine_name,sort_order', 'doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name'), 'specialty:id,name_ar,color'])
                ->get()->each(fn ($p) => $events->push([
                    'type' => 'prescription', 'id' => $p->id, 'at' => $p->issued_at,
                    'title' => 'وصفة طبية رقم '.$p->number,
                    'detail' => trim(($p->diagnosis ? 'التشخيص: '.$p->diagnosis."\n" : '').$p->items->pluck('medicine_name')->implode('، ')),
                    'doctor' => $doctorName($p->doctor), 'specialty' => $spec($p->specialty),
                ]));
        }

        if ($want('file') && $user->can('viewAny', PatientFile::class)) {
            $bySpecialty(PatientFile::query()->where('patient_id', $patient->id))
                ->with(['doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name'), 'specialty:id,name_ar,color'])
                ->get()->each(fn ($f) => $events->push([
                    'type' => 'file', 'id' => $f->id,
                    // taken_at is a date: place it at the upload time on that day
                    'at' => $f->taken_at
                        ? Carbon::parse($f->taken_at->format('Y-m-d').' '.$f->created_at->setTimezone($tz)->format('H:i:s'), $tz)->utc()
                        : $f->created_at,
                    'title' => (PatientFile::CATEGORY_LABELS[$f->category] ?? 'ملف').': '.$f->title,
                    'detail' => $f->notes, 'doctor' => $doctorName($f->doctor), 'specialty' => $spec($f->specialty),
                    'is_image' => $f->is_image, 'has_thumbnail' => $f->has_thumbnail, 'mime' => $f->mime,
                ]));
        }

        if ($want('payment') && $user->can('viewAny', Payment::class)) {
            $bySpecialty(Payment::query()->visibleTo($user)->where('patient_id', $patient->id))
                ->with(['doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name')])
                ->get()->each(fn ($p) => $events->push([
                    'type' => 'payment', 'id' => $p->id, 'at' => $p->paid_at,
                    'title' => 'دفعة '.Activity::money($p->amount, $p->currency),
                    'detail' => $p->notes, 'doctor' => $doctorName($p->doctor), 'specialty_id' => $p->specialty_id,
                    'amount' => (float) $p->amount, 'currency' => $p->currency,
                ]));
        }

        // Specialty names for rows that only carry an id.
        $names = Specialty::query()->get(['id', 'name_ar', 'color'])->keyBy('id');
        $events = $events->map(function ($e) use ($names, $spec) {
            if (! array_key_exists('specialty', $e)) {
                $e['specialty'] = $spec($names[$e['specialty_id'] ?? ''] ?? null);
            }
            unset($e['specialty_id']);
            $e['at'] = $e['at'] ? Carbon::parse($e['at'])->toIso8601ZuluString() : null;

            return $e;
        })->sortByDesc('at')->values()->take(1000);

        return response()->json([
            'data' => $events,
            'specialties' => $events->pluck('specialty')->filter()->unique('id')->values(),
        ]);
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
