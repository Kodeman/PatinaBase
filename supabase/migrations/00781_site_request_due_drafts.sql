-- Keep a completed due-reminder outbox from being recreated every cron tick
-- after the reminder has been staged as an outbound draft.
DO $$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.site_request_process_lifecycle(timestamptz)'::regprocedure
  );
  v_definition := replace(
    v_definition,
    'AND o.status IN (''pending'',''processing'',''sent'')',
    'AND o.status IN (''pending'',''processing'',''sent'',''cancelled'')'
  );
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public._resolve_site_request_due_drafts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IN ('completed', 'closed', 'expired')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.resolve_outbound_drafts('site_request', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_site_request_due_drafts ON public.site_requests;
CREATE TRIGGER resolve_site_request_due_drafts
AFTER UPDATE OF status ON public.site_requests
FOR EACH ROW EXECUTE FUNCTION public._resolve_site_request_due_drafts();
