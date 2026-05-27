-- 00147_auth_users_token_null_safety.sql
--
-- Backfill empty strings into auth.users string columns that GoTrue's Go model
-- types as plain `string` (not `sql.NullString`), and add explicit defaults so
-- future raw-SQL inserts cannot leave them NULL.
--
-- Root cause (2026-05-20): GoTrue's User struct types `confirmation_token`,
-- `recovery_token`, `email_change_token_new`, and `email_change` as plain
-- `string`. A single NULL in any of these columns makes GoTrue's `/admin/users`
-- endpoint return "Database error finding users" with status 500 — surfaced on
-- the admin-portal Users page. The other sibling columns ship with `''` defaults
-- at table-creation time; these four did not, so any seed script that inserted
-- users without setting them broke the entire admin user list.
--
-- (Note: `phone` is also nullable on all rows but GoTrue models it as a
-- NullString, so NULLs there are safe and are intentionally left alone.)
--
-- This migration:
--   1) Backfills NULL → '' for the four affected columns (idempotent COALESCE).
--   2) Adds `DEFAULT ''` to those columns at the schema level so the next
--      out-of-band insert can't reintroduce the NULL.
--
-- Role / permissions:
--   `auth.users` is owned by `supabase_auth_admin`. The migration runner
--   connects as `postgres`. On Supabase Cloud and on managed self-hosted setups
--   `postgres` is a superuser and can ALTER tables in the `auth` schema; on
--   the local Supabase CLI it is NOT a superuser and ALTER auth.users would
--   fail with `permission denied`, which would in turn fail `supabase db reset`.
--
--   The UPDATE statements only need column-level UPDATE privilege, which
--   `postgres` already has via the standard Supabase grant set, so they run
--   unconditionally outside any DO block.
--
--   The ALTER statements are wrapped in a DO block with an EXCEPTION handler
--   so a non-superuser `postgres` (local dev) raises a NOTICE and moves on
--   instead of aborting the migration. In a superuser context (prod) the
--   ALTERs run and the DEFAULT is committed exactly as intended.

UPDATE auth.users SET confirmation_token     = COALESCE(confirmation_token, '');
UPDATE auth.users SET recovery_token         = COALESCE(recovery_token, '');
UPDATE auth.users SET email_change_token_new = COALESCE(email_change_token_new, '');
UPDATE auth.users SET email_change           = COALESCE(email_change, '');

DO $$
BEGIN
  ALTER TABLE auth.users ALTER COLUMN confirmation_token     SET DEFAULT '';
  ALTER TABLE auth.users ALTER COLUMN recovery_token         SET DEFAULT '';
  ALTER TABLE auth.users ALTER COLUMN email_change_token_new SET DEFAULT '';
  ALTER TABLE auth.users ALTER COLUMN email_change           SET DEFAULT '';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE
      'Skipping ALTER auth.users DEFAULTs: current role lacks privilege to ALTER auth.users. Backfill UPDATEs already ran; the DEFAULT-hardening must be applied as a superuser (e.g. supabase_admin) in this environment.';
END $$;
