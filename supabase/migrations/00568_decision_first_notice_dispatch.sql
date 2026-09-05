-- =====================================================================================
-- 00568 — The first notice: a letter at the moment the studio presses send
--
-- Program: "The Decision, Delivered" · Wave 1 · P-02.
--
-- Until now no email was produced when an approval was published. 00464's
-- publish_client_decision wrote an in-app row through
-- _enqueue_decision_notification (00466) and stopped there; 00534's
-- notify_client_decision_raised added the bell and the push; the only decision
-- letter a homeowner ever received came from the decision-reminders cron
-- (00092), 48 hours before the due date. She read a reminder for a send she was
-- never mailed about.
--
-- This adds the missing producer, using 00174's exact mechanism: an AFTER
-- trigger on client_decisions that fires the invoke_edge_function bridge
-- (00081: dual apikey + Bearer service_role headers, GUC-guarded — locally the
-- GUCs are unset so it WARNs and no-ops). The edge function
-- decision-first-notice renders the announcing register and routes it through
-- the same sendCompliantEmail chokepoint as every other decision letter.
--
-- Firing edge: copied from notify_client_decision_raised (00534:298-306) so the
-- letter and the bell agree on what "put to the client" means — status
-- 'pending', court 'client', and on the UPDATE leg only a real status
-- transition. No enum, table, grant or column changes.
--
-- Lineage: 00081 (invoke_edge_function) → 00092 (decision cron) → 00174
-- (decision_dispatch_resolved_email, the pattern) → 00464 (publish path) →
-- 00466 (in-app enqueue) → 00534 (notify_client_decision_raised) → 00568.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.decision_dispatch_first_notice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only a decision actually put to the client.
  IF NEW.status <> 'pending' OR NEW.court <> 'client' THEN
    RETURN NEW;
  END IF;

  -- On the UPDATE leg, only the transition into 'pending' is a send. A write
  -- that names status without changing it (a republish, a reminder stamp) is
  -- not one, and must not produce a second announcement.
  IF TG_OP = 'UPDATE' AND NOT (OLD.status IS DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Fire and forget. The designer's write must always succeed even if the
  -- email side has a hiccup; the in-app row and the bell are written
  -- separately and lose nothing here.
  BEGIN
    PERFORM public.invoke_edge_function(
      'decision-first-notice',
      jsonb_build_object('decision_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decision_dispatch_first_notice: dispatch failed for decision %: %',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.decision_dispatch_first_notice()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS decision_first_notice_dispatch ON public.client_decisions;
CREATE TRIGGER decision_first_notice_dispatch
  AFTER INSERT OR UPDATE OF status ON public.client_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.decision_dispatch_first_notice();

COMMENT ON FUNCTION public.decision_dispatch_first_notice() IS
  'P-02: fires the decision-first-notice edge function when an approval is put to the client — on INSERT, and on the draft→pending UPDATE that publish_client_decision (00464) and the project-approval send use. Same firing edge as notify_client_decision_raised (00534). Non-fatal; modeled on 00174''s decision_dispatch_resolved_email.';
