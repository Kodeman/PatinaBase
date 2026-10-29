-- RC-7 lane E7 (X08): one FICTIONAL job set holding legacy approvals of every
-- existing kind, C4 service-acceptance requests/responses (portal, paper and a
-- replaced signer), C6 completions and C5 external-fulfilment rows at once.
-- Owned stack only. Apply as one transaction:
--   psql -X -1 -v ON_ERROR_STOP=1 -v owned_port=59122 -v owned_system_id=<id> \
--     postgresql://postgres:postgres@127.0.0.1:59122/postgres -f mixed-fixture.sql
-- Activation (C2/C4/C6 grants, C5 rail + presence grants, scope_editions=true) is local to the
-- owned stack and is not rolled back: the export reads run after commit.
-- Legacy approvals are constructed rows (their creation is not under test);
-- every C4/C5/C6 record is produced by its own RPC as its real actor.
-- Password for every fixture login: password123.
\set ON_ERROR_STOP on
\if :{?owned_port}
\else
DO $$ BEGIN RAISE EXCEPTION 'rc7-e7 fixture refused: owned_port not given'; END $$;
\quit
\endif
\if :{?owned_system_id}
\else
DO $$ BEGIN RAISE EXCEPTION 'rc7-e7 fixture refused: owned_system_id not given'; END $$;
\quit
\endif
SELECT :'HOST' IN ('127.0.0.1','localhost') AND :'PORT' = :'owned_port' AND :'PORT' NOT IN ('54321','54322')
  AND (SELECT system_identifier::text FROM pg_control_system()) = :'owned_system_id' AS owned \gset
\if :owned
\else
DO $$ BEGIN RAISE EXCEPTION 'rc7-e7 fixture refused: not the owned rc7-e7 stack'; END $$;
\quit
\endif
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION pg_temp.uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e7e70000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.card(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e7e76000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.fid(p text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e7e7'||p||'-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN n IS NULL THEN '' ELSE pg_temp.uid(n)::text END,true);
  PERFORM set_config('request.jwt.claims',CASE WHEN n IS NULL THEN '' ELSE jsonb_build_object('sub',pg_temp.uid(n),
    'role','authenticated')::text END,true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.uid(integer),pg_temp.card(integer),pg_temp.fid(text,integer),pg_temp.actor(integer) TO authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'e7e70000-%') THEN
    RAISE EXCEPTION 'rc7-e7 fixture already applied; restart the owned stack for a fresh run';
  END IF;
END $$;

-- ── Local activation (C2 §2.8, C4 §2.8, C6 §2.7) plus the C5 rail ─────────
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid),
  public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text),
  public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text),
  public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text),
  public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text),
  public.review_service_acceptance_paper_intake(uuid,text,text,text,text),
  public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text),
  public.withdraw_service_acceptance_request(uuid,text,text),
  public.present_service_acceptance_offline(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text),
  public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text),
  public.revoke_studio_service_completion(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text),
  public.record_external_fulfilment_event(uuid,text,jsonb,text[],text),
  public.verify_external_fulfilment_event(uuid,text),
  public.bind_fulfilment_evidence(uuid,uuid,text[],text) TO authenticated;

-- ── Actors ───────────────────────────────────────────────────────────────────
-- 1 studio owner/designer · 2 member · 3 admin (paper reviewer) · 4 studio B owner
-- 5 client (decision lead, policy slot "client") · 6 co-client (card 2)
-- 7 partner (card 3; replaced off request 2) · 8 replacement partner (card 5)
-- 9 GC party · 10 outsider
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(instance_id,id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role,
  raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,
  email_change_token_current,phone_change,phone_change_token,reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000',pg_temp.uid(n),'rc7-e7-'||n||'@patina.test',
  extensions.crypt('password123',extensions.gen_salt('bf')),now(),now(),now(),'authenticated','authenticated',
  '{"provider":"email","providers":["email"]}','{}','','','','','','','',''
FROM generate_series(1,10) n;
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data,last_sign_in_at,created_at,updated_at)
SELECT gen_random_uuid(),u.id,u.id::text,'email',jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true),
  now(),now(),now() FROM auth.users u WHERE u.id::text LIKE 'e7e70000-%';
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,CASE WHEN id IN (pg_temp.uid(1),pg_temp.uid(2),pg_temp.uid(3),pg_temp.uid(4)) THEN 'E7 Studio '
  ELSE 'E7 Person ' END||right(id::text,2),
  id IN (pg_temp.uid(1),pg_temp.uid(2),pg_temp.uid(3),pg_temp.uid(4))
