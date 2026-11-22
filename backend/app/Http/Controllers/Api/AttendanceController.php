<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Doctor;
use App\Models\DoctorAttendance;
use App\Services\SettlementService;
use App\Support\Activity;
use App\Support\DoctorBooks;
use App\Support\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * حضور الأطباء (Phase G): check-in / check-out gives the work hours that
 * split clinic-wide charges. Reception or the doctor clocks; only the admin
 * edits past entries (every edit is logged).
 */
class AttendanceController extends Controller
{
    /** GET /attendance?doctor_id=&from=YYYY-MM-DD&to=YYYY-MM-DD */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeView($user);
        $data = $request->validate(['doctor_id' => ['nullable', 'uuid'], 'from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $tz = config('clinic.timezone');
        $from = $data['from'] ?? now($tz)->startOfMonth()->toDateString();
        $to = $data['to'] ?? now($tz)->toDateString();

        $rows = DoctorAttendance::query()->with('doctor:id,full_name')
            ->whereBetween('date', [$from, $to])
            ->when($this->ownOnly($user), fn ($q, $own) => $q->where('doctor_id', $own))
            ->when($data['doctor_id'] ?? null, fn ($q, $id) => $q->where('doctor_id', $id))
            ->orderByDesc('date')->orderByDesc('check_in')
            ->get();

        $totals = $rows->whereNotNull('minutes')->groupBy('doctor_id')
            ->map(fn ($r) => round($r->sum('minutes') / 60, 2));

        return response()->json(['data' => $rows, 'hours_by_doctor' => $totals, 'from' => $from, 'to' => $to]);
    }

    /** GET /attendance/today — who is in right now, and today's hours. */
    public function today(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeView($user);
        $today = now(config('clinic.timezone'))->toDateString();
        $own = $this->ownOnly($user);

        $doctors = Doctor::query()->orderBy('full_name')
            ->when($own, fn ($q) => $q->whereKey($own))
            ->get(['id', 'full_name']);
        $spans = DoctorAttendance::where('date', $today)->get()->groupBy('doctor_id');

        return response()->json(['data' => $doctors->map(function ($d) use ($spans) {
            $mine = $spans->get($d->id, collect());
            $open = $mine->firstWhere('check_out', null);
            $minutes = (int) $mine->sum('minutes') + ($open ? (int) $open->check_in->diffInMinutes(now(), true) : 0);

            return [
                'doctor_id' => $d->id,
                'doctor_name' => $d->full_name,
                'checked_in' => (bool) $open,
                'open_since' => $open?->check_in,
                'today_minutes' => $minutes,
                'spans' => $mine->values(),
            ];
        })->values(), 'date' => $today]);
    }

    /** POST /attendance/check-in {doctor_id} */
    public function checkIn(Request $request): JsonResponse
    {
        $doctorId = $this->doctorForClock($request);
        if (DoctorAttendance::where('doctor_id', $doctorId)->whereNull('check_out')->exists()) {
            throw ValidationException::withMessages(['doctor_id' => ['الطبيب مسجل حضوره بالفعل']]);
        }
        $row = DoctorAttendance::create([
            'doctor_id' => $doctorId,
            'date' => now(config('clinic.timezone'))->toDateString(),
            'check_in' => now(),
            'source' => 'live',
            'entered_by' => $request->user()->id,
        ]);

        return response()->json(['data' => $row], 201);
    }

    /** POST /attendance/check-out {doctor_id} */
    public function checkOut(Request $request): JsonResponse
    {
        $doctorId = $this->doctorForClock($request);
        $row = DoctorAttendance::where('doctor_id', $doctorId)->whereNull('check_out')->latest('check_in')->first();
        if (! $row) {
            throw ValidationException::withMessages(['doctor_id' => ['لا يوجد تسجيل حضور مفتوح لهذا الطبيب']]);
        }
        $row->check_out = now();
        $row->syncMinutes();
        $row->save();

        return response()->json(['data' => $row]);
    }

    /** POST /attendance (admin: add a forgotten day) {doctor_id, date, check_in "HH:mm", check_out "HH:mm", notes} */
    public function store(Request $request, SettlementService $settlements): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $this->validatedManual($request);
        $this->assertOpenMonth($settlements, $data['date']);

        $row = new DoctorAttendance(['doctor_id' => $data['doctor_id'], 'date' => $data['date'], 'source' => 'manual', 'entered_by' => $request->user()->id, 'notes' => $data['notes'] ?? null]);
        $this->applyTimes($row, $data);
        $row->save();

        Activity::log('created', 'settings', $row->id,
            'أضاف يدوياً حضور '.Activity::doctorName(Doctor::withTrashed()->whereKey($row->doctor_id)->value('full_name')).' بتاريخ '.$row->date->format('Y-m-d')
            .' ('.$this->hm($row->minutes).')', ['doctor_id' => $row->doctor_id]);

        return response()->json(['data' => $row->load('doctor:id,full_name')], 201);
    }

