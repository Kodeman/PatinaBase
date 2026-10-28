-- C4 client evidence reader (00889) on an OWNED stack (+3000: 127.0.0.1:57322).
-- Pass -v expected_port=<n> for another owned stack; never the shared 54322.
-- Every fixture, capability and ACL change is rolled back.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 57322
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
\echo REFUSED: service_acceptance_client_evidence_test needs owned 127.0.0.1 port :expected_port, got :HOST port :PORT
DO $$ BEGIN RAISE EXCEPTION 'service_acceptance_client_evidence_test refused: not the owned local stack'; END $$;
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
  SELECT ('f8890000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN n IS NULL THEN '' ELSE pg_temp.uid(n)::text END,true);
  PERFORM set_config('request.jwt.claims',CASE WHEN n IS NULL THEN '' ELSE jsonb_build_object('sub',pg_temp.uid(n),
    'role','authenticated')::text END,true);
END $$;
CREATE FUNCTION pg_temp.keys(v jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(k ORDER BY k),'{}') FROM jsonb_object_keys(v) k;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text,text,text),
  pg_temp.actor(integer),pg_temp.uid(integer),pg_temp.keys(jsonb) TO authenticated,anon;

-- ---------------------------------------------------------------------------
-- Shipped ACL and shape: one read and one storage predicate reach authenticated.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(to_regprocedure('public.get_my_service_acceptance_evidence(uuid)') IS NOT NULL,
  'reader get_my_service_acceptance_evidence(uuid) exists');
DO $$ DECLARE f regprocedure; r text; granted boolean; BEGIN
  FOREACH f IN ARRAY ARRAY['public.get_my_service_acceptance_evidence(uuid)','public._can_read_service_acceptance_evidence_object(text)',
    'public._is_service_acceptance_client_reader(uuid)','public._service_acceptance_evidence_documents(uuid)',
    'public._service_acceptance_client_member(uuid,jsonb)']::regprocedure[] LOOP
    granted:=f IN ('public.get_my_service_acceptance_evidence(uuid)'::regprocedure,
      'public._can_read_service_acceptance_evidence_object(text)'::regprocedure);
    PERFORM pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE')=granted,
      format('authenticated execute=%s %s',granted,f));
    FOREACH r IN ARRAY ARRAY['anon','service_role'] LOOP
      PERFORM pg_temp.assert_true(NOT has_function_privilege(r,f,'EXECUTE'),r||' no execute '||f);
    END LOOP;
    PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC no execute '||f);
    PERFORM pg_temp.assert_true((SELECT p.prosecdef AND p.provolatile='s'
      AND p.proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc p WHERE p.oid=f),'stable definer pinned search_path '||f);
  END LOOP;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(permissive='PERMISSIVE' AND cmd='SELECT' AND roles='{authenticated}'
  AND qual LIKE '%bucket_id = ''project-documents''::text%' AND qual LIKE '%_can_read_service_acceptance_evidence_object(name)%')
  FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='service_acceptance_evidence_client_read'),
  'one permissive authenticated SELECT policy on project-documents keyed to the evidence predicate');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND qual LIKE '%_can_read_service_acceptance_evidence_object%' AND policyname<>'service_acceptance_evidence_client_read'),
  'no other storage policy uses the evidence predicate');
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions'),'capability ships off');

