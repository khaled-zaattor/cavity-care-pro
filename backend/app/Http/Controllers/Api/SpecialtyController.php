<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Specialty;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** التخصصات management (new in Laravel; plan §2.1). */
class SpecialtyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Specialty::class);

        $specialties = Specialty::query()
            ->when(! $request->boolean('include_inactive'), fn ($q) => $q->where('is_active', true))
            ->withCount(['doctors', 'treatments'])
            ->orderBy('sort_order')
            ->orderBy('name_ar')
            ->get();

        return response()->json(['data' => $specialties]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Specialty::class);

        $specialty = Specialty::create($this->validated($request));

        return response()->json(['data' => $specialty], 201);
    }

    public function update(Request $request, Specialty $specialty): JsonResponse
    {
        $this->authorize('update', $specialty);

        $specialty->update($this->validated($request, $specialty));

        return response()->json(['data' => $specialty]);
    }

    public function destroy(Specialty $specialty): JsonResponse
    {
        $this->authorize('delete', $specialty);

        if ($specialty->treatments()->exists() || $specialty->doctors()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف تخصص مرتبط بأطباء أو علاجات. يمكنك إيقافه بدلاً من ذلك.',
            ], 422);
        }
        $specialty->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, ?Specialty $specialty = null): array
    {
        $required = $specialty ? 'sometimes' : 'required';

        return $request->validate([
            'name_ar' => [$required, 'string', 'max:100'],
            'name_en' => ['nullable', 'string', 'max:100'],
            'code' => ['nullable', 'string', 'max:50', 'alpha_dash', Rule::unique('specialties', 'code')->ignore($specialty)],
            'is_dental' => ['sometimes', 'boolean'],
            'color' => ['nullable', 'string', 'max:20'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
