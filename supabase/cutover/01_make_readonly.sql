-- =====================================================================
-- CUTOVER STEP: make the live Supabase app READ-ONLY.
-- Run in Supabase dashboard -> SQL Editor right before the final
-- `php artisan import:supabase --fresh`. Staff can still open and read
-- everything, but no save can land in Supabase after the final copy.
--
-- Undo (rollback): 02_restore_writes.sql
-- Logins keep working (auth schema is untouched).
-- =====================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Check: should return no rows
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
