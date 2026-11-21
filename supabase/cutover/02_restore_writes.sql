-- =====================================================================
-- ROLLBACK: make the Supabase app writable again (undoes 01_make_readonly.sql).
-- Supabase's default grants on public tables are ALL privileges for anon
-- and authenticated; row-level security policies still decide who may do
-- what, exactly as before the cutover.
-- =====================================================================

GRANT INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Check: every public table should list INSERT/UPDATE/DELETE for authenticated
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated'
GROUP BY table_name
ORDER BY table_name;
