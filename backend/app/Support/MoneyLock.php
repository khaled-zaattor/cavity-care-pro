<?php

namespace App\Support;

use App\Models\User;
use App\Services\SettlementService;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Plan §3.6: old money is not edited casually.
 *  - in a CLOSED settlement month: nobody edits (reopen the month first)
 *  - older than config('clinic.finance.lock_after_days'): super_admin only
 */
final class MoneyLock
{
    public static function assertEditable(mixed $date, User $user, string $field = 'amount'): void
    {
        if ($date === null) {
            return;
        }
        $when = Carbon::parse($date);
        $period = SettlementService::periodOf($when);

        if (app(SettlementService::class)->isClosed($period)) {
            throw ValidationException::withMessages([$field => ['شهر '.$period.' مغلق في التسوية الشهرية: لا يمكن تعديل مبالغه إلا بعد إعادة فتحه']]);
        }

        $days = (int) config('clinic.finance.lock_after_days');
        if ($days > 0 && ! $user->isSuperAdmin() && $when->lt(now()->subDays($days))) {
            throw ValidationException::withMessages([$field => ["مضى أكثر من $days أيام على هذا المبلغ: التعديل للمدير فقط"]]);
        }
    }
}
