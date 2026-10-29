-- This activation belongs only to the isolated RC-7 E3 cluster. The spec checks
-- the external DB port before invoking this file; the system identifier checks
-- the actual Postgres cluster, not its forwarded container port.
BEGIN;
DO $$ BEGIN
  IF (SELECT system_identifier::text FROM pg_control_system()) <> '7702029588411166762' THEN
    RAISE EXCEPTION 'RC7-E3 refuses non-owned cluster';
  END IF;
END $$;
UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';
GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;
COMMIT;
