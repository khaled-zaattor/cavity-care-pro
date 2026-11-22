<?php

namespace App\Import;

use App\Models\Specialty;
use App\Support\LegacyPassword;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Copies the Supabase database into the Laravel schema (plan §5 step 3).
 *
 *  - IDs never change (UUIDs are copied as-is).
 *  - Idempotent: rows are upserted by id, so it can be re-run any time.
 *    With $fresh = true the target clinic tables are emptied first, which is
 *    what the final cutover run uses (rows deleted in Supabase disappear too).
 *  - Runs in ONE transaction on the target: either everything is imported
 *    or nothing changes.
 *  - activity_logs are NOT imported: the clinic exported them to Excel and
 *    cleared them (decision 2026-11-21). The new activity log starts empty.
 *  - Rows whose parent is missing are skipped and reported, never guessed.
 *    import:verify then shows the difference.
 */
class SupabaseImporter
{
    private Connection $src;

    private Connection $dst;

    private string $dentalId;

    /** @var array<string, array<string, true>> imported ids per target table */
    private array $ids = [];

    /** @var array<string, array{patient_id: string, doctor_id: string, specialty_id: ?string}> */
    private array $appointments = [];

    /** @var array<string, string> treatment id => specialty id */
    private array $treatmentSpecialty = [];

    /** @var array<string, array{read: int, written: int, skipped: array<int, string>, note?: string}> */
    private array $report = [];

    /** Target tables, children first (used for --fresh). */
    private const TARGET_TABLES = [
        // Data created in Laravel itself (staging trial data must not survive the
        // final --fresh run). Configuration is kept: medicines, prescription
        // templates, clinic print settings, expense categories, percentage rules,
        // recurring charges. Uploaded files on disk are not deleted.
        'activity_logs', 'prescription_items', 'prescriptions', 'patient_files',
        'doctor_attendances', 'settlements', 'doctor_payouts', 'expenses',
        'waiting_list', 'unfinished_sub_treatments', 'appointment_treatment_steps',
        'treatment_plans', 'payments', 'treatment_records', 'appointments', 'sub_treatment_steps',
        'sub_treatments', 'treatments', 'patients', 'doctor_specialty', 'doctors', 'role_permissions',
        'sessions', 'users',
    ];

    private const ROLE_RANK = ['super_admin' => 4, 'doctor' => 3, 'dentist_assistant' => 2, 'receptionist' => 1];

    public function __construct(private ?Closure $log = null)
    {
        $this->src = DB::connection(config('import.source_connection'));
        $this->dst = DB::connection();
    }

    /** @return array<string, array{read: int, written: int, skipped: array<int, string>, note?: string}> */
    public function run(bool $fresh = false): array
    {
        $this->dst->transaction(function () use ($fresh) {
            if ($fresh) {
                $this->emptyTargetTables();
            }

            $this->dentalId = $this->defaultSpecialtyId();

            $this->importUsers();
            $this->importRolePermissions();
            $this->importDoctors();
            $this->importPatients();
            $this->importCatalog();
            $this->importAppointments();
            $this->importTreatmentRecords();
            $this->importPayments();
            $this->importPlansAndProgress();
            $this->importWaitingList();
        });

        return $this->report;
    }

    // ------------------------------------------------------------------
    // Tables
    // ------------------------------------------------------------------

