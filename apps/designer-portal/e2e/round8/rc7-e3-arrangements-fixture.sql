-- Supply -v e3_system_identifier="$RC7_E3_SYSTEM_IDENTIFIER" after validating
-- SUPABASE_DB_URL port 56122. No identifier or a different cluster refuses writes.
\if :{?e3_system_identifier}
\else
\echo 'RC7-E3 requires the cluster identifier captured at stack start'
\quit 1
\endif
BEGIN;
SELECT set_config('rc7_e3.expected_cluster', :'e3_system_identifier', true);
DO $$ BEGIN
  IF (SELECT system_identifier::text FROM pg_control_system())
      IS DISTINCT FROM current_setting('rc7_e3.expected_cluster', true) THEN
    RAISE EXCEPTION 'RC7-E3 refuses non-owned cluster';
  END IF;
END $$;
\ir ../../../../supabase/migrations/_pending/00905_round8_launch_service_arrangements.sql
UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';
GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;
COMMIT;
