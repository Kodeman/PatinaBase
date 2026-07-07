-- =============================================================================
-- 00259 — New-lead notification on marketing waitlist signup
-- =============================================================================
-- The marketing site (patina.cloud) upserts new signups into public.waitlist
-- (onConflict: email). This fires an internal alert email on every genuinely
-- NEW signup — AFTER INSERT only, so a repeat submission (ON CONFLICT → UPDATE)
-- does not re-notify. Routes through public.invoke_edge_function (00258,
-- Vault-backed settings) to the waitlist-notify edge function, which emails
-- LEAD_NOTIFY_TO via Resend.
--
-- The notification never blocks the signup: any failure is caught and warned.

CREATE OR REPLACE FUNCTION public.notify_new_waitlist_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.invoke_edge_function(
    'waitlist-notify',
    jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_new_waitlist_lead: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_waitlist_lead_trigger ON public.waitlist;
CREATE TRIGGER notify_new_waitlist_lead_trigger
  AFTER INSERT ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_waitlist_lead();
