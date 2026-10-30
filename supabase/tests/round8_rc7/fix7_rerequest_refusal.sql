-- RC8-FIX7 (K11, RC7-E2-OBS-2; migration 00903): a returned acceptance
-- request cannot be re-requested on unchanged evidence.
-- Covers: the returned request's unchanged manifest is refused (PT409
-- acceptance_rerequest_needs_new_evidence, nothing written), including an
-- identical member set minted as another manifest row (the hash is compared,
-- not the id); the returned request's own key still replays (R15); a revised
-- manifest is accepted; a superseded or withdrawn request, which is not
-- returned, leaves its manifest re-requestable.
-- Owned stack only (default 127.0.0.1:63122; -v expected_port=<n> for another,
-- never the shared 54322). Every fixture, capability and ACL change rolls back.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 63122
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'fix7 re-request refusal test requires an owned 127.0.0.1 stack (not 54322)'; END $$;
\quit
\endif

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE TEMP TABLE assertion_count(n integer NOT NULL);
INSERT INTO assertion_count VALUES (0);
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
  PERFORM pg_temp.assert_true(actual_state=state AND (message IS NULL OR actual_message=message),
    name||' ['||COALESCE(actual_state,'<none>')||' '||COALESCE(actual_message,'')||']');
END $$;
CREATE FUNCTION pg_temp.uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('c9030000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.manifest(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('c9038000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN n IS NULL THEN '' ELSE pg_temp.uid(n)::text END,true);
  PERFORM set_config('request.jwt.claims',CASE WHEN n IS NULL THEN '' ELSE jsonb_build_object('sub',pg_temp.uid(n),
    'role','authenticated')::text END,true);
END $$;

-- The delta itself: one PT409 raise of the stable key, placed after the
-- latest request's FOR UPDATE.
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM pg_proc p, regexp_matches(p.prosrc,
    'RAISE\s+EXCEPTION\s+''acceptance_rerequest_needs_new_evidence''\s+USING\s+ERRCODE\s*=\s*''PT409''','g')
  WHERE p.oid='public.create_service_acceptance_request(uuid,uuid,uuid,text)'::regprocedure)
  AND (SELECT position('ORDER BY request_number DESC LIMIT 1 FOR UPDATE' IN prosrc)
      < position('acceptance_rerequest_needs_new_evidence' IN prosrc)
    FROM pg_proc WHERE oid='public.create_service_acceptance_request(uuid,uuid,uuid,text)'::regprocedure),
  'create raises acceptance_rerequest_needs_new_evidence once, with PT409, after the latest request lock');

-- Fixture: studio owner 1, client 5 (the one required signer), outsider 10.
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'fix7-rerequest-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM unnest(ARRAY[1,5]) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Fix7 fixture',true FROM auth.users WHERE id::text LIKE 'c9030000-%';
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
('c9031000-0000-4000-8000-000000000001','design_studio','Fix7 studio','fix7-rerequest','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.uid(1),'c9031000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id::text LIKE 'c9030000-%' AND r.name='studio_owner';
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source) VALUES
('c9032000-0000-4000-8000-000000000001',pg_temp.uid(1),pg_temp.uid(5),'Fix7 client',
 'fix7-rerequest-5@test.invalid','active','direct');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);

CREATE FUNCTION pg_temp.parts(p uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'variant',variant,'partKey',part_key,'title',title,
   'payload',payload,'required',required,'clientVisible',client_visible) ORDER BY position),'[]')
 FROM public.proposal_agreement_parts WHERE proposal_id=p;
