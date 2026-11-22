<?php

namespace Tests\Feature;

use App\Import\SupabaseImporter;
use App\Import\SupabaseVerifier;
use App\Models\DoctorAttendance;
use App\Models\Medicine;
use App\Models\Payment;
use App\Models\Prescription;
use App\Models\TreatmentRecord;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\Connection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Runs the importer against a fake Supabase database (SQLite, same table
 * and column names as the live Supabase project).
 */
class SupabaseImportTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN = '00000000-0000-0000-0000-00000000000a';

    private const KIDS_USER = '00000000-0000-0000-0000-00000000000b';

    private const NO_EMAIL = '00000000-0000-0000-0000-00000000000c';

    private const DENTIST = '10000000-0000-0000-0000-000000000001';

    private const KIDS_DOC = '10000000-0000-0000-0000-000000000002';

    private const PATIENT = '20000000-0000-0000-0000-000000000001';

    private const T_CLINIC = '30000000-0000-0000-0000-000000000001';

    private const T_KIDS = '30000000-0000-0000-0000-000000000002';

    private const S_FILL = '31000000-0000-0000-0000-000000000001';

    private const S_EXAM = '31000000-0000-0000-0000-000000000002';

    private const STEP = '32000000-0000-0000-0000-000000000001';

    private const A1 = '40000000-0000-0000-0000-000000000001';

    private const A2 = '40000000-0000-0000-0000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        config([
            'database.connections.legacy' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false],
            'import.source_connection' => 'legacy',
            'import.users_table' => 'auth_users',
        ]);
        DB::purge('legacy');
        $this->buildLegacySchema();
        $this->seedLegacyData();
    }

    private function src(): Connection
    {
        return DB::connection('legacy');
    }

    private function buildLegacySchema(): void
    {
        $s = Schema::connection('legacy');
        $ts = function (Blueprint $t) {
            $t->string('created_at')->nullable();
            $t->string('updated_at')->nullable();
        };

        $s->create('auth_users', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('email')->nullable();
            $t->string('encrypted_password')->nullable();
            $t->string('last_sign_in_at')->nullable();
            $ts($t);
        });
        $s->create('profiles', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('email')->nullable();
            $t->string('full_name')->nullable();
            $ts($t);
        });
        $s->create('user_roles', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('user_id');
            $t->string('role');
            $ts($t);
        });
        $s->create('role_permissions', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('role');
            $t->string('resource');
            $t->boolean('can_create');
            $t->boolean('can_update');
            $t->boolean('can_delete');
            $ts($t);
        });
        $s->create('doctors', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('full_name');
            $t->string('email');
            $t->string('phone_number');
            $t->string('specialty');
            $t->string('user_id')->nullable();
            $t->boolean('has_own_books')->default(false);
            $ts($t);
        });
        $s->create('patients', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('full_name');
            $t->string('date_of_birth');
            $t->string('phone_number');
            $t->string('address')->nullable();
            $t->string('medical_notes')->nullable();
            $ts($t);
        });
        $s->create('treatments', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('name');
            $t->string('description')->nullable();
            $t->string('doctor_id')->nullable();
            $ts($t);
        });
        $s->create('sub_treatments', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('treatment_id');
            $t->string('name');
            $t->decimal('estimated_cost_syp', 14, 2)->nullable();
            $t->decimal('estimated_cost_usd', 14, 2)->nullable();
            $t->string('tooth_association');
            $ts($t);
        });
        $s->create('sub_treatment_steps', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('sub_treatment_id');
            $t->string('step_name');
            $t->integer('step_order');
            $ts($t);
        });
        $s->create('appointments', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('patient_id');
            $t->string('doctor_id');
            $t->string('scheduled_at');
            $t->string('status');
            $t->string('notes')->nullable();
            $ts($t);
        });
        $s->create('treatment_records', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('appointment_id');
            $t->string('treatment_id');
            $t->string('sub_treatment_id');
            $t->string('tooth_number');
            $t->decimal('actual_cost_syp', 14, 2)->nullable();
            $t->decimal('actual_cost_usd', 14, 2)->nullable();
            $t->boolean('is_completed')->nullable();
            $t->string('performed_at');
            $t->string('treatment_notes')->nullable();
            $ts($t);
        });
        $s->create('payments', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('appointment_id');
            $t->decimal('amount', 14, 2);
            $t->string('currency')->nullable();
            $t->string('paid_at');
            $ts($t);
        });
        $s->create('treatment_plans', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('patient_id');
            $t->string('treatment_id');
            $t->string('sub_treatment_id');
            $t->string('tooth_number');
            $t->string('appointment_id')->nullable();
            $t->boolean('is_executed')->nullable();
            $t->string('executed_at')->nullable();
            $ts($t);
        });
        $s->create('appointment_treatment_steps', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('appointment_id');
            $t->string('sub_treatment_step_id');
            $t->boolean('is_completed')->nullable();
            $t->string('completed_at')->nullable();
            $t->string('notes')->nullable();
            $ts($t);
        });
        $s->create('unfinished_sub_treatments', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('patient_id');
            $t->string('treatment_id');
            $t->string('sub_treatment_id');
            $t->string('tooth_number');
            $t->string('last_appointment_id')->nullable();
            $t->boolean('is_marked_complete')->nullable();
            $t->string('started_at')->nullable();
            $ts($t);
        });
        $s->create('waiting_list', function (Blueprint $t) use ($ts) {
            $t->string('id')->primary();
            $t->string('patient_id');
            $t->string('appointment_id')->nullable();
            $t->string('doctor_id')->nullable();
            $t->string('clinic_arrival_time');
            $t->string('examination_room_entry_time')->nullable();
            $t->string('status');
            $ts($t);
        });
        $s->create('activity_logs', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->string('user_id');
            $t->string('user_name');
            $t->string('action');
            $t->string('entity_type')->nullable();
            $t->string('entity_id')->nullable();
            $t->text('details')->nullable();
            $t->string('created_at');
        });
    }

    private function seedLegacyData(): void
    {
        $now = '2026-01-04 12:31:39.123456+00';
        $go = fn (string $pw) => '$2a$'.substr(password_hash($pw, PASSWORD_BCRYPT, ['cost' => 10]), 4);
        $src = $this->src();

        $src->table('auth_users')->insert([
            ['id' => self::ADMIN, 'email' => 'Admin@Clinic.com', 'encrypted_password' => $go('admin-pass'), 'last_sign_in_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::KIDS_USER, 'email' => 'kids@clinic.com', 'encrypted_password' => $go('kids-pass'), 'last_sign_in_at' => null, 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::NO_EMAIL, 'email' => null, 'encrypted_password' => null, 'last_sign_in_at' => null, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('profiles')->insert([
            ['id' => self::ADMIN, 'email' => 'admin@clinic.com', 'full_name' => 'مدير النظام', 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::KIDS_USER, 'email' => 'kids@clinic.com', 'full_name' => 'د. سمر', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('user_roles')->insert([
            ['id' => 'r1', 'user_id' => self::ADMIN, 'role' => 'receptionist', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 'r2', 'user_id' => self::ADMIN, 'role' => 'super_admin', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 'r3', 'user_id' => self::KIDS_USER, 'role' => 'doctor', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('role_permissions')->insert([
            ['id' => 'p1', 'role' => 'receptionist', 'resource' => 'payments', 'can_create' => true, 'can_update' => false, 'can_delete' => false, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('doctors')->insert([
            ['id' => self::DENTIST, 'full_name' => 'د. أحمد', 'email' => 'a@x.com', 'phone_number' => '0991', 'specialty' => 'تقويم', 'user_id' => null, 'has_own_books' => false, 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::KIDS_DOC, 'full_name' => 'د. سمر', 'email' => 'k@x.com', 'phone_number' => '0992', 'specialty' => 'أطفال', 'user_id' => self::KIDS_USER, 'has_own_books' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('patients')->insert([
            ['id' => self::PATIENT, 'full_name' => 'محمد علي', 'date_of_birth' => '1990-05-01', 'phone_number' => '0944', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('treatments')->insert([
            ['id' => self::T_CLINIC, 'name' => 'حشوات', 'doctor_id' => null, 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::T_KIDS, 'name' => 'معاينة', 'doctor_id' => self::KIDS_DOC, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('sub_treatments')->insert([
            ['id' => self::S_FILL, 'treatment_id' => self::T_CLINIC, 'name' => 'حشوة ضوئية', 'estimated_cost_syp' => 150000, 'tooth_association' => 'single_tooth', 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::S_EXAM, 'treatment_id' => self::T_KIDS, 'name' => 'معاينة وفحص', 'estimated_cost_syp' => 50000, 'tooth_association' => 'not_related', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('sub_treatment_steps')->insert([
            ['id' => self::STEP, 'sub_treatment_id' => self::S_FILL, 'step_name' => 'تحضير', 'step_order' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('appointments')->insert([
            ['id' => self::A1, 'patient_id' => self::PATIENT, 'doctor_id' => self::DENTIST, 'scheduled_at' => '2026-01-04 10:00:00+03', 'status' => 'Completed', 'created_at' => $now, 'updated_at' => $now],
            ['id' => self::A2, 'patient_id' => self::PATIENT, 'doctor_id' => self::KIDS_DOC, 'scheduled_at' => $now, 'status' => 'Completed', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('treatment_records')->insert([
            ['id' => 'tr1', 'appointment_id' => self::A1, 'treatment_id' => self::T_CLINIC, 'sub_treatment_id' => self::S_FILL, 'tooth_number' => '16, 17', 'actual_cost_syp' => 300000, 'actual_cost_usd' => 20, 'is_completed' => true, 'performed_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 'tr2', 'appointment_id' => self::A2, 'treatment_id' => self::T_KIDS, 'sub_treatment_id' => self::S_EXAM, 'tooth_number' => '', 'actual_cost_syp' => 50000, 'actual_cost_usd' => null, 'is_completed' => true, 'performed_at' => $now, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('payments')->insert([
            ['id' => 'pay1', 'appointment_id' => self::A1, 'amount' => 100000, 'currency' => 'SYP', 'paid_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 'pay2', 'appointment_id' => self::A1, 'amount' => 20, 'currency' => 'USD', 'paid_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 'pay3', 'appointment_id' => self::A2, 'amount' => 25000, 'currency' => null, 'paid_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            // orphan: its appointment no longer exists
            ['id' => 'pay4', 'appointment_id' => '40000000-0000-0000-0000-0000000000ff', 'amount' => 999, 'currency' => 'SYP', 'paid_at' => $now, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('treatment_plans')->insert([
            ['id' => 'tp1', 'patient_id' => self::PATIENT, 'treatment_id' => self::T_CLINIC, 'sub_treatment_id' => self::S_FILL, 'tooth_number' => '26', 'appointment_id' => null, 'is_executed' => false, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('appointment_treatment_steps')->insert([
            ['id' => 'ats1', 'appointment_id' => self::A1, 'sub_treatment_step_id' => self::STEP, 'is_completed' => true, 'completed_at' => $now, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('unfinished_sub_treatments')->insert([
            ['id' => 'u1', 'patient_id' => self::PATIENT, 'treatment_id' => self::T_CLINIC, 'sub_treatment_id' => self::S_FILL, 'tooth_number' => '36', 'last_appointment_id' => self::A1, 'is_marked_complete' => false, 'started_at' => $now, 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('waiting_list')->insert([
            ['id' => 'w1', 'patient_id' => self::PATIENT, 'appointment_id' => self::A2, 'doctor_id' => self::KIDS_DOC, 'clinic_arrival_time' => $now, 'status' => 'completed', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $src->table('activity_logs')->insert([
            ['id' => 'l1', 'user_id' => self::ADMIN, 'user_name' => 'مدير النظام', 'action' => 'INSERT', 'entity_type' => 'payments', 'entity_id' => 'pay1', 'details' => '{"new_data":{"amount":100000}}', 'created_at' => $now],
        ]);
    }

    public function test_import_copies_and_transforms_everything(): void
    {
        $report = (new SupabaseImporter)->run();

        // users: role dedup (highest wins), email lowercased, no-email user skipped
        $admin = User::findOrFail(self::ADMIN);
        $this->assertSame('admin@clinic.com', $admin->email);
        $this->assertSame('super_admin', $admin->role);
        $this->assertSame('مدير النظام', $admin->full_name);
        $this->assertCount(1, $report['users']['skipped']);
        $this->assertSame(2, User::count());

        // doctors: same id, linked login, own books, every doctor is a dentist
        $kids = DB::table('doctors')->where('id', self::KIDS_DOC)->first();
        $this->assertSame(self::KIDS_USER, $kids->user_id);
        $this->assertTrue((bool) $kids->has_own_books);
        $this->assertSame('أطفال', $kids->legacy_specialty);
        $dental = DB::table('specialties')->where('code', 'dental')->value('id');
        $this->assertSame(2, DB::table('doctor_specialty')->where('specialty_id', $dental)->where('is_primary', true)->count());
        $this->assertSame(2, DB::table('treatments')->where('specialty_id', $dental)->count());

        // treatment records: snapshots filled, empty tooth -> NULL
        $tr2 = TreatmentRecord::findOrFail('tr2');
        $this->assertSame(self::PATIENT, $tr2->patient_id);
        $this->assertSame(self::KIDS_DOC, $tr2->doctor_id);
        $this->assertNull($tr2->tooth_number);
        $this->assertSame('16, 17', TreatmentRecord::findOrFail('tr1')->tooth_number);

        // payments: snapshots, missing currency -> SYP, orphan skipped
        $pay3 = Payment::findOrFail('pay3');
        $this->assertSame('SYP', $pay3->currency);
        $this->assertSame(self::KIDS_DOC, $pay3->doctor_id);
        $this->assertNull(Payment::find('pay4'));
        $this->assertCount(1, $report['payments']['skipped']);

        // timestamps converted to UTC
        $this->assertSame('2026-01-04 07:00:00', DB::table('appointments')->where('id', self::A1)->value('scheduled_at'));

        // the rest arrived
        foreach (['treatment_plans', 'appointment_treatment_steps', 'unfinished_sub_treatments', 'waiting_list', 'role_permissions', 'sub_treatment_steps'] as $table) {
            $this->assertSame(1, DB::table($table)->count(), $table);
        }
    }

    public function test_fresh_import_wipes_laravel_only_data_but_keeps_configuration(): void
    {
        (new SupabaseImporter)->run();
        $medicine = Medicine::create(['trade_name' => 'Amoxil']);
        Prescription::create([
            'number' => 1, 'patient_id' => self::PATIENT, 'doctor_id' => self::DENTIST, 'issued_at' => now(),
        ]);
        DoctorAttendance::create(['doctor_id' => self::DENTIST, 'date' => '2026-01-04', 'check_in' => now()]);

        (new SupabaseImporter)->run(fresh: true);

        $this->assertSame(0, Prescription::withTrashed()->count());
        $this->assertSame(0, DoctorAttendance::count());
        $this->assertNotNull(Medicine::find($medicine->id)); // configuration survives
    }

    public function test_activity_logs_are_not_imported(): void
    {
        (new SupabaseImporter)->run();

        $this->assertFalse(Schema::hasTable('legacy_activity_logs'));
        $checked = array_column((new SupabaseVerifier)->run()['counts'], 'table');
        $this->assertContains('payments', $checked);
        $this->assertNotContains('legacy_activity_logs', $checked);
    }

    public function test_imported_users_log_in_with_their_supabase_passwords(): void
    {
        (new SupabaseImporter)->run();

        $this->withHeaders(['Origin' => 'http://localhost:8080', 'Referer' => 'http://localhost:8080/'])
            ->postJson('/auth/login', ['email' => 'kids@clinic.com', 'password' => 'kids-pass'])
            ->assertOk()
            ->assertJsonPath('user.doctor_id', self::KIDS_DOC)
            ->assertJsonPath('user.is_independent_doctor', true);
    }

    public function test_import_is_idempotent_and_fresh_removes_stale_rows(): void
    {
        (new SupabaseImporter)->run();
        (new SupabaseImporter)->run();
        $this->assertSame(3, Payment::count());
        $this->assertSame(2, TreatmentRecord::count());

        // A row deleted in Supabase stays after a normal run, disappears with --fresh.
        $this->src()->table('payments')->where('id', 'pay2')->delete();
        (new SupabaseImporter)->run();
        $this->assertSame(3, Payment::count());
        (new SupabaseImporter)->run(fresh: true);
        $this->assertSame(2, Payment::count());
    }

    public function test_verify_passes_after_import_except_for_the_orphan(): void
    {
        (new SupabaseImporter)->run();

        $problems = (new SupabaseVerifier)->run()['problems'];

        // the orphan payment (no appointment) is the only difference, and it is reported
        $this->assertContains('payments: 4 rows in Supabase, 3 in Laravel', $problems);
        $this->assertCount(1, $problems);
    }

    public function test_verify_is_clean_on_clean_data_and_catches_money_drift(): void
    {
        $this->src()->table('payments')->where('id', 'pay4')->delete();
        (new SupabaseImporter)->run();

        $this->assertSame([], (new SupabaseVerifier)->run()['problems']);

        // Tamper with one payment: verify must name the patient and doctor.
        DB::table('payments')->where('id', 'pay1')->update(['amount' => 100001]);
        $problems = (new SupabaseVerifier)->run()['problems'];
        $this->assertContains('patient '.self::PATIENT.' paid_syp: Supabase 125000.00, Laravel 125001.00', $problems);
        $this->assertContains('doctor '.self::DENTIST.' paid_syp: Supabase 100000.00, Laravel 100001.00', $problems);
    }
}
