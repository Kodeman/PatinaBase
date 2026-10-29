\set ON_ERROR_STOP on
SELECT :'HOST'='127.0.0.1' AND :'PORT'='58122' AND
 (SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions') AND
 NOT has_function_privilege('authenticated','public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text)','EXECUTE')
 AS owned_inactive \gset
\if :owned_inactive
\else
DO $$ BEGIN RAISE EXCEPTION 'E1 activation requires inactive owned 127.0.0.1:58122'; END $$;
\quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text),
 public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text),
 public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text),
 public.review_service_acceptance_paper_intake(uuid,text,text,text,text),
 public.present_service_acceptance_offline(uuid,text,text,text),
 public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text),
 public.withdraw_service_acceptance_request(uuid,text,text),
 public.complete_studio_service(uuid,uuid,text,text),
 public.revoke_studio_service_completion(uuid,text),
 public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) TO authenticated;
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
COMMIT;