-- ---------------------------------------------------------------------------
-- Fixture: a native agreement origin edition (x08 pattern), native plan prints,
-- a manifest minted by create_evidence_manifest, and projection-only requests.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'client-evidence-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(1,11) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Client evidence fixture',true FROM auth.users WHERE id::text LIKE 'f8890000-%';
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
('f8891000-0000-4000-8000-000000000001','design_studio','Evidence A','client-evidence-a','active'),
('f8891000-0000-4000-8000-000000000002','design_studio','Evidence B','client-evidence-b','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.uid(1),'f8891000-0000-4000-8000-000000000001','owner','active'),
(pg_temp.uid(2),'f8891000-0000-4000-8000-000000000001','member','active'),
(pg_temp.uid(4),'f8891000-0000-4000-8000-000000000002','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id::text LIKE 'f8890000-%' AND r.name='studio_owner';
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id) VALUES
('f8896000-0000-4000-8000-000000000001','f8891000-0000-4000-8000-000000000001','person','client','Client',pg_temp.uid(5)),
('f8896000-0000-4000-8000-000000000002','f8891000-0000-4000-8000-000000000001','person','client','Partner',pg_temp.uid(6)),
('f8896000-0000-4000-8000-000000000003','f8891000-0000-4000-8000-000000000001','person','client','Household card',NULL),
('f8896000-0000-4000-8000-000000000008','f8891000-0000-4000-8000-000000000001','person','client','Other household',pg_temp.uid(8));
INSERT INTO public.client_households(id,organization_id,designer_id,display_name,member_person_ids) VALUES
('f8897000-0000-4000-8000-000000000001','f8891000-0000-4000-8000-000000000001',pg_temp.uid(1),'Evidence household',
 ARRAY['f8896000-0000-4000-8000-000000000001','f8896000-0000-4000-8000-000000000002',
       'f8896000-0000-4000-8000-000000000003']::uuid[]),
('f8897000-0000-4000-8000-000000000008','f8891000-0000-4000-8000-000000000001',pg_temp.uid(1),'Other household',
 ARRAY['f8896000-0000-4000-8000-000000000008']::uuid[]);
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source,household_id) VALUES
('f8892000-0000-4000-8000-000000000001',pg_temp.uid(1),pg_temp.uid(5),'Evidence client',
 'client-evidence-5@test.invalid','active','direct','f8897000-0000-4000-8000-000000000001'),
('f8892000-0000-4000-8000-000000000008',pg_temp.uid(1),pg_temp.uid(8),'Other client',
 'client-evidence-8@test.invalid','active','direct','f8897000-0000-4000-8000-000000000008');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);
CREATE FUNCTION pg_temp.parts(p uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'variant',variant,'partKey',part_key,'title',title,
   'payload',payload,'required',required,'clientVisible',client_visible) ORDER BY position),'[]')
 FROM public.proposal_agreement_parts WHERE proposal_id=p;
$$;
CREATE FUNCTION pg_temp.draft(p uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE design_id uuid; install_id uuid;
BEGIN
 INSERT INTO public.proposals(id,designer_id,designer_client_id,client_id,title,total_amount,status,valid_until)
 VALUES(p,pg_temp.uid(1),'f8892000-0000-4000-8000-000000000001',pg_temp.uid(5),'Evidence draft',0,'draft',now()+interval '30 days');
 INSERT INTO public.proposal_phases(proposal_id,name,phase_key,duration_days,lane,fee_cents,sort_order)
 VALUES(p,'Design development','design-development',5,'main',250000,0) RETURNING id INTO design_id;
 INSERT INTO public.proposal_phases(proposal_id,name,phase_key,duration_days,lane,fee_cents,sort_order,follows_phase_id)
 VALUES(p,'Installation week','installation',5,'main',90000,1,design_id) RETURNING id INTO install_id;
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
         'fabrication_contract','gc','installation','studio'),
       'serviceBindings',jsonb_build_object('design',jsonb_build_array(design_id),'installation',jsonb_build_array(install_id)))),
   jsonb_build_object('kind','scope_package','partKey','scope.dining','title','Dining','payload',
     jsonb_build_object('packageKey','pkg.dining','label','Dining room','inclusion','conditional',
       'conditionText','Only if the dining budget is approved',
       'responsibilities',jsonb_build_object('design','client','purchasing','client','payer','client',
         'fabrication_contract','none','installation','other'))),
   jsonb_build_object('kind','acceptance_signer_policy','partKey','scope.signers','title','Signers','payload',
     jsonb_build_object('policyRevision',1,'signers',jsonb_build_array(
       jsonb_build_object('slot','client','required',true,'profileId',pg_temp.uid(5)),
       jsonb_build_object('slot','partner','required',true,'profileId',pg_temp.uid(6)),
       jsonb_build_object('slot','household','required',false,'householdPersonId','f8896000-0000-4000-8000-000000000003'))))),
   'client evidence fixture');