FROM auth.users WHERE id::text LIKE 'e7e70000-%'
ON CONFLICT (id) DO UPDATE SET email=excluded.email,full_name=excluded.full_name,is_designer=excluded.is_designer;
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
(pg_temp.fid('1000',1),'design_studio','E7 Studio A','rc7-e7-a','active'),
(pg_temp.fid('1000',2),'design_studio','E7 Studio B','rc7-e7-b','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.uid(1),pg_temp.fid('1000',1),'owner','active'),
(pg_temp.uid(2),pg_temp.fid('1000',1),'member','active'),
(pg_temp.uid(3),pg_temp.fid('1000',1),'admin','active'),
(pg_temp.uid(4),pg_temp.fid('1000',2),'owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id IN (pg_temp.uid(1),pg_temp.uid(2),pg_temp.uid(3),pg_temp.uid(4)) AND r.name='studio_owner';
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id IN (pg_temp.uid(5),pg_temp.uid(6),pg_temp.uid(7),pg_temp.uid(8),pg_temp.uid(10)) AND r.name='client'
ON CONFLICT DO NOTHING;
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id) VALUES
(pg_temp.card(1),pg_temp.fid('1000',1),'person','client','E7 Client',pg_temp.uid(5)),
(pg_temp.card(2),pg_temp.fid('1000',1),'person','client','E7 Co-client',pg_temp.uid(6)),
(pg_temp.card(3),pg_temp.fid('1000',1),'person','client','E7 Partner',pg_temp.uid(7)),
(pg_temp.card(4),pg_temp.fid('1000',1),'person','client','E7 Guest',NULL),
(pg_temp.card(5),pg_temp.fid('1000',1),'person','client','E7 Replacement partner',pg_temp.uid(8)),
(pg_temp.card(7),pg_temp.fid('1000',1),'person','client','E7 Paper A',NULL),
(pg_temp.card(8),pg_temp.fid('1000',1),'person','client','E7 Paper B',NULL);
INSERT INTO public.client_households(id,organization_id,designer_id,display_name,member_person_ids) VALUES
(pg_temp.fid('7000',1),pg_temp.fid('1000',1),pg_temp.uid(1),'E7 household',
 ARRAY[pg_temp.card(1),pg_temp.card(2),pg_temp.card(3),pg_temp.card(4),pg_temp.card(5),pg_temp.card(7),pg_temp.card(8)]);
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source,household_id) VALUES
(pg_temp.fid('2000',1),pg_temp.uid(1),pg_temp.uid(5),'E7 Client','rc7-e7-5@patina.test','active','direct',pg_temp.fid('7000',1));
SET LOCAL session_replication_role=origin;

-- ── Native agreement origin (as service_acceptance_release_fixes_body) ──────
CREATE FUNCTION pg_temp.policy(kind text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('kind','acceptance_signer_policy','partKey','scope.signers','title','Signers','payload',
  jsonb_build_object('policyRevision',1,'signers',CASE kind WHEN 'household' THEN jsonb_build_array(
    jsonb_build_object('slot','client','required',true,'profileId',pg_temp.uid(5)),
    jsonb_build_object('slot','co_client','required',true,'householdPersonId',pg_temp.card(2)),
    jsonb_build_object('slot','partner','required',true,'householdPersonId',pg_temp.card(3)),
    jsonb_build_object('slot','guest','required',false,'householdPersonId',pg_temp.card(4)))
  ELSE jsonb_build_array(
    jsonb_build_object('slot','paper_a','required',true,'householdPersonId',pg_temp.card(7)),
    jsonb_build_object('slot','paper_b','required',true,'householdPersonId',pg_temp.card(8))) END));
$$;
CREATE FUNCTION pg_temp.parts(p uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'variant',variant,'partKey',part_key,'title',title,
   'payload',payload,'required',required,'clientVisible',client_visible) ORDER BY position),'[]')
 FROM public.proposal_agreement_parts WHERE proposal_id=p;
