<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentTreatmentStep;
use App\Models\Payment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\UnfinishedSubTreatment;
use App\Models\WaitingListEntry;
use App\Support\Activity;
use Illuminate\Support\Facades\DB;

/**
 * Deleting appointments (single and bulk) in one transaction, with the same
 * rules for both (the old screens differed):
 *  - its steps, treatment records and payments are deleted (as before)
 *  - unfinished trackers whose last session was this appointment are deleted
 *  - a treatment plan executed in it goes back to "not executed"
 *    (before: bulk delete removed the plan entirely, single delete left it
 *    marked executed with no record behind it)
 *  - waiting-room rows stay, only unlinked
 */
class AppointmentDeletion
{
    /** @param string[] $ids */
    public function delete(array $ids): int
    {
        if ($ids === []) {
            return 0;
        }

        return DB::transaction(function () use ($ids) {
            $this->logDeletion($ids);

            foreach (array_chunk($ids, 500) as $chunk) {
                AppointmentTreatmentStep::whereIn('appointment_id', $chunk)->delete();
                TreatmentRecord::withTrashed()->whereIn('appointment_id', $chunk)->forceDelete();
                Payment::withTrashed()->whereIn('appointment_id', $chunk)->forceDelete();
                UnfinishedSubTreatment::whereIn('last_appointment_id', $chunk)->delete();
                TreatmentPlan::whereIn('appointment_id', $chunk)
                    ->update(['is_executed' => false, 'executed_at' => null, 'appointment_id' => null]);
                WaitingListEntry::whereIn('appointment_id', $chunk)->update(['appointment_id' => null]);
            }

            return Appointment::whereIn('id', $ids)->delete();
        });
    }

    /**
     * These are query-builder deletes (no model events), so write the
     * activity lines here: one per appointment, naming the money that goes with it.
     */
    private function logDeletion(array $ids): void
    {
        foreach (array_chunk($ids, 500) as $chunk) {
            $appointments = Appointment::with(['patient' => fn ($q) => $q->withTrashed()->select('id', 'full_name'), 'doctor' => fn ($q) => $q->withTrashed()->select('id', 'full_name')])
                ->whereIn('id', $chunk)->get();
            $payments = Payment::whereIn('appointment_id', $chunk)->get()->groupBy('appointment_id');
            $records = TreatmentRecord::whereIn('appointment_id', $chunk)->get()->groupBy('appointment_id');

            foreach ($appointments as $a) {
                $sentence = 'حذف موعد المريض '.($a->patient?->full_name ?? 'غير معروف').' عند '
                    .Activity::doctorName($a->doctor?->full_name).' بتاريخ '.Activity::when($a->scheduled_at);

                $extra = [];
                $aPayments = $payments->get($a->id, collect());
                if ($aPayments->isNotEmpty()) {
                    $totals = $aPayments->groupBy('currency')
                        ->map(fn ($p, $cur) => Activity::money($p->sum('amount'), $cur))->implode(' + ');
                    $extra[] = $aPayments->count().' دفعة بمجموع '.$totals;
                }
                if (($n = $records->get($a->id, collect())->count()) > 0) {
                    $extra[] = $n.' علاج';
                }
                if ($extra) {
                    $sentence .= '، وحُذف معه '.implode(' و', $extra);
                }

                Activity::log('deleted', 'appointment', $a->id, $sentence, [
                    'patient_id' => $a->patient_id,
                    'doctor_id' => $a->doctor_id,
                    'is_money' => $aPayments->isNotEmpty(),
                ]);
            }
        }
    }
}