    /** PATCH /attendance/{id} (admin correction) */
    public function update(Request $request, DoctorAttendance $attendance, SettlementService $settlements): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $this->validatedManual($request, true);
        $this->assertOpenMonth($settlements, $attendance->date);
        $before = $attendance->minutes;

        $this->applyTimes($attendance, $data + ['date' => $attendance->date->format('Y-m-d')]);
        if (array_key_exists('notes', $data)) {
            $attendance->notes = $data['notes'];
        }
        $attendance->source = 'manual';
        $attendance->save();

        Activity::log('updated', 'settings', $attendance->id,
            'صحّح حضور '.Activity::doctorName(Doctor::withTrashed()->whereKey($attendance->doctor_id)->value('full_name'))
            .' بتاريخ '.$attendance->date->format('Y-m-d').' من '.$this->hm($before).' إلى '.$this->hm($attendance->minutes),
            ['doctor_id' => $attendance->doctor_id]);

        return response()->json(['data' => $attendance->load('doctor:id,full_name')]);
    }

    public function destroy(Request $request, DoctorAttendance $attendance, SettlementService $settlements): JsonResponse
    {
        $this->authorizeAdmin($request);
        $this->assertOpenMonth($settlements, $attendance->date);
        $attendance->delete();

        Activity::log('deleted', 'settings', $attendance->id,
            'حذف حضور '.Activity::doctorName(Doctor::withTrashed()->whereKey($attendance->doctor_id)->value('full_name'))
            .' بتاريخ '.$attendance->date->format('Y-m-d').' ('.$this->hm($attendance->minutes).')', ['doctor_id' => $attendance->doctor_id]);

        return response()->json(null, 204);
    }

    // ---- helpers -----------------------------------------------------------

    private function authorizeView($user): void
    {
        abort_unless($user->is_active && $user->hasRole(Role::SUPER_ADMIN, Role::RECEPTIONIST, Role::DOCTOR), 403, 'ليس لديك صلاحية');
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->isSuperAdmin(), 403, 'تعديل الحضور للمدير فقط');
    }

    /** Doctors only see/clock themselves. */
    private function ownOnly($user): ?string
    {
        return $user->hasRole(Role::DOCTOR) ? (DoctorBooks::for($user)->currentDoctorId() ?? 'none') : null;
    }

    private function doctorForClock(Request $request): string
    {
        $user = $request->user();
        $this->authorizeView($user);
        $data = $request->validate(['doctor_id' => ['nullable', 'uuid', 'exists:doctors,id']]);
        if ($user->hasRole(Role::DOCTOR)) {
            $own = DoctorBooks::for($user)->currentDoctorId();
            abort_unless($own && (($data['doctor_id'] ?? $own) === $own), 403, 'يمكنك تسجيل حضورك فقط');

            return $own;
        }
        if (empty($data['doctor_id'])) {
            throw ValidationException::withMessages(['doctor_id' => ['اختر الطبيب']]);
        }

        return $data['doctor_id'];
    }

    private function validatedManual(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'doctor_id' => [$partial ? 'prohibited' : 'required', 'uuid', 'exists:doctors,id'],
            'date' => [$partial ? 'prohibited' : 'required', 'date'],
            'check_in' => [$req, 'date_format:H:i'],
            'check_out' => [$req, 'date_format:H:i'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
    }

    private function applyTimes(DoctorAttendance $row, array $data): void
    {
        $tz = config('clinic.timezone');
        $date = $data['date'];
        if (isset($data['check_in'])) {
            $row->check_in = Carbon::parse($date.' '.$data['check_in'], $tz)->utc();
        }
        if (isset($data['check_out'])) {
            $row->check_out = Carbon::parse($date.' '.$data['check_out'], $tz)->utc();
        }
        if ($row->check_out && $row->check_out->lessThanOrEqualTo($row->check_in)) {
            throw ValidationException::withMessages(['check_out' => ['وقت الانصراف يجب أن يكون بعد وقت الحضور']]);
        }
        $row->date = $date;
        $row->syncMinutes();
    }

    private function assertOpenMonth(SettlementService $settlements, mixed $date): void
    {
        $period = Carbon::parse($date)->format('Y-m');
        if ($settlements->isClosed($period)) {
            throw ValidationException::withMessages(['date' => ['شهر '.$period.' مغلق: أعد فتحه من التسوية الشهرية أولاً']]);
        }
    }

    private function hm(?int $minutes): string
    {
        return $minutes === null ? '—' : intdiv($minutes, 60).' س '.($minutes % 60).' د';
    }
}
