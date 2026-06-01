-- Migration: 00171_decision_status_guard_and_events.sql
-- Decision Framework Wave 1 (Spine) · PT-D-1-1
--
-- Closes the integrity gap (delivery plan cluster C): the status column on
-- client_decisions had a CHECK on the allowed *values* (00062) but nothing
-- enforced legal *transitions*, and there was no history of who flipped a
-- decision and when.
--
-- This migration adds:
--   1. A BEFORE UPDATE transition guard on public.client_decisions that
--      rejects illegal status moves with a clear EXCEPTION.
--   2. A public.decision_events audit table.
--   3. An AFTER UPDATE trigger that writes one decision_events row on every
--      status change.
--
-- RLS mirrors the existing decision tables (00064 / 00090 / 00091): the
-- designer who owns the decision (via the designer_clients join) can read.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. STATUS-TRANSITION GUARD (BEFORE UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Valid transitions (delivery plan PT-D-1-1):
--   draft     → pending     (publish a draft)
--   pending   → responded   (client/designer resolves; see apply_decision)
--   pending   → expired     (expire-decisions cron / manual expiry — 00092)
--   responded → pending     (reopen a resolved decision)
--   expired   → pending     (reopen an expired decision — supports the
--                            expired-recovery flow, PT-D-2-T1-3)
--
-- Any other status change raises an exception. No-op updates (status
-- unchanged) always pass so the existing updated_at / viewed_at / responded_at
-- writes are never blocked.

CREATE OR REPLACE FUNCTION public.guard_decision_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only police actual status changes.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'draft'     AND NEW.status = 'pending')
    OR (OLD.status = 'pending'   AND NEW.status IN ('responded', 'expired'))
    OR (OLD.status = 'responded' AND NEW.status = 'pending')
    OR (OLD.status = 'expired'   AND NEW.status = 'pending')
  ) THEN
    RAISE EXCEPTION
      'Invalid decision status transition: % -> % (decision %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_decision_status_transition() IS
  'BEFORE UPDATE guard on client_decisions. Allows draft->pending, '
  'pending->responded|expired, responded->pending, expired->pending. '
  'Rejects every other status change with a check_violation exception. '
  'No-op updates (status unchanged) always pass.';

DROP TRIGGER IF EXISTS guard_decision_status_transition_trg ON public.client_decisions;
CREATE TRIGGER guard_decision_status_transition_trg
  BEFORE UPDATE ON public.client_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_decision_status_transition();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. decision_events AUDIT TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_events_decision
  ON public.decision_events(decision_id, created_at);

COMMENT ON TABLE public.decision_events IS
  'Append-only audit trail of client_decisions status changes. One row per '
  'status transition, written by the AFTER UPDATE trigger record_decision_status_event().';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STATUS-CHANGE RECORDER (AFTER UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Writes a decision_events row whenever status changes. changed_by uses
-- auth.uid() when available (client/designer acting through the API); it is
-- NULL for system actors such as the expire-decisions cron job (00092), which
-- runs as postgres with no auth context.

CREATE OR REPLACE FUNCTION public.record_decision_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.decision_events (
      decision_id, old_status, new_status, changed_by
    ) VALUES (
      NEW.id, OLD.status, NEW.status, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.record_decision_status_event() IS
  'AFTER UPDATE trigger on client_decisions. Inserts a decision_events row on '
  'every status change. changed_by = auth.uid() (NULL for system/cron actors). '
  'SECURITY DEFINER so the INSERT bypasses RLS — clients never insert directly.';

DROP TRIGGER IF EXISTS record_decision_status_event_trg ON public.client_decisions;
CREATE TRIGGER record_decision_status_event_trg
  AFTER UPDATE ON public.client_decisions
  FOR EACH ROW EXECUTE FUNCTION public.record_decision_status_event();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS — mirror the existing decision tables (00090 / 00091)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.decision_events ENABLE ROW LEVEL SECURITY;

-- Designer (owner) can read the event log for decisions they own.
CREATE POLICY decision_events_designer_select
  ON public.decision_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.designer_id = auth.uid()
    )
  );

-- Client (recipient) can read the event log for decisions addressed to them
-- (transparency — parallels decision_overrides / decision_comments).
CREATE POLICY decision_events_client_select
  ON public.decision_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.client_id = auth.uid()
    )
  );

-- INSERT is trigger-only (SECURITY DEFINER); no authenticated INSERT policy.
