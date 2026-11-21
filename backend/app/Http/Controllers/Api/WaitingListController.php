<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\WaitingListEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * WaitingListManagement.tsx + WaitingListDisplay.tsx (shared waiting room).
 * No websockets on shared hosting: the screens poll GET /waiting-list
 * every few seconds; ?since= lets them skip unchanged responses cheaply.
 */
class WaitingListController extends Controller
{
    private const WITH = ['patient:id,full_name,phone_number', 'doctor:id,full_name', 'appointment:id,scheduled_at'];

    /** GET /waiting-list?active=1  (active = waiting + in_examination, for the TV display) */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', WaitingListEntry::class);

        $rows = WaitingListEntry::query()->with(self::WITH)
            ->when($request->boolean('active'), fn ($q) => $q->whereIn('status', ['waiting', 'in_examination']))
            ->orderBy('clinic_arrival_time')
            ->get();

        return response()->json([
            'data' => $rows,
            // cheap change marker for polling
            'version' => md5($rows->max('updated_at').'|'.$rows->count()),
        ]);
    }

    /**
     * POST /waiting-list {patient_id, doctor_id?}
     * Links the patient's first appointment today; doctor defaults to that
     * appointment's doctor ("auto").
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', WaitingListEntry::class);
        $data = $request->validate([
            'patient_id' => ['required', 'uuid', 'exists:patients,id'],
            'doctor_id' => ['nullable', 'uuid', 'exists:doctors,id'],
        ]);

        $start = now(config('clinic.timezone'))->startOfDay()->utc();
        $appointment = Appointment::where('patient_id', $data['patient_id'])
            ->whereBetween('scheduled_at', [$start, $start->copy()->addDay()])
            ->orderBy('scheduled_at')->first();

        $entry = WaitingListEntry::create([
            'patient_id' => $data['patient_id'],
            'appointment_id' => $appointment?->id,
            'doctor_id' => $data['doctor_id'] ?? $appointment?->doctor_id,
            'clinic_arrival_time' => now(),
            'status' => 'waiting',
        ]);

        return response()->json(['data' => $entry->load(self::WITH)], 201);
    }

    /**
     * PATCH /waiting-list/{id}
     *  {action: "enter_exam"} | {action: "complete"} | {clinic_arrival_time, examination_room_entry_time?}
     */
    public function update(Request $request, WaitingListEntry $entry): JsonResponse
    {
        $this->authorize('update', $entry);
        $data = $request->validate([
            'action' => ['nullable', Rule::in(['enter_exam', 'complete'])],
            'clinic_arrival_time' => ['nullable', 'date'],
            'examination_room_entry_time' => ['nullable', 'date'],
            'doctor_id' => ['nullable', 'uuid', 'exists:doctors,id'],
        ]);

        match ($data['action'] ?? null) {
            'enter_exam' => $entry->fill(['status' => 'in_examination', 'examination_room_entry_time' => now()]),
            'complete' => $entry->fill(['status' => 'completed']),
            default => null,
        };
        foreach (['clinic_arrival_time', 'examination_room_entry_time'] as $k) {
            if (! empty($data[$k])) {
                $entry->{$k} = Carbon::parse($data[$k])->utc();
            }
        }
        if (array_key_exists('doctor_id', $data)) {
            $entry->doctor_id = $data['doctor_id'];
        }
        $entry->save();

        return response()->json(['data' => $entry->load(self::WITH)]);
    }

    /** POST /waiting-list/complete-in-exam — finish everyone in the exam room. */
    public function completeInExam(): JsonResponse
    {
        $this->authorize('create', WaitingListEntry::class);
        $n = WaitingListEntry::where('status', 'in_examination')->update(['status' => 'completed', 'updated_at' => now()]);

        return response()->json(['updated' => $n]);
    }

    public function destroy(WaitingListEntry $entry): JsonResponse
    {
        $this->authorize('delete', $entry);
        $entry->delete();

        return response()->json(null, 204);
    }

    /**
     * POST /waiting-list/clear-completed {ids?: [...]} (after the screen exported them to Excel).
     * With ids: only those (still completed) rows, so a visit finished after the
     * export is not lost.
     */
    public function clearCompleted(Request $request): JsonResponse
    {
        $this->authorize('delete', new WaitingListEntry);
        $ids = $request->validate(['ids' => ['sometimes', 'array'], 'ids.*' => ['uuid']])['ids'] ?? null;
        $n = WaitingListEntry::where('status', 'completed')
            ->when($ids !== null, fn ($q) => $q->whereIn('id', $ids))
            ->delete();

        return response()->json(['deleted' => $n]);
    }
}
