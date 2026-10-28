-- C6 studio service completion (00888) oracle on a reset database, K3 Option A.
-- Refuses any target but 127.0.0.1:expected_port (default 56322, the owned
-- +2000 stack). One rolled-back transaction: every grant, capability and
-- fixture change below is undone. The "shared" sections are reused by
-- service_completion_concurrency.test.mjs.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 56322
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AS local_stack \gset
\if :local_stack
\else
\echo REFUSED: service_completion_test needs 127.0.0.1 port :expected_port, got :HOST port :PORT
DO $$ BEGIN RAISE EXCEPTION 'service_completion_test refused: not the expected local stack'; END $$;
\quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';

-- BEGIN shared assertion helpers
CREATE FUNCTION pg_temp.assert_true(ok boolean, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',name; END IF;
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
  SELECT ('f8880000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.fid(series text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f888'||series||'-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN n IS NULL THEN '' ELSE pg_temp.uid(n)::text END,true);
  PERFORM set_config('request.jwt.claims',CASE WHEN n IS NULL THEN '' ELSE jsonb_build_object('sub',pg_temp.uid(n),
    'role','authenticated')::text END,true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text,text,text),
  pg_temp.actor(integer),pg_temp.uid(integer) TO authenticated,service_role;
-- END shared assertion helpers

-- Shipped inactive (F20): no mutation or helper is executable by PUBLIC, anon,
-- authenticated or service_role; only the two reads reach authenticated.
DO $$ DECLARE f record; r text; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature, p.proname FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('_guard_studio_service_completion',
      '_guard_service_acceptance_condition_resolution','_service_obligation_key','_service_obligation_write_lock',
      '_service_obligation_lock_row','_service_obligation_label','_service_obligation_items',
      '_service_acceptance_open_conditions','_service_completion_financial_hold','_derive_studio_service_obligations',
      '_can_complete_studio_service','_service_completion_receipt','_lock_service_completion_scope',
      '_assert_service_completion_read_committed','complete_studio_service','resolve_service_acceptance_condition',
      'revoke_studio_service_completion','derive_studio_service_obligations','get_studio_service_completion') LOOP
    PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM pg_proc p,
      aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
      WHERE p.oid=f.signature::oid AND acl.grantee=0 AND acl.privilege_type='EXECUTE'),'PUBLIC no execute '||f.signature);
    PERFORM pg_temp.assert_true(NOT has_function_privilege('anon',f.signature,'EXECUTE')
      AND NOT has_function_privilege('service_role',f.signature,'EXECUTE'),'anon and service_role no execute '||f.signature);
    IF f.proname IN ('derive_studio_service_obligations','get_studio_service_completion') THEN
      PERFORM pg_temp.assert_true(has_function_privilege('authenticated',f.signature,'EXECUTE'),'read granted to authenticated '||f.signature);
    ELSE
      PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated',f.signature,'EXECUTE'),'authenticated no execute '||f.signature);
    END IF;
  END LOOP;
END $$;
SELECT pg_temp.assert_true((SELECT count(DISTINCT proname)=19 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('_guard_studio_service_completion','_guard_service_acceptance_condition_resolution','_service_obligation_key',
   '_service_obligation_write_lock','_service_obligation_lock_row','_service_obligation_label','_service_obligation_items',
   '_service_acceptance_open_conditions','_service_completion_financial_hold','_derive_studio_service_obligations',
   '_can_complete_studio_service','_service_completion_receipt','_lock_service_completion_scope',
   '_assert_service_completion_read_committed','complete_studio_service','resolve_service_acceptance_condition',
   'revoke_studio_service_completion','derive_studio_service_obligations','get_studio_service_completion')),
  'the census covers all nineteen 00888 functions');
SELECT pg_temp.assert_true((SELECT bool_and(c.relrowsecurity) AND count(*)=2
  AND bool_and(NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
  AND bool_and(NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
  AND bool_and(NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace
  AND c.relname IN ('studio_service_completions','service_acceptance_condition_resolutions')),
  'both C6 tables have RLS and no anon, authenticated or service_role privilege');
SELECT pg_temp.assert_true((SELECT count(*)=17 AND bool_and(t.tgenabled='O') FROM pg_trigger t
  WHERE t.tgname='zzzzz_service_obligation_lock' AND t.tgfoid='public._service_obligation_lock_row()'::regprocedure),
  'the lock trigger ships active on all seventeen contributing tables');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname='zzzzz_service_obligation_lock'
  AND t.tgrelid::regclass::text IN ('invoices','invoice_line_items','payments','payment_milestones')),
  'invoice, payment and milestone tables carry no obligation lock (R20)');
SELECT pg_temp.assert_true((SELECT pg_get_constraintdef(oid) LIKE '%completed_with_conditions%' FROM pg_constraint
  WHERE conrelid='public.studio_service_completions'::regclass AND pg_get_constraintdef(oid) LIKE '%state = ANY%'),
  'the state CHECK ships wide (K3 Option A)');
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions'),'capability ships false');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='close_project'
  AND (prosrc LIKE '%studio_service%' OR prosrc LIKE '%service_obligation%')),'close_project is not edited');

-- Inactive (F8): every mutation refuses even with its grant restored here.
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text),
  public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text),
  public.revoke_studio_service_completion(uuid,text) TO authenticated;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT public.complete_studio_service(gen_random_uuid(),gen_random_uuid(),repeat(''a'',64),''k'')',
  '55000','scope_editions_inactive','inactive completion refuses with grant restored');
SELECT pg_temp.expect_error('SELECT public.resolve_service_acceptance_condition(gen_random_uuid(),gen_random_uuid(),''r'',''{}'',''k'')',
  '55000','scope_editions_inactive','inactive resolution refuses with grant restored');
SELECT pg_temp.expect_error('SELECT public.revoke_studio_service_completion(gen_random_uuid(),''r'')',
  '55000','scope_editions_inactive','inactive revocation refuses with grant restored');