$$;
CREATE FUNCTION pg_temp.draft(p uuid, kind text, title text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE phase_id uuid;
BEGIN
 INSERT INTO public.proposals(id,designer_id,designer_client_id,client_id,title,total_amount,status,valid_until)
 VALUES(p,pg_temp.uid(1),pg_temp.fid('2000',1),pg_temp.uid(5),title,0,'draft',now()+interval '30 days');
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
   jsonb_build_object('kind','scope_package','partKey','scope.cabinets','title','Cabinetry','payload',
     jsonb_build_object('packageKey','pkg.cabinets','label','Cabinetry','inclusion','included',
       'responsibilities',jsonb_build_object('design','gc','purchasing','gc','payer','gc',
         'fabrication_contract','gc','installation','gc'))),
   pg_temp.policy(kind)),'rc7-e7 fixture');
END $$;
CREATE FUNCTION pg_temp.send_and_sign(p uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 snapshot:=public.get_commercial_document_send_snapshot(p);
 PERFORM public.send_commercial_document(p,snapshot->>'documentFingerprint',NULL,now()+interval '30 days');
 PERFORM pg_temp.actor(5);
 PERFORM public.sign_design_services_agreement(p,'E7 Client');
 PERFORM pg_temp.actor(1);
END $$;
CREATE TABLE IF NOT EXISTS public.rc7_e7_fixture_results(key text PRIMARY KEY,value jsonb NOT NULL);
REVOKE ALL ON public.rc7_e7_fixture_results FROM PUBLIC, anon, authenticated;
-- The exporter reads the recorded ids through the service key.
GRANT SELECT ON public.rc7_e7_fixture_results TO service_role;
CREATE FUNCTION pg_temp.v(k text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT value FROM public.rc7_e7_fixture_results WHERE key=k $$;
CREATE FUNCTION pg_temp.keep(k text, v jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.rc7_e7_fixture_results VALUES (k,v) ON CONFLICT (key) DO UPDATE SET value=excluded.value RETURNING value $$;
CREATE FUNCTION pg_temp.req(k text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT (pg_temp.v(k)->>'requestId')::uuid $$;
CREATE FUNCTION pg_temp.project(k text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT (pg_temp.v(k)->>'projectId')::uuid $$;
CREATE FUNCTION pg_temp.ed(k text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.project_scope_editions WHERE project_id=pg_temp.project(k) AND status='active' $$;
CREATE FUNCTION pg_temp.signer(req uuid, s text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.service_acceptance_signers WHERE request_id=req AND slot=s AND status='active' $$;
-- Fixture-side reads of the rows an RPC needs as arguments (never a write).
CREATE FUNCTION pg_temp.rq(id uuid) RETURNS public.service_acceptance_requests LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.service_acceptance_requests WHERE service_acceptance_requests.id=rq.id $$;
CREATE FUNCTION pg_temp.intake(id uuid) RETURNS public.service_acceptance_paper_intakes LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.service_acceptance_paper_intakes WHERE service_acceptance_paper_intakes.id=intake.id $$;
GRANT EXECUTE ON FUNCTION pg_temp.rq(uuid),pg_temp.intake(uuid) TO authenticated,service_role;
-- V22 delivery as the service path (no JWT): claim, deliver, finalize, after-send.
CREATE FUNCTION pg_temp.deliver(req uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d uuid; f timestamptz;
BEGIN
  SELECT outbound_draft_id INTO STRICT d FROM public.service_acceptance_requests WHERE id=req;
  PERFORM pg_temp.actor(NULL);
  PERFORM public.claim_outbound_draft_for_send(d);
  PERFORM public.record_outbound_draft_send_attempt(d);
  PERFORM public.record_outbound_draft_delivery(d,'msg-'||d);
  SELECT finalizing_at INTO f FROM public.claim_outbound_draft_finalize(d);
  PERFORM public.record_outbound_draft_after_send(d,f);
  PERFORM public.mark_outbound_draft_sent(d,pg_temp.uid(1),'msg-'||d);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.v(text),pg_temp.keep(text,jsonb),pg_temp.req(text),pg_temp.project(text),pg_temp.ed(text),
  pg_temp.signer(uuid,text),pg_temp.send_and_sign(uuid) TO authenticated,service_role;
GRANT SELECT, INSERT, UPDATE ON public.rc7_e7_fixture_results TO authenticated;

SELECT pg_temp.actor(1);
SELECT pg_temp.draft(pg_temp.fid('3000',1),'household','E7 household job');
SELECT pg_temp.draft(pg_temp.fid('3000',2),'paper','E7 paper job');
SET LOCAL ROLE authenticated;
SELECT pg_temp.send_and_sign(pg_temp.fid('3000',1));
SELECT pg_temp.keep('origin1',public.countersign_design_services_agreement(pg_temp.fid('3000',1),'E7 Designer'));
SELECT pg_temp.send_and_sign(pg_temp.fid('3000',2));
SELECT pg_temp.keep('origin2',public.countersign_design_services_agreement(pg_temp.fid('3000',2),'E7 Designer'));
RESET ROLE;

-- Evidence manifests (constructed, as every C4 SQL suite does).
SET LOCAL session_replication_role=replica;
INSERT INTO public.evidence_manifests(id,project_id,package_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by) VALUES
(pg_temp.fid('8000',1),pg_temp.project('origin1'),NULL,'service_acceptance','[]',repeat('a',64),repeat('1',64),'e7-m1',pg_temp.uid(1)),
(pg_temp.fid('8000',2),pg_temp.project('origin2'),NULL,'service_acceptance','[]',repeat('b',64),repeat('2',64),'e7-m2',pg_temp.uid(1));
SET LOCAL session_replication_role=origin;

-- ── C4 on job 1: request 1 returned; request 2 with a replaced signer ──────
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('r1',public.create_service_acceptance_request(pg_temp.project('origin1'),pg_temp.ed('origin1'),pg_temp.fid('8000',1),'e7-r1'));
RESET ROLE;
SELECT pg_temp.deliver(pg_temp.req('r1'));
SELECT pg_temp.actor(5);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('r1-client',public.respond_service_acceptance(r.id,'return','[]'::jsonb,'The kitchen scope is missing the island',
  r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision,'e7-r1-client'))
FROM pg_temp.rq(pg_temp.req('r1')) r;
SELECT pg_temp.actor(1);
SELECT pg_temp.keep('r2',public.create_service_acceptance_request(pg_temp.project('origin1'),pg_temp.ed('origin1'),pg_temp.fid('8000',1),'e7-r2'));
RESET ROLE;
SELECT pg_temp.deliver(pg_temp.req('r2'));
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('r2-replace',public.replace_service_acceptance_signer(r.id,pg_temp.signer(r.id,'partner'),NULL,pg_temp.card(5),
  r.signer_policy_revision,'Partner moved out; the studio names the new partner','e7-r2-replace'))
FROM pg_temp.rq(pg_temp.req('r2')) r;
SELECT pg_temp.actor(5);
SELECT pg_temp.keep('r2-client',public.respond_service_acceptance(r.id,'accept_with_conditions','[{"text":"Keep the oak floor"}]'::jsonb,NULL,
  r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision,'e7-r2-client'))
FROM pg_temp.rq(pg_temp.req('r2')) r;
SELECT pg_temp.actor(6);
SELECT pg_temp.keep('r2-co',public.respond_service_acceptance(r.id,'accept','[]'::jsonb,NULL,
  r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision,'e7-r2-co'))
FROM pg_temp.rq(pg_temp.req('r2')) r;
SELECT pg_temp.actor(8);
SELECT pg_temp.keep('r2-partner',public.respond_service_acceptance(r.id,'accept','[]'::jsonb,NULL,
  r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision,'e7-r2-partner'))
FROM pg_temp.rq(pg_temp.req('r2')) r;
RESET ROLE;

-- ── C4 on job 2: offline presentation, two paper intakes, admin review ─────
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('p1',public.create_service_acceptance_request(pg_temp.project('origin2'),pg_temp.ed('origin2'),pg_temp.fid('8000',2),'e7-p1'));
SELECT pg_temp.actor(3);
SELECT pg_temp.keep('p1-present',public.present_service_acceptance_offline(r.id,r.scope_content_hash,r.evidence_manifest_hash,'e7-p1-present'))
FROM pg_temp.rq(pg_temp.req('p1')) r;
RESET ROLE;
INSERT INTO storage.objects(id,bucket_id,name,owner_id,version,metadata)
SELECT pg_temp.fid('9000',n),'service-acceptance-paper',pg_temp.project('origin2')||'/'||pg_temp.fid('9000',n)||'.pdf',
  pg_temp.uid(1)::text,'v-'||n,jsonb_build_object('mimetype','application/pdf','size',2048,'eTag','"etag-'||n||'"')
FROM generate_series(1,2) n;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('pa',public.record_service_acceptance_paper_intake(r.id,pg_temp.signer(r.id,'paper_a'),pg_temp.fid('9000',1),current_date,
  'E7 Paper A','accept','[]'::jsonb,NULL,r.request_number,r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision,'e7-pa'))
FROM pg_temp.rq(pg_temp.req('p1')) r;
SELECT pg_temp.keep('pb',public.record_service_acceptance_paper_intake(r.id,pg_temp.signer(r.id,'paper_b'),pg_temp.fid('9000',2),current_date,
  'E7 Paper B','accept','[]'::jsonb,NULL,r.request_number,r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision,'e7-pb'))
FROM pg_temp.rq(pg_temp.req('p1')) r;
RESET ROLE;
-- WP-10C's hash stamp as the service path (no JWT).
SELECT pg_temp.actor(NULL);
SET LOCAL ROLE service_role;
SELECT pg_temp.keep(k||'-stamp',public.stamp_service_acceptance_paper_hash(i.id,encode(extensions.digest('e7-'||k,'sha256'),'hex'),
  i.storage_object_version,i.storage_object_etag))
FROM (VALUES ('pa'),('pb')) x(k) CROSS JOIN LATERAL pg_temp.intake((pg_temp.v(x.k)->>'intakeId')::uuid) i;
RESET ROLE;
SELECT pg_temp.actor(3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep(k||'-review',public.review_service_acceptance_paper_intake((pg_temp.v(k)->>'intakeId')::uuid,'confirmed',
  pg_temp.v(k||'-stamp')->>'documentSha256',NULL,'e7-'||k||'-review'))
FROM (VALUES ('pa'),('pb')) x(k);
RESET ROLE;

-- ── C4 on job 3: request withdrawn, successor sent and still open ─────────
SELECT pg_temp.actor(1);
SELECT pg_temp.draft(pg_temp.fid('3000',3),'household','E7 open job');
SET LOCAL ROLE authenticated;
SELECT pg_temp.send_and_sign(pg_temp.fid('3000',3));
SELECT pg_temp.keep('origin3',public.countersign_design_services_agreement(pg_temp.fid('3000',3),'E7 Designer'));
RESET ROLE;
SET LOCAL session_replication_role=replica;
INSERT INTO public.evidence_manifests(id,project_id,package_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by) VALUES
(pg_temp.fid('8000',3),pg_temp.project('origin3'),NULL,'service_acceptance','[]',repeat('c',64),repeat('3',64),'e7-m3',pg_temp.uid(1));
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('s1',public.create_service_acceptance_request(pg_temp.project('origin3'),pg_temp.ed('origin3'),pg_temp.fid('8000',3),'e7-s1'));
RESET ROLE;
SELECT pg_temp.deliver(pg_temp.req('s1'));
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('s1-withdraw',public.withdraw_service_acceptance_request(pg_temp.req('s1'),'Fictional: wrong drawing set cited','e7-s1-withdraw'));
SELECT pg_temp.keep('s2',public.create_service_acceptance_request(pg_temp.project('origin3'),pg_temp.ed('origin3'),pg_temp.fid('8000',3),'e7-s2'));
RESET ROLE;
SELECT pg_temp.deliver(pg_temp.req('s2'));

-- ── C6: complete both studio services (the designer, through the RPC) ─────
-- The agreed design phase is finished first, through advance_project_phase.
CREATE FUNCTION pg_temp.open_phases(p uuid) RETURNS TABLE(id uuid, status text) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id,status FROM public.project_phases WHERE project_id=p AND status IN ('in_progress','delayed') ORDER BY sort_order,id $$;
GRANT EXECUTE ON FUNCTION pg_temp.open_phases(uuid) TO authenticated;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT k,public.advance_project_phase(pg_temp.project(k),ph.id,ph.status)
FROM (VALUES ('origin1'),('origin2')) x(k) CROSS JOIN LATERAL pg_temp.open_phases(pg_temp.project(k)) ph;
SELECT pg_temp.keep('c1',public.complete_studio_service(pg_temp.project('origin1'),pg_temp.req('r2'),
  (public.derive_studio_service_obligations(pg_temp.project('origin1'))->>'obligationHash'),'e7-c1'));
SELECT pg_temp.keep('c2',public.complete_studio_service(pg_temp.project('origin2'),pg_temp.req('p1'),
  (public.derive_studio_service_obligations(pg_temp.project('origin2'))->>'obligationHash'),'e7-c2'));
SELECT pg_temp.keep('c2-revoke',public.revoke_studio_service_completion((pg_temp.v('c2')->>'completionId')::uuid,
  'Fictional: punch list reopened'));
RESET ROLE;

-- ── C5: external fulfilment on job 1 (the designer, through the RPC) ───────
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('x-gc',public.create_external_fulfilment(pg_temp.project('origin1'),pg_temp.ed('origin1'),'pkg.cabinets',
  'gc_cabinetry',ARRAY['k-1','k-2'],NULL,NULL,'e7-x-gc'));
SELECT pg_temp.keep('x-client',public.create_external_fulfilment(pg_temp.project('origin1'),pg_temp.ed('origin1'),'pkg.kitchen',
  'client_furnishing',ARRAY['chair','table'],NULL,NULL,'e7-x-client'));
SELECT pg_temp.keep('x-contract',public.record_external_fulfilment_event((pg_temp.v('x-client')->>'fulfilmentId')::uuid,
  'contract_reported','{"contractAmountCents":200000}',NULL,'e7-x-contract'));
RESET ROLE;

-- ── C5 presence: one studio FF&E line and one converted to the client rail ──
CREATE FUNCTION pg_temp.ffe_version(id uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT row_version FROM public.project_ffe_items WHERE project_ffe_items.id=ffe_version.id $$;
GRANT EXECUTE ON FUNCTION pg_temp.ffe_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text) TO authenticated;
SET LOCAL session_replication_role=replica;
INSERT INTO public.project_ffe_items(id,project_id,name,selection_thread_id,unit_price_cents,line_total_cents,
 quantity,trade_price_cents,retail_unit_cents,price_basis,currency,design_disposition)
SELECT pg_temp.fid('c000',n),pg_temp.project('origin1'),t.name,pg_temp.fid('c100',n),120000,120000,1,80000,120000,'markup','USD','selected'
FROM (VALUES (1,'E7 studio dining table'),(2,'E7 client-bought chair')) t(n,name);
INSERT INTO public.project_ffe_selection_threads(id,project_id,primary_ffe_item_id,created_by)
SELECT pg_temp.fid('c100',n),pg_temp.project('origin1'),pg_temp.fid('c000',n),pg_temp.uid(1) FROM generate_series(1,2) n;
SET LOCAL session_replication_role=origin;
UPDATE public.project_ffe_items SET notes=notes WHERE id IN (pg_temp.fid('c000',1),pg_temp.fid('c000',2));
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.keep('x-convert',public.set_ffe_item_external_fulfilment(pg_temp.fid('c000',2),
  (pg_temp.v('x-client')->>'fulfilmentId')::uuid,pg_temp.ffe_version(pg_temp.fid('c000',2)),'e7-x-convert'));
RESET ROLE;

-- ── Legacy approvals of every existing kind (constructed rows) ──────────────
-- Stage-2 project_artifact_v1: plan_issue (pending), spec_book_artifact (draft
-- review), budget_version (responded, approved), plan_issue withdrawn, plan_issue
-- superseded by the pending one. Legacy client decisions: selection (pending,
-- options), signoff (pending), submittal in the designer's court, responded selection.
SET LOCAL session_replication_role=replica;
INSERT INTO public.client_decisions(id,designer_client_id,title,designer_id,project_id,approval_contract,decision_type,
  decision_kind,coordination_kind,court,phase_id,blocking_status,blocks_kind,status,sent_at,responded_at,due_date,created_at,updated_at)
SELECT pg_temp.fid('a000',n),pg_temp.fid('2000',1),t.title,pg_temp.uid(1),pg_temp.project('origin1'),'project_artifact_v1',
  'approval','approval','signoff','client',pg_temp.fid('a200',1),'blocks_phase','phase',t.status,
  CASE WHEN t.status<>'draft' THEN now()-interval '2 days' END,CASE WHEN t.status='responded' THEN now()-interval '1 day' END,
  now()+interval '7 days',now()-make_interval(mins=>60-n),now()-make_interval(mins=>60-n)
FROM (VALUES (1,'E7 plan issue','pending'),(2,'E7 spec book','draft'),(3,'E7 budget','responded'),
             (4,'E7 withdrawn plan','expired'),(5,'E7 superseded plan','expired')) t(n,title,status);
INSERT INTO public.project_decision_authority_snapshots(decision_id,project_id,decision_lead_id,authority_revision,assigned_by)
SELECT pg_temp.fid('a000',n),pg_temp.project('origin1'),pg_temp.uid(5),1,pg_temp.uid(1) FROM generate_series(1,5) n;
INSERT INTO public.project_approval_artifacts(decision_id,project_id,source_kind,source_id,source_version,artifact_hash,
  artifact_title,question,due_at,phase_id,cost_cents_delta,schedule_days_delta,lead_time_days_delta,source_snapshot)
SELECT pg_temp.fid('a000',n),pg_temp.project('origin1'),t.kind,pg_temp.fid('a100',n),1,repeat(t.h,64),t.title,
  'Approve '||t.title||'?',now()+interval '7 days',pg_temp.fid('a200',1),n*100,0,0,'{}'
FROM (VALUES (1,'plan_issue','d','E7 plan issue'),(2,'spec_book_artifact','e','E7 spec book'),
             (3,'budget_version','f','E7 budget'),(4,'plan_issue','0','E7 withdrawn plan'),
             (5,'plan_issue','9','E7 superseded plan')) t(n,kind,h,title);
-- Every issued row was reviewed before it was sent (the real publish order);
-- the draft spec book still waits on the lead's review.
INSERT INTO public.project_decision_review_confirmations(decision_id,project_id,authority_revision,approver_id,
  approver_role,artifact_hash,review_method)
SELECT pg_temp.fid('a000',n),pg_temp.project('origin1'),1,pg_temp.uid(5),'lead',repeat(h,64),'portal_clickthrough'
FROM (VALUES (1,'d'),(3,'f'),(4,'0'),(5,'9')) t(n,h);
INSERT INTO public.client_decision_options(id,decision_id,name,selected,approves,approval_outcome,sort_order,
  cost_cents_delta,schedule_days_delta,lead_time_days_delta) VALUES
(pg_temp.fid('a300',3),pg_temp.fid('a000',3),'Approve',true,true,'approved',0,300,0,0);
INSERT INTO public.project_approval_action_receipts(project_id,decision_id,action_kind,idempotency_key,request_hash,actor_id,result,successor_decision_id) VALUES
(pg_temp.project('origin1'),pg_temp.fid('a000',4),'withdrawn','e7-withdraw',repeat('4',64),pg_temp.uid(1),'{}',NULL),
(pg_temp.project('origin1'),pg_temp.fid('a000',5),'superseded','e7-supersede',repeat('5',64),pg_temp.uid(1),'{}',pg_temp.fid('a000',1));
INSERT INTO public.client_decisions(id,designer_client_id,title,designer_id,project_id,decision_type,decision_kind,
  coordination_kind,court,status,sent_at,responded_at,created_at,updated_at) VALUES
(pg_temp.fid('b000',1),pg_temp.fid('2000',1),'E7 legacy sofa selection',pg_temp.uid(1),pg_temp.project('origin1'),'product','choice','selection','client','pending',now(),NULL,now()-interval '3 hours',now()),
(pg_temp.fid('b000',2),pg_temp.fid('2000',1),'E7 legacy drawing signoff',pg_temp.uid(1),pg_temp.project('origin1'),'approval','approval','signoff','client','pending',now(),NULL,now()-interval '2 hours',now()),
(pg_temp.fid('b000',3),pg_temp.fid('2000',1),'E7 legacy GC submittal',pg_temp.uid(1),pg_temp.project('origin1'),'approval','approval','submittal','designer','pending',now(),NULL,now()-interval '1 hours',now()),
(pg_temp.fid('b000',4),pg_temp.fid('2000',1),'E7 legacy rug selection',pg_temp.uid(1),pg_temp.project('origin1'),'product','choice','selection','client','responded',now()-interval '2 days',now()-interval '1 day',now()-interval '4 hours',now());
INSERT INTO public.client_decision_options(id,decision_id,name,selected,is_recommended,sort_order,price) VALUES
(pg_temp.fid('b100',1),pg_temp.fid('b000',1),'Linen sofa',false,true,0,240000),
(pg_temp.fid('b100',2),pg_temp.fid('b000',1),'Velvet sofa',false,false,1,260000),
(pg_temp.fid('b100',3),pg_temp.fid('b000',4),'Wool rug',true,true,0,90000);
SET LOCAL session_replication_role=origin;

SELECT pg_temp.actor(NULL);
NOTIFY pgrst, 'reload schema';
