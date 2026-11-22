# Cavity Care Pro — Laravel API

The backend that replaces Supabase. Full plan: [`../docs/LARAVEL_MIGRATION_PLAN.md`](../docs/LARAVEL_MIGRATION_PLAN.md).

**Status: Phase A (foundation).** The live app still runs on Supabase. Nothing here is used by production yet.

## What exists (Phase A)

| Piece | Where |
|---|---|
| Schema mirroring Supabase (same UUIDs) + specialties + money snapshots | `database/migrations/` |
| Login / me / logout (Sanctum SPA cookies, existing Supabase passwords) | `app/Http/Controllers/Api/AuthController.php` |
| User admin + password reset (replaces the edge function) | `app/Http/Controllers/Api/UserAdminController.php` |
| Role matrix (port of the RLS role policies) | `config/clinic.php` |
| Independent-doctor rules (port of `can_see_doctor_books` etc.) | `app/Support/DoctorBooks.php`, `app/Policies/` |
| Tests for all of the above | `tests/Feature/` |

## Local development

Requirements: PHP 8.3, Composer, MySQL 8 (Laragon works).

```bash
cd backend
composer install
cp .env.example .env        # then set DB_* for your local MySQL
php artisan key:generate
php artisan migrate --seed
php artisan serve           # http://127.0.0.1:8000
```

Frontend (repo root): `npm run dev` serves the React app on http://localhost:8080. Vite proxies `/api/*` to Laravel, removing the `/api` prefix. Set `VITE_BACKEND=laravel` in `.env.local` once screens are switched over (Phase B).

Create a first admin locally:

```bash
php artisan tinker --execute="App\Models\User::create(['email'=>'admin@local.test','full_name'=>'Admin','role'=>'super_admin','password'=>'change-me-123']);"
```

Tests (in-memory SQLite, no MySQL needed):

```bash
php artisan test
```

## Importing from Supabase (Phase B)

1. Supabase dashboard → **Connect** → **Session pooler** (IPv4). Copy host, port, user and the database password into `backend/.env`:
   ```
   SUPABASE_DB_HOST=aws-0-<region>.pooler.supabase.com
   SUPABASE_DB_PORT=5432
   SUPABASE_DB_USERNAME=postgres.<project-ref>
   SUPABASE_DB_PASSWORD=<database password>
   ```
   PHP needs `pdo_pgsql` (`php -m | grep pgsql`).
2. `php artisan db:seed` (creates the طب الأسنان / طب الأطفال specialties the import needs).
3. `php artisan import:supabase --fresh -v` reads Supabase (read-only) and writes MySQL in one transaction.
4. `php artisan import:verify` compares row counts and every patient's and doctor's SYP/USD totals. Go-live only when it prints ✔.

Re-running is safe. `--fresh` empties the Laravel tables first, including users, so any Laravel-only test accounts disappear. In production it also needs `--force`.

What the import changes on the way: Go-style `$2a$` password hashes become `$2y$` (same password), every doctor and treatment gets the طب الأسنان specialty, records and payments get doctor/patient/specialty copies, empty tooth numbers become NULL, a missing payment currency becomes SYP, and timestamps become UTC. The old `activity_logs` are **not** imported (exported to Excel by the clinic, 2026-11-21). Rows whose parent no longer exists are skipped and listed, never guessed.

## API endpoints (Phase B)

All require login except `POST /auth/login`. Lists respect the role matrix and independent-doctor books.