RESET ROLE;
REVOKE EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text),
  public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text),
  public.revoke_studio_service_completion(uuid,text) FROM authenticated;
SELECT pg_temp.actor(NULL);

-- Fixture: studio A (1 owner, 2 member, 3 admin), studio B (4 owner), client 5,
-- household partner 6, outsider 7.
-- BEGIN shared fixture
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f8880000-%'),'fixture starts absent');
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'service-completion-f888-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(1,7) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Service completion fixture',true FROM auth.users WHERE id::text LIKE 'f8880000-%';
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
('f8881000-0000-4000-8000-000000000001','design_studio','Completion A','service-completion-f888-a','active'),
('f8881000-0000-4000-8000-000000000002','design_studio','Completion B','service-completion-f888-b','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.uid(1),'f8881000-0000-4000-8000-000000000001','owner','active'),
(pg_temp.uid(2),'f8881000-0000-4000-8000-000000000001','member','active'),
(pg_temp.uid(3),'f8881000-0000-4000-8000-000000000001','admin','active'),
(pg_temp.uid(4),'f8881000-0000-4000-8000-000000000002','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id::text LIKE 'f8880000-%' AND r.name='studio_owner';
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id) VALUES
('f8886000-0000-4000-8000-000000000001','f8881000-0000-4000-8000-000000000001','person','client','Client',pg_temp.uid(5)),
('f8886000-0000-4000-8000-000000000002','f8881000-0000-4000-8000-000000000001','person','client','Partner',pg_temp.uid(6)),
('f8886000-0000-4000-8000-000000000003','f8881000-0000-4000-8000-000000000001','person','client','Household card',NULL);
INSERT INTO public.client_households(id,organization_id,designer_id,display_name,member_person_ids) VALUES
('f8887000-0000-4000-8000-000000000001','f8881000-0000-4000-8000-000000000001',pg_temp.uid(1),'Completion household',
 ARRAY['f8886000-0000-4000-8000-000000000001','f8886000-0000-4000-8000-000000000002',
       'f8886000-0000-4000-8000-000000000003']::uuid[]);
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source,household_id) VALUES
('f8882000-0000-4000-8000-000000000001',pg_temp.uid(1),pg_temp.uid(5),'Completion client',
 'service-completion-f888-5@test.invalid','active','direct','f8887000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);
-- END shared fixture

-- BEGIN shared native helpers
CREATE FUNCTION pg_temp.policy() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('kind','acceptance_signer_policy','partKey','scope.signers','title','Signers','payload',
  jsonb_build_object('policyRevision',1,'signers',jsonb_build_array(
    jsonb_build_object('slot','client','required',true,'profileId',pg_temp.uid(5)),
    jsonb_build_object('slot','partner','required',true,'profileId',pg_temp.uid(6)),
    jsonb_build_object('slot','household','required',false,'householdPersonId','f8886000-0000-4000-8000-000000000003'))));
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
 VALUES(p,pg_temp.uid(1),'f8882000-0000-4000-8000-000000000001',pg_temp.uid(5),'Completion draft',0,'draft',now()+interval '30 days');
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
   pg_temp.policy()),'completion fixture');