END $$;
CREATE FUNCTION pg_temp.send_and_sign(p uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 snapshot:=public.get_commercial_document_send_snapshot(p);
 PERFORM public.send_commercial_document(p,snapshot->>'documentFingerprint',NULL,now()+interval '30 days');
 PERFORM pg_temp.actor(5);
 PERFORM public.sign_design_services_agreement(p,'Evidence Client');
 PERFORM pg_temp.actor(1);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_and_sign(uuid) TO authenticated;
CREATE TEMP TABLE ev_results(key text PRIMARY KEY,value jsonb);
GRANT ALL ON ev_results TO authenticated, anon;
CREATE FUNCTION pg_temp.project() RETURNS uuid LANGUAGE sql AS $$ SELECT (value->>'projectId')::uuid FROM ev_results WHERE key='origin' $$;
CREATE FUNCTION pg_temp.doc_path(n integer) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.project()::text||'/evidence-'||n||'.pdf';
$$;
GRANT EXECUTE ON FUNCTION pg_temp.project(),pg_temp.doc_path(integer) TO authenticated,anon;
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
SELECT pg_temp.draft('f8893000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.send_and_sign('f8893000-0000-4000-8000-000000000001');
INSERT INTO ev_results VALUES('origin',public.countersign_design_services_agreement(
 'f8893000-0000-4000-8000-000000000001','Evidence Designer'));
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.project_scope_edition_packages k JOIN public.project_scope_editions e
  ON e.id=k.edition_id WHERE e.project_id=pg_temp.project() AND e.status='active'),'origin edition freezes two packages');

-- Native plan evidence: documents 1 and 2 sit behind manifest prints; 3 is an
-- unrelated project document. None is client_visible, so only 00889 can admit them.
SET LOCAL session_replication_role=replica;
INSERT INTO public.project_documents(id,project_id,title,storage_path,client_visible,uploaded_by) VALUES
(pg_temp.uid(701),pg_temp.project(),'Kitchen set',pg_temp.doc_path(1),false,pg_temp.uid(1)),
(pg_temp.uid(702),pg_temp.project(),'Kitchen elevations',pg_temp.doc_path(2),false,pg_temp.uid(1)),
(pg_temp.uid(703),pg_temp.project(),'Studio margin workbook',pg_temp.doc_path(3),false,pg_temp.uid(1));
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
SELECT 'project-documents',pg_temp.doc_path(n),pg_temp.uid(1)::text,jsonb_build_object('mimetype','application/pdf')
FROM generate_series(1,3) n;
INSERT INTO public.plan_sheets(id,project_id,sheet_number,title,state,current_print_number,current_print_id,created_by) VALUES
(pg_temp.uid(711),pg_temp.project(),'A-101','Kitchen plan','shared',1,pg_temp.uid(721),pg_temp.uid(1)),
(pg_temp.uid(712),pg_temp.project(),'A-201','Kitchen elevations','shared',1,pg_temp.uid(722),pg_temp.uid(1));
INSERT INTO public.plan_print_batches(id,project_id,idempotency_key,request_hash,item_count) VALUES
(pg_temp.uid(731),pg_temp.project(),'client-evidence-batch',repeat('9',64),2);
INSERT INTO public.plan_prints(id,sheet_id,batch_id,print_number,rev_letter,project_document_id,sha256,source,created_by) VALUES
(pg_temp.uid(721),pg_temp.uid(711),pg_temp.uid(731),1,'A',pg_temp.uid(701),repeat('c',64),'upload',pg_temp.uid(1)),
(pg_temp.uid(722),pg_temp.uid(712),pg_temp.uid(731),1,'B',pg_temp.uid(702),repeat('e',64),'upload',pg_temp.uid(1));
INSERT INTO public.plan_issues(id,project_id,issue_number,name,idempotency_key,request_hash,set_checksum,sheet_count,issued_at,created_by) VALUES
(pg_temp.uid(741),pg_temp.project(),1,'Spec book issue 1','client-evidence-issue',repeat('8',64),repeat('f',64),1,now(),pg_temp.uid(1));
INSERT INTO public.plan_issue_prints(id,issue_id,sheet_id,print_id,sheet_number,sheet_title,rev_letter,sha256) VALUES
(pg_temp.uid(751),pg_temp.uid(741),pg_temp.uid(711),pg_temp.uid(721),'A-101','Kitchen plan','A',repeat('c',64));
INSERT INTO public.client_decisions(id,designer_client_id,title,designer_id,project_id,approval_contract,decision_type,decision_kind,coordination_kind,court,phase_id,blocking_status,blocks_kind) VALUES
(pg_temp.uid(761),'f8892000-0000-4000-8000-000000000001','Approve the care pack',pg_temp.uid(1),pg_temp.project(),'project_artifact_v1','approval','approval','signoff','client',pg_temp.uid(762),'blocks_phase','phase');
INSERT INTO public.project_approval_artifacts(id,decision_id,project_id,source_kind,source_id,source_version,artifact_hash,
  artifact_title,question,context,due_at,phase_id,cost_cents_delta,schedule_days_delta,lead_time_days_delta,source_snapshot)