| Screen | Endpoints |
|---|---|
| Login / session | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/password` |
| Users / permissions | `GET/POST /admin/users` (`?role=doctor`), `PATCH /admin/users/{id}`, `POST /admin/users/{id}/reset-password`, `GET/PUT /role-permissions` |
| التخصصات | `GET/POST /specialties`, `PATCH/DELETE /specialties/{id}` |
| Doctors | `GET/POST /doctors` (`?specialty_id=`), `GET/PATCH/DELETE /doctors/{id}` (body: `specialty_ids[]`, `primary_specialty_id`) |
| Treatments catalog | `GET /treatments` (`?specialty_id=`, `?doctor_id=`), `POST/PATCH/DELETE /treatments`, `/sub-treatments`, `/sub-treatment-steps` |
| Patients | `GET /patients` (paginated; `?search=`, `?filter=duplicates\|no_appointments`, `?per_page=` up to 10000 for export), `GET /patients/search?q=` (max 200), `POST /patients/import`, `GET/POST/PATCH/DELETE /patients/{id}` |
| Patient profile | `GET /patients/{id}/appointments`, `/treatment-records` (`?incomplete=1` = resume list), `/payments`, `/balance`, `/treatment-plans` (`?pending=1`), `/unfinished` |
| Appointments | `GET /appointments` (paginated; `doctor_id, patient_id, patient_name, specialty_id, status, from, to, upcoming`), `GET /appointments/today`, CRUD, `GET /appointments/bulk-delete-preview?from&to`, `POST /appointments/bulk-delete`, `POST /appointments/import` |
| Treating (one transaction each) | `POST /appointments/{id}/treatments`, `POST /appointments/{id}/resume`, `POST /appointments/{id}/execute-plan`, `GET /appointments/{id}/completed-steps` |
| Money | `POST /payments`, `PATCH/DELETE /payments/{id}`, `GET /appointments/{id}/payments`, `PATCH/DELETE /treatment-records/{id}`, `POST /treatment-plans`, `DELETE /treatment-plans/{id}` |
| Waiting room | `GET /waiting-list` (`?active=1`), `POST /waiting-list`, `PATCH /waiting-list/{id}` (`action: enter_exam\|complete` or times), `POST /waiting-list/complete-in-exam`, `POST /waiting-list/clear-completed`, `DELETE /waiting-list/{id}` |
| Reports | `GET /stats?from&to&books=all\|clinic\|<doctor_id>`, `GET /reports/revenue?from&to&group_by=doctor\|specialty\|doctor_specialty` |
| Dashboard | `GET /dashboard` (contents by role) |
| Prescriptions (E) | `/medicines`, `/prescriptions` (+ `/{id}/printed`), `/prescription-templates`, `/clinic-settings` (+ `/logo`) |
| Patient files (F) | `GET/POST /patients/{id}/files`, `GET /patient-files/{id}/content\|thumbnail`, `PATCH/DELETE /patient-files/{id}`, `GET /patients/{id}/timeline`, `GET /admin/storage` |
| Attendance (G) | `GET /attendance`, `GET /attendance/today`, `POST /attendance/check-in\|check-out`, admin `POST/PATCH/DELETE /attendance` |
| Finance (G, admin) | `GET /settlements?period=YYYY-MM`, `POST /settlements/close\|reopen`, `GET /my-settlement` (doctor), `/compensation-rules`, `/expense-categories`, `/expenses?period=`, `/recurring-expenses`, `/payouts` |
| Receipts | `GET /payments/{id}` (for the printed receipt) |

Behaviour changes vs. Supabase (deliberate fixes): sums are no longer capped at 1000 rows; treatment flows are atomic; tooth matching works for NULL teeth; "mark complete" and deleting a record also clear the unfinished tracker; deleting an appointment re-opens a plan executed in it (bulk delete used to delete the plan); bulk-delete totals are per currency; changing your password checks the current one; public self sign-up is gone (admins create users).

## Artisan commands

| Command | What it does |
|---|---|
| `import:supabase [--fresh]` / `import:verify` | Copy Supabase into MySQL / prove counts and every balance match |
| `clinic:backup` | Daily gzip dump of the database (scheduled 03:00) |
| `clinic:restore <file>` | Load a dump into the database |
| `clinic:recurring-expenses [--period=YYYY-MM]` | Monthly charges from the recurring templates (scheduled on the 1st) |
| `clinic:setup-pediatrics "<doctor>" [--price=] [--own-books]` | Children's doctor: specialty + «معاينة وفحص» catalog |

Settlement rule (decisions 2026-11-20): revenue = payments collected in the month; all charges first (doctor's direct charges + clinic-wide charges split by work hours + specialty charges split among that specialty's doctors), then the doctor's own percentage. Independent doctors don't carry clinic-wide charges (`FINANCE_INDEPENDENT_SHARE_EXPENSES`). Old money (older than `FINANCE_LOCK_AFTER_DAYS`, default 7) is editable by the admin only; a closed month by nobody.

## Routing convention

Laravel routes have **no `/api` prefix** (`apiPrefix: ''` in `bootstrap/app.php`). The `/api` segment comes from where the app is mounted:

- production: `https://your-domain/api/...` → `laravel/public` (see below)
- local: Vite proxy `/api` → `http://127.0.0.1:8000`

## Production layout on the shared host (Phase C)

```
/home/USER/laravel/          ← this backend/ folder (outside public_html)
/home/USER/public_html/      ← React build (dist/)
/home/USER/public_html/api   → symlink to /home/USER/laravel/public
```

`.env` on the server: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-domain/api`, `SANCTUM_STATEFUL_DOMAINS=your-domain`, `SESSION_SECURE_COOKIE=true`, MySQL credentials.

Cron is optional: monthly fixed expenses are added with the button in المالية (`POST /recurring-expenses/generate`), and the Hostinger plan backs up the database daily. On a host without backups, add `* * * * * cd /home/USER/laravel && php artisan schedule:run >> /dev/null 2>&1`.