END $$;
CREATE FUNCTION pg_temp.send_and_sign(p uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 snapshot:=public.get_commercial_document_send_snapshot(p);
 PERFORM public.send_commercial_document(p,snapshot->>'documentFingerprint',NULL,now()+interval '30 days');
 PERFORM pg_temp.actor(5);
 PERFORM public.sign_design_services_agreement(p,'Completion Client');
 PERFORM pg_temp.actor(1);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_and_sign(uuid) TO authenticated;
CREATE TEMP TABLE sa_results(key text PRIMARY KEY,value jsonb);
GRANT ALL ON sa_results TO authenticated;
CREATE FUNCTION pg_temp.v(k text) RETURNS jsonb LANGUAGE sql AS $$ SELECT value FROM sa_results WHERE key=k $$;
CREATE FUNCTION pg_temp.req(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT (value->>'requestId')::uuid FROM sa_results WHERE key=k $$;
CREATE FUNCTION pg_temp.project() RETURNS uuid LANGUAGE sql AS $$ SELECT (value->>'projectId')::uuid FROM sa_results WHERE key='origin' $$;
CREATE FUNCTION pg_temp.create(k text, manifest text DEFAULT 'f8888000-0000-4000-8000-000000000001') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_service_acceptance_request(pg_temp.project(),
    (SELECT id FROM public.project_scope_editions WHERE project_id=pg_temp.project() AND status='active'),manifest::uuid,k);
$$;
CREATE FUNCTION pg_temp.respond(req uuid, response text, k text, conditions jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.respond_service_acceptance(r.id,response,conditions,NULL,r.scope_content_hash,
    r.evidence_manifest_hash,r.signer_policy_revision,k,'portal_authenticated')
  FROM public.service_acceptance_requests r WHERE r.id=req;
$$;
-- V22 delivery as the service path (no JWT): claim, deliver, finalize, after-send.
CREATE FUNCTION pg_temp.deliver(req uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d uuid; f timestamptz; caller text := current_setting('request.jwt.claim.sub',true);
BEGIN
  SELECT outbound_draft_id INTO STRICT d FROM public.service_acceptance_requests WHERE id=req;
  PERFORM pg_temp.actor(NULL);
  PERFORM public.claim_outbound_draft_for_send(d);
  PERFORM public.record_outbound_draft_send_attempt(d);
  PERFORM public.record_outbound_draft_delivery(d,'msg-'||d);
  SELECT finalizing_at INTO f FROM public.claim_outbound_draft_finalize(d);
  PERFORM public.record_outbound_draft_after_send(d,f);
  PERFORM public.mark_outbound_draft_sent(d,pg_temp.uid(1),'msg-'||d);
  PERFORM set_config('request.jwt.claim.sub',COALESCE(caller,''),true);
  PERFORM set_config('request.jwt.claims',CASE WHEN COALESCE(caller,'')='' THEN '' ELSE
    jsonb_build_object('sub',caller,'role','authenticated')::text END,true);
END $$;
-- END shared native helpers

UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
-- BEGIN shared origin
SELECT pg_temp.draft('f8883000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.send_and_sign('f8883000-0000-4000-8000-000000000001');
INSERT INTO sa_results VALUES('origin',public.countersign_design_services_agreement(
 'f8883000-0000-4000-8000-000000000001','Completion Designer'));
RESET ROLE;
SET LOCAL session_replication_role=replica;
INSERT INTO public.evidence_manifests(id,project_id,package_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by) VALUES
('f8888000-0000-4000-8000-000000000001',pg_temp.project(),NULL,'service_acceptance','[]',repeat('a',64),repeat('1',64),'sc-1',pg_temp.uid(1));
SET LOCAL session_replication_role=origin;
-- END shared origin

-- BEGIN shared completion helpers
CREATE FUNCTION pg_temp.ed() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.project_scope_editions WHERE project_id=pg_temp.project() AND status='active';
$$;
CREATE FUNCTION pg_temp.derive() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public._derive_studio_service_obligations(pg_temp.project());
$$;
CREATE FUNCTION pg_temp.codes(kind text DEFAULT 'blockers') RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg((b->>'code')||COALESCE(':'||(b->>'packageKey'),'') ORDER BY n),'{}')
  FROM jsonb_array_elements(pg_temp.derive()->kind) WITH ORDINALITY x(b,n);
$$;
CREATE FUNCTION pg_temp.hash() RETURNS text LANGUAGE sql AS $$ SELECT pg_temp.derive()->>'obligationHash' $$;
CREATE FUNCTION pg_temp.current_req() RETURNS uuid LANGUAGE sql AS $$
  SELECT (pg_temp.derive()->'acceptance'->>'requestId')::uuid;
$$;
CREATE FUNCTION pg_temp.complete(k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.complete_studio_service(pg_temp.project(),pg_temp.current_req(),pg_temp.hash(),k);
$$;
CREATE FUNCTION pg_temp.settle(req uuid, condition uuid, k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.resolve_service_acceptance_condition(req,condition,'Done on site',
    jsonb_build_object('issueId','f888e000-0000-4000-8000-000000000001'),k);
$$;
CREATE FUNCTION pg_temp.condition(req uuid, n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT (c->>'conditionId')::uuid FROM public.service_acceptance_responses x,
    jsonb_array_elements(x.conditions) WITH ORDINALITY y(c,i)
  WHERE x.request_id=req AND x.response='accept_with_conditions' AND y.i=n;
$$;
-- A sent request answered by both required signers; conditions ride the client's answer.
CREATE FUNCTION pg_temp.accepted(k text, conditions jsonb DEFAULT '[]') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  PERFORM pg_temp.actor(1);
  INSERT INTO sa_results VALUES(k,pg_temp.create('c-'||k));
  r:=pg_temp.req(k);
  PERFORM pg_temp.deliver(r);
  PERFORM pg_temp.actor(5);
  PERFORM pg_temp.respond(r,CASE WHEN jsonb_array_length(conditions)>0 THEN 'accept_with_conditions' ELSE 'accept' END,
    'x5-'||k,conditions);
  PERFORM pg_temp.actor(6);
  PERFORM pg_temp.respond(r,'accept','x6-'||k);
  PERFORM pg_temp.actor(1);
  RETURN r;
END $$;
-- Fixture rows the derivation reads, written with triggers off.
CREATE FUNCTION pg_temp.replica(on_ boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- A SET statement (not set_config) so the stack's privileged-role hook allows it.
  IF on_ THEN SET LOCAL session_replication_role=replica; ELSE SET LOCAL session_replication_role=origin; END IF;
END $$;
CREATE FUNCTION pg_temp.package(k text, inclusion text, resp jsonb, design_since integer DEFAULT 1, install_since integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.replica(true);
  INSERT INTO public.project_scope_edition_packages(edition_id,package_key,label,inclusion,responsibilities,
    design_owed_since,installation_owed_since)
  VALUES (pg_temp.ed(),k,k,inclusion,jsonb_build_object('design','none','purchasing','client','payer','client',
    'fabrication_contract','none','installation','none')||resp,design_since,install_since)
  ON CONFLICT (edition_id,package_key) DO UPDATE SET inclusion=excluded.inclusion,
    responsibilities=excluded.responsibilities,design_owed_since=excluded.design_owed_since,
    installation_owed_since=excluded.installation_owed_since;
  PERFORM pg_temp.replica(false);
END $$;
CREATE FUNCTION pg_temp.phase(n integer, status text DEFAULT 'completed') RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.replica(true);
  INSERT INTO public.project_phases(id,project_id,name,status) VALUES (pg_temp.fid('c000',n),pg_temp.project(),'Phase '||n,status)
  ON CONFLICT (id) DO UPDATE SET status=excluded.status;
  PERFORM pg_temp.replica(false);
  RETURN pg_temp.fid('c000',n);
END $$;
CREATE FUNCTION pg_temp.bind(k text, slot text, bound integer, project_phase uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.replica(true);
  INSERT INTO public.project_scope_edition_phases(edition_id,source_proposal_phase_id,project_phase_id,package_key,service_slot,bound_in_edition)
  VALUES (pg_temp.ed(),extensions.gen_random_uuid(),project_phase,k,slot,bound);
  PERFORM pg_temp.replica(false);
END $$;
CREATE FUNCTION pg_temp.fulfilment(n integer, k text, status text DEFAULT 'received') RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.replica(true);
  INSERT INTO public.project_external_fulfilments(id,project_id,scope_edition_id,package_key,units,kind,buyer_party_kind,
    payer_party_kind,contracting_party_kind,status,created_by,client_request_id,request_hash)
  VALUES (pg_temp.fid('d000',n),pg_temp.project(),pg_temp.ed(),k,ARRAY['u'||n],'client_furnishing','client','client','none',
    status,pg_temp.uid(1),'ful-'||n,repeat('0',64));
  PERFORM pg_temp.replica(false);
  RETURN pg_temp.fid('d000',n);
END $$;
CREATE FUNCTION pg_temp.event(f uuid, kind text, verified boolean) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE e uuid := extensions.gen_random_uuid();
BEGIN
  PERFORM pg_temp.replica(true);
  INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence_level,evidence,recorded_by,
    verified_by,verified_at,event_seq,verification_seq,client_request_id,request_hash)
  VALUES (e,f,kind,CASE WHEN verified THEN 'verified' ELSE 'reported' END,'{}',pg_temp.uid(2),
    CASE WHEN verified THEN pg_temp.uid(1) END,CASE WHEN verified THEN now() END,
    (SELECT COALESCE(max(event_seq),0)+1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=f),
    CASE WHEN verified THEN 1 END,'ev-'||e,repeat('0',64));
  PERFORM pg_temp.replica(false);
  RETURN e;
END $$;
CREATE FUNCTION pg_temp.line(n integer, k text, status text DEFAULT 'specified', fulfilment uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.replica(true);
  INSERT INTO public.project_ffe_items(id,project_id,name,selection_thread_id,status,scope_package_key,
    external_fulfilment_id,design_disposition)
  VALUES (pg_temp.fid('b000',n),pg_temp.project(),'Line '||n,pg_temp.fid('b000',n),status,k,fulfilment,'selected')
  ON CONFLICT (id) DO UPDATE SET status=excluded.status,scope_package_key=excluded.scope_package_key,
    external_fulfilment_id=excluded.external_fulfilment_id;
  PERFORM pg_temp.replica(false);
  RETURN pg_temp.fid('b000',n);
END $$;
-- Completes every project phase (the agreed design phase included).
CREATE FUNCTION pg_temp.finish_phases() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.replica(true);
  UPDATE public.project_phases SET status='completed',completed_at=COALESCE(completed_at,now())
  WHERE project_id=pg_temp.project() AND status<>'completed';
  PERFORM pg_temp.replica(false);
END $$;
-- close_project's full closeout checklist (close_project_readiness_test.sql).
CREATE FUNCTION pg_temp.closeout() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '[{"key":"walkthrough","label":"Walkthrough","completed":true},{"key":"punch_list","label":"Punch list","completed":true},
    {"key":"payment","label":"Payment","completed":true},{"key":"photography","label":"Photography","completed":true},
    {"key":"photos","label":"Photos","completed":true},{"key":"case_study","label":"Case study","completed":true}]'::jsonb;
$$;
-- END shared completion helpers

-- Origin: the design-only, client-buy kitchen (design=studio, installation=gc).
SELECT pg_temp.assert_true(pg_temp.codes() @> ARRAY['acceptance_not_accepted'] AND pg_temp.codes() @> ARRAY['agreed_phase_open:pkg.kitchen']
  AND jsonb_array_length(pg_temp.derive()->'conditions')=0 AND pg_temp.derive()->>'scopeEditionId'=pg_temp.ed()::text,
  'origin blocks on the open agreed design phase and on acceptance');
SELECT pg_temp.assert_true(NOT pg_temp.codes() @> ARRAY['studio_design_unbound:pkg.kitchen'],
  'the signed design binding discharges the kitchen design slot');
SELECT pg_temp.expect_error(format($q$SELECT public.complete_studio_service(%L,gen_random_uuid(),repeat('a',64),'k-early')$q$,
  pg_temp.project()),'23514','acceptance_request_unknown','completion needs a request of this project');

-- Read authority: studio reads, client and outsider do not.
SELECT pg_temp.actor(7);
SELECT pg_temp.expect_error(format('SELECT public.derive_studio_service_obligations(%L)',pg_temp.project()),'42501',NULL,
  'outsider cannot derive');
SELECT pg_temp.actor(5);
SELECT pg_temp.expect_error(format('SELECT public.derive_studio_service_obligations(%L)',pg_temp.project()),'42501',NULL,
  'client cannot derive');
SELECT pg_temp.actor(2);
SELECT pg_temp.assert_true(public.derive_studio_service_obligations(pg_temp.project())->>'obligationHash'=pg_temp.hash()
  AND NOT public.derive_studio_service_obligations(pg_temp.project())?'snapshot','studio member derives the same hash');
SELECT pg_temp.actor(1);

-- Ready: the phase completes and both required signers accept.
SELECT pg_temp.finish_phases();
INSERT INTO sa_results VALUES('a0',pg_temp.create('c-a0'));
SELECT pg_temp.deliver(pg_temp.req('a0'));
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['acceptance_not_accepted'],'a sent, unanswered request leaves only the acceptance blocker');
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-unaccepted')$q$,'23514','service_obligations_open',
  'an unaccepted service refuses');
SELECT pg_temp.accepted('a1');
SELECT pg_temp.assert_true(pg_temp.codes()='{}' AND (pg_temp.derive()->'acceptance'->>'outcome')='accepted'
  AND pg_temp.current_req()=pg_temp.req('a1'),'accepted with phases done: no blockers');
SELECT pg_temp.assert_true(pg_temp.hash()=pg_temp.hash() AND pg_temp.hash() ~ '^[0-9a-f]{64}$','the hash is deterministic');

-- Blockers and informational items (each variant rolls back to the savepoint).
SAVEPOINT v;
SELECT pg_temp.phase(1,'in_progress');
SELECT pg_temp.bind('pkg.kitchen','design',1,pg_temp.fid('c000',1));
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['agreed_phase_open:pkg.kitchen'],'an included agreed phase still open blocks');
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-open-phase')$q$,'23514','service_obligations_open',
  'completion refuses on the open phase');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.bind('pkg.kitchen','design',1,NULL);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['agreed_phase_unbound:pkg.kitchen'],'F10: an addendum phase with no project phase blocks');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.line(1,NULL);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['ffe_unassigned_to_package'],'F10: a live studio line with no package blocks');
SELECT pg_temp.package('pkg.attic','excluded','{"purchasing":"studio","installation":"studio"}');
SELECT pg_temp.line(1,'pkg.attic');
SELECT pg_temp.line(2,'pkg.porch');
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['package_key_not_in_edition:pkg.porch']
  AND pg_temp.codes('informational')=ARRAY['package_excluded:pkg.attic'],
  'F10/R10: a line in an excluded package does not block; a key in no package of the edition does');
SELECT pg_temp.fulfilment(9,'pkg.porch');
SELECT pg_temp.assert_true((pg_temp.derive()->'blockers'->0->>'count')::int=2,'R10: a fulfilment keyed outside the edition blocks too');
SELECT pg_temp.package('pkg.porch','excluded','{}');
SELECT pg_temp.assert_true(pg_temp.codes()='{}' AND pg_temp.codes('informational')=ARRAY['external_fulfilment_open:pkg.porch',
  'package_excluded:pkg.attic','package_excluded:pkg.porch'],'R10: the key set to excluded does not block');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.package('pkg.den','included','{"purchasing":"studio","payer":"client","installation":"gc"}');
SELECT pg_temp.line(1,'pkg.den','delivered');
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_line_open:pkg.den'],'a live studio line not installed blocks');
SELECT pg_temp.line(1,'pkg.den','installed');
SELECT pg_temp.assert_true(pg_temp.codes()='{}','an installed studio line clears');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.package('pkg.yard','included','{"purchasing":"client","installation":"gc"}');
SELECT pg_temp.fulfilment(1,'pkg.yard','contracted');
SELECT pg_temp.line(1,'pkg.yard','specified',pg_temp.fid('d000',1));
SELECT pg_temp.replica(true);
INSERT INTO public.install_punch_items(project_id,ffe_item_id,note) VALUES (pg_temp.project(),pg_temp.fid('b000',1),'Scuff');
SELECT pg_temp.replica(false);
SELECT pg_temp.assert_true(pg_temp.codes()='{}' AND pg_temp.codes('informational')=ARRAY['external_fulfilment_open:pkg.yard',
  'punch_item_open'],'external work whose installation is not studio, and an open punch item, are informational');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.replica(true);
INSERT INTO public.client_decisions(designer_client_id,title,designer_id,project_id,status)
VALUES ('f8882000-0000-4000-8000-000000000001','Pick a tile',pg_temp.uid(1),pg_temp.project(),'pending');
INSERT INTO public.scope_change_requests(project_id,requested_by,title,description,status)
VALUES (pg_temp.project(),pg_temp.uid(1),'Add a bar','Wet bar','sent');
SELECT pg_temp.replica(false);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['client_decision_unresolved','scope_change_unresolved'],
  'unresolved decisions and scope changes block');
ROLLBACK TO SAVEPOINT v;

-- Studio installation on client-bought goods (SQ-1851 R8).
SELECT pg_temp.package('pkg.bath','included','{"purchasing":"client","payer":"client","installation":"studio"}');
SELECT pg_temp.fulfilment(1,'pkg.bath','received');
SELECT pg_temp.line(1,'pkg.bath','delivered',pg_temp.fid('d000',1));
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_installation_open:pkg.bath'],
  'R8: a converted external line not installed blocks the studio installation');
