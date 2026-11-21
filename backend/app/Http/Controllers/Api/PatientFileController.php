<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\PatientFile;
use App\Support\Activity;
use App\Support\DoctorBooks;
use App\Support\Thumbnailer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/** ملفات المريض (plan §2.4). */
class PatientFileController extends Controller
{
    private const WITH = ['uploader:id,full_name,email', 'doctor:id,full_name', 'specialty:id,name_ar,color'];

    /** GET /patients/{patient}/files?category= */
    public function index(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);
        $this->authorize('viewAny', PatientFile::class);

        $files = PatientFile::query()->where('patient_id', $patient->id)
            ->with(self::WITH)
            ->when($request->query('category'), fn ($q, $c) => $q->where('category', $c))
            ->orderByDesc('taken_at')->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $files,
            'categories' => PatientFile::CATEGORY_LABELS,
            'max_upload_mb' => (int) config('clinic.upload_max_mb'),
        ]);
    }

    /** POST /patients/{patient}/files (multipart: file, category, title?, taken_at?, notes?, appointment_id?) */
    public function store(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);
        $this->authorize('create', PatientFile::class);

        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:'.((int) config('clinic.upload_max_mb') * 1024)],
            'category' => ['required', Rule::in(PatientFile::CATEGORIES)],
            'title' => ['nullable', 'string', 'max:255'],
            // no dates in the future (one day of slack for the clinic timezone)
            'taken_at' => ['nullable', 'date', 'before_or_equal:'.now(config('clinic.timezone'))->addDay()->toDateString()],
            'notes' => ['nullable', 'string', 'max:2000'],
            'appointment_id' => ['nullable', 'uuid', 'exists:appointments,id'],
        ]);

        $appointment = ! empty($data['appointment_id']) ? Appointment::find($data['appointment_id']) : null;
        if ($appointment && $appointment->patient_id !== $patient->id) {
            throw ValidationException::withMessages(['appointment_id' => ['الموعد لا يخص هذا المريض']]);
        }

        $upload = $request->file('file');
        $mime = $upload->getMimeType() ?: 'application/octet-stream';
        $id = (string) Str::uuid7();
        $ext = strtolower($upload->guessExtension() ?: $upload->getClientOriginalExtension() ?: 'bin');
        $dir = 'patients/'.$patient->id;

        $path = $upload->storeAs($dir, $id.'.'.$ext, 'local');
        if (! $path) {
            throw ValidationException::withMessages(['file' => ['تعذر حفظ الملف على الخادم']]);
        }

        $thumbPath = null;
        if ($bytes = Thumbnailer::make($upload->getRealPath(), $mime)) {
            $thumbPath = $dir.'/thumbs/'.$id.'.jpg';
            Storage::disk('local')->put($thumbPath, $bytes);
        }

        // Who/which specialty: the appointment's, else the uploader's own doctor.
        $doctorId = $appointment?->doctor_id ?? DoctorBooks::for($request->user())->currentDoctorId();
        $specialtyId = $appointment?->specialty_id
            ?? ($doctorId ? Doctor::with('specialties')->find($doctorId)?->primarySpecialty()?->id : null);

        $file = PatientFile::create([
            'id' => $id,
            'patient_id' => $patient->id,
            'appointment_id' => $appointment?->id,
            'doctor_id' => $doctorId,
            'specialty_id' => $specialtyId,
            'uploaded_by' => $request->user()->id,
            'category' => $data['category'],
            'title' => trim((string) ($data['title'] ?? '')) ?: pathinfo($upload->getClientOriginalName(), PATHINFO_FILENAME),
            'taken_at' => $data['taken_at'] ?? now(config('clinic.timezone'))->toDateString(),
            'notes' => $data['notes'] ?? null,
            'disk' => 'local',
            'path' => $path,
            'thumbnail_path' => $thumbPath,
            'original_name' => $upload->getClientOriginalName(),
            'mime' => $mime,
            'size' => $upload->getSize(),
        ]);

        Activity::log('created', 'patient_file', $file->id,
            'رفع '.PatientFile::CATEGORY_LABELS[$file->category].' «'.$file->title.'» للمريض '.$patient->full_name,
            ['patient_id' => $patient->id]);

        return response()->json(['data' => $file->load(self::WITH)], 201);
    }

    /** GET /patient-files/{file}/content?download=1 — the file itself (inline by default). */
    public function content(Request $request, PatientFile $file): Response
    {
        $this->authorize('view', $file);
        abort_unless(Storage::disk($file->disk)->exists($file->path), 404, 'الملف غير موجود على الخادم');

        $name = $file->title.'.'.pathinfo($file->path, PATHINFO_EXTENSION);
        $disposition = $request->boolean('download') ? 'attachment' : 'inline';

        return Storage::disk($file->disk)->response($file->path, $name, [
            'Content-Type' => $file->mime,
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ], $disposition);
    }

    /** GET /patient-files/{file}/thumbnail */
    public function thumbnail(PatientFile $file): Response
    {
        $this->authorize('view', $file);
        abort_unless($file->thumbnail_path && Storage::disk($file->disk)->exists($file->thumbnail_path), 404);

        return Storage::disk($file->disk)->response($file->thumbnail_path, null, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    public function update(Request $request, PatientFile $file): JsonResponse
    {
        $this->authorize('update', $file);
        $file->update($request->validate([
            'category' => ['sometimes', Rule::in(PatientFile::CATEGORIES)],
            'title' => ['sometimes', 'string', 'max:255'],
            'taken_at' => ['sometimes', 'nullable', 'date', 'before_or_equal:'.now(config('clinic.timezone'))->addDay()->toDateString()],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]));

        return response()->json(['data' => $file->fresh(self::WITH)]);
    }

    /** Soft delete: the stored file is kept so an admin can restore it. */
    public function destroy(PatientFile $file): JsonResponse
    {
        $this->authorize('delete', $file);
        $file->delete();

        Activity::log('deleted', 'patient_file', $file->id,
            'حذف '.PatientFile::CATEGORY_LABELS[$file->category].' «'.$file->title.'» من ملفات المريض '
            .Patient::withTrashed()->whereKey($file->patient_id)->value('full_name'),
            ['patient_id' => $file->patient_id]);

        return response()->json(null, 204);
    }
}
