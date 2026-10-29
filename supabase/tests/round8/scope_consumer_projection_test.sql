\set ON_ERROR_STOP on
-- -v expected_port=<n> names another local stack's DB port; the host stays 127.0.0.1.
\if :{?expected_port}
\else
\set expected_port 54322
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AS local_stack \gset
\if :local_stack
\else
\echo REFUSED: scope_consumer_projection needs 127.0.0.1 port :expected_port, got :HOST port :PORT
DO $$ BEGIN RAISE EXCEPTION 'scope_consumer_projection refused: not the expected local stack'; END $$;
\quit
\endif
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
-- Keep the rolled-back oracle at the cumulative replay horizon (see README).
\ir ../../migrations/00868_round8_scope_composition.sql
\ir ../../migrations/00869_round8_scope_execution.sql
\ir ../../migrations/00871_round8_plan_composition.sql
\ir ../../migrations/00876_round8_external_presence_parity.sql
\ir ../../migrations/00879_round8_fabrication_instruction.sql
\ir ../../migrations/00883_round8_external_reader_parity.sql
\ir ../../migrations/00885_round8_countersign_execution_time.sql
\ir ../../migrations/00900_round8_external_install_hold_guard.sql
\ir ../../migrations/00901_round8_client_threshold_external_field.sql

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION pg_temp.expect_error(command text, state text, fragment text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; actual_message text;
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_message = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.assert_true(actual_state = state AND strpos(actual_message,fragment)>0,
    label || format(' [got %s: %s]', actual_state, actual_message));
END $$;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f1991000-%')
  AND NOT EXISTS(SELECT 1 FROM public.proposals WHERE id::text LIKE 'f1991300-%'), 'fictional fixture starts absent');

-- Fixture-only storage bypass: never enable C2 or grant a consequential RPC.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT ('f1991000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'scope-consumer-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(1,3)n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Scope consumer fixture',true FROM auth.users WHERE id::text LIKE 'f1991000-%';
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source)
VALUES ('f1991200-0000-4000-8000-000000000001','f1991000-0000-4000-8000-000000000001',
 'f1991000-0000-4000-8000-000000000002','Scope consumer','scope-consumer-2@test.invalid','active','direct');
INSERT INTO public.proposals(id,designer_id,designer_client_id,client_id,title,total_amount,status,valid_until,document_kind,commercial_state,sent_at,signed_at,accepted_at,signed_by_name)
SELECT ('f1991300-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'f1991000-0000-4000-8000-000000000001','f1991200-0000-4000-8000-000000000001',
 'f1991000-0000-4000-8000-000000000002','Signed scope consumer',0,
 CASE WHEN n=1 THEN 'accepted' ELSE 'sent' END,now()+interval '30 days','design_services',
 CASE WHEN n=1 THEN 'client_signed' ELSE 'sent' END,now(),
 CASE WHEN n=1 THEN now() END,CASE WHEN n=1 THEN now() END,CASE WHEN n=1 THEN 'Fictional Client' END
FROM generate_series(1,2)n;
INSERT INTO public.proposal_phases(id,proposal_id,name,phase_key,fee_cents,sort_order,lane,duration_days) VALUES
('f1991500-0000-4000-8000-000000000001','f1991300-0000-4000-8000-000000000001','Design','concept_development',0,1,'main',5);
CREATE TEMP TABLE expected_scope AS SELECT jsonb_build_object(
 'packageKey','pkg.kitchen','label','Kitchen cabinetry','inclusion','included',
 'conditionText', E'Only after site approval.\nKeep existing stone.',
 'responsibilities',jsonb_build_object('design','studio','purchasing','client','payer','other','fabrication_contract','gc','installation','none'),
 'serviceBindings',jsonb_build_object('design',jsonb_build_array('f1991500-0000-4000-8000-000000000001'))
) payload;
INSERT INTO public.proposal_agreement_parts(id,proposal_id,position,kind,part_key,title,payload,client_visible)
SELECT ('f1991600-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'f1991300-0000-4000-8000-000000000001',n,'scope_package','kitchen-'||n,
 CASE WHEN n=1 THEN 'Signed scope' ELSE 'Private scope' END,
 CASE WHEN n=1 THEN payload ELSE jsonb_set(payload,'{packageKey}','"pkg.private"') END,n=1
FROM expected_scope CROSS JOIN generate_series(1,2)n;
SET LOCAL session_replication_role = origin;
GRANT SELECT ON expected_scope TO authenticated;
DO $$ BEGIN
 EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()));
 EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO authenticated', (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()));
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f1991000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true(
 (public.get_client_commercial_document_bundle('f1991300-0000-4000-8000-000000000001')#>'{parts,0,payload}') = payload,
 'client signed projection retains exact inclusion, all five parties, condition and typed bindings') FROM expected_scope;
SELECT pg_temp.assert_true(jsonb_array_length(public.get_client_commercial_document_bundle('f1991300-0000-4000-8000-000000000001')->'parts')=1,
 'private scope parts do not cross client projection');
SELECT pg_temp.expect_error($q$SELECT public.sign_proposal('f1991300-0000-4000-8000-000000000002','Fictional Client')$q$,
 '23514','commercial documents require their dedicated signature authority','legacy native signing cannot accept unsupported commercial scope');
SELECT set_config('request.jwt.claim.sub','f1991000-0000-4000-8000-000000000003',true);
SELECT pg_temp.expect_error($q$SELECT public.get_client_commercial_document_bundle('f1991300-0000-4000-8000-000000000001')$q$,
 '42501','access denied','foreign client cannot read signed scope');
RESET ROLE;
ROLLBACK;
SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f1991000-%') AS fixture_users_rolled_back,
 NOT EXISTS(SELECT 1 FROM public.proposals WHERE id::text LIKE 'f1991300-%') AS fixture_proposals_rolled_back;
