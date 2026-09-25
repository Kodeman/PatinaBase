-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00669: field_captures — confirmations and proposals (F6, NI-02)
--
-- Reserved 2026-09-25 by NI-02 (SQ-217); recorded in
-- docs/engineering/migration-number-reservations.md. Applies after 00668.
--
-- Patina Field sends two per-field dictionaries in every capture payload
-- (FieldCapturePayload.swift:42, :45):
--   confirmations  FieldKey -> {confirmedBy, confirmedAt}  — who confirmed a value
--   proposals      FieldKey -> string                      — the machine's proposal
--                                                             a human replaced
-- Until now they rode raw_payload and nothing read them. This migration gives
-- each a column and projects it out of raw_payload.
--
-- ── WHY A TRIGGER ──────────────────────────────────────────────────────────
-- Same reason as 00532:18-29: commit_field_capture is a shared object whose
-- second author silently reverts the first, and it already writes the whole
-- payload to raw_payload on INSERT and on ON CONFLICT DO UPDATE. A BEFORE
-- INSERT OR UPDATE trigger projects from there and stays off that object.
--
-- ── WHY THIS TRIGGER CLEARS, UNLIKE 00532 ──────────────────────────────────
-- 00532's visit trigger never clears (00532:31-38). That is right for a visit
-- id and wrong for a dictionary of confirmations: a designer confirms `maker`,
-- syncs, then edits `maker` by hand, and the recommit carries
-- `confirmations: {}`. Keeping the old value would tell the studio a field is
-- confirmed that the device says is not. So when raw_payload has changed:
--   key present, jsonb object      → the column IS REPLACED, `{}` included
--                                    (that is the clear);
--   key present, any other type    → malformed: the column is left alone and
--     (array, string, number, null)  the problem is appended to
--                                    raw_payload -> 'projection_errors' as
--                                    {key, reason} — the shape
--                                    commit_field_capture already writes
--                                    there (00530:305). Never a RAISE (the
--                                    00532:40-57 ruling: a device retries a
--                                    raising capture forever);
--   key absent                     → a client that does not send the key (V3):
--                                    the column is left alone.
-- An UPDATE whose raw_payload is unchanged returns first (00532:171-172), so
-- route_field_capture, dismiss_field_capture and every other payload-less
-- UPDATE keep both columns.
--
-- ── NO BACKFILL ────────────────────────────────────────────────────────────
-- There is deliberately no `UPDATE field_captures SET …`. The 00233 guard
-- trigger raises on UPDATE for stale routing, and 00530's safe harbor exists
-- because such rows exist. Existing rows project on their next re-commit; a
-- row that never re-commits keeps `{}` in both columns while its raw_payload
-- still carries the keys.
--
-- Re-commits reach this trigger only where 00530's ON CONFLICT … WHERE status
-- NOT IN ('saved','dismissed') lets them. schemaVersion is not checked.
--
-- Revert: DROP TRIGGER trg_field_captures_proposal_projection ON field_captures;
-- DROP FUNCTION public.field_captures_project_confirmations();
-- ALTER TABLE field_captures DROP COLUMN confirmations, DROP COLUMN proposals;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Objects, not arrays: the Swift side is [String: Confirmation] and
-- [String: String], and readers index by field key.
ALTER TABLE field_captures
  ADD COLUMN IF NOT EXISTS confirmations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS proposals     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Never raises: every branch below is a jsonb type test or a jsonb merge.
CREATE OR REPLACE FUNCTION public.field_captures_project_confirmations()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_value  jsonb;
  v_prior  jsonb;
  v_error  jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.raw_payload IS NOT DISTINCT FROM OLD.raw_payload THEN
    RETURN NEW;
  END IF;

  -- A payload that is not an object has no keys to project.
  IF NEW.raw_payload IS NULL OR jsonb_typeof(NEW.raw_payload) <> 'object' THEN
    RETURN NEW;
  END IF;

  IF NEW.raw_payload ? 'confirmations' THEN
    v_value := NEW.raw_payload -> 'confirmations';
    IF jsonb_typeof(v_value) = 'object' THEN
      NEW.confirmations := v_value;
    ELSE
      v_errors := v_errors || jsonb_build_object(
        'key', 'confirmations',
        'reason', 'not a jsonb object (got ' || jsonb_typeof(v_value) || ')');
    END IF;
  END IF;

  IF NEW.raw_payload ? 'proposals' THEN
    v_value := NEW.raw_payload -> 'proposals';
    IF jsonb_typeof(v_value) = 'object' THEN
      NEW.proposals := v_value;
    ELSE
      v_errors := v_errors || jsonb_build_object(
        'key', 'proposals',
        'reason', 'not a jsonb object (got ' || jsonb_typeof(v_value) || ')');
    END IF;
  END IF;

  -- Append to whatever commit_field_capture already recorded. An entry already
  -- present is not added again: INSERT … ON CONFLICT DO UPDATE fires this
  -- trigger for the proposed row and again for the update, and EXCLUDED
  -- carries the first firing's entries.
  IF jsonb_array_length(v_errors) > 0 THEN
    v_prior := NEW.raw_payload -> 'projection_errors';
    IF v_prior IS NULL OR jsonb_typeof(v_prior) <> 'array' THEN
      v_prior := '[]'::jsonb;
    END IF;
    FOR v_error IN SELECT jsonb_array_elements(v_errors) LOOP
      IF NOT v_prior @> jsonb_build_array(v_error) THEN
        v_prior := v_prior || jsonb_build_array(v_error);
      END IF;
    END LOOP;
    NEW.raw_payload := NEW.raw_payload
                       || jsonb_build_object('projection_errors', v_prior);
  END IF;

  RETURN NEW;
END;
$$;

-- New public routine: the explicit revoke idiom (00532:335-342).
REVOKE ALL ON FUNCTION public.field_captures_project_confirmations() FROM PUBLIC, anon;

-- Triggers fire in name order: 'trg_field_captures_proposal_*' sorts after
-- 'trg_field_captures_guard_*', so a routing violation is rejected first.
DROP TRIGGER IF EXISTS trg_field_captures_proposal_projection ON field_captures;
CREATE TRIGGER trg_field_captures_proposal_projection
  BEFORE INSERT OR UPDATE ON field_captures
  FOR EACH ROW EXECUTE FUNCTION public.field_captures_project_confirmations();

COMMIT;
