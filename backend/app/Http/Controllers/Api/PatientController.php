<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Support\Activity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Patients.tsx. Patients are shared by all doctors.
 * Replaces the client-side 1000-row paging loops with real server paging,
 * and moves the duplicate-name check to the server.
 */
class PatientController extends Controller
{
    /**
     * GET /patients?search=&filter=duplicates|no_appointments&page=&per_page=
     * per_page up to 10000 so the Excel export can fetch everything in one call.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Patient::class);
        $perPage = min(max((int) $request->query('per_page', 20), 1), 10000);

        $query = Patient::query()
            ->withCount('appointments')
            ->when($request->query('search'), fn (Builder $q, $s) => $q->where(fn ($w) => $w
                ->where('full_name', 'like', '%'.$s.'%')
                ->orWhere('phone_number', 'like', '%'.$s.'%')))
            ->when($request->query('filter') === 'no_appointments', fn (Builder $q) => $q->whereDoesntHave('appointments'))
            // Self-join via EXISTS instead of GROUP BY/HAVING: MySQL's
            // only_full_group_by rejects grouping on an expression.
            ->when($request->query('filter') === 'duplicates', fn (Builder $q) => $q->whereExists(
                fn ($s) => $s->select(DB::raw(1))
                    ->from('patients as dup')
                    ->whereNull('dup.deleted_at')
                    ->whereColumn('dup.id', '<>', 'patients.id')
                    ->whereRaw('LOWER(TRIM(dup.full_name)) = LOWER(TRIM(patients.full_name))'),
            ))
            ->orderBy('full_name');

        return response()->json($query->paginate($perPage));
    }

    /** GET /patients/search?q= — light list for comboboxes (name or phone), max 200. */
    public function search(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Patient::class);
        $q = trim((string) $request->query('q', ''));

        $patients = Patient::query()
            ->select(['id', 'full_name', 'phone_number'])
            ->when($q !== '', fn (Builder $b) => $b->where(fn ($w) => $w
                ->where('full_name', 'like', "%$q%")
                ->orWhere('phone_number', 'like', "%$q%")))
            ->orderBy('full_name')
            ->limit(200)
            ->get();

        return response()->json(['data' => $patients]);
    }

    public function show(Patient $patient): JsonResponse
    {
        $this->authorize('view', $patient);

        return response()->json(['data' => $patient]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Patient::class);
        $data = $this->validated($request);

        if ($this->nameExists($data['full_name'])) {
            return response()->json([
                'message' => 'يوجد مريض بنفس الاسم مسبقاً',
                'errors' => ['full_name' => ['يوجد مريض بنفس الاسم مسبقاً']],
            ], 422);
        }

        return response()->json(['data' => Patient::create($data)], 201);
    }

    public function update(Request $request, Patient $patient): JsonResponse
    {
        $this->authorize('update', $patient);
        $patient->update($this->validated($request, true));

        return response()->json(['data' => $patient]);
    }

    /** Soft delete (super_admin): history and money stay intact and can be restored. */
    public function destroy(Patient $patient): JsonResponse
    {
        $this->authorize('delete', $patient);
        $patient->delete();

        return response()->json(null, 204);
    }

    /**
     * POST /patients/import  { rows: [{full_name, date_of_birth, phone_number, address, job, contact, medical_notes}] }
     * Skips names that already exist (case/space-insensitive), including
     * duplicates inside the file itself. Checks against ALL patients.
     */
    public function import(Request $request): JsonResponse
    {
        $this->authorize('create', Patient::class);
        $data = $request->validate([
            'rows' => ['required', 'array', 'max:5000'],
            'rows.*.full_name' => ['required', 'string', 'max:255'],
            'rows.*.date_of_birth' => ['nullable', 'date'],
            'rows.*.phone_number' => ['nullable', 'string', 'max:50'],
            'rows.*.address' => ['nullable', 'string'],
            'rows.*.job' => ['nullable', 'string', 'max:255'],
            'rows.*.contact' => ['nullable', 'string', 'max:255'],
            'rows.*.medical_notes' => ['nullable', 'string'],
        ]);

        $existing = Patient::query()->pluck('full_name')
            ->mapWithKeys(fn ($n) => [$this->key($n) => true])->all();

        $inserted = 0;
        $skipped = [];
        DB::transaction(function () use ($data, &$existing, &$inserted, &$skipped) {
            // One summary line in سجل النشاطات instead of one per row.
            Activity::muted(function () use ($data, &$existing, &$inserted, &$skipped) {
                foreach ($data['rows'] as $row) {
                    $key = $this->key($row['full_name']);
                    if (isset($existing[$key])) {
                        $skipped[] = $row['full_name'];

                        continue;
                    }
                    $row['full_name'] = trim($row['full_name']);
                    Patient::create($row);
                    $existing[$key] = true;
                    $inserted++;
                }
            });
            if ($inserted > 0) {
                Activity::log('imported', 'patient', null, "استورد $inserted مريضاً من ملف Excel"
                    .($skipped ? ' (تم تخطي '.count($skipped).' اسماً موجوداً مسبقاً)' : ''));
            }
        });

        return response()->json(['inserted' => $inserted, 'skipped' => count($skipped), 'skipped_names' => $skipped]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $data = $request->validate([
            'full_name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'date_of_birth' => ['nullable', 'date'],
            'phone_number' => ['nullable', 'string', 'max:50'],
            'contact' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'job' => ['nullable', 'string', 'max:255'],
            'medical_notes' => ['nullable', 'string'],
        ]);
        if (isset($data['full_name'])) {
            $data['full_name'] = trim($data['full_name']);
        }
        if (! empty($data['date_of_birth'])) {
            $data['date_of_birth'] = Carbon::parse($data['date_of_birth'])->toDateString();
        }

        return $data;
    }

    private function nameExists(string $name): bool
    {
        return Patient::query()->whereRaw('LOWER(TRIM(full_name)) = ?', [$this->key($name)])->exists();
    }

    private function key(string $name): string
    {
        return mb_strtolower(trim($name));
    }
}
