-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005NN: field_captures — the visit and the suggestion
--
-- Field Companion wave 3 (package 3-10). Spec §9.3.
--
-- ⚠ NN IS DRAWN FROM THE RESERVED BAND 00530–00535 AT LANDING, by the
--   orchestrator, after re-checking BOTH docs/engineering/migration-number-
--   reservations.md AND `supabase migration list` against Strata (discipline
--   rules 1–2 + the file-based push invariant in docs/ops/strata-staging.md).
--   This file lives under docs/design/field-companion/plans/sql/ until then.
--
-- Additive and idempotent throughout. No RPC signature changes. No new status
-- value — "filed" is `project_id IS NOT NULL`, and a terminal status would
-- silently revoke studio read through field_captures_org_inbox_select
-- (00233_field_captures_inbox.sql:175-186).
--
-- ── WHY A TRIGGER AND NOT A `CREATE OR REPLACE commit_field_capture` ────────
-- §9.0 records that `commit_field_capture` is a SHARED OBJECT with two live
-- authors: Phase 3's 00516 replaces it "from its 00235 body verbatim" plus an
-- enrichment enqueue, and whichever lane lands second SILENTLY REVERTS the
-- other — no error, no failed migration. FC-R18 rules that wave 1's routing
-- migration is authored from the merged 00516 body and lands after it. Wave 3
-- does NOT need to re-enter that queue: `commit_field_capture` already writes
-- the WHOLE payload to `field_captures.raw_payload` on both the INSERT and the
-- ON CONFLICT DO UPDATE path (00235:100, :184), so a BEFORE INSERT OR UPDATE
-- trigger can project the visit and suggestion keys out of it. That keeps this
-- migration off the contested object entirely, and it is idempotent by
-- construction: a re-commit re-projects the same values.
--
-- The trigger NEVER clears a value. Each column takes the payload's value when
-- the key is present AND parses, and keeps its existing value otherwise — so
-- the `route_field_capture` / `dismiss_field_capture` UPDATE paths, which carry
-- no new payload, leave the visit intact.
--
-- ── THE PROJECTION NEVER RAISES ────────────────────────────────────────────
-- Ruling (2026-08-24): a malformed or unknown-vocabulary payload key must not
-- be able to fail `commit_field_capture` on EITHER destination. Patina Field is
-- offline-first and RETRIES: `LocalCaptureSyncService` re-drains the outbox, so
-- a capture whose payload trips a cast or a CHECK would raise the same error
-- forever — never syncing, never reaching the studio, and holding the queue
-- behind it. That would also break `commit_field_capture`'s own promise that
-- "any failure on the library path safe-harbors to the inbox rather than
-- erroring (offline clients must always converge)" (00235:11-13) — the upsert,
-- and therefore this trigger, runs BEFORE that safe harbor's BEGIN block
-- (00235:223-299), so an exception here escapes the RPC on the library path and
-- has no harbor at all on the inbox path.
--
-- So every projected value is parsed defensively: an unparsable uuid, timestamp
-- or numeric, an unknown `visit_kind` / `visit_kit` / `suggestion_basis`, and an
-- out-of-range confidence all resolve to "leave the column alone" and are
-- RECORDED in `raw_payload->'visit_projection_errors'` as a jsonb array of
-- `{key, sqlstate, at}`. Nothing is silently dropped; nothing raises.
--
-- The named CHECK constraints STAY. They are the schema-level invariant for
-- anything writing these columns DIRECTLY (a portal, a backfill, a hand-run
-- UPDATE) — they were never meant to be the device's input validator, and this
-- trigger is the guarantor that a device payload can no longer trip them.
--
-- ⚠ Flow 7's consequence stands and is NOT worked around here: a capture that
--   commits at status='saved' (the sourcing → library path) is immutable
--   (00235:190 skips the conflict without touching the row; :193-202 returns
--   the untouched row), so closing a visit can never stamp `visit_ended_at`
--   onto it. The Visits block derives a visit's span from min/max(created_at).
--   `visit_ended_at` is a device-side nicety, correct only for captures still
--   at status='inbox'.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (a) The visit ──────────────────────────────────────────────────────────
-- An opaque, device-minted grouping key. NO FK, no visits table: an abandoned
-- visit must leave no server rows, and a visit is device-local until its first
-- capture.
--
-- FC-R2 ratified: two kinds (site, sourcing) and three kits (walk_through,
-- trade_walk, install). A kit is NEVER also a kind. No visit = NULL kind.
--
-- CHECK constraints are NAMED so a later widening can DROP them by name.
ALTER TABLE field_captures
  ADD COLUMN IF NOT EXISTS visit_id   uuid,
  ADD COLUMN IF NOT EXISTS visit_kind text
    CONSTRAINT field_captures_visit_kind_ck
    CHECK (visit_kind IS NULL OR visit_kind IN ('site','sourcing')),
  ADD COLUMN IF NOT EXISTS visit_kit  text
    CONSTRAINT field_captures_visit_kit_ck
    CHECK (visit_kit IS NULL
           OR visit_kit IN ('walk_through','trade_walk','install')),
  ADD COLUMN IF NOT EXISTS visit_label text,
  ADD COLUMN IF NOT EXISTS visit_started_at timestamptz,
  -- Device-side only, and correct ONLY for captures still at status='inbox'.
  ADD COLUMN IF NOT EXISTS visit_ended_at   timestamptz,

  -- ── (b) The suggestion, ALWAYS distinct from the fact ────────────────────
  -- project_id means SHE SAID SO. suggested_project_id means WE THINK SO.
  -- Nothing reads suggested_* as truth, ever, anywhere. One suggestion per
  -- capture, superseded on re-run — columns, not a table, because it must be
  -- indexable and sortable in the tray.
  ADD COLUMN IF NOT EXISTS suggested_project_id      uuid REFERENCES projects(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_project_room_id uuid REFERENCES project_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggestion_basis          text
    CONSTRAINT field_captures_suggestion_basis_ck
    CHECK (suggestion_basis IS NULL
           OR suggestion_basis IN ('visit','scan','proximity','venue','calendar','transcript')),
  -- ORDERS suggestions in the tray. NEVER RENDERED (Principle 4, §2.2): the
  -- basis is always shown in words. A surface that renders this number is a bug.
  ADD COLUMN IF NOT EXISTS suggestion_confidence     numeric(3,2)
    CONSTRAINT field_captures_suggestion_confidence_ck
    CHECK (suggestion_confidence IS NULL OR suggestion_confidence BETWEEN 0 AND 1);

-- Serves wave 4's `useProjectVisits` read — "every capture on this project,
-- grouped by visit, newest first" (wave-4-plan.md:1334). The partial predicate
-- is deliberate: a visit is only ever LISTED on a project spread, so a row with
-- no project_id can never satisfy that query. Nothing in wave 3 reads it — the
-- unplaced tray is device-side SwiftData. Do not "fix" it to cover
-- `project_id IS NULL`; that scan has no caller.
CREATE INDEX IF NOT EXISTS idx_field_captures_visit
  ON field_captures (project_id, visit_id, created_at DESC)
  WHERE project_id IS NOT NULL;

-- ── (c) The projection trigger ─────────────────────────────────────────────
-- Reads the device payload out of raw_payload and fills the columns above.
-- SECURITY INVOKER (the default for a trigger function): the suggestion
-- existence probes below run under the CALLER's RLS, exactly like
-- field_captures_guard_routing (00233_field_captures_inbox.sql:189-194). A
-- project the designer cannot see is treated as absent and the suggestion is
-- dropped — which is correct: we only ever suggest what she can already reach.
--
-- TOTAL BY CONSTRUCTION. Every parse sits in its own plpgsql sub-block whose
-- EXCEPTION handler records the failure and leaves the column untouched, and
-- every controlled vocabulary is checked in SQL before assignment rather than
-- by letting the CHECK bite. There is no code path from a payload value to a
-- RAISE. (Each sub-block is a subtransaction; at one row per device commit the
-- cost is irrelevant, and the alternative is a permanently wedged outbox.)
CREATE OR REPLACE FUNCTION public.field_captures_project_visit_columns()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb := COALESCE(NEW.raw_payload, '{}'::jsonb);
  v_errors  jsonb := '[]'::jsonb;
  v_text    text;
  v_uuid    uuid;
  v_ts      timestamptz;
  v_num     numeric;
BEGIN
  -- ── visit.id ─────────────────────────────────────────────────────────────
  v_text := NULLIF(v_payload#>>'{visit,id}', '');
  IF v_text IS NOT NULL THEN
    BEGIN
      v_uuid := v_text::uuid;
      NEW.visit_id := v_uuid;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'key', 'visit.id', 'sqlstate', SQLSTATE, 'at', NOW());
    END;
  END IF;

  -- ── visit.kind — FC-R2 vocabulary, checked, never CHECKed ────────────────
  v_text := NULLIF(v_payload#>>'{visit,kind}', '');
  IF v_text IS NOT NULL THEN
    IF v_text IN ('site','sourcing') THEN
      NEW.visit_kind := v_text;
    ELSE
      -- A widened vocabulary, or a newer build than this database. Record it
      -- and drop it; 23514 is the code field_captures_visit_kind_ck WOULD have
      -- raised, which is the useful thing to see in the payload.
      v_errors := v_errors || jsonb_build_object(
        'key', 'visit.kind', 'sqlstate', '23514', 'at', NOW());
    END IF;
  END IF;

  -- ── visit.kit ────────────────────────────────────────────────────────────
  v_text := NULLIF(v_payload#>>'{visit,kit}', '');
  IF v_text IS NOT NULL THEN
    IF v_text IN ('walk_through','trade_walk','install') THEN
      NEW.visit_kit := v_text;
    ELSE
      v_errors := v_errors || jsonb_build_object(
        'key', 'visit.kit', 'sqlstate', '23514', 'at', NOW());
    END IF;
  END IF;

  -- ── visit.label — free text, nothing to reject ───────────────────────────
  v_text := NULLIF(v_payload#>>'{visit,label}', '');
  IF v_text IS NOT NULL THEN
    NEW.visit_label := v_text;
  END IF;

  -- ── visit.startedAt / visit.endedAt ──────────────────────────────────────
  v_text := NULLIF(v_payload#>>'{visit,startedAt}', '');
  IF v_text IS NOT NULL THEN
    BEGIN
      v_ts := v_text::timestamptz;
      NEW.visit_started_at := v_ts;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'key', 'visit.startedAt', 'sqlstate', SQLSTATE, 'at', NOW());
    END;
  END IF;

  v_text := NULLIF(v_payload#>>'{visit,endedAt}', '');
  IF v_text IS NOT NULL THEN
    BEGIN
      v_ts := v_text::timestamptz;
      NEW.visit_ended_at := v_ts;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'key', 'visit.endedAt', 'sqlstate', SQLSTATE, 'at', NOW());
    END;
  END IF;

  -- ── suggestion.projectId ─────────────────────────────────────────────────
  -- Both ids are FKs, and a stale suggestion must never hard-fail a sync
  -- (R3-1: the phone can hold a project that has since moved), so each id is
  -- admitted only when it parses AND actually resolves for this caller.
  v_text := NULLIF(v_payload#>>'{suggestion,projectId}', '');
  IF v_text IS NOT NULL THEN
    BEGIN
      v_uuid := v_text::uuid;
      IF EXISTS (SELECT 1 FROM projects p WHERE p.id = v_uuid) THEN
        NEW.suggested_project_id := v_uuid;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'key', 'suggestion.projectId', 'sqlstate', SQLSTATE, 'at', NOW());
    END;
  END IF;

  -- ── suggestion.projectRoomId ─────────────────────────────────────────────
  v_text := NULLIF(v_payload#>>'{suggestion,projectRoomId}', '');
  IF v_text IS NOT NULL THEN
    BEGIN
      v_uuid := v_text::uuid;
      IF EXISTS (SELECT 1 FROM project_rooms r WHERE r.id = v_uuid) THEN
        NEW.suggested_project_room_id := v_uuid;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'key', 'suggestion.projectRoomId', 'sqlstate', SQLSTATE, 'at', NOW());
    END;
  END IF;

  -- ── suggestion.basis ─────────────────────────────────────────────────────
  v_text := NULLIF(v_payload#>>'{suggestion,basis}', '');
  IF v_text IS NOT NULL THEN
    IF v_text IN ('visit','scan','proximity','venue','calendar','transcript') THEN
      NEW.suggestion_basis := v_text;
    ELSE
      v_errors := v_errors || jsonb_build_object(
        'key', 'suggestion.basis', 'sqlstate', '23514', 'at', NOW());
    END IF;
  END IF;

  -- ── suggestion.confidence ────────────────────────────────────────────────
  -- Two failure classes the CHECK used to own: out of 0..1 (23514) and past
  -- numeric(3,2)'s 9.99 ceiling (22003). Both become NULL + a recorded note.
  -- In range, round(…, 2) is exact for numeric(3,2), so the assignment cannot
  -- overflow.
  v_text := NULLIF(v_payload#>>'{suggestion,confidence}', '');
  IF v_text IS NOT NULL THEN
    BEGIN
      v_num := v_text::numeric;
      IF v_num >= 0 AND v_num <= 1 THEN
        NEW.suggestion_confidence := round(v_num, 2);
      ELSE
        v_errors := v_errors || jsonb_build_object(
          'key', 'suggestion.confidence', 'sqlstate', '23514', 'at', NOW());
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'key', 'suggestion.confidence', 'sqlstate', SQLSTATE, 'at', NOW());
    END;
  END IF;

  -- ── What was dropped, said out loud ──────────────────────────────────────
  -- Same shape and the same home as commit_field_capture's own safe-harbor
  -- 'conflict' key (00235:280-291). A clean re-commit replaces raw_payload
  -- verbatim, so the array disappears by itself once the phone sends a payload
  -- this database understands.
  IF jsonb_array_length(v_errors) > 0 THEN
    NEW.raw_payload := CASE
                         WHEN jsonb_typeof(NEW.raw_payload) = 'object'
                           THEN NEW.raw_payload
                         ELSE '{}'::jsonb
                       END
                       || jsonb_build_object('visit_projection_errors', v_errors);
  END IF;

  RETURN NEW;
END;
$$;

-- A NEW public routine, so the explicit revoke idiom applies (00437:516-529):
-- prod default privileges auto-grant anon EXECUTE on new public functions, and
-- that has bitten twice. No GRANT is needed in return — Postgres checks EXECUTE
-- on a trigger function at CREATE TRIGGER time, not when the trigger fires, and
-- a trigger function called directly raises "can only be called as a trigger".
-- (This migration adds no other routine, so there is no in-body call whose
-- EXECUTE would be checked at run time under the caller's role.)
REVOKE ALL ON FUNCTION public.field_captures_project_visit_columns() FROM PUBLIC, anon;

-- Fires AFTER field_captures_guard_routing (triggers run in name order, and
-- 'trg_field_captures_guard_*' sorts before 'trg_field_captures_visit_*'), so a
-- routing violation is rejected before any projection work happens.
DROP TRIGGER IF EXISTS trg_field_captures_visit_projection ON field_captures;
CREATE TRIGGER trg_field_captures_visit_projection
  BEFORE INSERT OR UPDATE ON field_captures
  FOR EACH ROW EXECUTE FUNCTION public.field_captures_project_visit_columns();

COMMIT;
