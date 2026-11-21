<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClinicSetting;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** Printed header: clinic name, address, phone, footer text and logo. */
class ClinicSettingController extends Controller
{
    public function show(): JsonResponse
    {
        $this->authorize('viewAny', ClinicSetting::class);
        $s = ClinicSetting::all_values();
        $s['has_logo'] = ! empty($s['logo_path']);
        unset($s['logo_path']);

        return response()->json(['data' => $s]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorize('create', ClinicSetting::class);
        $data = $request->validate([
            'clinic_name' => ['nullable', 'string', 'max:255'],
            'clinic_name_en' => ['nullable', 'string', 'max:255'],
            'clinic_address' => ['nullable', 'string', 'max:500'],
            'clinic_phone' => ['nullable', 'string', 'max:100'],
            'prescription_footer' => ['nullable', 'string', 'max:500'],
        ]);
        foreach ($data as $key => $value) {
            ClinicSetting::put($key, $value);
        }
        Activity::log('updated', 'settings', null, 'عدّل بيانات العيادة المطبوعة على الوصفات');

        return $this->show();
    }

    /** POST /clinic-settings/logo (multipart "logo": png/jpg/webp ≤ 2 MB) */
    public function uploadLogo(Request $request): JsonResponse
    {
        $this->authorize('create', ClinicSetting::class);
        $request->validate(['logo' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048']]);

        $old = ClinicSetting::query()->whereKey('logo_path')->value('value');
        $path = $request->file('logo')->store('clinic', 'local'); // storage/app/private/clinic
        ClinicSetting::put('logo_path', $path);
        if ($old && $old !== $path) {
            Storage::disk('local')->delete($old);
        }
        Activity::log('updated', 'settings', null, 'غيّر شعار العيادة');

        return $this->show();
    }

    public function deleteLogo(): JsonResponse
    {
        $this->authorize('create', ClinicSetting::class);
        $old = ClinicSetting::query()->whereKey('logo_path')->value('value');
        if ($old) {
            Storage::disk('local')->delete($old);
        }
        ClinicSetting::put('logo_path', null);

        return $this->show();
    }

    /** GET /clinic-settings/logo — served through Laravel (files stay outside public_html). */
    public function logo(): Response
    {
        $this->authorize('viewAny', ClinicSetting::class);
        $path = ClinicSetting::query()->whereKey('logo_path')->value('value');
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, ['Cache-Control' => 'private, max-age=3600']);
    }
}
