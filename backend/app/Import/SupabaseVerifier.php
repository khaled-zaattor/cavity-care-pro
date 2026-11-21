<?php

namespace App\Import;

use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;

/**
 * Proves the import is complete (plan §5 step 4). Go-live only when it
 * reports zero problems.
 *
 *  1. Row counts per table (source vs target).
 *  2. Every patient's charges and payments, per currency, to the cent.
 *  3. Charges and payments per doctor, per currency.
 *
 * Money is computed exactly like the current app (PatientProfile.tsx):
 * charges = Σ treatment_records.actual_cost_* of the patient's appointments,
 * payments = Σ payments.amount grouped by currency (missing currency = SYP).
 */
class SupabaseVerifier
{
    private Connection $src;

    private Connection $dst;

    /** source table => target table */
    private const TABLES = [
        'role_permissions' => 'role_permissions',
        'doctors' => 'doctors',
        'patients' => 'patients',
        'treatments' => 'treatments',
        'sub_treatments' => 'sub_treatments',
        'sub_treatment_steps' => 'sub_treatment_steps',
        'appointments' => 'appointments',
        'treatment_records' => 'treatment_records',
        'payments' => 'payments',
        'treatment_plans' => 'treatment_plans',
        'appointment_treatment_steps' => 'appointment_treatment_steps',
        'unfinished_sub_treatments' => 'unfinished_sub_treatments',
        'waiting_list' => 'waiting_list',
    ];

    public function __construct()
    {
        $this->src = DB::connection(config('import.source_connection'));
        $this->dst = DB::connection();
    }

    /**
     * @return array{counts: array<int, array{table: string, source: int, target: int}>, problems: string[]}
     */
    public function run(): array
    {
        $problems = [];
        $counts = [];

        // 1. Row counts ---------------------------------------------------
        $usersTable = config('import.users_table');
        $srcUsers = $this->src->table($usersTable)->whereNotNull('email')->count();
        $dstUsers = $this->dst->table('users')->count();
        $counts[] = ['table' => 'users', 'source' => $srcUsers, 'target' => $dstUsers];

        foreach (self::TABLES as $source => $target) {
            $s = $this->src->getSchemaBuilder()->hasTable($source) ? $this->src->table($source)->count() : 0;
            $t = $this->dst->table($target)->count();
            $counts[] = ['table' => $target, 'source' => $s, 'target' => $t];
        }
        foreach ($counts as $c) {
            if ($c['source'] !== $c['target']) {
                $problems[] = "{$c['table']}: {$c['source']} rows in Supabase, {$c['target']} in Laravel";
            }
        }

        // 2. Per-patient money -------------------------------------------
        $problems = array_merge($problems, $this->compare('patient', $this->sourceMoney('a.patient_id'), $this->targetMoney('patient_id')));

        // 3. Per-doctor money --------------------------------------------
        $problems = array_merge($problems, $this->compare('doctor', $this->sourceMoney('a.doctor_id'), $this->targetMoney('doctor_id')));

        return ['counts' => $counts, 'problems' => $problems];
    }

    /** @return array<string, array<string, string>> key => [metric => amount] */
    private function sourceMoney(string $groupColumn): array
    {
        $out = [];

        $this->src->table('treatment_records as t')
            ->join('appointments as a', 'a.id', '=', 't.appointment_id')
            ->groupBy($groupColumn)
            ->select("$groupColumn as k")
            ->selectRaw('COALESCE(SUM(t.actual_cost_syp), 0) as syp, COALESCE(SUM(t.actual_cost_usd), 0) as usd')
            ->get()
            ->each(function ($r) use (&$out) {
                $out[$r->k]['charges_syp'] = $this->money($r->syp);
                $out[$r->k]['charges_usd'] = $this->money($r->usd);
            });

        $this->src->table('payments as p')
            ->join('appointments as a', 'a.id', '=', 'p.appointment_id')
            ->groupBy($groupColumn, 'p.currency')
            ->select("$groupColumn as k", 'p.currency')
            ->selectRaw('COALESCE(SUM(p.amount), 0) as total')
            ->get()
            ->each(function ($r) use (&$out) {
                $currency = strtoupper((string) $r->currency) ?: 'SYP';
                $key = 'paid_'.strtolower($currency);
                $out[$r->k][$key] = $this->money(($out[$r->k][$key] ?? 0) + (float) $r->total);
            });

        return $out;
    }

    /** @return array<string, array<string, string>> */
    private function targetMoney(string $column): array
    {
        $out = [];

        $this->dst->table('treatment_records')
            ->whereNull('deleted_at')
            ->groupBy($column)
            ->select("$column as k")
            ->selectRaw('COALESCE(SUM(actual_cost_syp), 0) as syp, COALESCE(SUM(actual_cost_usd), 0) as usd')
            ->get()
            ->each(function ($r) use (&$out) {
                $out[$r->k]['charges_syp'] = $this->money($r->syp);
                $out[$r->k]['charges_usd'] = $this->money($r->usd);
            });

        $this->dst->table('payments')
            ->whereNull('deleted_at')
            ->groupBy($column, 'currency')
            ->select("$column as k", 'currency')
            ->selectRaw('COALESCE(SUM(amount), 0) as total')
            ->get()
            ->each(function ($r) use (&$out) {
                $key = 'paid_'.strtolower($r->currency);
                $out[$r->k][$key] = $this->money(($out[$r->k][$key] ?? 0) + (float) $r->total);
            });

        return $out;
    }

    /** @return string[] */
    private function compare(string $label, array $source, array $target): array
    {
        $problems = [];
        foreach (array_unique(array_merge(array_keys($source), array_keys($target))) as $key) {
            $metrics = array_unique(array_merge(array_keys($source[$key] ?? []), array_keys($target[$key] ?? [])));
            foreach ($metrics as $metric) {
                $s = $source[$key][$metric] ?? '0.00';
                $t = $target[$key][$metric] ?? '0.00';
                if ($s !== $t) {
                    $problems[] = "$label $key $metric: Supabase $s, Laravel $t";
                }
            }
        }

        return $problems;
    }

    private function money(mixed $value): string
    {
        return number_format(round((float) $value, 2), 2, '.', '');
    }
}
