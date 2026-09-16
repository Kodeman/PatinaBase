BEGIN;
-- F3: the literal the spec used to send, against the nullable uuid column.
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.projects (name, designer_id, studio_id, client_id, created_by, status)
    SELECT 'F3 probe (string)', designer_id, studio_id, 'bring-forward-e2e', created_by, status
      FROM public.projects WHERE id='d0e00000-0000-0000-0000-00000000000a';
    RAISE NOTICE 'string client_id: ACCEPTED  <-- unexpected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = RETURNED_SQLSTATE;
    RAISE NOTICE 'string client_id: REFUSED SQLSTATE %  (%)', v_err, SQLERRM;
  END;
  BEGIN
    INSERT INTO public.projects (name, designer_id, studio_id, client_id, created_by, status)
    SELECT 'F3 probe (null)', designer_id, studio_id, NULL, created_by, status
      FROM public.projects WHERE id='d0e00000-0000-0000-0000-00000000000a';
    RAISE NOTICE 'null client_id: ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'null client_id: REFUSED -> %  <-- unexpected', SQLERRM;
  END;
END $$;
ROLLBACK;
