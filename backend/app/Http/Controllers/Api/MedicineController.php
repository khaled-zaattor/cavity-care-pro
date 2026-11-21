<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** الأدوية catalog (plan §2.3). */
class MedicineController extends Controller
{
    /** GET /medicines?q=&include_inactive=1&specialty_id=&limit= */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Medicine::class);
        $q = trim((string) $request->query('q', ''));
        $limit = min(max((int) $request->query('limit', 500), 1), 2000);

        $rows = Medicine::query()
            ->when(! $request->boolean('include_inactive'), fn (Builder $b) => $b->where('is_active', true))
            ->when($q !== '', fn (Builder $b) => $b->where(fn ($w) => $w
                ->where('trade_name', 'like', "%$q%")
                ->orWhere('generic_name', 'like', "%$q%")))
            // a specialty's own medicines + general ones
            ->when($request->query('specialty_id'), fn (Builder $b, $id) => $b->where(fn ($w) => $w->whereNull('specialty_id')->orWhere('specialty_id', $id)))
            ->orderBy('trade_name')
            ->limit($limit)
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Medicine::class);

        return response()->json(['data' => Medicine::create($this->validated($request))], 201);
    }

    public function update(Request $request, Medicine $medicine): JsonResponse
    {
        $this->authorize('update', $medicine);
        $medicine->update($this->validated($request, true));

        return response()->json(['data' => $medicine]);
    }

    /** Past prescriptions keep the medicine name (snapshot), so deleting is safe. */
    public function destroy(Medicine $medicine): JsonResponse
    {
        $this->authorize('delete', $medicine);
        $medicine->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'trade_name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'generic_name' => ['nullable', 'string', 'max:255'],
            'form' => ['nullable', 'string', 'max:50'],
            'strength' => ['nullable', 'string', 'max:100'],
            'default_dose' => ['nullable', 'string', 'max:100'],
            'default_frequency' => ['nullable', 'string', 'max:100'],
            'default_duration' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'specialty_id' => ['nullable', 'uuid', 'exists:specialties,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
