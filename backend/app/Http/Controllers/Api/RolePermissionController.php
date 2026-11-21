<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RolePermission;
use App\Support\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** RolePermissionsManagement.tsx: the UI toggles per role/resource. */
class RolePermissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', RolePermission::class);

        $rows = RolePermission::query()
            ->when($request->query('role'), fn ($q, $role) => $q->where('role', $role))
            ->orderBy('role')
            ->orderBy('resource')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /** Upsert one toggle row (role + resource). */
    public function update(Request $request): JsonResponse
    {
        $this->authorize('create', RolePermission::class);

        $data = $request->validate([
            'role' => ['required', Rule::in(Role::ALL)],
            'resource' => ['required', 'string', 'max:100'],
            'can_create' => ['sometimes', 'boolean'],
            'can_update' => ['sometimes', 'boolean'],
            'can_delete' => ['sometimes', 'boolean'],
        ]);

        $row = RolePermission::updateOrCreate(
            ['role' => $data['role'], 'resource' => $data['resource']],
            collect($data)->only(['can_create', 'can_update', 'can_delete'])->all(),
        );

        return response()->json(['data' => $row]);
    }
}
