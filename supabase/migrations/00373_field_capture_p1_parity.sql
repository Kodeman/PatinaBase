-- ═══════════════════════════════════════════════════════════════════════════
-- 00373 — Field Capture P1 parity (reconcile early-applied 00341)
--
-- WHY THIS EXISTS
--   00341 (field_capture_p1_schema) was applied to Strata by the Back-of-House
--   deploy from an EARLIER form of the file, BEFORE three in-place edits landed
--   locally (Field Capture P1 items 9/10/11):
--     • room_files.drawings jsonb    — full rendered sheet set (plan + 4 elevations)
--     • room_files.status CHECK      — widened to include 'solved' + 'generated'
--     • room_file_measurements UNIQUE(room_file_id, element_ref) — solve-race guard
--   In-place editing of 00341 was sanctioned while it read as undeployed to prod
--   (patina-db-migrations: editing in place is standard remediation ONLY while a
--   migration is unapplied on prod). It had, in fact, already been applied by the
--   BOH deploy — the file froze early on Strata and the three edits never reached
--   prod through 00341. This migration fixes forward: it reconciles prod to
--   00341's final form.
--
-- LIVE DIFF at authoring (information_schema + pg_constraint on Strata,
-- ref bkvcixdmuyejfzcijpdg, 2026-07-18): of the three edits, only
-- room_files.drawings was genuinely absent on prod — the status CHECK already
-- carried the full value set and rfm_element_ref_uniq already existed (the
-- BOH-applied form had two of the three). Every clause below is catalog-guarded,
-- so this migration is a NO-OP on an already-final schema (local — where 00341's
-- final form already builds these — and the two already-present clauses on prod)
-- and only materializes the missing drawings column.
--
-- Additive + idempotent only. No data risk: room_files held 2 pre-render rows at
-- authoring; the NOT NULL DEFAULT '{}' backfills them to an empty sheet set,
-- the correct semantics for a version rendered before item-11 existed. No
-- GRANT/REVOKE changes (a column add inherits table grants) → the legacy-grants
-- seed is unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. room_files.drawings — full rendered sheet set (plan + 4 elevations) ──
ALTER TABLE public.room_files
  ADD COLUMN IF NOT EXISTS drawings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.room_files.drawings IS
  'Full rendered sheet set (plan + four elevations), each with its storage URL + sha256. svg_url/pdf_url/dxf_url remain the canonical single-pointer columns; drawings records the complete set (item 11).';

-- ─── 2. room_files.status CHECK — widen to the full lifecycle value set ──────
-- pending → solved → generated → error. Rebuilt only when the live constraint
-- does not already permit both 'solved' and 'generated' (no-op on prod + local,
-- which already carry the full set).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  JOIN pg_class t     ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'room_files'
    AND c.conname = 'room_files_status_check';

  IF v_def IS NULL OR v_def NOT LIKE '%''solved''%' OR v_def NOT LIKE '%''generated''%' THEN
    ALTER TABLE public.room_files DROP CONSTRAINT IF EXISTS room_files_status_check;
    ALTER TABLE public.room_files
      ADD CONSTRAINT room_files_status_check
      CHECK (status IN ('pending','solved','generated','error'));
  END IF;
END $$;

-- ─── 3. room_file_measurements UNIQUE(room_file_id, element_ref) ─────────────
-- Anti-double guard on the solve stage's delete-then-insert. Added only when a
-- constraint of that name is absent (no-op on prod + local, which already have it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t     ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'room_file_measurements'
      AND c.conname = 'rfm_element_ref_uniq'
  ) THEN
    ALTER TABLE public.room_file_measurements
      ADD CONSTRAINT rfm_element_ref_uniq UNIQUE (room_file_id, element_ref);
  END IF;
END $$;
