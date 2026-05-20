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

UPDATE auth.users SET confirmation_token     = COALESCE(confirmation_token, '');
UPDATE auth.users SET recovery_token         = COALESCE(recovery_token, '');
UPDATE auth.users SET email_change_token_new = COALESCE(email_change_token_new, '');
UPDATE auth.users SET email_change           = COALESCE(email_change, '');

ALTER TABLE auth.users ALTER COLUMN confirmation_token     SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN recovery_token         SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN email_change_token_new SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN email_change           SET DEFAULT '';