SELECT pg_temp.line(1,'pkg.bath','installed',pg_temp.fid('d000',1));
SELECT pg_temp.event(pg_temp.fid('d000',1),'installed',false);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_installation_open:pkg.bath'],
  'R8: a reported installed event does not clear it');
SELECT pg_temp.event(pg_temp.fid('d000',1),'installed',true);
SELECT pg_temp.assert_true(pg_temp.codes()='{}','R8: the verified installed event clears it');
SELECT pg_temp.line(1,'pkg.bath','delivered',pg_temp.fid('d000',1));
SELECT pg_temp.package('pkg.bath','included','{"purchasing":"client","payer":"client","installation":"client"}');
SELECT pg_temp.assert_true(pg_temp.codes()='{}','R8: the same package with installation=client does not block');
ROLLBACK TO SAVEPOINT v;

-- Unbound service obligations (SQ-1857 T3, SQ-1862 U1).
SELECT pg_temp.package('pkg.dining','included','{"purchasing":"client","payer":"client","design":"studio","installation":"studio"}');
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_design_unbound:pkg.dining','studio_installation_unbound:pkg.dining'],
  'T3: an unbound studio design and installation both block; the kitchen phase discharges nothing');
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-unbound')$q$,'23514','studio_design_unbound:pkg.dining',
  'T3: completion refuses with the unbound codes, even with an accepted acceptance');
