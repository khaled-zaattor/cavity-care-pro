<?php

namespace App\Observers;

use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\SubTreatment;
use App\Models\Treatment;
use App\Models\TreatmentPlan;
use App\Models\TreatmentRecord;
use App\Models\User;
use App\Support\Activity;
use App\Support\Role;
use Illuminate\Database\Eloquent\Model;

/**
 * Turns model events into readable سجل النشاطات sentences.
 * Registered in AppServiceProvider for the models below. Bulk query-builder
 * writes (appointment deletion) are logged by their service instead.
 */
class ActivityObserver
{
    private const STATUS = ['Scheduled' => 'مجدول', 'Completed' => 'مكتمل', 'Cancelled' => 'ملغى'];

    private const ROLES = [
        Role::SUPER_ADMIN => 'مدير النظام',
        Role::DOCTOR => 'طبيب',
        Role::ASSISTANT => 'مساعد طبيب',
        Role::RECEPTIONIST => 'موظف استقبال',
    ];

    private const PATIENT_FIELDS = [
        'full_name' => 'الاسم', 'date_of_birth' => 'تاريخ الميلاد', 'phone_number' => 'الهاتف',
        'address' => 'العنوان', 'contact' => 'جهة الاتصال', 'job' => 'المهنة', 'medical_notes' => 'الملاحظات الطبية',
    ];

    public function created(Model $model): void
    {
        match (true) {
            $model instanceof Appointment => $this->log('created', $model,
                'حجز موعداً للمريض '.$this->patient($model->patient_id).' عند '.$this->doctor($model->doctor_id)
                .' بتاريخ '.Activity::when($model->scheduled_at)),
            $model instanceof Payment => $this->log('created', $model,
                'سجّل دفعة '.Activity::money($model->amount, $model->currency).' للمريض '.$this->patient($model->patient_id)
                .' ('.$this->doctor($model->doctor_id).')', money: true),
            $model instanceof TreatmentRecord => $this->log('created', $model,
                'سجّل علاج '.$this->treatmentLabel($model).' للمريض '.$this->patient($model->patient_id)
                .' ('.$this->doctor($model->doctor_id).')'.$this->costText($model), money: $this->hasCost($model)),
            $model instanceof TreatmentPlan => $this->log('created', $model,
                'أضاف خطة علاج '.$this->treatmentLabel($model).' للمريض '.$this->patient($model->patient_id)),
            $model instanceof Patient => $this->log('created', $model, 'أضاف المريض '.$model->full_name),
            $model instanceof Doctor => $this->log('created', $model, 'أضاف الطبيب '.Activity::doctorName($model->full_name)),
            $model instanceof User => $this->log('created', $model,
                'أنشأ المستخدم '.($model->full_name ?: $model->email).' بدور '.(self::ROLES[$model->role] ?? 'بدون دور')),
            default => null,
        };
    }

    public function updated(Model $model): void
    {
        match (true) {
            $model instanceof Appointment => $this->appointmentUpdated($model),
            $model instanceof Payment => $model->wasChanged('amount') && $this->log('updated', $model,
                'عدّل دفعة المريض '.$this->patient($model->patient_id).' من '
                .Activity::money($model->getOriginal('amount'), $model->currency).' إلى '.Activity::money($model->amount, $model->currency),
                money: true, props: $this->diff($model, ['amount'])),
            $model instanceof TreatmentRecord => $this->recordUpdated($model),
            $model instanceof Patient => $this->patientUpdated($model),
            $model instanceof Doctor => $this->doctorUpdated($model),
            $model instanceof User => $this->userUpdated($model),
            default => null,
        };
    }

    public function deleted(Model $model): void
    {
        match (true) {
            $model instanceof Payment => $this->log('deleted', $model,
                'حذف دفعة '.Activity::money($model->amount, $model->currency).' للمريض '.$this->patient($model->patient_id)
                .' ('.$this->doctor($model->doctor_id).')', money: true),
            $model instanceof TreatmentRecord => $this->log('deleted', $model,
                'حذف علاج '.$this->treatmentLabel($model).' للمريض '.$this->patient($model->patient_id)
                .' من موعد '.Activity::when($model->performed_at).$this->costText($model), money: $this->hasCost($model)),
            $model instanceof TreatmentPlan => $this->log('deleted', $model,
                'حذف خطة علاج '.$this->treatmentLabel($model).' للمريض '.$this->patient($model->patient_id)),
            $model instanceof Patient => $this->log('deleted', $model, 'حذف المريض '.$model->full_name),
            $model instanceof Doctor => $this->log('deleted', $model, 'حذف الطبيب '.Activity::doctorName($model->full_name)),
            default => null,
        };
    }