    private function importUsers(): void
    {
        $table = config('import.users_table');
        $users = [];

        // A user may have several user_roles rows in theory: keep the highest.
        $this->src->table("$table as u")
            ->leftJoin('profiles as p', 'p.id', '=', 'u.id')
            ->leftJoin('user_roles as r', 'r.user_id', '=', 'u.id')
            ->select('u.id', 'u.email', 'u.encrypted_password', 'u.created_at', 'u.updated_at', 'u.last_sign_in_at', 'p.full_name', 'r.role')
            ->orderBy('u.id')
            ->each(function ($u) use (&$users) {
                $current = $users[$u->id] ?? null;
                if ($current && (self::ROLE_RANK[$current->role] ?? 0) >= (self::ROLE_RANK[$u->role] ?? 0)) {
                    return;
                }
                $users[$u->id] = $u;
            }, config('import.chunk'));

        $this->begin('users', count($users));
        $rows = [];
        foreach ($users as $u) {
            if (! $u->email) {
                $this->skip('users', $u->id, 'no email (phone-only login is not supported)');

                continue;
            }

            $password = $u->encrypted_password ? LegacyPassword::normalize($u->encrypted_password) : null;
            if (! $password) {
                $this->note('users', "no password for {$u->email}: set one from user admin");
                $password = Hash::make(Str::random(40));
            }

            $rows[] = [
                'id' => $u->id,
                'email' => mb_strtolower(trim($u->email)),
                'full_name' => $u->full_name,
                'role' => $u->role,
                'is_active' => true,
                'password' => $password,
                'last_login_at' => $this->ts($u->last_sign_in_at),
                'created_at' => $this->ts($u->created_at),
                'updated_at' => $this->ts($u->updated_at),
            ];
        }
        $this->write('users', $rows);
    }

