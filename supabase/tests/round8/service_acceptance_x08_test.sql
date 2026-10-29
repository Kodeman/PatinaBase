-- Owned stack only (any local port but the shared 54322); every fixture/ACL change is rolled back.
\set ON_ERROR_STOP on
SELECT :'HOST' = '127.0.0.1' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'X08 refused: requires an owned 127.0.0.1 stack, never the shared 54322'; END $$;
\quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE assertion_count(n integer NOT NULL);
INSERT INTO assertion_count VALUES (0);
GRANT ALL ON assertion_count TO authenticated, anon;
CREATE FUNCTION pg_temp.assert_true(ok boolean, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',name; END IF;
 UPDATE assertion_count SET n=n+1;
 RAISE NOTICE 'PASS: %',name;
END $$;
CREATE FUNCTION pg_temp.expect_error(command text, state text, message text, name text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; actual_message text;
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE,actual_message=MESSAGE_TEXT;
  END;
  PERFORM pg_temp.assert_true(actual_state=state AND (message IS NULL OR strpos(actual_message,message)>0),
    name||format(' [expected %s/%s, got %s/%s]',state,message,actual_state,actual_message));
END $$;
CREATE FUNCTION pg_temp.uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f88e0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN n IS NULL THEN '' ELSE pg_temp.uid(n)::text END,true);
  PERFORM set_config('request.jwt.claims',CASE WHEN n IS NULL THEN '' ELSE jsonb_build_object('sub',pg_temp.uid(n),
    'role','authenticated')::text END,true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text,text,text),pg_temp.actor(integer),pg_temp.uid(integer) TO authenticated,anon;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f88e0000-%'),'fixture starts absent');
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'service-acceptance-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(1,10) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Service acceptance fixture',true FROM auth.users WHERE id::text LIKE 'f88e0000-%';
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
('f88e1000-0000-4000-8000-000000000001','design_studio','Acceptance A','service-acceptance-a','active'),
('f88e1000-0000-4000-8000-000000000002','design_studio','Acceptance B','service-acceptance-b','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.uid(1),'f88e1000-0000-4000-8000-000000000001','owner','active'),
(pg_temp.uid(2),'f88e1000-0000-4000-8000-000000000001','member','active'),
(pg_temp.uid(3),'f88e1000-0000-4000-8000-000000000001','admin','active'),
(pg_temp.uid(4),'f88e1000-0000-4000-8000-000000000002','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id::text LIKE 'f88e0000-%' AND r.name='studio_owner';
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id) VALUES
('f88e6000-0000-4000-8000-000000000001','f88e1000-0000-4000-8000-000000000001','person','client','Client',pg_temp.uid(5)),
('f88e6000-0000-4000-8000-000000000002','f88e1000-0000-4000-8000-000000000001','person','client','Partner',pg_temp.uid(6)),
('f88e6000-0000-4000-8000-000000000003','f88e1000-0000-4000-8000-000000000001','person','client','Household card',NULL),
('f88e6000-0000-4000-8000-000000000004','f88e1000-0000-4000-8000-000000000001','person','client','Second card',NULL);
INSERT INTO public.client_households(id,organization_id,designer_id,display_name,member_person_ids) VALUES
('f88e7000-0000-4000-8000-000000000001','f88e1000-0000-4000-8000-000000000001',pg_temp.uid(1),'Acceptance household',
 ARRAY['f88e6000-0000-4000-8000-000000000001','f88e6000-0000-4000-8000-000000000002',
       'f88e6000-0000-4000-8000-000000000003','f88e6000-0000-4000-8000-000000000004']::uuid[]);
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source,household_id) VALUES
('f88e2000-0000-4000-8000-000000000001',pg_temp.uid(1),pg_temp.uid(5),'Acceptance client',
 'service-acceptance-5@test.invalid','active','direct','f88e7000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);
CREATE FUNCTION pg_temp.policy() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('kind','acceptance_signer_policy','partKey','scope.signers','title','Signers','payload',
  jsonb_build_object('policyRevision',1,'signers',jsonb_build_array(
    jsonb_build_object('slot','client','required',true,'profileId',pg_temp.uid(5)),
    jsonb_build_object('slot','partner','required',true,'profileId',pg_temp.uid(6)),
    jsonb_build_object('slot','household','required',false,'householdPersonId','f88e6000-0000-4000-8000-000000000003'))));
$$;
CREATE FUNCTION pg_temp.parts(p uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'variant',variant,'partKey',part_key,'title',title,
   'payload',payload,'required',required,'clientVisible',client_visible) ORDER BY position),'[]')
 FROM public.proposal_agreement_parts WHERE proposal_id=p;