    // ---- per-model update sentences ---------------------------------------

    private function appointmentUpdated(Appointment $a): void
    {
        $parts = [];
        if ($a->wasChanged('status')) {
            $parts[] = match ($a->status) {
                'Completed' => 'أنهى',
                'Cancelled' => 'ألغى',
                default => 'أعاد إلى "مجدول"',
            };
        }
        $changes = [];
        if ($a->wasChanged('scheduled_at')) {
            $changes[] = 'الوقت من '.Activity::when($a->getOriginal('scheduled_at')).' إلى '.Activity::when($a->scheduled_at);
        }
        if ($a->wasChanged('doctor_id')) {
            $changes[] = 'الطبيب من '.$this->doctor($a->getOriginal('doctor_id')).' إلى '.$this->doctor($a->doctor_id);
        }
        if ($parts === [] && $changes === []) {
            return; // notes / specialty only: not worth a log line
        }

        $sentence = ($parts[0] ?? 'عدّل').' موعد المريض '.$this->patient($a->patient_id)
            .' عند '.$this->doctor($a->doctor_id).' بتاريخ '.Activity::when($a->scheduled_at);
        if ($changes) {
            $sentence .= ' (غيّر '.implode('، ', $changes).')';
        }

        $this->log('updated', $a, $sentence, props: $this->diff($a, ['status', 'scheduled_at', 'doctor_id']));
    }

    private function recordUpdated(TreatmentRecord $r): void
    {
        $label = 'علاج '.$this->treatmentLabel($r).' للمريض '.$this->patient($r->patient_id);
        $bits = [];
        foreach (['actual_cost_syp' => 'SYP', 'actual_cost_usd' => 'USD'] as $field => $cur) {
            if ($r->wasChanged($field) && (float) $r->getOriginal($field) !== (float) $r->$field) {
                $bits[] = 'الكلفة من '.Activity::money($r->getOriginal($field), $cur).' إلى '.Activity::money($r->$field, $cur);
            }
        }
        $money = $bits !== [];
        if ($r->wasChanged('is_completed')) {
            $bits[] = $r->is_completed ? 'علّمه كمكتمل' : 'أعاده إلى غير مكتمل';
        }
        if ($r->wasChanged('treatment_notes')) {
            $bits[] = 'عدّل الملاحظات';
        }
        if ($bits === []) {
            return;
        }

        $this->log('updated', $r, 'عدّل '.$label.': '.implode('، ', $bits), money: $money,
            props: $this->diff($r, ['actual_cost_syp', 'actual_cost_usd', 'is_completed', 'treatment_notes']));
    }

    private function patientUpdated(Patient $p): void
    {
        $changed = array_values(array_intersect_key(self::PATIENT_FIELDS, $p->getChanges()));
        if ($changed === []) {
            return; // last_accessed_at etc.
        }

        $name = $p->wasChanged('full_name') ? $p->getOriginal('full_name').' ← '.$p->full_name : $p->full_name;
        $this->log('updated', $p, 'عدّل بيانات المريض '.$name.' ('.implode('، ', $changed).')',
            props: $this->diff($p, array_keys(self::PATIENT_FIELDS)));
    }

    private function doctorUpdated(Doctor $d): void
    {
        $bits = [];
        if ($d->wasChanged('full_name')) {
            $bits[] = 'الاسم';
        }
        if ($d->wasChanged('has_own_books')) {
            $bits[] = $d->has_own_books ? 'جعله طبيباً مستقلاً بحساباته' : 'ألغى استقلالية حساباته';
        }
        if ($d->wasChanged(['email', 'phone_number'])) {
            $bits[] = 'بيانات الاتصال';
        }
        if ($bits === []) {
            return;
        }

        $this->log('updated', $d, 'عدّل الطبيب '.Activity::doctorName($d->full_name).' ('.implode('، ', $bits).')',
            props: $this->diff($d, ['full_name', 'has_own_books', 'email', 'phone_number']));
    }