    private function importRolePermissions(): void
    {
        $this->copy('role_permissions', 'role_permissions', fn ($r) => [
            'id' => $r->id,
            'role' => $r->role,
            'resource' => $r->resource,
            'can_create' => (bool) $r->can_create,
            'can_update' => (bool) $r->can_update,
            'can_delete' => (bool) $r->can_delete,
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);
    }

    private function importDoctors(): void
    {
        $this->copy('doctors', 'doctors', fn ($r) => [
            'id' => $r->id,
            'user_id' => $this->optional('doctors', $r, 'user_id', 'users'),
            'full_name' => $r->full_name,
            'email' => $r->email ?? null,
            'phone_number' => $r->phone_number ?? null,
            'legacy_specialty' => $r->specialty ?? null,
            'has_own_books' => (bool) ($r->has_own_books ?? false),
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);

        // Every current doctor is a dentist (decision 2026-11-20).
        $pivot = array_map(fn ($id) => [
            'doctor_id' => $id, 'specialty_id' => $this->dentalId, 'is_primary' => true,
        ], array_keys($this->ids['doctors'] ?? []));
        foreach (array_chunk($pivot, 500) as $chunk) {
            $this->dst->table('doctor_specialty')->insertOrIgnore($chunk);
        }
    }

    private function importPatients(): void
    {
        $this->copy('patients', 'patients', fn ($r) => [
            'id' => $r->id,
            'full_name' => $r->full_name,
            'date_of_birth' => $this->date($r->date_of_birth ?? null),
            'phone_number' => $r->phone_number ?? null,
            'address' => $r->address ?? null,
            'contact' => $r->contact ?? null,
            'job' => $r->job ?? null,
            'medical_notes' => $r->medical_notes ?? null,
            'accessed_by_user_id' => $this->optional('patients', $r, 'accessed_by_user_id', 'users'),
            'last_accessed_at' => $this->ts($r->last_accessed_at ?? null),
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);
    }

    private function importCatalog(): void
    {
        $this->copy('treatments', 'treatments', function ($r) {
            $doctorId = $r->doctor_id ?? null;
            if ($doctorId !== null && ! $this->has('doctors', $doctorId)) {
                return $this->skip('treatments', $r->id, "doctor $doctorId not found");
            }
            $this->treatmentSpecialty[$r->id] = $this->dentalId;

            return [
                'id' => $r->id,
                'name' => $r->name,
                'description' => $r->description ?? null,
                'doctor_id' => $doctorId,
                'specialty_id' => $this->dentalId,
                'created_at' => $this->ts($r->created_at),
                'updated_at' => $this->ts($r->updated_at),
            ];
        });

        $this->copy('sub_treatments', 'sub_treatments', fn ($r) => $this->requireParents('sub_treatments', $r, ['treatment_id' => 'treatments']) ?? [
            'id' => $r->id,
            'treatment_id' => $r->treatment_id,
            'name' => $r->name,
            'estimated_cost_syp' => $r->estimated_cost_syp ?? null,
            'estimated_cost_usd' => $r->estimated_cost_usd ?? null,
            'tooth_association' => $r->tooth_association ?? 'not_related',
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);

        $this->copy('sub_treatment_steps', 'sub_treatment_steps', fn ($r) => $this->requireParents('sub_treatment_steps', $r, ['sub_treatment_id' => 'sub_treatments']) ?? [
            'id' => $r->id,
            'sub_treatment_id' => $r->sub_treatment_id,
            'step_name' => $r->step_name,
            'step_description' => $r->step_description ?? null,
            'step_order' => $r->step_order,
            'completion_percentage' => $r->completion_percentage ?? null,
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);
    }

    private function importAppointments(): void
    {
        $this->copy('appointments', 'appointments', function ($r) {
            if (($skip = $this->requireParents('appointments', $r, ['patient_id' => 'patients', 'doctor_id' => 'doctors'])) !== null) {
                return $skip;
            }
            $this->appointments[$r->id] = [
                'patient_id' => $r->patient_id, 'doctor_id' => $r->doctor_id, 'specialty_id' => $this->dentalId,
            ];

            return [
                'id' => $r->id,
                'patient_id' => $r->patient_id,
                'doctor_id' => $r->doctor_id,
                'specialty_id' => $this->dentalId,
                'scheduled_at' => $this->ts($r->scheduled_at),
                'status' => $r->status,
                'notes' => $r->notes ?? null,
                'created_at' => $this->ts($r->created_at),
                'updated_at' => $this->ts($r->updated_at),
            ];
        });
    }

    private function importTreatmentRecords(): void
    {
        $this->copy('treatment_records', 'treatment_records', function ($r) {
            $skip = $this->requireParents('treatment_records', $r, [
                'appointment_id' => 'appointments', 'treatment_id' => 'treatments', 'sub_treatment_id' => 'sub_treatments',
            ]);
            if ($skip !== null) {
                return $skip;
            }
            $a = $this->appointments[$r->appointment_id];

            return [
                'id' => $r->id,
                'appointment_id' => $r->appointment_id,
                'patient_id' => $a['patient_id'],
                'doctor_id' => $a['doctor_id'],
                'specialty_id' => $this->treatmentSpecialty[$r->treatment_id] ?? $a['specialty_id'],
                'treatment_id' => $r->treatment_id,
                'sub_treatment_id' => $r->sub_treatment_id,
                'tooth_number' => $this->tooth($r->tooth_number ?? null),
                'actual_cost_syp' => $r->actual_cost_syp ?? null,
                'actual_cost_usd' => $r->actual_cost_usd ?? null,
                'is_completed' => (bool) ($r->is_completed ?? false),
                'performed_at' => $this->ts($r->performed_at ?? $r->created_at),
                'treatment_notes' => $r->treatment_notes ?? null,
                'created_at' => $this->ts($r->created_at),
                'updated_at' => $this->ts($r->updated_at),
            ];
        });
    }

    private function importPayments(): void
    {
        $this->copy('payments', 'payments', function ($r) {
            if (($skip = $this->requireParents('payments', $r, ['appointment_id' => 'appointments'])) !== null) {
                return $skip;
            }
            $a = $this->appointments[$r->appointment_id];

            return [
                'id' => $r->id,
                'appointment_id' => $r->appointment_id,
                'patient_id' => $a['patient_id'],
                'doctor_id' => $a['doctor_id'],
                'specialty_id' => $a['specialty_id'],
                'amount' => $r->amount,
                // The app has always treated a missing currency as SYP.
                'currency' => strtoupper((string) ($r->currency ?? '')) ?: 'SYP',
                'paid_at' => $this->ts($r->paid_at ?? $r->created_at),
                'created_at' => $this->ts($r->created_at),
                'updated_at' => $this->ts($r->updated_at),
            ];
        });
    }

    private function importPlansAndProgress(): void
    {
        $this->copy('treatment_plans', 'treatment_plans', fn ($r) => $this->requireParents('treatment_plans', $r, [
            'patient_id' => 'patients', 'treatment_id' => 'treatments', 'sub_treatment_id' => 'sub_treatments',
        ]) ?? [
            'id' => $r->id,
            'patient_id' => $r->patient_id,
            'treatment_id' => $r->treatment_id,
            'sub_treatment_id' => $r->sub_treatment_id,
            'tooth_number' => $this->tooth($r->tooth_number ?? null),
            'appointment_id' => $this->optional('treatment_plans', $r, 'appointment_id', 'appointments'),
            'is_executed' => (bool) ($r->is_executed ?? false),
            'executed_at' => $this->ts($r->executed_at ?? null),
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);

        $this->copy('appointment_treatment_steps', 'appointment_treatment_steps', fn ($r) => $this->requireParents('appointment_treatment_steps', $r, [
            'appointment_id' => 'appointments', 'sub_treatment_step_id' => 'sub_treatment_steps',
        ]) ?? [
            'id' => $r->id,
            'appointment_id' => $r->appointment_id,
            'sub_treatment_step_id' => $r->sub_treatment_step_id,
            'is_completed' => (bool) ($r->is_completed ?? false),
            'completed_at' => $this->ts($r->completed_at ?? null),
            'notes' => $r->notes ?? null,
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);

        $this->copy('unfinished_sub_treatments', 'unfinished_sub_treatments', fn ($r) => $this->requireParents('unfinished_sub_treatments', $r, [
            'patient_id' => 'patients', 'treatment_id' => 'treatments', 'sub_treatment_id' => 'sub_treatments',
        ]) ?? [
            'id' => $r->id,
            'patient_id' => $r->patient_id,
            'treatment_id' => $r->treatment_id,
            'sub_treatment_id' => $r->sub_treatment_id,
            'tooth_number' => $this->tooth($r->tooth_number ?? null),
            'last_appointment_id' => $this->optional('unfinished_sub_treatments', $r, 'last_appointment_id', 'appointments'),
            'is_marked_complete' => (bool) ($r->is_marked_complete ?? false),
            'notes' => $r->notes ?? null,
            'started_at' => $this->ts($r->started_at ?? null),
            'created_at' => $this->ts($r->created_at ?? null),
            'updated_at' => $this->ts($r->updated_at ?? null),
        ]);
    }

    private function importWaitingList(): void
    {
        $this->copy('waiting_list', 'waiting_list', fn ($r) => $this->requireParents('waiting_list', $r, ['patient_id' => 'patients']) ?? [
            'id' => $r->id,
            'patient_id' => $r->patient_id,
            'appointment_id' => $this->optional('waiting_list', $r, 'appointment_id', 'appointments'),
            'doctor_id' => $this->optional('waiting_list', $r, 'doctor_id', 'doctors'),
            'clinic_arrival_time' => $this->ts($r->clinic_arrival_time),
            'examination_room_entry_time' => $this->ts($r->examination_room_entry_time ?? null),
            'status' => $r->status,
            'created_at' => $this->ts($r->created_at),
            'updated_at' => $this->ts($r->updated_at),
        ]);
    }

    // ------------------------------------------------------------------
    // Plumbing
    // ------------------------------------------------------------------

    /** Read $srcTable in chunks, map each row (array to write, null to skip) and upsert. */
    private function copy(string $srcTable, string $dstTable, Closure $map): void
    {
        if (! $this->src->getSchemaBuilder()->hasTable($srcTable)) {
            $this->begin($dstTable, 0);
            $this->note($dstTable, "source table $srcTable does not exist, nothing imported");

            return;
        }

        $this->begin($dstTable, 0);
        // chunkById ("WHERE id > last LIMIT n") stays fast on big tables over the
        // network; OFFSET paging got slower with every page (81k activity logs).
        $this->src->table($srcTable)->chunkById(config('import.chunk'), function ($chunk) use ($dstTable, $map) {
            $this->report[$dstTable]['read'] += count($chunk);
            $rows = [];
            foreach ($chunk as $r) {
                $row = $map($r);
                if (is_array($row)) {
                    $rows[] = $row;
                }
            }
            $this->write($dstTable, $rows);
        });
    }

    private function write(string $table, array $rows): void
    {
        if ($rows === []) {
            return;
        }
        $update = array_values(array_diff(array_keys($rows[0]), ['id']));
        foreach (array_chunk($rows, 200) as $chunk) {
            $this->dst->table($table)->upsert($chunk, ['id'], $update);
        }
        foreach ($rows as $row) {
            $this->ids[$table][$row['id']] = true;
        }
        $this->report[$table]['written'] += count($rows);
    }

    /** Skip the row (returns false) if a required parent was not imported; null when all present. */
    private function requireParents(string $table, object $r, array $parents): ?bool
    {
        foreach ($parents as $column => $parentTable) {
            $id = $r->{$column} ?? null;
            if ($id === null || ! $this->has($parentTable, $id)) {
                return $this->skip($table, $r->id, "$column ".($id ?? 'NULL')." not found in $parentTable");
            }
        }

        return null;
    }

    /** Nullable reference: keep if the parent exists, otherwise NULL + note. */
    private function optional(string $table, object $r, string $column, string $parentTable): ?string
    {
        $id = $r->{$column} ?? null;
        if ($id === null) {
            return null;
        }
        if (! $this->has($parentTable, $id)) {
            $this->note($table, "{$r->id}: $column $id not found, set to NULL");

            return null;
        }

        return $id;
    }

    private function has(string $table, string $id): bool
    {
        return isset($this->ids[$table][$id]);
    }

    private function skip(string $table, string $id, string $reason): bool
    {
        $this->report[$table]['skipped'][] = "$id: $reason";
        $this->log("  skipped $table $id: $reason");

        return false;
    }

    private function note(string $table, string $message): void
    {
        $this->report[$table]['notes'][] = $message;
    }

    private function begin(string $table, int $read): void
    {
        $this->report[$table] ??= ['read' => $read, 'written' => 0, 'skipped' => [], 'notes' => []];
        $this->log("importing $table ...");
    }

    private function log(string $message): void
    {
        if ($this->log) {
            ($this->log)($message);
        }
    }

    private function emptyTargetTables(): void
    {
        $schema = $this->dst->getSchemaBuilder();
        $schema->disableForeignKeyConstraints();
        foreach (self::TARGET_TABLES as $table) {
            $this->dst->table($table)->delete();
        }
        $schema->enableForeignKeyConstraints();
        $this->log('emptied target tables (--fresh)');
    }

    private function defaultSpecialtyId(): string
    {
        $code = config('import.default_specialty_code');
        $specialty = Specialty::where('code', $code)->first();
        if (! $specialty) {
            throw new RuntimeException("Specialty '$code' missing: run php artisan db:seed first.");
        }

        return $specialty->id;
    }

    /** Postgres timestamptz -> UTC 'Y-m-d H:i:s' (the app runs in UTC). */
    private function ts(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return CarbonImmutable::parse($value)->utc()->format('Y-m-d H:i:s');
    }

    private function date(mixed $value): ?string
    {
        return $value ? CarbonImmutable::parse($value)->format('Y-m-d') : null;
    }

    /** Non-dental records were saved with "" (empty tooth list). */
    private function tooth(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }
}
