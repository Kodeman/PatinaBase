-- 00147_auth_users_token_null_safety.sql
--
-- Backfill empty strings into auth.users token columns and add explicit defaults
-- so future raw-SQL inserts cannot leave them NULL.
--
-- Root cause (2026-05-20): GoTrue's User Go-struct types `confirmation_token`,
-- `recovery_token`, and `email_change_token_new` as plain `string`, not `sql.NullString`.
-- A single NULL in any of these columns makes GoTrue's `/admin/users` endpoint
-- return "Database error finding users" with status 500 — surfaced on the
-- admin-portal Users page. Three of six token columns already had `''` defaults
-- at table-creation time; these three did not, so a seed script that inserted
-- users without setting tokens broke the entire admin user list.
--
-- This migration:
--   1) Backfills NULL → '' for the three affected columns (idempotent COALESCE).
--   2) Adds `DEFAULT ''` to those columns at the schema level so the next
--      out-of-band insert can't reintroduce the NULL.

UPDATE auth.users SET confirmation_token     = COALESCE(confirmation_token, '');
UPDATE auth.users SET recovery_token         = COALESCE(recovery_token, '');
UPDATE auth.users SET email_change_token_new = COALESCE(email_change_token_new, '');

ALTER TABLE auth.users ALTER COLUMN confirmation_token     SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN recovery_token         SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN email_change_token_new SET DEFAULT '';
