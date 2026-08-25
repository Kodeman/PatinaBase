-- ═══════════════════════════════════════════════════════════════════════════
-- 00531 — grant EXECUTE on extensions.uuid_generate_v5(uuid, text) to authenticated
--
-- Number drawn from the Field Companion reservation band (00530–00535, see
-- docs/engineering/migration-number-reservations.md on branch
-- feat/field-companion-w1). This hotfix has no dependency on 00530 and may
-- apply to prod BEFORE 00530 lands.
--
-- Root cause (confirmed read-only on Strata prod, 2026-08-25, and cross-checked
-- against docs/ops/uuid-generate-v5-prod-error-2026-08-25.md):
--
--   public.margin_items (introduced 00194, security_invoker = true) has a
--   UNION ALL branch — the 'time' kind, a rolling 7-day summary of
--   project_time_entries, unchanged through 00197/00200/00202/00206/00219/00282
--   as later branches (including 00282's field_sms branch) were appended —
--   that projects:
--
--     uuid_generate_v5(
--       'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
--       te.project_id::text || te.day::text
--     )
--
--   This resolves via the default search_path to extensions.uuid_generate_v5
--   (uuid-ossp), the only function of that name on prod — so resolution is
--   not the problem (that was the separate, already-fixed 00282 issue). On
--   Strata, `extensions.uuid_generate_v5(uuid, text)` grants EXECUTE only to
--   postgres/dashboard_user/supabase_admin; authenticated and anon never had
--   it. Because margin_items is security_invoker, the EXECUTE check runs as
--   the querying role (authenticated, via PostgREST/authenticator), and
--   Postgres evaluates it lazily per output row of the 'time' branch — so the
--   failure only fires for a project with >=1 project_time_entries row where
--   duration_minutes IS NOT NULL AND started_at > now() - interval '7 days'.
--   That's rare, which is why a pre-existing (00194, months old) grant gap sat
--   live and undetected until prod logs caught it on 2026-08-25 (sql_state
--   42501, user_name authenticator, application_name PostgREST 14.1) as
--   `/doc/<id>` loads called the designer portal's useMarginItems hook.
--
-- Fix: a single targeted GRANT, matching the existing narrow-grant pattern on
-- this function family (see _send_proposal_with_dispatch's scoped REVOKE in
-- 00390). NOT to anon, NOT to PUBLIC — margin_items' own access is already
-- gated by base-table RLS via security_invoker; this only unblocks the
-- synthetic-id helper call itself for the authenticated role that legitimately
-- reaches it through the view. The view body and default privileges are
-- untouched by this migration.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

GRANT EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) TO authenticated;

COMMIT;