SAVEPOINT t3;
SELECT pg_temp.bind(NULL,NULL,NULL,pg_temp.phase(2));
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_design_unbound:pkg.dining','studio_installation_unbound:pkg.dining'],
  'T3: a phase bound to no package discharges nothing');
SELECT pg_temp.bind('pkg.dining','design',1,pg_temp.phase(3));
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_installation_unbound:pkg.dining'],
  'U1: a completed design binding clears design but not installation');
SELECT pg_temp.bind('pkg.dining','installation',1,pg_temp.phase(4));
SELECT pg_temp.assert_true(pg_temp.codes()='{}','T3: a binding under installation clears installation');
ROLLBACK TO SAVEPOINT t3;
SELECT pg_temp.fulfilment(2,'pkg.dining','received');
SELECT pg_temp.line(2,'pkg.dining','installed',pg_temp.fid('d000',2));
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_design_unbound:pkg.dining','studio_installation_open:pkg.dining'],
  'T3: a converted external line clears installation_unbound and blocks as installation_open');
SELECT pg_temp.event(pg_temp.fid('d000',2),'installed',true);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_design_unbound:pkg.dining'],'T3: the verified install clears it');
ROLLBACK TO SAVEPOINT t3;
SELECT pg_temp.package('pkg.dining','excluded','{"design":"studio","installation":"studio"}');
SELECT pg_temp.package('pkg.study','included','{"design":"client","installation":"gc"}');
SELECT pg_temp.assert_true(pg_temp.codes()='{}','T3: excluded, or design/installation other than studio, adds no unbound blocker');
ROLLBACK TO SAVEPOINT v;

