<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * User administration (super_admin). Replaces AdminUserManagement's direct
 * Supabase queries and the admin-reset-password edge function.
 */
class UserAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', User::class);

        $users = User::query()
            ->with('doctor:id,user_id,full_name,has_own_books')
            // Doctors.tsx lists logins with the doctor role to link a doctor row.
            ->when($request->query('role'), fn ($q, $role) => $q->where('role', $role))
            ->orderBy('full_name')
            ->get(['id', 'email', 'full_name', 'role', 'is_active', 'last_login_at', 'created_at']);

        return response()->json(['data' => $users]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'full_name' => ['required', 'string', 'max:255'],
            'role' => ['required', Rule::in(Role::ALL)],
            'password' => ['required', Password::min(8)],
        ]);
        $data['email'] = mb_strtolower(trim($data['email']));

        $user = User::create($data);

        return response()->json(['data' => $user->only(['id', 'email', 'full_name', 'role', 'is_active'])], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);

        $data = $request->validate([
            'full_name' => ['sometimes', 'string', 'max:255'],
            'role' => ['sometimes', 'nullable', Rule::in(Role::ALL)],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        // Never lock the clinic out: keep at least one active super_admin.
        $losesAdmin = $user->isSuperAdmin()
            && ((array_key_exists('role', $data) && $data['role'] !== Role::SUPER_ADMIN)
                || (array_key_exists('is_active', $data) && ! $data['is_active']));
        if ($losesAdmin && User::where('role', Role::SUPER_ADMIN)->where('is_active', true)->count() <= 1) {
            return response()->json(['message' => 'لا يمكن إزالة آخر مدير للنظام'], 422);
        }

        $user->update($data);

        return response()->json(['data' => $user->only(['id', 'email', 'full_name', 'role', 'is_active'])]);
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $this->authorize('resetPassword', $user);

        $data = $request->validate(['password' => ['required', Password::min(8)]]);

        $user->password = $data['password'];
        $user->save();

        // Sign the user out everywhere.
        DB::table('sessions')->where('user_id', $user->id)->delete();

        return response()->json(['ok' => true]);
    }
}
