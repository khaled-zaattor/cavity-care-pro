<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ClinicSetting;
use App\Models\Doctor;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Prescription;
use App\Support\Activity;
use App\Support\DoctorBooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** الوصفات الطبية (plan §2.3). */
class PrescriptionController extends Controller
{
    private const WITH = [
        'items',
        'patient:id,full_name,date_of_birth,phone_number',
        'doctor:id,full_name,print_header',
        'specialty:id,name_ar',
    ];

    /** GET /prescriptions?patient_id=&doctor_id=&page=&per_page= */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Prescription::class);
        $perPage = min(max((int) $request->query('per_page', 50), 1), 200);

        $rows = Prescription::query()->visibleTo($request->user())
            ->with(self::WITH)
            ->when($request->query('patient_id'), fn (Builder $q, $id) => $q->where('patient_id', $id))
            ->when($request->query('doctor_id'), fn (Builder $q, $id) => $q->where('doctor_id', $id))
            ->orderByDesc('issued_at')
            ->paginate($perPage);

        return response()->json($rows);
    }

    /** GET /prescriptions/{id} — also everything the A4 print page needs. */
    public function show(Prescription $prescription): JsonResponse
    {
        $this->authorize('view', $prescription);
        $prescription->load(self::WITH);

        $settings = ClinicSetting::all_values();

        return response()->json([
            'data' => $prescription,
            'clinic' => [
                'name' => $settings['clinic_name'],
                'name_en' => $settings['clinic_name_en'],
                'address' => $settings['clinic_address'],
                'phone' => $settings['clinic_phone'],
                'footer' => $settings['prescription_footer'],
                'has_logo' => ! empty($settings['logo_path']),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Prescription::class);
        $data = $this->validated($request);
        $doctorId = $this->doctorFor($request, $data['doctor_id'] ?? null);

        $patient = Patient::findOrFail($data['patient_id']);
        $this->authorize('view', $patient);

        $appointment = null;
        if (! empty($data['appointment_id'])) {
            $appointment = Appointment::findOrFail($data['appointment_id']);
            if ($appointment->patient_id !== $patient->id) {
                throw ValidationException::withMessages(['appointment_id' => ['الموعد لا يخص هذا المريض']]);
            }
        }

        $prescription = new Prescription([
            'patient_id' => $patient->id,
            'doctor_id' => $doctorId,
            'specialty_id' => $data['specialty_id']
                ?? $appointment?->specialty_id
                ?? Doctor::with('specialties')->find($doctorId)?->primarySpecialty()?->id,
            'appointment_id' => $appointment?->id,
            'created_by' => $request->user()->id,
            'diagnosis' => $data['diagnosis'] ?? null,
            'notes' => $data['notes'] ?? null,
            'issued_at' => now(),
        ]);
        $this->authorize('store', $prescription);

        DB::transaction(function () use ($prescription, $data) {
            // Sequential printed number; the row lock serialises concurrent saves (MySQL).
            $prescription->number = (int) Prescription::withTrashed()->lockForUpdate()->max('number') + 1;
            $prescription->save();
            $this->saveItems($prescription, $data['items']);
        });

        Activity::log('created', 'prescription', $prescription->id,
            'كتب الوصفة رقم '.$prescription->number.' للمريض '.$patient->full_name.' ('.Activity::doctorName(Doctor::withTrashed()->whereKey($doctorId)->value('full_name')).'): '
            .$prescription->items()->pluck('medicine_name')->implode('، '),
            ['patient_id' => $patient->id, 'doctor_id' => $doctorId]);

        return response()->json(['data' => $prescription->load(self::WITH)], 201);
    }

    public function update(Request $request, Prescription $prescription): JsonResponse
    {
        $this->authorize('update', $prescription);
        $data = $this->validated($request, true);

        DB::transaction(function () use ($prescription, $data) {
            $prescription->update(collect($data)->only(['diagnosis', 'notes', 'specialty_id'])->all());
            if (array_key_exists('items', $data)) {
                $prescription->items()->delete();
                $this->saveItems($prescription, $data['items']);
            }
        });

        Activity::log('updated', 'prescription', $prescription->id,
            'عدّل الوصفة رقم '.$prescription->number.' للمريض '.$prescription->patient()->withTrashed()->value('full_name'),
            ['patient_id' => $prescription->patient_id, 'doctor_id' => $prescription->doctor_id]);

        return response()->json(['data' => $prescription->fresh(self::WITH)]);
    }

    public function destroy(Prescription $prescription): JsonResponse
    {
        $this->authorize('delete', $prescription);
        $prescription->delete();

        Activity::log('deleted', 'prescription', $prescription->id,
            'حذف الوصفة رقم '.$prescription->number.' للمريض '.$prescription->patient()->withTrashed()->value('full_name'),
            ['patient_id' => $prescription->patient_id, 'doctor_id' => $prescription->doctor_id]);

        return response()->json(null, 204);
    }

    /** POST /prescriptions/{id}/printed — remembered for the "printed" badge. */
    public function markPrinted(Prescription $prescription): JsonResponse
    {
        $this->authorize('view', $prescription);
        $prescription->forceFill(['printed_at' => now()])->saveQuietly();

        return response()->json(['data' => ['printed_at' => $prescription->printed_at]]);
    }

    // ---- helpers -----------------------------------------------------------

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'patient_id' => [$partial ? 'prohibited' : 'required', 'uuid', 'exists:patients,id'],
            'doctor_id' => [$partial ? 'prohibited' : 'nullable', 'uuid', 'exists:doctors,id'],
            'appointment_id' => [$partial ? 'prohibited' : 'nullable', 'uuid', 'exists:appointments,id'],
            'specialty_id' => ['nullable', 'uuid', 'exists:specialties,id'],
            'diagnosis' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => [$req, 'array', 'min:1', 'max:30'],
            'items.*.medicine_id' => ['nullable', 'uuid', 'exists:medicines,id'],
            'items.*.medicine_name' => ['nullable', 'string', 'max:255', 'required_without:items.*.medicine_id'],
            'items.*.dose' => ['nullable', 'string', 'max:100'],
            'items.*.frequency' => ['nullable', 'string', 'max:100'],
            'items.*.duration' => ['nullable', 'string', 'max:100'],
            'items.*.route' => ['nullable', 'string', 'max:50'],
            'items.*.quantity' => ['nullable', 'string', 'max:50'],
            'items.*.instructions' => ['nullable', 'string', 'max:500'],
        ]);
    }

    /** A doctor prescribes as themselves; super_admin must say which doctor. */
    private function doctorFor(Request $request, ?string $requested): string
    {
        $user = $request->user();
        $own = DoctorBooks::for($user)->currentDoctorId();

        if (! $user->isSuperAdmin()) {
            if (! $own) {
                throw ValidationException::withMessages(['doctor_id' => ['حسابك غير مرتبط بطبيب']]);
            }

            return $own;
        }
        if (! $requested && ! $own) {
            throw ValidationException::withMessages(['doctor_id' => ['اختر الطبيب']]);
        }

        return $requested ?? $own;
    }

    private function saveItems(Prescription $prescription, array $items): void
    {
        $medicines = Medicine::whereIn('id', collect($items)->pluck('medicine_id')->filter())->get()->keyBy('id');

        foreach (array_values($items) as $i => $item) {
            $medicine = isset($item['medicine_id']) ? $medicines[$item['medicine_id']] ?? null : null;
            $prescription->items()->create([
                'medicine_id' => $medicine?->id,
                'medicine_name' => trim((string) ($item['medicine_name'] ?? '')) ?: $medicine?->displayName(),
                'dose' => $item['dose'] ?? null,
                'frequency' => $item['frequency'] ?? null,
                'duration' => $item['duration'] ?? null,
                'route' => $item['route'] ?? null,
                'quantity' => $item['quantity'] ?? null,
                'instructions' => $item['instructions'] ?? null,
                'sort_order' => $i,
            ]);
        }
    }
}