$$;
CREATE FUNCTION pg_temp.draft(p uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE phase_id uuid;
BEGIN
 INSERT INTO public.proposals(id,designer_id,designer_client_id,client_id,title,total_amount,status,valid_until)
 VALUES(p,pg_temp.uid(1),'f88e2000-0000-4000-8000-000000000001',pg_temp.uid(5),'Acceptance draft',0,'draft',now()+interval '30 days');
 INSERT INTO public.proposal_phases(proposal_id,name,phase_key,duration_days,lane,fee_cents,sort_order)
 VALUES(p,'Design','design-development',5,'main',0,0) RETURNING id INTO phase_id;
 PERFORM public.upsert_design_services_draft(p,jsonb_build_object('scope','Interior design services',
   'deliverables',jsonb_build_array('Selections'),'exclusions','[]'::jsonb,'billingCeilingCents',100000,
   'retainerAmountCents',0,'retainerActivationPolicy','immediate','billingCadence','monthly',
   'currency','USD','terms','Signed actual hours','currentRateVersion',1),
   jsonb_build_array(jsonb_build_object('version',1,'roleName','Designer','hourlyRateCents',12000,'sortOrder',0,'effectiveAt',now()-interval '1 day')));
 PERFORM public.materialize_standard_parts(p);
 PERFORM public.upsert_agreement_parts(p,pg_temp.parts(p)||jsonb_build_array(
   jsonb_build_object('kind','scope_package','partKey','scope.kitchen','title','Kitchen','payload',
     jsonb_build_object('packageKey','pkg.kitchen','label','Kitchen','inclusion','included',
       'responsibilities',jsonb_build_object('design','studio','purchasing','client','payer','client',
         'fabrication_contract','gc','installation','gc'),
       'serviceBindings',jsonb_build_object('design',jsonb_build_array(phase_id)))),
   pg_temp.policy()),'acceptance fixture');
END $$;
CREATE FUNCTION pg_temp.send_and_sign(p uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 snapshot:=public.get_commercial_document_send_snapshot(p);
 PERFORM public.send_commercial_document(p,snapshot->>'documentFingerprint',NULL,now()+interval '30 days');
 PERFORM pg_temp.actor(5);
 PERFORM public.sign_design_services_agreement(p,'Acceptance Client');
 PERFORM pg_temp.actor(1);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_and_sign(uuid) TO authenticated;
CREATE TEMP TABLE sa_results(key text PRIMARY KEY,value jsonb);
GRANT ALL ON sa_results TO authenticated;
CREATE FUNCTION pg_temp.project() RETURNS uuid LANGUAGE sql AS $$ SELECT (value->>'projectId')::uuid FROM sa_results WHERE key='origin' $$;
GRANT EXECUTE ON FUNCTION pg_temp.project() TO authenticated,anon;
GRANT SELECT ON sa_results TO anon;
-- Native agreement origin; read fixtures below do not claim to test delivery/lifecycle guards.
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
SELECT pg_temp.draft('f88e3000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.send_and_sign('f88e3000-0000-4000-8000-000000000001');
INSERT INTO sa_results VALUES('origin',public.countersign_design_services_agreement(
 'f88e3000-0000-4000-8000-000000000001','Acceptance Designer'));
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.project_scope_edition_signers s JOIN public.project_scope_editions e
  ON e.id=s.edition_id WHERE e.project_id=pg_temp.project() AND e.status='active'),'origin edition freezes three signers');
SET LOCAL session_replication_role=replica;
INSERT INTO public.evidence_manifests(id,project_id,package_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by) VALUES
('f88e8000-0000-4000-8000-000000000001',pg_temp.project(),NULL,'service_acceptance','[]',repeat('a',64),repeat('1',64),'sa-1',pg_temp.uid(1));
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id) VALUES
(pg_temp.uid(308),'f88e1000-0000-4000-8000-000000000001','person','client','Other household',pg_temp.uid(8));
INSERT INTO public.client_households(id,organization_id,designer_id,display_name,member_person_ids) VALUES
(pg_temp.uid(408),'f88e1000-0000-4000-8000-000000000001',pg_temp.uid(1),'Other household',ARRAY[pg_temp.uid(308)]);
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source,household_id) VALUES
(pg_temp.uid(508),pg_temp.uid(1),pg_temp.uid(8),'Other client','other-x08@test.invalid','active','direct',pg_temp.uid(408));
INSERT INTO public.project_parties(project_id,party_kind,display_name,profile_id,created_by) VALUES
(pg_temp.project(),'gc','GC',pg_temp.uid(9),pg_temp.uid(1)),
(pg_temp.project(),'vendor','Maker',pg_temp.uid(10),pg_temp.uid(1));
SET LOCAL session_replication_role=origin;
-- Freeze the legacy approval to the project client so both list baselines are nonempty.
SET LOCAL session_replication_role=replica;
INSERT INTO public.client_decisions(id,designer_client_id,title,designer_id,project_id,approval_contract,decision_type,decision_kind,coordination_kind,court,phase_id,blocking_status,blocks_kind) VALUES
('f88ea000-0000-4000-8000-000000000001','f88e2000-0000-4000-8000-000000000001','Approve plan',pg_temp.uid(1),pg_temp.project(),'project_artifact_v1','approval','approval','signoff','client','f88ea200-0000-4000-8000-000000000001','blocks_phase','phase');
INSERT INTO public.project_decision_authority_snapshots(decision_id,project_id,decision_lead_id,authority_revision,assigned_by)
VALUES ('f88ea000-0000-4000-8000-000000000001',pg_temp.project(),pg_temp.uid(5),1,pg_temp.uid(1));
INSERT INTO public.project_approval_artifacts(decision_id,project_id,source_kind,source_id,source_version,artifact_hash,
  artifact_title,question,due_at,phase_id,cost_cents_delta,schedule_days_delta,lead_time_days_delta,source_snapshot)
