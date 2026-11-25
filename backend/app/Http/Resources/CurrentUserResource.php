<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Support\DoctorBooks;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Shape consumed by src/api/auth.ts (CurrentUser) and replaces what
 * src/hooks/useUserRole.ts used to assemble from three Supabase queries.
 *
 * @mixin User
 */
class CurrentUserResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        $books = DoctorBooks::for($this->resource);

        return [
            'id' => $this->id,
            'email' => $this->email,
            'full_name' => $this->full_name,
            'role' => $this->role,
            'doctor_id' => $books->currentDoctorId(),
            'has_own_books' => $books->isIndependentDoctor(),
            'is_independent_doctor' => $this->role === 'doctor' && $books->isIndependentDoctor(),
            // the doctor's specialties (UI: dental vs non-dental screens)
            'specialties' => $books->currentDoctorId()
                ? $this->resource->doctor->specialties()->get(['specialties.id', 'name_ar', 'is_dental'])
                    ->map(fn ($s) => ['id' => $s->id, 'name_ar' => $s->name_ar, 'is_dental' => (bool) $s->is_dental])->values()
                : [],
        ];
    }
}