VALUES (pg_temp.uid(771),pg_temp.uid(761),pg_temp.project(),'spec_book_artifact',pg_temp.uid(772),1,repeat('d',64),'Care pack',
  'Approve the care pack?','Studio note: trade cost 4120',now()+interval '7 days',pg_temp.uid(762),987654,0,0,'{"tradeCostCents":412000}');
SET LOCAL session_replication_role=origin;
-- Native C1 mint (service_role-only RPC, called as the composing designer).
INSERT INTO ev_results VALUES('manifest',public.create_evidence_manifest(pg_temp.project(),NULL,'service_acceptance',jsonb_build_array(
  jsonb_build_object('kind','plan_issue','id',pg_temp.uid(741),'sha256',repeat('f',64),'version',1),
  jsonb_build_object('kind','plan_print','id',pg_temp.uid(722),'sha256',repeat('e',64),'rev','B'),
  jsonb_build_object('kind','approval_artifact','id',pg_temp.uid(771),'sha256',repeat('d',64),'version',1)),'client-evidence-1'));
SELECT pg_temp.assert_true((SELECT manifest_hash=encode(extensions.digest(public._plan_room_canonical_json(members),'sha256'),'hex')
  AND jsonb_array_length(members)=3 FROM public.evidence_manifests WHERE id=(SELECT (value->>'manifestId')::uuid FROM ev_results WHERE key='manifest')),
  'native manifest hash is taken over its three frozen members');

