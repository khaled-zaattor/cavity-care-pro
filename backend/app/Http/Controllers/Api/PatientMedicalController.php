<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\PatientFile;
use App\Models\PatientGynecologyProfile;
use App\Models\PrescriptionItem;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * السجل الطبي: gynecology profile + the summary a doctor needs at a glance
 * (latest abdominal / gynecological echo, medicines taken and when).
 * Clinical history is shared like patient files; money is not involved.
 */
class PatientMedicalController extends Controller
{
    /** GET /patients/{patient}/gynecology-profile → profile or null */
    public function showGynecology(Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);

        $profile = PatientGynecologyProfile::with('editor:id,full_name,email')->where('patient_id', $patient->id)->first();

        return response()->json(['data' => $profile]);
    }

    /** PUT /patients/{patient}/gynecology-profile */
    public function updateGynecology(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('update', $patient);

        $count = ['nullable', 'integer', 'min:0', 'max:50'];
        $text = ['nullable', 'string', 'max:5000'];
        $data = $request->validate([
            'is_smoker' => ['nullable', 'boolean'],
            'marital_status' => ['nullable', Rule::in(PatientGynecologyProfile::MARITAL_STATUSES)],
            'pregnancies' => $count,
            'living_children' => $count,
            'abortions' => $count,
            'preterm_births' => $count,
            'medical_history' => $text,
            'surgical_history' => $text,
            'family_history' => $text,
            'allergy_history' => $text,
            'medication_history' => $text,
            'weight_kg' => ['nullable', 'numeric', 'min:0', 'max:500'],
            'blood_pressure' => ['nullable', 'string', 'max:20', 'regex:/^\s*\d{2,3}\s*\/\s*\d{2,3}\s*$/'],
        ], [
            'blood_pressure.regex' => 'اكتب الضغط بالشكل 120/80',
        ]);
        if (isset($data['blood_pressure'])) {
            $data['blood_pressure'] = preg_replace('/\s+/', '', $data['blood_pressure']);
        }

        $profile = PatientGynecologyProfile::firstOrNew(['patient_id' => $patient->id]);
        $created = ! $profile->exists;
        $profile->fill([...$data, 'updated_by' => $request->user()->id])->save();

        Activity::log($created ? 'created' : 'updated', 'patient', $patient->id,
            ($created ? 'أضاف' : 'عدّل').' الملف النسائي للمريض '.$patient->full_name);

        return response()->json(['data' => $profile->load('editor:id,full_name,email')]);
    }

    /**
     * GET /patients/{patient}/medical-summary
     *   latest_echo: { echo_abdominal: file|null, echo_gyn: file|null }
     *   medications: prescription items, newest first, with date and doctor
     */
    public function summary(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);
        $user = $request->user();

        $latest = [];
        if ($user->can('viewAny', PatientFile::class)) {
            foreach (PatientFile::ECHO_CATEGORIES as $category) {
                $latest[$category] = PatientFile::query()
                    ->where('patient_id', $patient->id)->where('category', $category)
                    ->with(['doctor:id,full_name'])
                    ->orderByRaw('COALESCE(taken_at, DATE(created_at)) DESC')->orderByDesc('created_at')
                    ->first();
            }
        }

        $medications = PrescriptionItem::query()
            ->join('prescriptions', 'prescriptions.id', '=', 'prescription_items.prescription_id')
            ->leftJoin('doctors', 'doctors.id', '=', 'prescriptions.doctor_id')
            ->where('prescriptions.patient_id', $patient->id)
            ->whereNull('prescriptions.deleted_at')
            ->orderByDesc('prescriptions.issued_at')->orderBy('prescription_items.sort_order')
            ->limit(300)
            ->withCasts(['issued_at' => 'datetime'])
            ->get([
                'prescription_items.id', 'prescription_items.medicine_name', 'prescription_items.dose',
                'prescription_items.frequency', 'prescription_items.duration', 'prescription_items.instructions',
                'prescriptions.id as prescription_id', 'prescriptions.number as prescription_number',
                'prescriptions.issued_at', 'prescriptions.diagnosis', 'doctors.full_name as doctor_name',
            ]);

        return response()->json(['data' => [
            'latest_echo' => (object) $latest,
            'medications' => $medications,
        ]]);
    }
}