-- U1: design done in E1, installation added later as studio (owed since 2).
SELECT pg_temp.package('pkg.kitchen','included','{"design":"studio","installation":"studio"}',1,2);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_installation_unbound:pkg.kitchen'],
  'U1: installation owed since 2 is unbound; the E1 design phase still clears design');
SELECT pg_temp.bind('pkg.kitchen','installation',2,NULL);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['agreed_phase_unbound:pkg.kitchen'],
  'U1: Q under installation clears installation_unbound and blocks as agreed_phase_unbound');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.package('pkg.kitchen','included','{"design":"studio","installation":"studio"}',1,2);
SELECT pg_temp.line(3,'pkg.kitchen');
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_installation_open:pkg.kitchen'],
  'U1: a live member line assigned after A2 clears unbound and blocks until installed');
ROLLBACK TO SAVEPOINT v;
SELECT pg_temp.bind('pkg.kitchen','installation',1,pg_temp.phase(5));
SELECT pg_temp.package('pkg.kitchen','included','{"design":"studio","installation":"studio"}',1,3);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_installation_unbound:pkg.kitchen'],
  'U1 interrupted run: R bound in 1 does not discharge installation owed since 3');
SELECT pg_temp.package('pkg.kitchen','included','{"design":"studio","installation":"studio"}',1,1);
SELECT pg_temp.assert_true(pg_temp.codes()='{}','U1 uninterrupted run: carried owed_since keeps the E1 binding');
SELECT pg_temp.package('pkg.kitchen','included','{"design":"studio","installation":"studio"}',NULL,1);
SELECT pg_temp.assert_true(pg_temp.codes()=ARRAY['studio_design_unbound:pkg.kitchen'],'a NULL owed_since fails closed');
ROLLBACK TO SAVEPOINT v;

-- Edition and capability states.
SELECT pg_temp.replica(true);
UPDATE public.project_scope_editions SET status='stale' WHERE id=pg_temp.ed();
SELECT pg_temp.replica(false);
SELECT pg_temp.assert_true(pg_temp.codes() @> ARRAY['scope_edition_not_active','acceptance_not_accepted'],
  'no active edition blocks');
ROLLBACK TO SAVEPOINT v;
UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';
SELECT pg_temp.assert_true(pg_temp.codes() @> ARRAY['scope_editions_inactive'],'scope_editions off blocks in the derivation');
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-off')$q$,'55000','scope_editions_inactive',
  'F8: completion refuses while scope_editions is off');
ROLLBACK TO SAVEPOINT v;
RELEASE SAVEPOINT v;

-- Completion: authority, stale hash, financial hold (R20), no project-level side effects.
SELECT pg_temp.replica(true);
INSERT INTO public.invoices(id,project_id,designer_id,invoice_number,status,total_cents,amount_paid_cents,tax_rate)
VALUES ('f888f000-0000-4000-8000-000000000001',pg_temp.project(),pg_temp.uid(1),'SC-1','sent',50000,10000,0);
SELECT pg_temp.replica(false);
SELECT pg_temp.assert_true((pg_temp.derive()->'financialHold'->>'balanceCents')::bigint=40000
  AND (pg_temp.derive()->'financialHold'->>'openInvoiceCount')::int=1 AND pg_temp.codes()='{}',
  'an invoice balance is a financial hold, not a blocker');
SELECT pg_temp.hash() AS hash_before_payment \gset
SELECT pg_temp.replica(true);
UPDATE public.invoices SET amount_paid_cents=20000 WHERE id='f888f000-0000-4000-8000-000000000001';
SELECT pg_temp.replica(false);
SELECT pg_temp.assert_true(pg_temp.hash()=:'hash_before_payment'
  AND (pg_temp.derive()->'financialHold'->>'balanceCents')::bigint=30000,'R20: a payment moves the hold, never the hash');
SELECT pg_temp.actor(7);
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-outsider')$q$,'42501',NULL,'outsider cannot complete');
SELECT pg_temp.actor(2);
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-member')$q$,'42501',NULL,'a plain studio member cannot complete');
SELECT pg_temp.actor(5);
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-client')$q$,'42501',NULL,'the client cannot complete');
SELECT pg_temp.actor(1);
SELECT pg_temp.expect_error(format($q$SELECT public.complete_studio_service(%L,%L,repeat('0',64),'k-stale')$q$,
  pg_temp.project(),pg_temp.req('a1')),'40001','stale_obligations','a stale obligation hash refuses');
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete(NULL)$q$,'23514','client_request_id_invalid','completion needs a key');
CREATE TEMP TABLE before_completion AS
SELECT (SELECT to_jsonb(p) FROM public.projects p WHERE p.id=pg_temp.project()) AS project,
  (SELECT count(*) FROM public.client_edition_requests WHERE project_id=pg_temp.project()) AS edition_requests,
  (SELECT COALESCE(jsonb_agg(frozen_at ORDER BY id),'[]') FROM public.client_editions WHERE project_id=pg_temp.project()) AS frozen;
