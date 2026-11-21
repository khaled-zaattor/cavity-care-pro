# Phase C: staging trial and go-live

Plan reference: [`docs/LARAVEL_MIGRATION_PLAN.md`](../docs/LARAVEL_MIGRATION_PLAN.md) §5 steps 5–7.

```
Your PC (Git Bash)                          Shared host
deploy/deploy.sh staging  ── ssh/scp ──▶  ~/apps/cavity-staging/{releases,shared,current}
                                           ~/staging.<domain>/          (React build)
                                           ~/staging.<domain>/api ─▶ current/public (Laravel)
```

Commands, all from the repo root in Git Bash:

| Task | Command |
|---|---|
| Deploy | `deploy/deploy.sh staging` / `deploy/deploy.sh production` |
| Roll back to the previous release | `deploy/rollback.sh staging` |
| Check a site | `deploy/smoke.sh https://staging.<domain>` |

---

## 1. One-time host setup (≈30 min, in cPanel)

1. **SSH key.** On your PC, run `ssh-keygen -t ed25519` (if `~/.ssh/id_ed25519.pub` does not exist yet). In cPanel → *SSH Access* → *Import key*, paste the `.pub` content, then *Authorize* it. Test it: `ssh -p <port> <user>@<host> "php -v"` should answer without a password.
2. **Staging subdomain.** cPanel → *Domains* → create `staging.<domain>`. Note its document root (for example `/home/<user>/staging.<domain>`), and turn on SSL (AutoSSL / Let's Encrypt).
3. **Databases.** cPanel → *MySQL Databases*:
   - Create `<user>_clinic_staging`, plus a user with ALL privileges on it.
   - Later, create `<user>_clinic` for production, with its own user.
4. **PHP 8.3** for both domains: cPanel → *MultiPHP Manager*. Over SSH, check the CLI with `php -v`. If it isn't 8.3, find it (usually `/opt/cpanel/ea-php83/root/usr/bin/php`) and put that path in `REMOTE_PHP`.
5. **Composer:** `composer -V` over SSH. If it's missing, run `curl -sS https://getcomposer.org/installer | php` in your home folder and set `REMOTE_COMPOSER="php ~/composer.phar"`.
6. **Target file.** Copy `deploy/targets/example.env` to `deploy/targets/staging.env` and fill it in (it is git-ignored).

## 2. Deploy staging

```bash
deploy/deploy.sh staging
```

- **First run:** it stops after creating `~/apps/cavity-staging/shared/.env` (exit code 2). Edit that file over SSH and set:
  - `APP_URL=https://staging.<domain>/api`
  - `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`
  - `SANCTUM_STATEFUL_DOMAINS=staging.<domain>`

  Then run the command again. The `APP_KEY` is generated automatically.
- **Every later run:** builds, uploads, runs `composer install`, migrations and caches, switches to the new release, publishes the frontend and runs the smoke test.

**Cron** (cPanel → *Cron Jobs*, every minute): this runs the daily backup.

```
* * * * * cd /home/<user>/apps/cavity-staging/current && php artisan schedule:run >> /dev/null 2>&1
```

## 3. Load real data into staging

Choose **A** if the host's PHP has `pdo_pgsql` and can reach Supabase. Check over SSH with `php -m | grep -i pgsql`. Otherwise use **B**.

**A. Import on the server**

```bash
# add SUPABASE_DB_* to shared/.env (session pooler host, user postgres.<project-ref>, password)
cd ~/apps/cavity-staging/current
php artisan import:supabase --fresh
php artisan import:verify        # must print ✔
```

**B. Import on your PC, then copy the database**

```bash
cd backend
php artisan import:supabase --fresh && php artisan import:verify     # local MySQL "clinic"
MYSQLDUMP_PATH=/c/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysqldump.exe php artisan clinic:backup
scp -P <port> storage/app/private/backups/<newest>.sql.gz <user>@<host>:~/apps/cavity-staging/shared/storage/app/private/
ssh -p <port> <user>@<host> "cd ~/apps/cavity-staging/current && php artisan clinic:restore ../shared/storage/app/private/<newest>.sql.gz --force"
```

Staff log in with their **current Supabase passwords**. The import keeps them.

## 4. Staging trial (a few days)

Ask 1–2 staff members to do their normal work on `https://staging.<domain>` (the live system stays on Supabase). Staging data is a copy and will be thrown away. Checklist:

- [ ] Every role can log in with its existing password: admin, doctor, assistant, receptionist.
- [ ] Create, edit and cancel an appointment. Book for a doctor with 2 specialties and choose التخصص.
- [ ] Record a treatment with steps and a payment. Continue it in a second appointment until it is complete.
- [ ] Execute a treatment plan.
- [ ] Patient profile: the balance matches what staff expect, and payments can be edited.
- [ ] Waiting room: add an arrival, enter the exam room, finish. The TV screen (`/waiting-list-display`) updates within 5 seconds.
- [ ] Excel import and export of patients and appointments.
- [ ] التقارير المالية and إحصائيات show sensible numbers.
- [ ] The children's doctor (if set up) sees only their own money and catalog.
- [ ] Phone browser: the main screens are usable.

Note any problem and fix it, then redeploy staging. Repeat until the list is all ticked.

## 5. Go-live evening (≈1–2 hours, outside clinic hours)

Prepare in advance: production DB + user, `deploy/targets/production.env` (`WEB_DIR` = the main domain's document root, usually `~/public_html`; `MAINTENANCE=1`), and one production deploy so `shared/.env` exists and is filled in (`APP_URL=https://<domain>/api`, `SANCTUM_STATEFUL_DOMAINS=<domain>,www.<domain>`).

> **Careful:** a production deploy publishes the new frontend into `public_html` immediately. Do that first deploy **on cutover night, at step 3 below**, not before. Until then, keep the current Supabase build in `public_html`.

1. Tell staff the system will be offline for about an hour.
2. **Back up the current site files:** download a copy of `public_html` (cPanel → File Manager → Compress). This is the rollback for the frontend.
3. **Freeze Supabase:** in the Supabase SQL editor, run [`supabase/cutover/01_make_readonly.sql`](../supabase/cutover/01_make_readonly.sql). Staff can still read but nothing can be saved.
4. **Final import:** run §3 A or B against the **production** app folder (`~/apps/cavity`), with `import:supabase --fresh`.
5. `php artisan import:verify` must print ✔. **If it doesn't, stop and roll back (§6).**
6. `deploy/deploy.sh production`, then confirm the smoke test passes.
7. Log in as admin and open a patient with payments. Record a test payment and delete it.
8. Add the production cron line (same as §2, with `~/apps/cavity/current`).
9. Tell staff the new system is live: same address, same passwords.

## 6. Rollback

- **During cutover (before staff use it):**
  1. Upload the saved `public_html` copy back.
  2. Run [`supabase/cutover/02_restore_writes.sql`](../supabase/cutover/02_restore_writes.sql).

  Staff are back on Supabase with nothing lost, because Supabase was only read.
- **After go-live, a bad release:** `deploy/rollback.sh production` switches code and frontend to the previous release.
- **After go-live, data problem:** `php artisan clinic:restore <backup.sql.gz>` restores a daily backup from `shared/storage/app/private/backups/`.

**Keep the Supabase project untouched for 30 days.** After that, take a final dump and pause it (plan §5 step 7).

## Troubleshooting

- **I edited `shared/.env` but nothing changed.** The config is cached. Run `php artisan config:cache` in `current/`, or redeploy. Values passed on the command line are ignored for the same reason, so put `MYSQL_PATH` / `MYSQLDUMP_PATH` in `shared/.env` if those tools are not on the PATH.
- **Smoke test: "login path works" fails with 500.** Read `shared/storage/logs/laravel-*.log`. (A rehearsal caught exactly this: the login rate limiter was registered somewhere that route caching skips. That is fixed in `AppServiceProvider`.)
- **`/api/...` returns the React page instead of JSON.** The `api` symlink is missing or Apache doesn't follow symlinks. Check `ls -l <WEB_DIR>/api`. If needed, add `Options +FollowSymLinks` (or `+SymLinksIfOwnerMatch`) to `<WEB_DIR>/.htaccess`.
- **Uploading an x-ray fails with "file too large" (413/422) below 20 MB.** The host's PHP limit is lower. `backend/public/.user.ini` raises it (`upload_max_filesize = 25M`, `post_max_size = 30M`). Some hosts need the same values set in cPanel → *MultiPHP INI Editor*. Changes can take up to 5 minutes.
- **Login works but every next request is 401.** `SANCTUM_STATEFUL_DOMAINS` doesn't match the exact host in the browser (`www.` vs no `www.`), or `SESSION_SECURE_COOKIE=true` on a site without HTTPS.

## 7. After go-live

- [ ] Download a backup off the server weekly (`shared/storage/app/private/backups/`).
- [ ] Back up patient files too: the daily backup covers the **database only**. X-rays and lab results live in `shared/storage/app/private/patients/`. Download that folder regularly (cPanel → File Manager → Compress), or ask the host for a backup that includes it. The admin dashboard shows the disk usage and warns at 80%.
- [ ] Change the Supabase database password (it was shared during the migration).
- [ ] Remove `@supabase/supabase-js` and `src/integrations/supabase` from the frontend (plan §8).
