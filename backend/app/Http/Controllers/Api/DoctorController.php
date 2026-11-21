<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Doctor;
use App\Support\DoctorBooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Doctors.tsx / DoctorProfile.tsx. Doctors are visible to every role (basic info). */
class DoctorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Doctor::class);

        $doctors = Doctor::query()
            ->with(['specialties:id,name_ar,is_dental,color', 'user:id,email,full_name'])
            ->when($request->query('specialty_id'), fn ($q, $id) => $q->whereHas('specialties', fn ($s) => $s->where('specialties.id', $id)))
            ->orderBy('full_name')
            ->get();

        return response()->json(['data' => $doctors->map(fn (Doctor $d) => $this->present($d, $request))]);
    }

    public function show(Request $request, Doctor $doctor): JsonResponse
    {
        $this->authorize('view', $doctor);
        $doctor->load(['specialties:id,name_ar,is_dental,color', 'user:id,email,full_name']);

        return response()->json(['data' => $this->present($doctor, $request)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Doctor::class);
        $data = $this->validated($request);

        $doctor = DB::transaction(function () use ($data) {
            $doctor = Doctor::create($data);
            $this->syncSpecialties($doctor, $data);

            return $doctor;
        });
        DoctorBooks::flush();

        return $this->show($request, $doctor->fresh())->setStatusCode(201);
    }

    public function update(Request $request, Doctor $doctor): JsonResponse
    {
        $this->authorize('update', $doctor);
        $data = $this->validated($request, $doctor);

        DB::transaction(function () use ($doctor, $data) {
            $doctor->update($data);
            $this->syncSpecialties($doctor, $data);
        });
        DoctorBooks::flush();

        return $this->show($request, $doctor->fresh());
    }

    /** Soft delete: appointments and money history stay intact. */
    public function destroy(Doctor $doctor): JsonResponse
    {
        $this->authorize('delete', $doctor);
        $doctor->delete();
        DoctorBooks::flush();

        return response()->json(null, 204);
    }

    private function present(Doctor $d, Request $request): array
    {
        $primary = $d->primarySpecialty();

        return [
            'id' => $d->id,
            'full_name' => $d->full_name,
            'email' => $d->email,
            'phone_number' => $d->phone_number,
            // Kept so existing screens that print doctors.specialty keep working.
            'specialty' => $primary?->name_ar ?? $d->legacy_specialty,
            'primary_specialty_id' => $primary?->id,
            'specialties' => $d->specialties->map(fn ($s) => [
                'id' => $s->id, 'name_ar' => $s->name_ar, 'is_dental' => $s->is_dental,
                'color' => $s->color, 'is_primary' => (bool) $s->pivot->is_primary,
            ])->values(),
            'has_own_books' => $d->has_own_books,
            'user_id' => $d->user_id,
            // Login e-mail only for admins.
            'user' => $request->user()->isSuperAdmin() ? $d->user?->only(['id', 'email', 'full_name']) : null,
            'print_header' => $d->print_header,
            'created_at' => $d->created_at,
            'updated_at' => $d->updated_at,
        ];
    }

    private function validated(Request $request, ?Doctor $doctor = null): array
    {
        $required = $doctor ? 'sometimes' : 'required';

        return $request->validate([
            'full_name' => [$required, 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone_number' => ['nullable', 'string', 'max:50'],
            'has_own_books' => ['sometimes', 'boolean'],
            'user_id' => ['nullable', 'uuid', 'exists:users,id', Rule::unique('doctors', 'user_id')->ignore($doctor)],
            'print_header' => ['nullable', 'string', 'max:2000'],
            'specialty_ids' => [$required, 'array', 'min:1'],
            'specialty_ids.*' => ['uuid', 'exists:specialties,id'],
            'primary_specialty_id' => ['nullable', 'uuid'],
        ]);
    }

    private function syncSpecialties(Doctor $doctor, array $data): void
    {
        if (! array_key_exists('specialty_ids', $data)) {
            return;
        }
        $ids = array_values(array_unique($data['specialty_ids']));
        $primary = in_array($data['primary_specialty_id'] ?? null, $ids, true) ? $data['primary_specialty_id'] : $ids[0];

        $doctor->specialties()->sync(collect($ids)->mapWithKeys(fn ($id) => [$id => ['is_primary' => $id === $primary]])->all());
    }
}