-- Projection fixture (x08 pattern): requests bound to the native edition and manifest.
CREATE FUNCTION pg_temp.fixture_request(n integer, state text, delivered boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.outbound_drafts(id,organization_id,project_id,kind,channel,recipient_kind,to_client_id,
 subject,body,ref_type,ref_id,dedupe_key) VALUES
 (pg_temp.uid(200+n),'f8891000-0000-4000-8000-000000000001',pg_temp.project(),'service_acceptance_request',
 'email','client',pg_temp.uid(5),'Service acceptance','Projection fixture only','service_acceptance_request',pg_temp.uid(100+n),'client-evidence-'||n);
 INSERT INTO public.service_acceptance_requests(id,project_id,scope_edition_id,scope_content_hash,evidence_manifest_id,
 evidence_manifest_hash,request_number,lifecycle,outbound_draft_id,sent_at,client_request_id,request_hash,created_by)
 SELECT pg_temp.uid(100+n),pg_temp.project(),e.id,e.content_hash,m.id,m.manifest_hash,n,state,pg_temp.uid(200+n),
 CASE WHEN delivered THEN now() END,'client-evidence-'||n,repeat('b',64),pg_temp.uid(1)
 FROM public.project_scope_editions e, public.evidence_manifests m
 WHERE e.project_id=pg_temp.project() AND e.status='active'
   AND m.id=(SELECT (value->>'manifestId')::uuid FROM ev_results WHERE key='manifest');
 INSERT INTO public.service_acceptance_signers(id,request_id,slot,required,profile_id,policy_slot) VALUES
 (pg_temp.uid(300+n),pg_temp.uid(100+n),'required',true,pg_temp.uid(6),'required'),
 (pg_temp.uid(400+n),pg_temp.uid(100+n),'optional',false,pg_temp.uid(7),'optional');
 INSERT INTO public.service_acceptance_signers(request_id,slot,required,profile_id,policy_slot,status,replaced_by_signer_id,
 replacement_reason,replaced_by,replaced_at,replacement_client_request_id,replacement_request_hash,replacement_policy_revision,
 replacement_lapsed_intake_ids) VALUES
 (pg_temp.uid(100+n),'required',true,pg_temp.uid(11),'required','replaced',pg_temp.uid(300+n),'Moved out',pg_temp.uid(1),now(),
  'client-evidence-replace-'||n,repeat('7',64),2,'{}');
END $$;
SET LOCAL session_replication_role=replica;
SELECT pg_temp.fixture_request(1,'draft',false);
SET LOCAL session_replication_role=origin;
-- Reads run with every C4 mutation inactive: the capability ships off.
UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';

-- ---------------------------------------------------------------------------
-- An unsent request is invisible to everyone, signers and project client too.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 FOREACH n IN ARRAY ARRAY[5,6,7] LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(101)),'42501',NULL,
   'unsent draft refused for actor '||n);
  PERFORM pg_temp.assert_true(NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1)),
   'unsent draft admits no document for actor '||n);
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='project-documents'
   AND name IN (pg_temp.doc_path(1),pg_temp.doc_path(2))),'unsent draft opens no storage object for actor '||n);
 END LOOP;
END $$;
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
 WHERE id=pg_temp.uid(101);
SELECT pg_temp.fixture_request(2,'sent',true);
SET LOCAL session_replication_role=origin;