INSERT INTO sa_results VALUES('c1',pg_temp.complete('k-c1'));
INSERT INTO sa_results VALUES('c1-replay',pg_temp.complete('k-c1'));
SELECT pg_temp.assert_true(pg_temp.v('c1')->>'state'='completed' AND (pg_temp.v('c1')->>'conditionsOpen')::int=0
  AND NOT (pg_temp.v('c1')->>'replayed')::boolean,'the designer completes the studio service');
SELECT pg_temp.assert_true(pg_temp.v('c1-replay')->>'completionId'=pg_temp.v('c1')->>'completionId'
  AND (pg_temp.v('c1-replay')->>'replayed')::boolean,'completion replays its receipt by client request id');
SELECT pg_temp.assert_true((SELECT c.financial_hold->>'balanceCents'='30000' AND c.obligation_hash=:'hash_before_payment'
  AND NOT c.obligation_snapshot ? 'financialHold' AND c.acceptance_request_id=pg_temp.req('a1') AND c.completed_by=pg_temp.uid(1)
  FROM public.studio_service_completions c WHERE c.id=(pg_temp.v('c1')->>'completionId')::uuid),
  'R20: the hold is stored as read, outside the hashed snapshot');
SELECT pg_temp.assert_true((SELECT b.project=(SELECT to_jsonb(p) FROM public.projects p WHERE p.id=pg_temp.project())
  AND b.edition_requests=(SELECT count(*) FROM public.client_edition_requests WHERE project_id=pg_temp.project())
  AND b.frozen=(SELECT COALESCE(jsonb_agg(frozen_at ORDER BY id),'[]') FROM public.client_editions WHERE project_id=pg_temp.project())
  FROM before_completion b),'no project-level side effects: projects row, client_edition_requests and frozen_at unchanged');
SELECT pg_temp.expect_error(format($q$SELECT public.complete_studio_service(%L,%L,repeat('1',64),'k-c1')$q$,
  pg_temp.project(),pg_temp.req('a1')),'23505','idempotency_key_reused','a reused key with other input refuses');
SELECT pg_temp.expect_error($q$SELECT pg_temp.complete('k-c2')$q$,'23505','service_already_completed',
  'one live completion per edition');
SELECT pg_temp.expect_error(format($q$SELECT public.close_project(%L,pg_temp.closeout(),'{}')$q$,pg_temp.project()),
  '23514','still carry a balance','close_project still refuses on the balance');

-- Reads: the studio sees the hold; the client sees state, dates and the accepted scope only.
SELECT pg_temp.actor(2);
SELECT pg_temp.assert_true((public.get_studio_service_completion(pg_temp.project())->'completions'->0->'financialHold'->>'balanceCents')='30000',
  'the studio reads the completion with its hold');
SELECT pg_temp.actor(5);
SELECT pg_temp.assert_true((SELECT c->>'state'='completed' AND c->>'scopeEditionId'=pg_temp.ed()::text
  AND NOT c ? 'financialHold' AND NOT c ? 'obligationSnapshot' AND NOT c ? 'openConditionIds'
  AND public.get_studio_service_completion(pg_temp.project())->>'audience'='client'
  FROM jsonb_array_elements(public.get_studio_service_completion(pg_temp.project())->'completions') c),
  'the client projection has no hold or obligation detail');
SELECT pg_temp.actor(4);
SELECT pg_temp.expect_error(format('SELECT public.get_studio_service_completion(%L)',pg_temp.project()),'42501',NULL,
  'another studio cannot read the completion');
SELECT pg_temp.actor(1);

-- Capability-guarded immutability.
SELECT pg_temp.expect_error(format('UPDATE public.studio_service_completions SET revoke_reason=''x'' WHERE id=%L',
  pg_temp.v('c1')->>'completionId'),'42501','service_completion_write_unauthorized','direct update is refused');
SELECT pg_temp.expect_error(format('DELETE FROM public.studio_service_completions WHERE id=%L',pg_temp.v('c1')->>'completionId'),
  '23514','service_completion_immutable','completions are never deleted');
SELECT pg_temp.expect_error(format($q$DO $d$ BEGIN PERFORM set_config('app.service_completion_id',%L,true);
  UPDATE public.studio_service_completions SET state='completed_with_conditions' WHERE id=%L; END $d$$q$,
  pg_temp.v('c1')->>'completionId',pg_temp.v('c1')->>'completionId'),'23514','service_completion_transition_invalid',
  'even under the capability setting, completed never returns to completed_with_conditions');
SELECT pg_temp.expect_error(format($q$DO $d$ BEGIN PERFORM set_config('app.service_completion_id','f888f100-0000-4000-8000-000000000001',true);
  INSERT INTO public.studio_service_completions(id,project_id,scope_edition_id,acceptance_request_id,state,obligation_snapshot,
  obligation_hash,financial_hold,completed_by,client_request_id,request_hash) VALUES ('f888f100-0000-4000-8000-000000000001',
  %L,%L,%L,'completed_with_conditions','{}',repeat('a',64),'{}',%L,'k-direct','h'); END $d$$q$,
  pg_temp.project(),pg_temp.ed(),pg_temp.req('a1'),pg_temp.uid(1)),'23514','studio_service_completions_state_ck',
  'completed_with_conditions without an open condition violates the CHECK');

-- Revocation: owner/admin only, reason required, history kept.
SELECT pg_temp.actor(2);
SELECT pg_temp.expect_error(format($q$SELECT public.revoke_studio_service_completion(%L,'Member says no')$q$,
  pg_temp.v('c1')->>'completionId'),'42501',NULL,'a plain member cannot revoke');
SELECT pg_temp.actor(3);
SELECT pg_temp.expect_error(format($q$SELECT public.revoke_studio_service_completion(%L,'  ')$q$,
  pg_temp.v('c1')->>'completionId'),'23514','service_completion_revoke_invalid','revocation needs a reason');
