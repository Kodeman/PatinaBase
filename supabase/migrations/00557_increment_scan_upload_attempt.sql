-- ═══════════════════════════════════════════════════════════════════════════
-- 00557 — public.increment_scan_upload_attempt: the one object the iOS
--         uploader calls that production does not have
--
-- ── NUMBER ─────────────────────────────────────────────────────────────────
--
-- This file was minted as 00556 and RENUMBERED to 00557 on 2026-09-02.
-- 00556 is taken by 00556_admin_studio_management.sql (commit d69e23f3f on
-- admin-studios/build, also at origin/admin-studios/build), which was ALREADY
-- APPLIED to the shared local stack. Two files at one number means one is
-- silently skipped.
--
-- `ls supabase/migrations` inside one worktree CANNOT see a peer branch, which
-- is how the collision was missed the first time. The check that can:
--
--   git log --all --diff-filter=A --format='' --name-only -- 'supabase/migrations/*.sql' \
--     | grep -E '^supabase/migrations/005[4-9][0-9]' | sort -u
--   git worktree list
--   psql "$STRATA_DB_URL" -X -q -tAc \
--     "SELECT version || '|' || name FROM supabase_migrations.schema_migrations
--       ORDER BY version DESC LIMIT 3"
--
-- Concurrent sessions mint in this band. Run all three AGAIN immediately before
-- the prod apply and renumber this file (filename, this banner, the test file,
-- and supabase/seed/00-legacy-grants.sql via generate-legacy-grants.py) on a
-- fresh collision.
--
-- Lineage: new function. Nothing in supabase/migrations/ has ever defined it —
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*increment_scan_upload_attempt" \
--     supabase/migrations/*.sql
-- returns nothing, and a 2026-09-01 re-probe of Strata found 0 rows in pg_proc.
-- Of everything the A3 production sweep listed as missing, this was the only
-- one that really was.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
--
-- apps/mobile/Patina/Patina/Services/Sync/RoomScanSyncService+AdvancedBundle.swift
-- :646-671 `stampUploadStarted(scanId:)` calls
--   .rpc("increment_scan_upload_attempt", params: ScanIdOnlyParams(p_scan_id:))
-- and, when the RPC 404s, falls back to a direct PATCH of room_scans setting
--   upload_started_at = <now>, status = 'uploading'
-- with its own comment: "The RPC is optional (pending migration)". So today
-- every scan upload on every device pays a failed round trip, and
-- room_scans.upload_attempt_count — described by 00082 as the "Monotonic retry
-- counter incremented by the uploader on each resumed attempt" — has never been
-- incremented by anything. Ruling D13 (build/rulings-2026-09-02.md) says write
-- the function rather than delete the call: removing a call is a behaviour
-- change in a lane that is not otherwise touching the upload path.
--
-- ── SHAPE: mirrored from mark_scan_upload_complete (00082:105-118,137) ──────
--
-- Same file, same rail, same caller, so the same shape:
--   LANGUAGE sql · SECURITY INVOKER · RETURNS void · the auth.uid() owner gate
--   inside the WHERE rather than a policy of its own · COMMENT ON FUNCTION ·
--   an explicit EXECUTE grant at the foot.
--
-- Two deliberate departures from 00082, neither of which changes behaviour:
-- the table is schema-qualified (`public.room_scans`) and search_path is pinned
-- (`SET search_path TO 'public'`). See the comment above the function body.
--
-- SECURITY INVOKER is the load-bearing half. The function runs as the caller,
-- so room_scans RLS applies to it in full and the `user_id = auth.uid()` clause
-- means a caller can only ever advance their OWN scan. A non-owner's call is a
-- silent zero-row UPDATE, not an error — which is the same contract
-- mark_scan_upload_complete has had since 00082.
--
-- ── SEMANTICS ──────────────────────────────────────────────────────────────
--
-- The Swift fallback tells us exactly what the RPC has to do, because the
-- fallback is what the app does when the RPC is absent: stamp
-- upload_started_at, set status = 'uploading'. Add the increment the name
-- promises and that is the whole function.
--
-- upload_started_at is COALESCEd rather than overwritten. 00082's own column
-- comment calls it "First PUT timestamp for this scan's artifact set", and this
-- RPC is called on every RESUMED attempt as well as the first — rewriting it
-- would turn a first-PUT timestamp into a last-retry timestamp and quietly
-- destroy the only signal that says how long an upload has really been running.
--
-- ── GRANTS ─────────────────────────────────────────────────────────────────
--
-- D13 says "mirror mark_scan_upload_complete's shape AND grants". 00082 wrote
-- only `GRANT EXECUTE ... TO authenticated`, but it predates Supabase's
-- 2026-05-30 platform-default flip, so on Strata (and on any local stack after
-- seed/00-legacy-grants.sql restores the legacy baseline) anon ALSO holds
-- EXECUTE on it from creation time. This file states both grants explicitly
-- instead of inheriting whichever default the environment happens to carry, so
-- the ACL is the same everywhere and readable from the migration text — which,
-- after the flip, is the only source of truth for the final ACL state.
--
-- anon holding EXECUTE is not a hole: the function is SECURITY INVOKER, so an
-- anon caller runs it with auth.uid() = NULL, `user_id = NULL` is never true,
-- and the UPDATE matches zero rows before room_scans RLS is even consulted.
--
-- REVOKE ... FROM PUBLIC is added, which 00082 predates. PUBLIC includes every
-- role in the cluster, present and future; anon and authenticated are named
-- explicitly instead.
--
-- Nothing here creates or drops a table, touches RLS, or touches svc_*.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- room_scans is schema-qualified and search_path is pinned, which 00082's
-- mark_scan_upload_complete does not do. 00282 shipped a bare table name that
-- resolved locally and failed on Strata with 42883 under the push session's
-- search_path; Supabase's linter also raises function_search_path_mutable on an
-- unpinned function. Neither changes behaviour, and SECURITY INVOKER is
-- untouched, so the D13 mirror still holds where it matters.
CREATE OR REPLACE FUNCTION public.increment_scan_upload_attempt(p_scan_id UUID)
  RETURNS void
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path TO 'public'
AS $$
  UPDATE public.room_scans
     SET upload_attempt_count = upload_attempt_count + 1,
         upload_started_at    = COALESCE(upload_started_at, NOW()),
         status               = 'uploading'
   WHERE id = p_scan_id
     AND user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.increment_scan_upload_attempt(UUID) IS
  'Caller (owner) records a new upload attempt for their scan: increments '
  'room_scans.upload_attempt_count, stamps upload_started_at the FIRST time '
  'only (00082 calls it the first-PUT timestamp, and this RPC is called again '
  'on every resume), and moves status to ''uploading''. RLS via SECURITY '
  'INVOKER; auth.uid() gate inside, so a non-owner''s call is a zero-row no-op. '
  'Same shape as mark_scan_upload_complete (00082). Called by '
  'RoomScanSyncService+AdvancedBundle.swift stampUploadStarted(scanId:), which '
  'until this migration always fell through to its direct-PATCH fallback.';

