<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CurrentUserResource;
use App\Models\User;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/** Session (Sanctum SPA cookie) login for the React app. */
class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', mb_strtolower(trim($credentials['email'])))->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['البريد الإلكتروني أو كلمة المرور غير صحيحة'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['هذا الحساب موقوف. يرجى التواصل مع مدير النظام'],
            ]);
        }

        // Upgrade the hash cost transparently if needed (e.g. Supabase cost 10).
        if (Hash::needsRehash($user->password)) {
            $user->password = $credentials['password'];
        }
        $user->last_login_at = now();
        // A silent hash upgrade is not a "password change" in the activity log.
        Activity::muted(fn () => $user->save());

        Auth::guard('web')->login($user, remember: true);
        $request->session()->regenerate();

        return response()->json(['user' => new CurrentUserResource($user)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => new CurrentUserResource($request->user())]);
    }

    /** POST /auth/password {current_password, password, password_confirmation} — now checks the current password. */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password:web'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        Activity::muted(fn () => $request->user()->update(['password' => $data['password']]));
        Activity::log('updated', 'user', $request->user()->id, 'غيّر كلمة المرور الخاصة به');

        return response()->json(['ok' => true]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }
}