INSERT INTO sa_results VALUES('rv1',public.revoke_studio_service_completion((pg_temp.v('c1')->>'completionId')::uuid,'Punch list reopened'));
INSERT INTO sa_results VALUES('rv1-replay',public.revoke_studio_service_completion((pg_temp.v('c1')->>'completionId')::uuid,'Punch list reopened'));
SELECT pg_temp.assert_true(NOT (pg_temp.v('rv1')->>'replayed')::boolean AND (pg_temp.v('rv1-replay')->>'replayed')::boolean
  AND (SELECT revoked_by=pg_temp.uid(3) AND state='completed' FROM public.studio_service_completions
    WHERE id=(pg_temp.v('c1')->>'completionId')::uuid),'the admin revokes; the replay returns the same act');
SELECT pg_temp.expect_error(format($q$SELECT public.revoke_studio_service_completion(%L,'Another reason')$q$,
  pg_temp.v('c1')->>'completionId'),'55000','service_completion_revoked','a revoked completion is not revoked again');
SELECT pg_temp.actor(1);

-- K3 Option A: complete with conditions; the last resolution moves it to completed.
SELECT pg_temp.accepted('a2','[{"text":"Touch up the paint"},{"text":"Replace the knob"}]');
SELECT pg_temp.assert_true(pg_temp.codes()='{}' AND (pg_temp.derive()->'acceptance'->>'outcome')='accepted_with_conditions'
  AND jsonb_array_length(pg_temp.derive()->'conditions')=2 AND pg_temp.current_req()=pg_temp.req('a2'),
  'open conditions are listed, never blockers');
SELECT pg_temp.actor(7);
SELECT pg_temp.expect_error(format($q$SELECT pg_temp.settle(%L,%L,'r-outsider')$q$,pg_temp.req('a2'),pg_temp.condition(pg_temp.req('a2'),1)),
  '42501',NULL,'outsider cannot resolve');
SELECT pg_temp.actor(1);
SELECT pg_temp.expect_error(format($q$SELECT public.resolve_service_acceptance_condition(%L,%L,'Done','{"note":"x"}','r-bad')$q$,
  pg_temp.req('a2'),pg_temp.condition(pg_temp.req('a2'),1)),'23514','service_acceptance_resolution_invalid',
  'evidence must name an issue, a storage object or a site request');
INSERT INTO sa_results VALUES('res1',pg_temp.settle(pg_temp.req('a2'),pg_temp.condition(pg_temp.req('a2'),1),'r-1'));
SELECT pg_temp.assert_true(pg_temp.v('res1')->>'completionId' IS NULL AND jsonb_array_length(pg_temp.derive()->'conditions')=1,
  'a resolution keyed by request works before any completion exists');
SELECT pg_temp.expect_error(format($q$SELECT pg_temp.settle(%L,%L,'r-again')$q$,pg_temp.req('a2'),pg_temp.condition(pg_temp.req('a2'),1)),
  '23505','service_acceptance_condition_resolved','an already-resolved condition refuses');
SELECT pg_temp.expect_error(format($q$SELECT pg_temp.settle(%L,gen_random_uuid(),'r-unknown')$q$,pg_temp.req('a2')),
  '23514','service_acceptance_condition_unknown','an unknown condition refuses');
INSERT INTO sa_results VALUES('c2',pg_temp.complete('k-c2'));
SELECT pg_temp.assert_true(pg_temp.v('c2')->>'state'='completed_with_conditions' AND (pg_temp.v('c2')->>'conditionsOpen')::int=1
  AND (SELECT open_condition_ids=ARRAY[pg_temp.condition(pg_temp.req('a2'),2)] FROM public.studio_service_completions
    WHERE id=(pg_temp.v('c2')->>'completionId')::uuid),'Option A: completion succeeds with the open condition recorded');
INSERT INTO sa_results VALUES('res2',pg_temp.settle(pg_temp.req('a2'),pg_temp.condition(pg_temp.req('a2'),2),'r-2'));
INSERT INTO sa_results VALUES('res2-replay',pg_temp.settle(pg_temp.req('a2'),pg_temp.condition(pg_temp.req('a2'),2),'r-2'));
SELECT pg_temp.assert_true(pg_temp.v('res2')->>'completionState'='completed' AND pg_temp.v('res2')->>'completionId'=pg_temp.v('c2')->>'completionId'
  AND (SELECT state='completed' AND conditions_closed_at IS NOT NULL AND cardinality(open_condition_ids)=1
    FROM public.studio_service_completions WHERE id=(pg_temp.v('c2')->>'completionId')::uuid)
  AND (pg_temp.v('res2-replay')->>'replayed')::boolean,'Option A: the last resolution moves the completion to completed in its transaction');
SELECT pg_temp.assert_true((public.get_studio_service_completion(pg_temp.project())->'resolutions'->1->>'conditionId')
  =pg_temp.condition(pg_temp.req('a2'),2)::text,'the studio read lists the resolutions');
SELECT pg_temp.expect_error(format('INSERT INTO public.service_acceptance_condition_resolutions(request_id,condition_id,response_id,
  resolution,evidence,resolved_by,client_request_id,request_hash) SELECT request_id,gen_random_uuid(),response_id,''x'',''{}'',resolved_by,
  ''r-direct'',''h'' FROM public.service_acceptance_condition_resolutions WHERE request_id=%L LIMIT 1',pg_temp.req('a2')),
  '42501','service_acceptance_resolution_unauthorized','direct resolution writes are refused');
UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';
SELECT pg_temp.expect_error(format($q$SELECT pg_temp.settle(%L,gen_random_uuid(),'r-off')$q$,pg_temp.req('a2')),
  '55000','scope_editions_inactive','F8: resolution refuses while scope_editions is off');
SELECT pg_temp.expect_error(format($q$SELECT public.revoke_studio_service_completion(%L,'off')$q$,pg_temp.v('c2')->>'completionId'),
  '55000','scope_editions_inactive','F8: revocation refuses while scope_editions is off');
ROLLBACK;