VALUES ('f88ea000-0000-4000-8000-000000000001',pg_temp.project(),'plan_issue','f88ea100-0000-4000-8000-000000000001',1,
  repeat('d',64),'Plan issue','Approve the plan?',now()+interval '7 days','f88ea200-0000-4000-8000-000000000001',0,0,0,'{}');
SET LOCAL session_replication_role=origin;
CREATE TEMP TABLE legacy_baseline(actor integer PRIMARY KEY, project_rows jsonb, client_rows jsonb);
GRANT ALL ON legacy_baseline TO authenticated;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
INSERT INTO legacy_baseline VALUES(1,public.get_project_decision_reviews(pg_temp.project()),public.list_my_project_decision_reviews());
SELECT pg_temp.actor(5);
INSERT INTO legacy_baseline VALUES(5,public.get_project_decision_reviews(pg_temp.project()),public.list_my_project_decision_reviews());
SELECT pg_temp.assert_true((SELECT bool_and(jsonb_array_length(project_rows)=1 AND jsonb_array_length(client_rows)=1) FROM legacy_baseline),
 'X08 both legacy lists have one real artifact before service records');
RESET ROLE;
-- Replica is restricted to projection fixture construction. All calls below restore origin and actual caller role.
CREATE FUNCTION pg_temp.fixture_request(n integer, state text, delivered boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.outbound_drafts(id,organization_id,project_id,kind,channel,recipient_kind,to_client_id,
 subject,body,ref_type,ref_id,dedupe_key) VALUES
 (pg_temp.uid(200+n),'f88e1000-0000-4000-8000-000000000001',pg_temp.project(),'service_acceptance_request',
 'email','client',pg_temp.uid(5),'Service acceptance','Projection fixture only','service_acceptance_request',pg_temp.uid(100+n),'x08-'||n);
 INSERT INTO public.service_acceptance_requests(id,project_id,scope_edition_id,scope_content_hash,evidence_manifest_id,
 evidence_manifest_hash,request_number,lifecycle,outbound_draft_id,sent_at,superseded_reason,superseded_at,
 client_request_id,request_hash,created_by)
 SELECT pg_temp.uid(100+n),pg_temp.project(),e.id,e.content_hash,'f88e8000-0000-4000-8000-000000000001',
 repeat('a',64),n,state,pg_temp.uid(200+n),CASE WHEN delivered THEN now() END,
 CASE WHEN state='superseded' THEN 'successor_request' END,CASE WHEN state='superseded' THEN now() END,
 'x08-'||n,repeat('b',64),pg_temp.uid(1)
 FROM public.project_scope_editions e WHERE e.project_id=pg_temp.project() AND e.status='active';
 INSERT INTO public.service_acceptance_signers(request_id,slot,required,profile_id,policy_slot) VALUES
 (pg_temp.uid(100+n),'required',true,pg_temp.uid(6),'required'),
 (pg_temp.uid(100+n),'optional',false,pg_temp.uid(7),'optional');
END $$;
SET LOCAL session_replication_role=replica;
SELECT pg_temp.fixture_request(1,'draft',false);
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(6);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_my_service_acceptance_requests()='[]'::jsonb,'X08 draft invisible to required signer');
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now() WHERE id=pg_temp.uid(101);
SELECT pg_temp.fixture_request(2,'superseded',true);
SELECT pg_temp.fixture_request(3,'sent',true);
SET LOCAL session_replication_role=origin;
CREATE FUNCTION pg_temp.check_viewer(n integer, expected_role text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM pg_temp.actor(n);
 rows:=public.get_my_service_acceptance_requests();
 PERFORM pg_temp.assert_true(jsonb_array_length(rows)=2 AND
  (SELECT bool_and(x->>'viewerRole'=expected_role AND x->>'sentAt' IS NOT NULL AND
   x->>'requestId' IN (pg_temp.uid(102)::text,pg_temp.uid(103)::text) AND NOT x ? 'artifactKind') FROM jsonb_array_elements(rows) x),
  'X08 sent-only service list: '||expected_role);
 PERFORM pg_temp.expect_error('SELECT public.get_project_service_acceptance(pg_temp.project())','42501',NULL,
  'X08 client cannot read studio service projection: '||expected_role);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check_viewer(integer,text) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_viewer(6,'signer_required');
SELECT pg_temp.check_viewer(7,'signer_optional');
SELECT pg_temp.check_viewer(5,'observer');
SELECT pg_temp.actor(1);
SELECT pg_temp.assert_true(jsonb_array_length(public.get_project_service_acceptance(pg_temp.project())->'requests')=3,
 'X08 studio sees draft-history, sent-history and current sent rows');
SELECT pg_temp.actor(2);
SELECT pg_temp.assert_true(jsonb_array_length(public.get_project_service_acceptance(pg_temp.project())->'requests')=3,'X08 studio comember has studio read');
DO $$ DECLARE n integer; label text; BEGIN
 FOR n,label IN SELECT * FROM (VALUES(4,'second studio'),(8,'another household'),(9,'GC'),(10,'maker')) actors(n,label) LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true(public.get_my_service_acceptance_requests()='[]'::jsonb,'X08 no service rows: '||label);
  PERFORM pg_temp.expect_error('SELECT public.get_project_service_acceptance(pg_temp.project())','42501',NULL,'X08 no studio projection: '||label);
 END LOOP;
 FOR n IN SELECT actor FROM legacy_baseline LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true((SELECT project_rows=public.get_project_decision_reviews(pg_temp.project()) AND
   client_rows=public.list_my_project_decision_reviews() FROM legacy_baseline WHERE actor=n),
   'X08 both legacy lists unchanged for actor '||n);
  PERFORM pg_temp.assert_true((SELECT bool_and(x->>'artifactKind'='plan_issue' AND NOT x ? 'requestId')
   FROM jsonb_array_elements(public.get_project_decision_reviews(pg_temp.project())) x),'X08 legacy parser receives only artifact kinds');
 END LOOP;
END $$;
SELECT pg_temp.actor(NULL);
SELECT pg_temp.assert_true(public.get_my_service_acceptance_requests()='[]'::jsonb,'X08 missing identity yields no client rows');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT public.get_my_service_acceptance_requests()','42501',NULL,'X08 anon denied client reader');
SELECT pg_temp.expect_error('SELECT public.get_project_service_acceptance(pg_temp.project())','42501',NULL,'X08 anon denied studio reader');
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'X08: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