$$;
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
DO $$
DECLARE p uuid := 'c9033000-0000-4000-8000-000000000001'; phase_id uuid; snapshot jsonb;
BEGIN
 INSERT INTO public.proposals(id,designer_id,designer_client_id,client_id,title,total_amount,status,valid_until)
 VALUES(p,pg_temp.uid(1),'c9032000-0000-4000-8000-000000000001',pg_temp.uid(5),'Fix7 draft',0,'draft',now()+interval '30 days');
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
   jsonb_build_object('kind','acceptance_signer_policy','partKey','scope.signers','title','Signers','payload',
     jsonb_build_object('policyRevision',1,'signers',jsonb_build_array(
       jsonb_build_object('slot','client','required',true,'profileId',pg_temp.uid(5)))))),'fix7 fixture');
 snapshot:=public.get_commercial_document_send_snapshot(p);
 PERFORM public.send_commercial_document(p,snapshot->>'documentFingerprint',NULL,now()+interval '30 days');
 PERFORM pg_temp.actor(5);
 PERFORM public.sign_design_services_agreement(p,'Fix7 Client');
 PERFORM pg_temp.actor(1);
END $$;
CREATE TEMP TABLE sa_results(key text PRIMARY KEY, value jsonb);
INSERT INTO sa_results VALUES('origin',public.countersign_design_services_agreement(
 'c9033000-0000-4000-8000-000000000001','Fix7 Designer'));