REVOKE EXECUTE ON FUNCTION public.increment_scan_upload_attempt(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_scan_upload_attempt(UUID) TO anon, authenticated;

-- Fail the transaction rather than ship a function nobody can call.
DO $$
BEGIN
  ASSERT NOT (
    SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_scan_upload_attempt'
  ), 'increment_scan_upload_attempt must be SECURITY INVOKER, like mark_scan_upload_complete';

  ASSERT has_function_privilege('authenticated', 'public.increment_scan_upload_attempt(uuid)', 'EXECUTE'),
    'authenticated cannot execute increment_scan_upload_attempt — the uploader would still 404';

  ASSERT has_function_privilege('anon', 'public.increment_scan_upload_attempt(uuid)', 'EXECUTE'),
    'anon cannot execute increment_scan_upload_attempt — D13 asks for parity with mark_scan_upload_complete';
END $$;

COMMIT;

-- ── AFTER APPLY ────────────────────────────────────────────────────────────
--   • the ledger row (this file is applied with `psql -f`, never `db push`):
--       INSERT INTO supabase_migrations.schema_migrations (version, name)
--       VALUES ('00557','increment_scan_upload_attempt') ON CONFLICT DO NOTHING;
--   • python3 scripts/generate-legacy-grants.py  (this file adds GRANT/REVOKE)
--   • pnpm db:generate                           (public schema gained a function)
--   • bash scripts/run-sql-tests.sh              (whole suite vs KNOWN_FAILURES.md)
--   • the object probe, not the ledger:
--       SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname='public' AND p.proname='increment_scan_upload_attempt';
--       -- before: 0   after: 1
--
-- The full apply sequence, with Step 0's deploy gate and the rollback, is
-- artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/KODY-RUNBOOK.md.