-- ---------------------------------------------------------------------------
-- Readers: required signer, optional signer, project client.
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.check_reader(n integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ev jsonb; req public.service_acceptance_requests%ROWTYPE; ed public.project_scope_editions%ROWTYPE;
  man public.evidence_manifests%ROWTYPE; kitchen jsonb; dining jsonb; members jsonb; leak text; rehash text;
BEGIN
 PERFORM pg_temp.actor(n);
 ev:=public.get_my_service_acceptance_evidence(pg_temp.uid(102));
 RESET ROLE;
 SELECT * INTO req FROM public.service_acceptance_requests WHERE id=pg_temp.uid(102);
 SELECT * INTO ed FROM public.project_scope_editions WHERE id=req.scope_edition_id;
 SELECT * INTO man FROM public.evidence_manifests WHERE id=req.evidence_manifest_id; rehash:=encode(extensions.digest(public._plan_room_canonical_json(man.members),'sha256'),'hex');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.assert_true(pg_temp.keys(ev)=ARRAY['evidence','requestId','requestNumber','scope']
  AND pg_temp.keys(ev->'scope')=ARRAY['contentHash','editionId','packages']
  AND pg_temp.keys(ev->'evidence')=ARRAY['manifestHash','manifestId','members'],'exact top key sets for actor '||n);
 PERFORM pg_temp.assert_true(ev->>'requestId'=req.id::text AND (ev->>'requestNumber')::int=req.request_number
  AND ev->'scope'->>'editionId'=ed.id::text AND ev->'evidence'->>'manifestId'=man.id::text,'binds the request edition and manifest for actor '||n);
 -- The scope comes from the content that hashes to the bound scope hash.
 PERFORM pg_temp.assert_true(ev->'scope'->>'contentHash'=req.scope_content_hash AND req.scope_content_hash=ed.content_hash
  AND ed.content_hash=encode(extensions.digest(convert_to(ed.content::text,'UTF8'),'sha256'),'hex'),
  'scope hash is the request hash of the edition content for actor '||n);
 PERFORM pg_temp.assert_true(jsonb_array_length(ev->'scope'->'packages')=jsonb_array_length(ed.content->'packages')
  AND (SELECT bool_and(pg_temp.keys(p)=ARRAY['conditionText','inclusion','key','label','phases','responsibilities']
    AND pg_temp.keys(p->'responsibilities')=ARRAY['design','installation','purchasing']
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(ed.content->'packages') c WHERE c->>'package_key'=p->>'key'
      AND c->>'label'=p->>'label' AND c->>'inclusion'=p->>'inclusion'
      AND c->>'condition_text' IS NOT DISTINCT FROM p->>'conditionText'
      AND c->'responsibilities'->>'design'=p->'responsibilities'->>'design'
      AND c->'responsibilities'->>'purchasing'=p->'responsibilities'->>'purchasing'
      AND c->'responsibilities'->>'installation'=p->'responsibilities'->>'installation'))
   FROM jsonb_array_elements(ev->'scope'->'packages') p),'every package is a client-safe copy of the hashed content for actor '||n);
 SELECT p INTO kitchen FROM jsonb_array_elements(ev->'scope'->'packages') p WHERE p->>'key'='pkg.kitchen';
 SELECT p INTO dining FROM jsonb_array_elements(ev->'scope'->'packages') p WHERE p->>'key'='pkg.dining';
 PERFORM pg_temp.assert_true(kitchen->'phases'=jsonb_build_array(
   jsonb_build_object('name','Design development','service','design'),jsonb_build_object('name','Installation week','service','installation'))
  AND kitchen->'responsibilities'=jsonb_build_object('design','studio','purchasing','client','installation','studio')
  AND kitchen->'conditionText'='null'::jsonb,'kitchen carries its bound agreement phase names and parties for actor '||n);
 PERFORM pg_temp.assert_true(dining->>'inclusion'='conditional' AND dining->>'conditionText'='Only if the dining budget is approved'
  AND dining->'phases'='[]'::jsonb,'conditional package carries its signed condition for actor '||n);
 -- The evidence comes from the manifest members that hash to the bound evidence hash.
 PERFORM pg_temp.assert_true(ev->'evidence'->>'manifestHash'=req.evidence_manifest_hash AND req.evidence_manifest_hash=man.manifest_hash
  AND man.manifest_hash=rehash,
  'evidence hash is the request hash of the manifest members for actor '||n);
 members:=ev->'evidence'->'members';
 PERFORM pg_temp.assert_true(jsonb_array_length(members)=3 AND (SELECT array_agg(m->>'kind' ORDER BY o)
   FROM jsonb_array_elements(members) WITH ORDINALITY x(m,o))=(SELECT array_agg(m->>'kind' ORDER BY o)
   FROM jsonb_array_elements(man.members) WITH ORDINALITY x(m,o)),'one member per frozen manifest member, in order, for actor '||n);
 PERFORM pg_temp.assert_true((SELECT bool_and(pg_temp.keys(m)=ARRAY['documents','issuedAt','kind','title'] AND m->>'issuedAt' IS NOT NULL
   AND (SELECT COALESCE(bool_and(pg_temp.keys(d)=ARRAY['bucket','path','title'] AND d->>'bucket'='project-documents'),true)
     FROM jsonb_array_elements(m->'documents') d)) FROM jsonb_array_elements(members) m),'exact member and document key sets for actor '||n);
 PERFORM pg_temp.assert_true((SELECT jsonb_agg(jsonb_build_object('kind',m->>'kind','title',m->>'title','documents',m->'documents'))
   FROM jsonb_array_elements(members) m)=jsonb_build_array(
   jsonb_build_object('kind','approval_artifact','title','Care pack','documents','[]'::jsonb),
   jsonb_build_object('kind','plan_issue','title','Spec book issue 1','documents',jsonb_build_array(
     jsonb_build_object('bucket','project-documents','path',pg_temp.doc_path(1),'title','Kitchen set'))),
   jsonb_build_object('kind','plan_print','title','A-201 Kitchen elevations','documents',jsonb_build_array(
     jsonb_build_object('bucket','project-documents','path',pg_temp.doc_path(2),'title','Kitchen elevations')))),
  'titles and print documents resolve from the native member rows for actor '||n);
 SELECT string_agg(f,',') INTO leak FROM unnest(ARRAY['payer','fabrication','provenance','room_ids','owed','signerPolicy',
   'profile','cost','price','margin','trade','note','snapshot','sha256','created_by','fee','evidence-3','margin workbook',
   pg_temp.uid(1)::text,pg_temp.uid(5)::text,pg_temp.uid(6)::text,pg_temp.uid(7)::text,pg_temp.uid(11)::text]) f
  WHERE strpos(lower(ev::text),lower(f))>0;
 PERFORM pg_temp.assert_true(leak IS NULL,'no forbidden field or person in the payload for actor '||n||' ['||COALESCE(leak,'')||']');
 -- Storage: exactly the returned documents open, the unrelated one does not.
 PERFORM pg_temp.assert_true(public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1))
  AND public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2))
  AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(3)),'predicate admits the two evidence documents only for actor '||n);
 PERFORM pg_temp.assert_true((SELECT array_agg(name ORDER BY name) FROM storage.objects WHERE bucket_id='project-documents'
   AND name IN (pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(3)))=ARRAY[pg_temp.doc_path(1),pg_temp.doc_path(2)],
  'storage SELECT opens exactly the evidence documents for actor '||n);
 INSERT INTO ev_results VALUES('reader'||n,ev);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check_reader(integer) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_reader(6);