CREATE FUNCTION pg_temp.v(k text) RETURNS jsonb LANGUAGE sql AS $$ SELECT value FROM sa_results WHERE key=k $$;
CREATE FUNCTION pg_temp.req(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT (value->>'requestId')::uuid FROM sa_results WHERE key=k $$;
CREATE FUNCTION pg_temp.project() RETURNS uuid LANGUAGE sql AS $$ SELECT (pg_temp.v('origin')->>'projectId')::uuid $$;
CREATE FUNCTION pg_temp.create(k text, m integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_service_acceptance_request(pg_temp.project(),
    (SELECT id FROM public.project_scope_editions WHERE project_id=pg_temp.project() AND status='active'),pg_temp.manifest(m),k);
$$;
CREATE FUNCTION pg_temp.requests() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.service_acceptance_requests WHERE project_id=pg_temp.project();
$$;
CREATE FUNCTION pg_temp.state(k text) RETURNS text LANGUAGE sql AS $$
  SELECT lifecycle||'/'||COALESCE(closed_reason,superseded_reason,'-') FROM public.service_acceptance_requests WHERE id=pg_temp.req(k);
$$;
-- V22 delivery as the service path (no JWT), as service_acceptance_release_fixes_body does.
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
  PERFORM pg_temp.actor(1);
END $$;

-- Manifests: 1 and 3 hold the same members (same content hash) under
-- different rows (3 is bound to a package of the job); 2 and 4 are revised sets.
SET LOCAL session_replication_role=replica;
INSERT INTO public.project_packages(id,project_id,package_kind,code,title,created_by,idempotency_key,request_hash) VALUES
('c9034000-0000-4000-8000-000000000001',pg_temp.project(),'build','FIX7','Fix7 package',pg_temp.uid(1),'fix7-pkg',repeat('5',64));
INSERT INTO public.evidence_manifests(id,project_id,package_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by) VALUES
(pg_temp.manifest(1),pg_temp.project(),NULL,'service_acceptance','[]',repeat('a',64),repeat('1',64),'fix7-1',pg_temp.uid(1)),
(pg_temp.manifest(2),pg_temp.project(),NULL,'service_acceptance','[]',repeat('b',64),repeat('2',64),'fix7-2',pg_temp.uid(1)),
(pg_temp.manifest(3),pg_temp.project(),'c9034000-0000-4000-8000-000000000001',
 'service_acceptance','[]',repeat('a',64),repeat('3',64),'fix7-3',pg_temp.uid(1)),
(pg_temp.manifest(4),pg_temp.project(),NULL,'service_acceptance','[]',repeat('c',64),repeat('4',64),'fix7-4',pg_temp.uid(1));
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);
SELECT pg_temp.assert_true((SELECT package_id IS NOT NULL FROM public.evidence_manifests WHERE id=pg_temp.manifest(3)),
  'fixture: manifest 3 repeats manifest 1''s hash as a different row');

-- r1 on manifest 1, sent, then returned by the one required signer.
INSERT INTO sa_results VALUES('r1',pg_temp.create('fix7-r1',1));
SELECT pg_temp.deliver(pg_temp.req('r1'));
SELECT pg_temp.actor(5);
SELECT public.respond_service_acceptance(r.id,'return','[]'::jsonb,'The drawings miss the pantry',r.scope_content_hash,
  r.evidence_manifest_hash,r.signer_policy_revision,'fix7-r1-return')
FROM public.service_acceptance_requests r WHERE r.id=pg_temp.req('r1');
SELECT pg_temp.actor(1);
SELECT pg_temp.assert_true(pg_temp.state('r1')='closed/returned','fixture: r1 is closed/returned');

-- Refused: the returned request's unchanged manifest, and the same members as another row.
INSERT INTO sa_results VALUES('count-before',to_jsonb(pg_temp.requests()));
SELECT pg_temp.expect_error($q$SELECT pg_temp.create('fix7-r1-again',1)$q$,'PT409','acceptance_rerequest_needs_new_evidence',
  'a new request on the returned request''s unchanged manifest is refused');
SELECT pg_temp.expect_error($q$SELECT pg_temp.create('fix7-r1-same-members',3)$q$,'PT409','acceptance_rerequest_needs_new_evidence',
  'a different manifest row with the same evidence hash is refused too');
SELECT pg_temp.assert_true(pg_temp.requests()=(pg_temp.v('count-before'))::bigint
  AND NOT EXISTS (SELECT 1 FROM public.outbound_drafts WHERE project_id=pg_temp.project()
    AND kind='service_acceptance_request' AND ref_id<>pg_temp.req('r1')),
  'the refusals write no request and no signer notice');
-- R15: the returned request's own key still replays its first effect.
SELECT pg_temp.assert_true((pg_temp.create('fix7-r1',1)->>'replayed')::boolean
  AND (pg_temp.create('fix7-r1',1)->>'requestId')::uuid=pg_temp.req('r1') AND pg_temp.state('r1')='closed/returned',
  'an exact replay of the returned request''s key returns its receipt and reopens nothing');

-- Accepted: a revised manifest.
INSERT INTO sa_results VALUES('r2',pg_temp.create('fix7-r2',2));
SELECT pg_temp.assert_true(pg_temp.state('r2')='draft/-'
  AND (SELECT predecessor_request_id=pg_temp.req('r1') AND evidence_manifest_hash=repeat('b',64)
    FROM public.service_acceptance_requests WHERE id=pg_temp.req('r2')),
  'a request on a revised manifest is accepted as r1''s successor');

-- Unaffected: requests that were not returned. r3 supersedes r2; r2's
-- manifest can be requested again (r4), which supersedes r3; r4 is withdrawn
-- and its manifest can be requested again (r5).
INSERT INTO sa_results VALUES('r3',pg_temp.create('fix7-r3',4));
SELECT pg_temp.assert_true(pg_temp.state('r2')='superseded/successor_request','fixture: r2 is superseded, not returned');
INSERT INTO sa_results VALUES('r4',pg_temp.create('fix7-r4',2));
SELECT pg_temp.assert_true(pg_temp.state('r4')='draft/-' AND pg_temp.state('r3')='superseded/successor_request',
  'a superseded (not returned) request''s manifest can be requested again');
SELECT public.withdraw_service_acceptance_request(pg_temp.req('r4'),'Wrong recipient','fix7-r4-withdraw');
SELECT pg_temp.assert_true(pg_temp.state('r4')='withdrawn/-','fixture: r4 is withdrawn, not returned');
INSERT INTO sa_results VALUES('r5',pg_temp.create('fix7-r5',2));
SELECT pg_temp.assert_true(pg_temp.state('r5')='draft/-'
  AND (SELECT evidence_manifest_hash=repeat('b',64) FROM public.service_acceptance_requests WHERE id=pg_temp.req('r5')),
  'a withdrawn (not returned) request''s manifest can be requested again');
-- The returned manifest stays refused after the later requests.
SELECT pg_temp.expect_error($q$SELECT pg_temp.create('fix7-r1-late',1)$q$,'PT409','acceptance_rerequest_needs_new_evidence',
  'the returned manifest is still refused once later requests exist');

DO $$ BEGIN RAISE NOTICE 'fix7 re-request refusal: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
