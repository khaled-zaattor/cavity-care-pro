<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** ActivityLogs.tsx (سجل النشاطات). */
class ActivityLogController extends Controller
{
    /**
     * GET /activity-logs?user_id=&patient_id=&subject_type=&event=&from=&to=&search=&important=1&page=&per_page=
     * from/to are ISO datetimes (the browser sends its local day boundaries).
     * important=1 → money changes and deletions only.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ActivityLog::class);
        $perPage = min(max((int) $request->query('per_page', 50), 1), 200);

        $query = ActivityLog::query()
            ->visibleTo($request->user())
            ->when($request->query('user_id'), fn (Builder $q, $id) => $q->where('user_id', $id))
            ->when($request->query('patient_id'), fn (Builder $q, $id) => $q->where('patient_id', $id))
            ->when($request->query('subject_type'), fn (Builder $q, $t) => $q->where('subject_type', $t))
            ->when($request->query('event'), fn (Builder $q, $e) => $q->where('event', $e))
            ->when($request->query('from'), fn (Builder $q, $d) => $q->where('created_at', '>=', Carbon::parse($d)->utc()))
            ->when($request->query('to'), fn (Builder $q, $d) => $q->where('created_at', '<=', Carbon::parse($d)->utc()))
            ->when($request->query('search'), fn (Builder $q, $s) => $q->where('description', 'like', '%'.$s.'%'))
            ->when($request->boolean('important'), fn (Builder $q) => $q->where(fn ($w) => $w->where('is_money', true)->orWhere('event', 'deleted')))
            ->orderByDesc('created_at');

        return response()->json($query->paginate($perPage));
    }

    /** GET /activity-logs/users — people who appear in the log, for the filter dropdown. */
    public function users(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ActivityLog::class);

        $users = ActivityLog::query()->visibleTo($request->user())
            ->whereNotNull('user_id')
            ->select('user_id', 'user_name')->distinct()->orderBy('user_name')->get()
            ->unique('user_id')->values()
            ->map(fn ($r) => ['id' => $r->user_id, 'name' => $r->user_name]);

        return response()->json(['data' => $users]);
    }
}