SELECT pg_temp.check_reader(7);
SELECT pg_temp.check_reader(5);
SELECT pg_temp.assert_true((SELECT count(DISTINCT value)=1 FROM ev_results WHERE key IN ('reader5','reader6','reader7')),
  'required signer, optional signer and project client read the same evidence');

-- ---------------------------------------------------------------------------
-- Everyone else: nothing, indistinguishable from a missing request.
-- ---------------------------------------------------------------------------
DO $$ DECLARE n integer; label text; BEGIN
 FOR n,label IN SELECT * FROM (VALUES(11,'replaced signer'),(8,'another household'),(9,'GC'),(10,'maker'),
   (4,'second studio'),(1,'studio owner'),(2,'studio member')) actors(n,label) LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(102)),'42501','insufficient_privilege',
   'evidence refused: '||label);
  PERFORM pg_temp.assert_true(NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1))
   AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2)),'evidence predicate refuses: '||label);
  PERFORM pg_temp.assert_true(public.get_my_service_acceptance_requests()='[]'::jsonb,'client list agrees, no rows: '||label);
 END LOOP;
 FOR n,label IN SELECT * FROM (VALUES(11,'replaced signer'),(8,'another household'),(4,'second studio')) actors(n,label) LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='project-documents'
   AND name IN (pg_temp.doc_path(1),pg_temp.doc_path(2))),'storage opens no evidence document: '||label);
 END LOOP;
 FOREACH n IN ARRAY ARRAY[5,6,7] LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_my_service_acceptance_requests()) x
   WHERE x->>'requestId'=pg_temp.uid(102)::text) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_my_service_acceptance_requests()) x
   WHERE x->>'requestId'=pg_temp.uid(101)::text),'client list agrees with the evidence reader for actor '||n);
  PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(101)),'42501','insufficient_privilege',
   'unsent superseded request stays refused for actor '||n);
  PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(199)),'42501','insufficient_privilege',
   'missing request refused alike for actor '||n);
 END LOOP;
END $$;
SELECT pg_temp.actor(NULL);
SELECT pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(102)),'42501','insufficient_privilege',
 'missing identity refused');
SELECT pg_temp.assert_true(NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1)),'missing identity opens nothing');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.actor(6);
SELECT pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(102)),'42501',NULL,'anon denied the reader');
SELECT pg_temp.expect_error(format('SELECT public._can_read_service_acceptance_evidence_object(%L)',pg_temp.doc_path(1)),'42501',NULL,
 'anon denied the storage predicate');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='project-documents'),'anon opens no project document');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions'),'capability still off after reads');
DO $$ BEGIN RAISE NOTICE 'C4 client evidence: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
