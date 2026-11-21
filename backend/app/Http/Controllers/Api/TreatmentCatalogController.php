<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Specialty;
use App\Models\SubTreatment;
use App\Models\SubTreatmentStep;
use App\Models\Treatment;
use App\Support\DoctorBooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Treatments.tsx: treatment → sub-treatments → steps.
 * Visibility and write rights follow TreatmentPolicy (clinic catalog vs an
 * independent doctor's own catalog). Non-dental specialties never get tooth
 * options (plan §2.1).
 */
class TreatmentCatalogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Treatment::class);
        $user = $request->user();

        $treatments = Treatment::query()
            ->visibleTo($user)
            ->with(['specialty:id,name_ar,is_dental,color', 'subTreatments' => fn ($q) => $q->orderBy('name'), 'subTreatments.steps'])
            ->when($request->query('specialty_id'), fn ($q, $id) => $q->where('specialty_id', $id))
            // ?doctor_id=<id> → specialties of that doctor (used when recording a visit)
            ->when($request->query('doctor_id'), function ($q, $doctorId) {
                $q->whereIn('specialty_id', fn ($s) => $s->select('specialty_id')->from('doctor_specialty')->where('doctor_id', $doctorId));
            })
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $treatments]);
    }

    // ---- treatments --------------------------------------------------

    public function storeTreatment(Request $request): JsonResponse
    {
        $this->authorize('create', Treatment::class);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'specialty_id' => ['required', 'uuid', 'exists:specialties,id'],
            'doctor_id' => ['nullable', 'uuid', 'exists:doctors,id'],
        ]);

        // An independent doctor always writes into their own catalog.
        $books = DoctorBooks::for($request->user());
        if (! $request->user()->isSuperAdmin() && $books->isIndependentDoctor()) {
            $data['doctor_id'] = $books->currentDoctorId();
        }

        $treatment = new Treatment($data);
        $this->authorize('store', $treatment);
        $treatment->save();

        return response()->json(['data' => $treatment->load('specialty:id,name_ar,is_dental,color')], 201);
    }

    public function updateTreatment(Request $request, Treatment $treatment): JsonResponse
    {
        $this->authorize('update', $treatment);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'specialty_id' => ['sometimes', 'uuid', 'exists:specialties,id'],
        ]);
        $treatment->update($data);

        if (! $treatment->specialty->is_dental) {
            $treatment->subTreatments()->update(['tooth_association' => 'not_related']);
        }

        return response()->json(['data' => $treatment->fresh(['specialty:id,name_ar,is_dental,color'])]);
    }

    public function destroyTreatment(Treatment $treatment): JsonResponse
    {
        $this->authorize('delete', $treatment);
        // Soft delete: past records keep pointing at it.
        $treatment->delete();

        return response()->json(null, 204);
    }

    // ---- sub-treatments ----------------------------------------------

    public function storeSubTreatment(Request $request): JsonResponse
    {
        $data = $this->validatedSub($request, true);
        $sub = new SubTreatment($data);
        $sub->setRelation('treatment', Treatment::findOrFail($data['treatment_id']));
        $this->authorize('store', $sub);
        $sub->tooth_association = $this->toothAssociation($sub->treatment, $data['tooth_association'] ?? null);
        $sub->save();

        return response()->json(['data' => $sub->load('steps')], 201);
    }

    public function updateSubTreatment(Request $request, SubTreatment $subTreatment): JsonResponse
    {
        $this->authorize('update', $subTreatment);
        $data = $this->validatedSub($request, false);
        $subTreatment->fill($data);
        $subTreatment->tooth_association = $this->toothAssociation($subTreatment->treatment, $subTreatment->tooth_association);
        $subTreatment->save();

        return response()->json(['data' => $subTreatment->load('steps')]);
    }

    public function destroySubTreatment(SubTreatment $subTreatment): JsonResponse
    {
        $this->authorize('delete', $subTreatment);
        if ($subTreatment->getConnection()->table('treatment_records')->where('sub_treatment_id', $subTreatment->id)->exists()) {
            return response()->json(['message' => 'لا يمكن حذف علاج فرعي مستخدم في سجلات المرضى'], 422);
        }
        $subTreatment->delete();

        return response()->json(null, 204);
    }

    // ---- steps ---------------------------------------------------------

    public function storeStep(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sub_treatment_id' => ['required', 'uuid', 'exists:sub_treatments,id'],
            'step_name' => ['required', 'string', 'max:255'],
            'step_description' => ['nullable', 'string'],
            'step_order' => ['required', 'integer', 'min:0'],
            'completion_percentage' => ['nullable', 'numeric', 'between:0,100'],
        ]);
        $step = new SubTreatmentStep($data);
        $step->setRelation('subTreatment', SubTreatment::with('treatment')->findOrFail($data['sub_treatment_id']));
        $this->authorize('store', $step);
        $step->save();

        return response()->json(['data' => $step], 201);
    }

    public function updateStep(Request $request, SubTreatmentStep $step): JsonResponse
    {
        $this->authorize('update', $step);
        $step->update($request->validate([
            'step_name' => ['sometimes', 'string', 'max:255'],
            'step_description' => ['nullable', 'string'],
            'step_order' => ['sometimes', 'integer', 'min:0'],
            'completion_percentage' => ['nullable', 'numeric', 'between:0,100'],
        ]));

        return response()->json(['data' => $step]);
    }

    public function destroyStep(SubTreatmentStep $step): JsonResponse
    {
        $this->authorize('delete', $step);
        $step->delete();

        return response()->json(null, 204);
    }

    // ---- helpers ---------------------------------------------------------

    private function validatedSub(Request $request, bool $creating): array
    {
        return $request->validate([
            'treatment_id' => [$creating ? 'required' : 'prohibited', 'uuid', 'exists:treatments,id'],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:255'],
            'estimated_cost_syp' => ['nullable', 'numeric', 'min:0'],
            'estimated_cost_usd' => ['nullable', 'numeric', 'min:0'],
            'tooth_association' => ['nullable', Rule::in(['not_related', 'single_tooth', 'multiple_teeth'])],
        ]);
    }

    /** Non-dental treatments are never tooth-related. */
    private function toothAssociation(Treatment $treatment, ?string $requested): string
    {
        $isDental = Specialty::whereKey($treatment->specialty_id)->value('is_dental');

        return $isDental ? ($requested ?? 'not_related') : 'not_related';
    }
}
