<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

/**
 * Writes readable activity-log rows (سجل النشاطات).
 *
 * Sentences start with the actor, e.g. "د. أحمد سجّل دفعة 50,000 ل.س للمريض محمد علي".
 * Use muted() around bulk work (Excel imports, login) and log one summary instead.
 */
final class Activity
{
    private static int $muted = 0;

    /** @param array{patient_id?: ?string, doctor_id?: ?string, properties?: ?array, is_money?: bool} $ctx */
    public static function log(string $event, string $subjectType, ?string $subjectId, string $sentence, array $ctx = []): void
    {
        if (self::$muted > 0) {
            return;
        }

        $user = Auth::user();

        ActivityLog::create([
            'user_id' => $user?->getKey(),
            'user_name' => $user ? self::actorName($user) : null,
            'event' => $event,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'patient_id' => $ctx['patient_id'] ?? null,
            'doctor_id' => $ctx['doctor_id'] ?? null,
            'description' => self::actor().' '.$sentence,
            'properties' => $ctx['properties'] ?? null,
            'is_money' => $ctx['is_money'] ?? false,
        ]);
    }

    /** Run $fn without logging each row. */
    public static function muted(callable $fn): mixed
    {
        self::$muted++;
        try {
            return $fn();
        } finally {
            self::$muted--;
        }
    }

    public static function actor(): string
    {
        $user = Auth::user();

        return $user ? self::actorName($user) : 'النظام';
    }

    public static function actorName(User $user): string
    {
        $name = $user->full_name ?: $user->email;

        return $user->role === Role::DOCTOR && ! str_starts_with($name, 'د.') ? 'د. '.$name : $name;
    }

    public static function doctorName(?string $name): string
    {
        if (! $name) {
            return 'طبيب غير معروف';
        }

        return str_starts_with($name, 'د.') ? $name : 'د. '.$name;
    }

    public static function money(float|string|null $amount, ?string $currency = 'SYP'): string
    {
        $amount = (float) $amount;
        $formatted = floor($amount) == $amount ? number_format($amount) : number_format($amount, 2);

        // "$" is a weak bidi character: isolate it with the number so it stays "50 $".
        return $currency === 'USD' ? "\u{2066}".$formatted." $\u{2069}" : $formatted.' ل.س';
    }

    /**
     * Clinic local date/time, e.g. 2026-11-21 14:30, wrapped in Unicode LTR
     * isolates (LRI…PDI): inside an Arabic sentence the bidi algorithm would
     * otherwise show the time before the date ("14:30 2026-11-21").
     */
    public static function when(mixed $date): string
    {
        return $date
            ? "\u{2066}".Carbon::parse($date)->timezone(config('clinic.timezone'))->format('Y-m-d H:i')."\u{2069}"
            : '-';
    }
}
