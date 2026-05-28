-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00158: Nomination state machine trigger
--
-- PRD §6.6 — the vendor_nominations status field is a strict state machine.
-- The transitions diagram:
--
--     submitted ──▶ under_review ──▶ contacted ──▶ onboarding ──▶ live
--                                                       │
--                                                       └──▶ declined
--     (any active state can transition to declined)
--
-- This trigger enforces transition legality server-side so a malformed
-- admin tool call can't drive the workflow into an impossible state. It
-- also denormalizes `vendor_nominations.status` to `vendors.nomination_status`
-- so the designer-facing vendor record always reflects the latest pipeline
-- state without a JOIN.
--
-- Notifications (in-app + email) are intentionally NOT fanned out from
-- this trigger — the existing notifications service in
-- `packages/notifications` owns delivery and timing concerns. A
-- follow-up migration adds the outbox row writes once the manufacturer
-- outreach email template (S3.7) is in place.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Helper: validate a single transition ──────────────────────────────────

CREATE OR REPLACE FUNCTION nomination_transition_is_legal(
  p_from TEXT,
  p_to   TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  -- No-op (UPDATE without changing status) — always legal.
  SELECT
    p_from IS NOT DISTINCT FROM p_to
    OR (p_from, p_to) IN (
      ('submitted',    'under_review'),
      ('submitted',    'declined'),
      ('under_review', 'contacted'),
      ('under_review', 'declined'),
      ('contacted',    'onboarding'),
      ('contacted',    'declined'),
      ('onboarding',   'live'),
      ('onboarding',   'declined'),
      -- Renomination after a decline — a new vendor_nominations row
      -- handles that path; we don't allow `declined → submitted` on the
      -- same row.
      -- live is a terminal state.
      -- declined is also terminal on the SAME row; the renomination flow
      -- creates a fresh row via previous_nomination_id (PRD §6.7).
      ('live',         'live'),
      ('declined',     'declined')
    );
$$;

COMMENT ON FUNCTION nomination_transition_is_legal IS
  'Returns true when a vendor_nominations.status update is a legal state-machine step. Includes the no-op (same → same) so non-status UPDATEs to the same row work normally.';

-- ─── BEFORE UPDATE trigger: validate + side-effect ─────────────────────────

CREATE OR REPLACE FUNCTION vendor_nominations_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT nomination_transition_is_legal(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'illegal nomination transition: % → %',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    -- Stamp the timestamp + actor for the new state. Callers may also
    -- write these explicitly; the trigger only fills them when blank
    -- so an admin-supplied audit detail doesn't get clobbered.
    IF NEW.status_updated_at = OLD.status_updated_at THEN
      NEW.status_updated_at := NOW();
    END IF;
    IF NEW.status_updated_by IS NULL THEN
      NEW.status_updated_by := auth.uid();
    END IF;

    -- Convenience fields for specific states (PRD §6.6 timeline data).
    IF NEW.status = 'contacted' AND NEW.patina_outreach_sent_at IS NULL THEN
      NEW.patina_outreach_sent_at := NOW();
    END IF;
    IF NEW.status = 'live' AND NEW.catalog_live_at IS NULL THEN
      NEW.catalog_live_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_nominations_state_machine_trigger ON vendor_nominations;
CREATE TRIGGER vendor_nominations_state_machine_trigger
  BEFORE UPDATE ON vendor_nominations
  FOR EACH ROW
  EXECUTE FUNCTION vendor_nominations_state_machine();

-- ─── AFTER trigger: denormalize to vendors.nomination_status ───────────────
--
-- After-trigger so it sees the validated NEW values. Runs on INSERT too
-- so a fresh submission sets vendors.nomination_status to 'submitted'
-- without the application having to update both tables.

CREATE OR REPLACE FUNCTION vendor_nominations_denorm_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vendors
     SET nomination_status = NEW.status,
         nominated_by      = COALESCE(nominated_by, NEW.nominated_by_user_id),
         nominated_at      = COALESCE(nominated_at, NEW.created_at)
   WHERE id = NEW.vendor_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_nominations_denorm_status_trigger ON vendor_nominations;
CREATE TRIGGER vendor_nominations_denorm_status_trigger
  AFTER INSERT OR UPDATE OF status ON vendor_nominations
  FOR EACH ROW
  EXECUTE FUNCTION vendor_nominations_denorm_status();

COMMENT ON FUNCTION vendor_nominations_denorm_status IS
  'Mirrors vendor_nominations.status onto vendors.nomination_status so designer-facing vendor surfaces can read the pipeline state without a JOIN.';

COMMIT;
