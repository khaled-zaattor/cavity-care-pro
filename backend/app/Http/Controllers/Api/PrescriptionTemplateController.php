<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PrescriptionTemplate;
use App\Support\DoctorBooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Per-doctor prescription templates. */
class PrescriptionTemplateController extends Controller
{
    /** GET /prescription-templates?doctor_id= (doctors: their own; admin: any doctor's) */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PrescriptionTemplate::class);
        $user = $request->user();
        $own = DoctorBooks::for($user)->currentDoctorId();
        $doctorId = $user->isSuperAdmin() ? ($request->query('doctor_id') ?? $own) : $own;

        $rows = PrescriptionTemplate::query()->with('items')
            ->when($doctorId, fn ($q) => $q->where('doctor_id', $doctorId), fn ($q) => $q->whereRaw('1 = 0'))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', PrescriptionTemplate::class);
        $data = $this->validated($request);
        $user = $request->user();
        $own = DoctorBooks::for($user)->currentDoctorId();
        $doctorId = $user->isSuperAdmin() ? ($data['doctor_id'] ?? $own) : $own;
        if (! $doctorId) {
            throw ValidationException::withMessages(['doctor_id' => ['حسابك غير مرتبط بطبيب']]);
        }

        $template = DB::transaction(function () use ($data, $doctorId) {
            $t = PrescriptionTemplate::create(['doctor_id' => $doctorId] + collect($data)->only(['name', 'diagnosis', 'notes'])->all());
            $this->saveItems($t, $data['items']);

            return $t;
        });

        return response()->json(['data' => $template->load('items')], 201);
    }

    public function update(Request $request, PrescriptionTemplate $template): JsonResponse
    {
        $this->authorize('update', $template);
        $data = $this->validated($request, true);

        DB::transaction(function () use ($template, $data) {
            $template->update(collect($data)->only(['name', 'diagnosis', 'notes'])->all());
            if (array_key_exists('items', $data)) {
                $template->items()->delete();
                $this->saveItems($template, $data['items']);
            }
        });

        return response()->json(['data' => $template->fresh('items')]);
    }

    public function destroy(PrescriptionTemplate $template): JsonResponse
    {
        $this->authorize('delete', $template);
        $template->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'doctor_id' => ['nullable', 'uuid', 'exists:doctors,id'],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'diagnosis' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => [$partial ? 'sometimes' : 'required', 'array', 'min:1', 'max:30'],
            'items.*.medicine_id' => ['nullable', 'uuid', 'exists:medicines,id'],
            'items.*.medicine_name' => ['required', 'string', 'max:255'],
            'items.*.dose' => ['nullable', 'string', 'max:100'],
            'items.*.frequency' => ['nullable', 'string', 'max:100'],
            'items.*.duration' => ['nullable', 'string', 'max:100'],
            'items.*.route' => ['nullable', 'string', 'max:50'],
            'items.*.quantity' => ['nullable', 'string', 'max:50'],
            'items.*.instructions' => ['nullable', 'string', 'max:500'],
        ]);
    }

    private function saveItems(PrescriptionTemplate $template, array $items): void
    {
        foreach (array_values($items) as $i => $item) {
            $template->items()->create(collect($item)->only([
                'medicine_id', 'medicine_name', 'dose', 'frequency', 'duration', 'route', 'quantity', 'instructions',
            ])->all() + ['sort_order' => $i]);
        }
    }
}
