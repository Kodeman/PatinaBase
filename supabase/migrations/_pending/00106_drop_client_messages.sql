-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Drop legacy client_messages
-- Spec: docs/prds/in-app-messaging-prd.md §14
-- Status: DRAFT — DEFERRED. Do NOT move into supabase/migrations/ until the
--         preconditions below are met.
--
-- Preconditions (all must be true):
--   1. The new comms_* system has been live for ≥ 1 full release cycle.
--   2. Backfill migration 00104 has been verified — every legacy row maps to
--      a comms_messages row via _comms_backfill_legacy_map.
--   3. Zero hits on the deprecation log for the legacy hooks
--      (useClientMessages, useSendClientMessage) — those hooks have been
--      removed from @patina/supabase by this point.
--   4. No INSERTs into client_messages have been observed for ≥ 7 days
--      (verify with: SELECT max(created_at) FROM client_messages;).
--   5. PostHog dashboard for thread_message_sent shows healthy daily volume,
--      confirming the new system is carrying real traffic.
--   6. Backups have been verified within the last 24 hours.
--
-- Rollback:
--   This migration is irreversible. The backfill table _comms_backfill_legacy_map
--   alone does not let us reconstruct client_messages — its FK has gone away.
--   Take a logical dump of public.client_messages immediately before applying
--   if you want any recovery option.
--
-- Procedure when ready:
--   1. mv supabase/migrations/_pending/00106_drop_client_messages.sql \
--         supabase/migrations/00106_drop_client_messages.sql
--   2. supabase db push (production)
--   3. Verify: SELECT to_regclass('public.client_messages') IS NULL;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the backfill mapping first — it has FKs into both tables and would
-- block the table-drop otherwise. The mapping has served its purpose
-- (idempotency guard for backfill); it is no longer needed.
DROP TABLE IF EXISTS public._comms_backfill_legacy_map;

-- Drop the legacy table.
DROP TABLE IF EXISTS public.client_messages CASCADE;

COMMIT;

-- Post-drop sanity check (run as a separate query after commit):
--   SELECT to_regclass('public.client_messages');  -- expect NULL
--   SELECT COUNT(*) FROM public.comms_messages;     -- expect ≥ pre-drop legacy count