    private function userUpdated(User $u): void
    {
        $name = $u->full_name ?: $u->email;
        $bits = [];
        if ($u->wasChanged('role')) {
            $bits[] = 'الدور من '.(self::ROLES[$u->getOriginal('role')] ?? 'بدون دور').' إلى '.(self::ROLES[$u->role] ?? 'بدون دور');
        }
        if ($u->wasChanged('is_active')) {
            $bits[] = $u->is_active ? 'فعّل الحساب' : 'أوقف الحساب';
        }
        if ($u->wasChanged('full_name')) {
            $bits[] = 'الاسم';
        }
        if ($u->wasChanged('password')) {
            $bits[] = 'غيّر كلمة المرور';
        }
        if ($bits === []) {
            return; // last_login_at, remember_token
        }

        $this->log('updated', $u, 'عدّل المستخدم '.$name.' ('.implode('، ', $bits).')',
            props: $this->diff($u, ['role', 'is_active', 'full_name']));
    }

    // ---- helpers -----------------------------------------------------------

    private function log(string $event, Model $model, string $sentence, bool $money = false, ?array $props = null): void
    {
        Activity::log($event, $this->type($model), $model->getKey(), $sentence, [
            'patient_id' => $model instanceof Patient ? $model->getKey() : ($model->patient_id ?? null),
            'doctor_id' => $model instanceof Doctor ? $model->getKey() : ($model->doctor_id ?? null),
            'is_money' => $money,
            'properties' => $props,
        ]);
    }

    private function type(Model $model): string
    {
        return match (true) {
            $model instanceof Appointment => 'appointment',
            $model instanceof Payment => 'payment',
            $model instanceof TreatmentRecord => 'treatment_record',
            $model instanceof TreatmentPlan => 'treatment_plan',
            $model instanceof Patient => 'patient',
            $model instanceof Doctor => 'doctor',
            $model instanceof User => 'user',
        };
    }

    /** @return array{old: array, new: array} */
    private function diff(Model $model, array $fields): array
    {
        $old = $new = [];
        foreach ($fields as $f) {
            if ($model->wasChanged($f)) {
                $old[$f] = $model->getOriginal($f) instanceof \DateTimeInterface ? Activity::when($model->getOriginal($f)) : $model->getOriginal($f);
                $new[$f] = $model->$f instanceof \DateTimeInterface ? Activity::when($model->$f) : $model->$f;
            }
        }

        return ['old' => $old, 'new' => $new];
    }

    private function patient(?string $id): string
    {
        return $id ? (Patient::withTrashed()->whereKey($id)->value('full_name') ?? 'غير معروف') : 'غير معروف';
    }

    private function doctor(?string $id): string
    {
        return Activity::doctorName($id ? Doctor::withTrashed()->whereKey($id)->value('full_name') : null);
    }

    private function treatmentLabel(Model $m): string
    {
        $t = Treatment::withTrashed()->whereKey($m->treatment_id)->value('name');
        $s = SubTreatment::whereKey($m->sub_treatment_id)->value('name');
        $label = trim(($t ?? '').($s && $s !== $t ? ' - '.$s : ''), ' -') ?: 'غير معروف';

        return '«'.$label.'»'.($m->tooth_number ? ' (السن '.$m->tooth_number.')' : '');
    }

    private function hasCost(TreatmentRecord $r): bool
    {
        return (float) $r->actual_cost_syp > 0 || (float) $r->actual_cost_usd > 0;
    }

    private function costText(TreatmentRecord $r): string
    {
        $costs = [];
        if ((float) $r->actual_cost_syp > 0) {
            $costs[] = Activity::money($r->actual_cost_syp, 'SYP');
        }
        if ((float) $r->actual_cost_usd > 0) {
            $costs[] = Activity::money($r->actual_cost_usd, 'USD');
        }

        return $costs ? ' بكلفة '.implode(' + ', $costs) : '';
    }
}
