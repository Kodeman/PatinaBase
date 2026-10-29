-- RC-7 lane E8: local C2/C4/C6 activation (C2 §2.8, C4 §2.8, C6 §2.7), the
-- RC-5 §4.3 method. Owned stack only: refuses unless psql is on loopback, on
-- the given owned DB port (never 54321/54322), on the given system identifier,
-- and the supabase_admin-owned rc7_owned.stack marker names patina-rc7-e8.
--   psql -X -1 -v ON_ERROR_STOP=1 -v owned_port=64122 -v owned_system_id=<id> \
--     postgresql://postgres:postgres@127.0.0.1:64122/postgres -f rc7-e8-activation-fixture.sql
-- Not rolled back: the stack is discarded with `supabase stop --no-backup`.
\set ON_ERROR_STOP on
\if :{?owned_port}
\else
DO $$ BEGIN RAISE EXCEPTION 'rc7-e8 activation refused: owned_port not given'; END $$;
\quit
\endif
\if :{?owned_system_id}
\else
DO $$ BEGIN RAISE EXCEPTION 'rc7-e8 activation refused: owned_system_id not given'; END $$;
\quit
\endif
SELECT :'HOST' IN ('127.0.0.1','localhost') AND :'PORT' = :'owned_port' AND :'PORT' NOT IN ('54321','54322')
  AND (SELECT system_identifier::text FROM pg_control_system()) = :'owned_system_id' AS owned \gset
\if :owned
\else
DO $$ BEGIN RAISE EXCEPTION 'rc7-e8 activation refused: not the owned rc7-e8 stack'; END $$;
\quit
\endif
DO $$ BEGIN
  IF to_regclass('rc7_owned.stack') IS NULL
     OR (SELECT relowner FROM pg_class WHERE oid = to_regclass('rc7_owned.stack')) <> 'supabase_admin'::regrole
     OR NOT EXISTS (SELECT 1 FROM rc7_owned.stack WHERE project_id = 'patina-rc7-e8') THEN
    RAISE EXCEPTION 'rc7-e8 activation refused: no rc7_owned.stack marker for patina-rc7-e8';
  END IF;
END $$;

UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';
-- C2
GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid),
  public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text),
  public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;
-- C4
GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text),
  public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text),
  public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text),
  public.review_service_acceptance_paper_intake(uuid,text,text,text,text),
  public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text),
  public.withdraw_service_acceptance_request(uuid,text,text),
  public.present_service_acceptance_offline(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
-- C6
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text),
  public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text),
  public.revoke_studio_service_completion(uuid,text) TO authenticated;

SELECT json_build_object(
  'scope_editions', (SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'),
  'c4_create', has_function_privilege('authenticated', 'public.create_service_acceptance_request(uuid,uuid,uuid,text)', 'EXECUTE'),
  'c6_complete', has_function_privilege('authenticated', 'public.complete_studio_service(uuid,uuid,text,text)', 'EXECUTE')
) AS rc7_e8_activation;
