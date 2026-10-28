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
-- BEGIN shared helpers
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
-- A boolean query about 00889's snapshot schema: an error (as on a base without
-- it) is a failed assertion that names the error, not an aborted suite.
CREATE FUNCTION pg_temp.assert_sql(query text, name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean; err text;
BEGIN
  BEGIN EXECUTE query INTO ok;
  EXCEPTION WHEN OTHERS THEN ok:=false; err:=SQLERRM;
  END;
  PERFORM pg_temp.assert_true(ok,name||COALESCE(' ['||err||']',''));
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
  pg_temp.assert_sql(text,text),pg_temp.actor(integer),pg_temp.uid(integer),pg_temp.keys(jsonb) TO authenticated,anon;
-- END shared helpers

-- ---------------------------------------------------------------------------
-- Shipped ACL and shape: one read and one storage predicate reach authenticated.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(to_regprocedure('public.get_my_service_acceptance_evidence(uuid)') IS NOT NULL,
  'reader get_my_service_acceptance_evidence(uuid) exists');
DO $$ DECLARE s text; f regprocedure; r text; granted boolean; BEGIN
  FOREACH s IN ARRAY ARRAY['public.get_my_service_acceptance_evidence(uuid)','public._can_read_service_acceptance_evidence_object(text)',
    'public._is_service_acceptance_client_reader(uuid)','public._service_acceptance_evidence_documents(uuid)',
    'public._service_acceptance_client_member(text,uuid)','public._service_acceptance_scalars(jsonb,text[])',
    'public._service_acceptance_texts(jsonb)'] LOOP
    f:=to_regprocedure(s);
    PERFORM pg_temp.assert_true(f IS NOT NULL,'exists '||s);
    CONTINUE WHEN f IS NULL;
    granted:=s IN ('public.get_my_service_acceptance_evidence(uuid)','public._can_read_service_acceptance_evidence_object(text)');
    PERFORM pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE')=granted,
      format('authenticated execute=%s %s',granted,f));
    FOREACH r IN ARRAY ARRAY['anon','service_role'] LOOP
      PERFORM pg_temp.assert_true(NOT has_function_privilege(r,f,'EXECUTE'),r||' no execute '||f);
    END LOOP;
    PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC no execute '||f);
    PERFORM pg_temp.assert_true((SELECT p.prosecdef AND p.provolatile IN ('s','i')
      AND p.proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc p WHERE p.oid=f),'definer pinned search_path '||f);
  END LOOP;
END $$;
SELECT pg_temp.assert_true(to_regprocedure('public._service_acceptance_object_projects(text[])') IS NULL
  AND to_regprocedure('public._service_acceptance_client_member(uuid,jsonb)') IS NULL,
  'no live-anchor resolver is left: the snapshot replaced _service_acceptance_object_projects and the read-time member');
-- The send-time snapshot (SQ-2283): RLS on, no API-role privilege, immutable.
SELECT pg_temp.assert_true((SELECT count(*)=6 AND bool_and(c.relrowsecurity)
  AND bool_and(NOT has_table_privilege(r.r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(r)
  WHERE c.oid IN (to_regclass('public.service_acceptance_evidence_snapshots'),
    to_regclass('public.service_acceptance_evidence_snapshot_objects'))),
  'both snapshot tables have RLS and no anon, authenticated or service_role privilege');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('service_acceptance_evidence_snapshots','service_acceptance_evidence_snapshot_objects')),
  'no policy opens a snapshot table');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM pg_trigger t
  WHERE t.tgrelid IN (to_regclass('public.service_acceptance_evidence_snapshots'),
    to_regclass('public.service_acceptance_evidence_snapshot_objects'))
   AND t.tgenabled='O' AND t.tgtype=(1|2|8|16)::int2
   AND t.tgfoid=to_regprocedure('public._guard_service_acceptance_evidence_snapshot()')),
  'one enabled BEFORE UPDATE OR DELETE row guard on each snapshot table');
SELECT pg_temp.assert_true(CASE WHEN g IS NOT NULL THEN NOT has_function_privilege(r,g,'EXECUTE') END,
 r||' no execute on the snapshot guard')
FROM unnest(ARRAY['anon','authenticated','service_role']) r, to_regprocedure('public._guard_service_acceptance_evidence_snapshot()') g;
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
  AND tablename='service_acceptance_evidence_snapshot_objects' AND indexdef LIKE '%(bucket_id, object_name)'),
  'pinned objects are indexed by (bucket, object name)');
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
-- a manifest minted by create_evidence_manifest, and draft requests sent
-- through the native V22 send transition (outbound draft delivered).
-- ---------------------------------------------------------------------------
-- BEGIN shared fixture
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'client-evidence-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(1,11) n;
-- 9 (GC) and 10 (maker) are trade profiles, not designers: their native project
-- relationships are inserted once the project exists.
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Client evidence fixture',id NOT IN (pg_temp.uid(9),pg_temp.uid(10)) FROM auth.users WHERE id::text LIKE 'f8890000-%';
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
('f8891000-0000-4000-8000-000000000001','design_studio','Evidence A','client-evidence-a','active'),
('f8891000-0000-4000-8000-000000000002','design_studio','Evidence B','client-evidence-b','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.uid(1),'f8891000-0000-4000-8000-000000000001','owner','active'),
(pg_temp.uid(2),'f8891000-0000-4000-8000-000000000001','member','active'),
(pg_temp.uid(4),'f8891000-0000-4000-8000-000000000002','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT p.id,r.id,p.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id::text LIKE 'f8890000-%' AND p.is_designer AND r.name='studio_owner';
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

-- Native plan evidence: documents 1 and 2 sit behind manifest prints; 3 sits
-- behind print 723, named only by manifest3 (sent last), so until then it is an
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
(pg_temp.uid(712),pg_temp.project(),'A-201','Kitchen elevations','shared',1,pg_temp.uid(722),pg_temp.uid(1)),
(pg_temp.uid(713),pg_temp.project(),'A-301','Kitchen lighting','shared',1,pg_temp.uid(723),pg_temp.uid(1));
INSERT INTO public.plan_print_batches(id,project_id,idempotency_key,request_hash,item_count) VALUES
(pg_temp.uid(731),pg_temp.project(),'client-evidence-batch',repeat('9',64),3);
INSERT INTO public.plan_prints(id,sheet_id,batch_id,print_number,rev_letter,project_document_id,sha256,source,created_by) VALUES
(pg_temp.uid(721),pg_temp.uid(711),pg_temp.uid(731),1,'A',pg_temp.uid(701),repeat('c',64),'upload',pg_temp.uid(1)),
(pg_temp.uid(722),pg_temp.uid(712),pg_temp.uid(731),1,'B',pg_temp.uid(702),repeat('e',64),'upload',pg_temp.uid(1)),
(pg_temp.uid(723),pg_temp.uid(713),pg_temp.uid(731),1,'A',pg_temp.uid(703),repeat('7',64),'upload',pg_temp.uid(1));
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
-- The GC (9) and the maker (10) are related to this project natively: active
-- project team members, project parties, and the maker is the studio's vendor.
INSERT INTO public.vendors(id,name,contact_profile_id) VALUES(pg_temp.uid(781),'Evidence maker works',pg_temp.uid(10));
INSERT INTO public.studio_vendor_accounts(organization_id,vendor_id) VALUES('f8891000-0000-4000-8000-000000000001',pg_temp.uid(781));
INSERT INTO public.project_team_members(project_id,user_id,role,assigned_by) VALUES
(pg_temp.project(),pg_temp.uid(9),'vendor',pg_temp.uid(1)),(pg_temp.project(),pg_temp.uid(10),'vendor',pg_temp.uid(1));
INSERT INTO public.project_parties(id,project_id,party_kind,display_name,company_name,profile_id,vendor_id,created_by) VALUES
(pg_temp.uid(791),pg_temp.project(),'gc','Evidence GC','Evidence builders',pg_temp.uid(9),NULL,pg_temp.uid(1)),
(pg_temp.uid(792),pg_temp.project(),'vendor','Evidence maker','Evidence maker works',pg_temp.uid(10),pg_temp.uid(781),pg_temp.uid(1));
-- The care pack is a ready spec book artifact (document 4): the approval
-- artifact's own file is evidence too.
INSERT INTO public.project_documents(id,project_id,title,storage_path,client_visible,uploaded_by) VALUES
(pg_temp.uid(704),pg_temp.project(),'Care pack folio',pg_temp.doc_path(4),false,pg_temp.uid(1));
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES
('project-documents',pg_temp.doc_path(4),pg_temp.uid(1)::text,'{"mimetype":"application/pdf"}');
INSERT INTO public.spec_book_artifacts(id,revision_id,audience,status,project_document_id,storage_path,checksum_sha256,rendered_at)
VALUES (pg_temp.uid(772),pg_temp.uid(773),'care','ready',pg_temp.uid(704),pg_temp.doc_path(4),repeat('a',64),now());
-- Non-plan evidence for a second manifest (SQ-2272 F1): a published review
-- item, an approved configuration and an approved commission revision, each
-- carrying poison (prices, sku, vendor, notes, urls, ids, media) marked
-- secret or 7770xx that its client projection must drop.
INSERT INTO public.project_review_editions(id,project_id,edition_number,title,status,published_at,snapshot_hash) VALUES
(pg_temp.uid(841),pg_temp.project(),1,'Living room review','published',now(),repeat('1',64));
INSERT INTO public.project_review_items(id,edition_id,source_ffe_item_id,selection_thread_id,item_snapshot,content_hash) VALUES
(pg_temp.uid(842),pg_temp.uid(841),pg_temp.uid(843),pg_temp.uid(844),jsonb_build_object('name','Walnut sofa','docCode','F-12',
  'category','Seating','quantity',2,'productId','secret-product','selectionId','secret-selection',
  'room',jsonb_build_object('id','secret-room','name','Living room'),
  'clientFields',jsonb_build_object('description','Low walnut sofa','finish','Oiled walnut','note','secret note',
    'leadTime',jsonb_build_object('secret',1)),
  'media',jsonb_build_array(jsonb_build_object('id','secret-media','checksumSha256',repeat('5',64))),
  'clientUnitPriceCents',777001,'clientLineTotalCents',777002),repeat('2',64));
INSERT INTO public.product_configurations(id,product_id,owner_user_id,project_id,name,status,version,schema_revision,
  evaluation,snapshot,snapshot_hash,approved_at,approved_by)
SELECT pg_temp.uid(851),pg_temp.uid(852),pg_temp.uid(1),pg_temp.project(),'Dining chair','approved',1,1,'{}'::jsonb,s,
  public._configuration_snapshot_hash(s),now(),pg_temp.uid(1)
FROM (SELECT jsonb_build_object('productName','Spindle chair','leadTimeWeeks',10,'retailPriceCents',777003,
  'tradePriceCents',777004,'variant',jsonb_build_object('sku','secret-sku','vendorSku','secret-vendor-sku'),
  'selections',jsonb_build_array(jsonb_build_object('groupName','Finish','valueLabel','Ebonized oak','priceDeltaCents',777005)),
  'components',jsonb_build_array(jsonb_build_object('name','Seat cushion','quantity',1,'handedness','none','tradePriceCents',777006)),
  'dimensions',jsonb_build_object('width',20,'depth',22,'height',34,'unit','in','secretKey','secret-dimension'),
  'comDetails',jsonb_build_object('fabricName','Linen','pattern','Herringbone','mill','secret-mill','sidemark','secret-sidemark',
    'notes','secret note'),'customCommission',jsonb_build_object('secret',true)) s) x;
INSERT INTO public.custom_commission_revisions(id,configuration_id,revision_number,status,brief,drawings,quote,provenance,
  submitted_at,quoted_at,approved_at) VALUES
(pg_temp.uid(861),pg_temp.uid(851),2,'approved',jsonb_build_object('summary','Ebonized dining chair','intent','Match the table',
  -- requirements and materials in the native CustomCommissionBrief string[] shape.
  'requirements',jsonb_build_array('Seat height 18 in','Arms flush with the table'),
  'materials',jsonb_build_array('Ebonized oak','Linen'),'targetDate','2026-12-01','budgetCents',777007,'allowanceCents',777008,
  'fabricatorName','secret fabricator','notes','secret note','measurements',jsonb_build_array(jsonb_build_object(
    'label','Seat height','value',18,'unit','in','source','secret-source'))),
  jsonb_build_array(jsonb_build_object('name','Chair elevation','revision','B','url','https://secret.invalid/drawing.pdf')),
  '{"totalCents":777009}'::jsonb,'{}'::jsonb,now(),now(),now());
SET LOCAL session_replication_role=origin;
-- Native C1 mint (service_role-only RPC, called as the composing designer).
INSERT INTO ev_results VALUES('manifest',public.create_evidence_manifest(pg_temp.project(),NULL,'service_acceptance',jsonb_build_array(
  jsonb_build_object('kind','plan_issue','id',pg_temp.uid(741),'sha256',repeat('f',64),'version',1),
  jsonb_build_object('kind','plan_print','id',pg_temp.uid(722),'sha256',repeat('e',64),'rev','B'),
  jsonb_build_object('kind','approval_artifact','id',pg_temp.uid(771),'sha256',repeat('d',64),'version',1)),'client-evidence-1'));
SELECT pg_temp.assert_true((SELECT manifest_hash=encode(extensions.digest(public._plan_room_canonical_json(members),'sha256'),'hex')
  AND jsonb_array_length(members)=3 FROM public.evidence_manifests WHERE id=(SELECT (value->>'manifestId')::uuid FROM ev_results WHERE key='manifest')),
  'native manifest hash is taken over its three frozen members');
INSERT INTO ev_results SELECT 'manifest2',public.create_evidence_manifest(pg_temp.project(),NULL,'service_acceptance',jsonb_build_array(
  jsonb_build_object('kind','review_item','id',pg_temp.uid(842),'sha256',repeat('2',64),'version',1),
  jsonb_build_object('kind','product_configuration','id',c.id,'sha256',c.snapshot_hash,'version',1),
  jsonb_build_object('kind','custom_commission_revision','id',v.id,'sha256',encode(extensions.digest(public._plan_room_canonical_json(
    jsonb_build_object('configurationId',v.configuration_id,'revision',v.revision_number,'brief',v.brief,'drawings',v.drawings,
      'quote',v.quote,'provenance',v.provenance)),'sha256'),'hex'),'rev',2),
  jsonb_build_object('kind','approval_artifact','id',pg_temp.uid(771),'sha256',repeat('d',64),'version',1)),'client-evidence-2')
FROM public.product_configurations c JOIN public.custom_commission_revisions v ON v.configuration_id=c.id WHERE v.id=pg_temp.uid(861);
-- manifest3 names only print 723 (document 3), for the send-time pin checks.
INSERT INTO ev_results VALUES('manifest3',public.create_evidence_manifest(pg_temp.project(),NULL,'service_acceptance',jsonb_build_array(
  jsonb_build_object('kind','plan_print','id',pg_temp.uid(723),'sha256',repeat('7',64),'rev','A')),'client-evidence-3'));
-- Manifests naming kinds with no client projection (refused at admission below).
SET LOCAL session_replication_role=replica;
INSERT INTO public.evidence_manifests(id,project_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by)
SELECT pg_temp.uid(880+k),pg_temp.project(),'service_acceptance',m,
  encode(extensions.digest(public._plan_room_canonical_json(m),'sha256'),'hex'),repeat('6',64),'client-evidence-refused-'||k,pg_temp.uid(1)
FROM (VALUES(1,jsonb_build_array(jsonb_build_object('kind','po_spec_snapshot','id',pg_temp.uid(891),'sha256',repeat('3',64),'rev',1))),
  (2,jsonb_build_array(jsonb_build_object('kind','coordination_item_revision','id',pg_temp.uid(892),'sha256',repeat('4',64),'rev',1)))) x(k,m);
INSERT INTO ev_results SELECT 'refused'||k,jsonb_build_object('manifestId',pg_temp.uid(880+k)) FROM generate_series(1,2) k;
SET LOCAL session_replication_role=origin;

-- Draft requests (x08 pattern) bound to the native edition and a manifest;
-- inserted under replica, sent only by pg_temp.send below.
CREATE FUNCTION pg_temp.fixture_request(n integer, manifest_key text DEFAULT 'manifest')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.outbound_drafts(id,organization_id,project_id,kind,channel,recipient_kind,to_client_id,
 subject,body,ref_type,ref_id,dedupe_key) VALUES
 (pg_temp.uid(200+n),'f8891000-0000-4000-8000-000000000001',pg_temp.project(),'service_acceptance_request',
 'email','client',pg_temp.uid(5),'Service acceptance','Projection fixture only','service_acceptance_request',pg_temp.uid(100+n),'client-evidence-'||n);
 INSERT INTO public.service_acceptance_requests(id,project_id,scope_edition_id,scope_content_hash,evidence_manifest_id,
 evidence_manifest_hash,request_number,lifecycle,outbound_draft_id,sent_at,client_request_id,request_hash,created_by)
 SELECT pg_temp.uid(100+n),pg_temp.project(),e.id,e.content_hash,m.id,m.manifest_hash,n,'draft',pg_temp.uid(200+n),
 NULL,'client-evidence-'||n,repeat('b',64),pg_temp.uid(1)
 FROM public.project_scope_editions e, public.evidence_manifests m
 WHERE e.project_id=pg_temp.project() AND e.status='active'
   AND m.id=(SELECT (value->>'manifestId')::uuid FROM ev_results WHERE key=manifest_key);
 INSERT INTO public.service_acceptance_signers(id,request_id,slot,required,profile_id,policy_slot) VALUES
 (pg_temp.uid(300+n),pg_temp.uid(100+n),'required',true,pg_temp.uid(6),'required'),
 (pg_temp.uid(400+n),pg_temp.uid(100+n),'optional',false,pg_temp.uid(7),'optional');
 INSERT INTO public.service_acceptance_signers(request_id,slot,required,profile_id,policy_slot,status,replaced_by_signer_id,
 replacement_reason,replaced_by,replaced_at,replacement_client_request_id,replacement_request_hash,replacement_policy_revision,
 replacement_lapsed_intake_ids) VALUES
 (pg_temp.uid(100+n),'required',true,pg_temp.uid(11),'required','replaced',pg_temp.uid(300+n),'Moved out',pg_temp.uid(1),now(),
  'client-evidence-replace-'||n,repeat('7',64),2,'{}');
END $$;
-- The native V22 send: the delivery worker marks the outbound draft delivered
-- and its after-send done, which fires _service_acceptance_after_send (sent_at
-- and, since SQ-2283, the evidence snapshot). Runs with triggers on (origin).
CREATE FUNCTION pg_temp.send(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE public.outbound_drafts SET status='sent',delivered_at=now(),after_send_done_at=now()
  WHERE id=pg_temp.uid(200+n) AND after_send_done_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'no unsent outbound draft for request %',n; END IF;
END $$;
-- END shared fixture
SET LOCAL session_replication_role=replica;
SELECT pg_temp.fixture_request(1);
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
-- An unsent draft freezes nothing: the studio may still replace a print it names.
SELECT pg_temp.actor(1);
WITH u AS (UPDATE storage.objects SET metadata=metadata||'{"eTag":"draft-edit"}' WHERE bucket_id='project-documents'
  AND name=pg_temp.doc_path(1) RETURNING 1)
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM u),'unsent draft leaves its print object mutable for the studio');
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
 WHERE id=pg_temp.uid(101);
SELECT pg_temp.fixture_request(2);
SET LOCAL session_replication_role=origin;
SELECT pg_temp.send(2);
SELECT pg_temp.assert_true((SELECT lifecycle='sent' AND sent_at IS NOT NULL FROM public.service_acceptance_requests
  WHERE id=pg_temp.uid(102)),'the native send transition sends request 102');
-- The send pins each member as it stands and each served object's identity.
SELECT pg_temp.assert_sql(format($q$SELECT (SELECT array_agg(member_kind ORDER BY ordinal) FROM public.service_acceptance_evidence_snapshots
  WHERE request_id=%1$L)=ARRAY['approval_artifact','plan_issue','plan_print']
 AND (SELECT array_agg(p.object_name||'@'||(p.object_id=o.id AND p.object_version IS NOT DISTINCT FROM o.version) ORDER BY p.object_name)
  FROM public.service_acceptance_evidence_snapshot_objects p JOIN storage.objects o ON o.bucket_id=p.bucket_id AND o.name=p.object_name
  WHERE p.request_id=%1$L)=ARRAY[%2$L||'@true',%3$L||'@true',%4$L||'@true']$q$,pg_temp.uid(102),pg_temp.doc_path(1),pg_temp.doc_path(2),
  pg_temp.doc_path(4)),'the send snapshots three members and pins the live identity of documents 1, 2 and 4');

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
 PERFORM pg_temp.assert_true((SELECT bool_and(pg_temp.keys(m)=ARRAY['content','documents','issuedAt','kind','title']
   AND m->>'issuedAt' IS NOT NULL
   AND (SELECT COALESCE(bool_and(pg_temp.keys(d)=ARRAY['bucket','path','title'] AND d->>'bucket'='project-documents'),true)
     FROM jsonb_array_elements(m->'documents') d)) FROM jsonb_array_elements(members) m),'exact member and document key sets for actor '||n);
 PERFORM pg_temp.assert_true((SELECT jsonb_agg(jsonb_build_object('kind',m->>'kind','title',m->>'title','content',m->'content',
     'documents',m->'documents')) FROM jsonb_array_elements(members) m)=jsonb_build_array(
   jsonb_build_object('kind','approval_artifact','title','Care pack','content',jsonb_build_object('source','spec_book_artifact',
     'question','Approve the care pack?'),'documents',jsonb_build_array(
     jsonb_build_object('bucket','project-documents','path',pg_temp.doc_path(4),'title','Care pack folio'))),
   jsonb_build_object('kind','plan_issue','title','Spec book issue 1','content',NULL,'documents',jsonb_build_array(
     jsonb_build_object('bucket','project-documents','path',pg_temp.doc_path(1),'title','Kitchen set'))),
   jsonb_build_object('kind','plan_print','title','A-201 Kitchen elevations','content',NULL,'documents',jsonb_build_array(
     jsonb_build_object('bucket','project-documents','path',pg_temp.doc_path(2),'title','Kitchen elevations')))),
  'titles, client content and documents resolve from the native member rows for actor '||n);
 SELECT string_agg(f,',') INTO leak FROM unnest(ARRAY['payer','fabrication','provenance','room_ids','owed','signerPolicy',
   'profile','cost','price','margin','trade','note','snapshot','sha256','created_by','fee','evidence-3','margin workbook',
   pg_temp.uid(1)::text,pg_temp.uid(5)::text,pg_temp.uid(6)::text,pg_temp.uid(7)::text,pg_temp.uid(11)::text]) f
  WHERE strpos(lower(ev::text),lower(f))>0;
 PERFORM pg_temp.assert_true(leak IS NULL,'no forbidden field or person in the payload for actor '||n||' ['||COALESCE(leak,'')||']');
 -- Storage: exactly the returned documents open, the unrelated one does not.
 PERFORM pg_temp.assert_true(public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1))
  AND public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2))
  AND public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(4))
  AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(3)),'predicate admits the three evidence documents only for actor '||n);
 PERFORM pg_temp.assert_true((SELECT array_agg(name ORDER BY name) FROM storage.objects WHERE bucket_id='project-documents'
   AND name LIKE pg_temp.project()::text||'/%')=ARRAY[pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(4)],
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
   AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2))
   AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(4)),'evidence predicate refuses: '||label);
  PERFORM pg_temp.assert_true(public.get_my_service_acceptance_requests()='[]'::jsonb,'client list agrees, no rows: '||label);
 END LOOP;
 FOR n,label IN SELECT * FROM (VALUES(11,'replaced signer'),(8,'another household'),(4,'second studio')) actors(n,label) LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='project-documents'
   AND name IN (pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(4))),'storage opens no evidence document: '||label);
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

-- ---------------------------------------------------------------------------
-- GC and maker, natively related: refused the acceptance read and predicate.
-- Their file access is the pre-existing 00584 team read, which 00889 leaves alone.
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.project_team_members WHERE project_id=pg_temp.project()
  AND user_id IN (pg_temp.uid(9),pg_temp.uid(10)) AND role='vendor' AND removed_at IS NULL)
 AND (SELECT array_agg(party_kind ORDER BY party_kind)=ARRAY['gc','vendor'] FROM public.project_parties
  WHERE project_id=pg_temp.project() AND profile_id IN (pg_temp.uid(9),pg_temp.uid(10)))
 AND EXISTS(SELECT 1 FROM public.project_parties pp JOIN public.vendors v ON v.id=pp.vendor_id
  JOIN public.studio_vendor_accounts a ON a.vendor_id=v.id AND a.organization_id='f8891000-0000-4000-8000-000000000001'
  WHERE pp.project_id=pg_temp.project() AND pp.profile_id=pg_temp.uid(10) AND v.contact_profile_id=pg_temp.uid(10))
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id IN (pg_temp.uid(9),pg_temp.uid(10)) AND is_designer),
 'GC and maker are native team members and parties, the maker is the studio vendor, neither is a designer');
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; label text; BEGIN
 FOR n,label IN SELECT * FROM (VALUES(9,'GC'),(10,'maker')) actors(n,label) LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(102)),'42501',
   'insufficient_privilege','evidence refused to the related '||label);
  PERFORM pg_temp.assert_true(NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1))
   AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2))
   AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(3))
   AND NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(4)),'evidence predicate refuses the related '||label);
  PERFORM pg_temp.assert_true(public.is_project_team_member(pg_temp.project())
   AND (SELECT array_agg(name ORDER BY name) FROM storage.objects WHERE bucket_id='project-documents'
    AND name LIKE pg_temp.project()::text||'/%')=ARRAY[pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(3),pg_temp.doc_path(4)],
   'the related '||label||' keeps the 00584 team read of every project document');
 END LOOP;
END $$;
RESET ROLE;
UPDATE public.project_team_members SET removed_at=now()
 WHERE project_id=pg_temp.project() AND user_id IN (pg_temp.uid(9),pg_temp.uid(10));
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; label text; BEGIN
 FOR n,label IN SELECT * FROM (VALUES(9,'GC'),(10,'maker')) actors(n,label) LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true(NOT public.is_project_team_member(pg_temp.project())
   AND (SELECT count(*)=0 FROM storage.objects WHERE bucket_id='project-documents' AND name LIKE pg_temp.project()::text||'/%'),
   'off the team, the '||label||'''s party and vendor ties open no project document');
  PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(102)),'42501',
   'insufficient_privilege','evidence still refused to the '||label||' off the team');
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

-- ---------------------------------------------------------------------------
-- A sent request freezes the objects behind its plan prints and its spec book
-- approval artifact (SQ-2273 F1): no overwrite, move, delete, or re-upload at
-- a bound name, for the studio (allowed by the 00584 write policies),
-- service_role, or the migration owner.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE t.tgrelid='storage.objects'::regclass AND t.tgname='immutable_service_acceptance_evidence_object' AND t.tgenabled='O'
   AND t.tgtype=(1|2|4|8|16)::int2 AND p.oid=to_regprocedure('public._guard_service_acceptance_evidence_object()')
   AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public, pg_temp']),
 'one enabled BEFORE INSERT OR UPDATE OR DELETE row trigger guards evidence objects');
SELECT pg_temp.assert_true(CASE WHEN g IS NOT NULL THEN NOT has_function_privilege(r,g,'EXECUTE') END,
 r||' no execute on the evidence object guard')
FROM unnest(ARRAY['anon','authenticated','service_role']) r, to_regprocedure('public._guard_service_acceptance_evidence_object()') g;
-- The Storage API's own delete switch, so a refusal below is the guard's, not protect_delete's.
SET LOCAL storage.allow_delete_query='true';
CREATE TEMP TABLE frozen_objects AS SELECT id,name,metadata,version,updated_at FROM storage.objects
 WHERE bucket_id='project-documents' AND name IN (pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(4));
GRANT SELECT ON frozen_objects TO authenticated;
CREATE FUNCTION pg_temp.refuse_writes(who text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 FOREACH n IN ARRAY ARRAY[1,2,4] LOOP
  PERFORM pg_temp.expect_error(format($q$UPDATE storage.objects SET metadata=metadata||'{"eTag":"swapped"}'
   WHERE bucket_id='project-documents' AND name=%L$q$,pg_temp.doc_path(n)),'23514','bound by a sent request',
   who||': same-name overwrite of bound document '||n||' refused');
  PERFORM pg_temp.expect_error(format($q$UPDATE storage.objects SET name=%L WHERE bucket_id='project-documents' AND name=%L$q$,
   pg_temp.doc_path(n)||'.moved',pg_temp.doc_path(n)),'23514','bound by a sent request',who||': move of bound document '||n||' refused');
  PERFORM pg_temp.expect_error(format($q$DELETE FROM storage.objects WHERE bucket_id='project-documents' AND name=%L$q$,
   pg_temp.doc_path(n)),'23514','bound by a sent request',who||': delete of bound document '||n||' refused');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
   VALUES('project-documents',%L,%L,'{"eTag":"replacement"}')$q$,pg_temp.doc_path(n),pg_temp.uid(1)),'23514','bound by a sent request',
   who||': re-upload at bound document '||n||' refused');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
   VALUES('project-documents',%L,%L,'{"eTag":"replacement"}') ON CONFLICT (bucket_id,name) DO UPDATE SET metadata=excluded.metadata$q$,
   pg_temp.doc_path(n),pg_temp.uid(1)),'23514','bound by a sent request',who||': upsert at bound document '||n||' refused');
 END LOOP;
 PERFORM pg_temp.expect_error(format($q$UPDATE storage.objects SET name=%L WHERE bucket_id='project-documents' AND name=%L$q$,
  pg_temp.doc_path(1),pg_temp.doc_path(3)),'23514','bound by a sent request',who||': moving another object onto a bound name refused');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.refuse_writes(text),pg_temp.expect_error(text,text,text,text),pg_temp.assert_true(boolean,text),
  pg_temp.uid(integer),pg_temp.project(),pg_temp.doc_path(integer) TO service_role;
GRANT ALL ON assertion_count,ev_results TO service_role;
GRANT EXECUTE ON FUNCTION pg_temp.refuse_writes(text) TO authenticated;
SELECT pg_temp.refuse_writes('migration owner');
SET LOCAL ROLE service_role;
SELECT pg_temp.refuse_writes('service_role');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.refuse_writes('studio owner');
SELECT pg_temp.actor(6);
SELECT pg_temp.assert_true((SELECT array_agg(o.id ORDER BY o.name) FROM storage.objects o WHERE o.bucket_id='project-documents'
  AND o.name IN (pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(4)))=(SELECT array_agg(id ORDER BY name) FROM frozen_objects),
 'the signer still opens the very objects that were bound');
-- An unbound document beside them stays ordinary studio work.
SELECT pg_temp.actor(1);
WITH u AS (UPDATE storage.objects SET metadata=metadata||'{"eTag":"studio-edit"}' WHERE bucket_id='project-documents'
  AND name=pg_temp.doc_path(3) RETURNING 1)
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM u),'unbound document: studio overwrite still allowed');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id='project-documents' AND name=pg_temp.doc_path(3) RETURNING 1)
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM d),'unbound document: studio delete still allowed');
WITH i AS (INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
  VALUES('project-documents',pg_temp.doc_path(3),pg_temp.uid(1)::text,'{"eTag":"reupload"}') RETURNING 1)
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM i),'unbound document: studio re-upload still allowed');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT array_agg(jsonb_build_object('id',o.id,'name',o.name,'metadata',o.metadata,'version',o.version,
  'updatedAt',o.updated_at) ORDER BY o.name) FROM storage.objects o WHERE o.bucket_id='project-documents'
  AND o.name IN (pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(4)))=(SELECT array_agg(jsonb_build_object('id',f.id,'name',f.name,
  'metadata',f.metadata,'version',f.version,'updatedAt',f.updated_at) ORDER BY f.name) FROM frozen_objects f)
 AND (SELECT count(*)=3 FROM frozen_objects),
 'bound objects are byte-for-byte the rows that were bound');

-- ---------------------------------------------------------------------------
-- The pin is the send-time snapshot, not a live anchor (SQ-2281 F1): moving
-- the Folio row behind the approval artifact to another project unpins nothing.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role=replica;
INSERT INTO public.projects(id,name,created_by,designer_id) VALUES
(pg_temp.uid(901),'Evidence project B',pg_temp.uid(1),pg_temp.uid(1));
SET LOCAL session_replication_role=origin;
UPDATE public.project_documents SET project_id=pg_temp.uid(901) WHERE id=pg_temp.uid(704);
SELECT pg_temp.assert_true((SELECT project_id=pg_temp.uid(901) FROM public.project_documents WHERE id=pg_temp.uid(704)),
 'the Folio row behind the approval artifact now sits on project B');
SELECT pg_temp.refuse_writes('migration owner, Folio row on project B');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.refuse_writes('studio owner, Folio row on project B');
RESET ROLE;
UPDATE public.project_documents SET project_id=pg_temp.project() WHERE id=pg_temp.uid(704);
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(6);
SELECT pg_temp.assert_true((SELECT array_agg(jsonb_build_object('id',o.id,'name',o.name,'metadata',o.metadata,'version',o.version)
  ORDER BY o.name) FROM storage.objects o WHERE o.bucket_id='project-documents'
  AND o.name IN (pg_temp.doc_path(1),pg_temp.doc_path(2),pg_temp.doc_path(4)))=(SELECT array_agg(jsonb_build_object('id',f.id,
  'name',f.name,'metadata',f.metadata,'version',f.version) ORDER BY f.name) FROM frozen_objects f),
 'Folio row back on project A: the signer reads the original bound objects');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- A pinned name serves only the pinned row: when the live object there is not
-- the pinned id and version (replaced by a path that skips triggers), the
-- storage predicate refuses it; the other pins stay readable.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role=replica;
UPDATE storage.objects SET version='replaced-v2' WHERE bucket_id='project-documents' AND name=pg_temp.doc_path(2);
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(6);
SELECT pg_temp.assert_true(NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2))
  AND public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(1)),
 'stale version: the pinned name is refused, another pin is still admitted');
SELECT pg_temp.assert_true((SELECT array_agg(name ORDER BY name) FROM storage.objects WHERE bucket_id='project-documents'
  AND name LIKE pg_temp.project()::text||'/%')=ARRAY[pg_temp.doc_path(1),pg_temp.doc_path(4)],
 'stale version: storage SELECT hides the replaced object');
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE storage.objects SET version=f.version,id=gen_random_uuid() FROM frozen_objects f
 WHERE storage.objects.bucket_id='project-documents' AND storage.objects.name=pg_temp.doc_path(2) AND f.name=storage.objects.name;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(6);
SELECT pg_temp.assert_true(NOT public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2))
  AND (SELECT count(*)=0 FROM storage.objects WHERE bucket_id='project-documents' AND name=pg_temp.doc_path(2)),
 'stale id: a different object at the pinned name is refused');
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE storage.objects SET id=f.id FROM frozen_objects f
 WHERE storage.objects.bucket_id='project-documents' AND storage.objects.name=pg_temp.doc_path(2) AND f.name=storage.objects.name;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(6);
SELECT pg_temp.assert_true(public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(2)),
 'the pinned id and version again: the object is served again');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Non-plan evidence reads through per-kind allowlists (SQ-2272 F1): a sent
-- request on the second native manifest.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
 WHERE id=pg_temp.uid(102);
SELECT pg_temp.fixture_request(3,'manifest2');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.send(3);
-- Native CustomCommissionBrief lists keep their string[] shape (SQ-2280 F1);
-- any other shape is dropped, never coerced.
SELECT pg_temp.assert_sql($q$SELECT public._service_acceptance_texts('["Seat height 18 in"," ","Arms",3,null,{"x":"y"},["z"]]')
  ='["Seat height 18 in","Arms"]'::jsonb AND public._service_acceptance_texts('[]')='[]'::jsonb
 AND public._service_acceptance_texts('"Seat height 18 in"') IS NULL AND public._service_acceptance_texts('{"a":"b"}') IS NULL
 AND public._service_acceptance_texts('7') IS NULL AND public._service_acceptance_texts(NULL) IS NULL$q$,
 'text lists keep exactly their non-blank string elements in order; scalars and objects are not lists');
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; ev jsonb; members jsonb; leak text; BEGIN
 FOREACH n IN ARRAY ARRAY[6,5] LOOP
  PERFORM pg_temp.actor(n);
  ev:=public.get_my_service_acceptance_evidence(pg_temp.uid(103));
  members:=ev->'evidence'->'members';
  PERFORM pg_temp.assert_true(jsonb_array_length(members)=4 AND (SELECT bool_and(pg_temp.keys(m)=ARRAY['content','documents',
    'issuedAt','kind','title'] AND m->>'issuedAt' IS NOT NULL) FROM jsonb_array_elements(members) m),
   'every non-plan member has the member shape for actor '||n);
  PERFORM pg_temp.assert_true((SELECT jsonb_object_agg(m->>'kind',jsonb_build_object('title',m->>'title','content',m->'content',
      'documents',m->'documents')) FROM jsonb_array_elements(members) m)=jsonb_build_object(
    'review_item',jsonb_build_object('title','Walnut sofa','documents','[]'::jsonb,'content',jsonb_build_object('docCode','F-12',
      'category','Seating','quantity',2,'room','Living room','details',jsonb_build_object('description','Low walnut sofa',
      'finish','Oiled walnut'))),
    'product_configuration',jsonb_build_object('title','Dining chair','documents','[]'::jsonb,'content',jsonb_build_object(
      'productName','Spindle chair','leadTimeWeeks',10,
      'selections',jsonb_build_array(jsonb_build_object('groupName','Finish','valueLabel','Ebonized oak')),
      'components',jsonb_build_array(jsonb_build_object('name','Seat cushion','quantity',1,'handedness','none')),
      'dimensions',jsonb_build_object('width',20,'depth',22,'height',34,'unit','in'),
      'fabric',jsonb_build_object('fabricName','Linen','pattern','Herringbone'))),
    'custom_commission_revision',jsonb_build_object('title','Dining chair revision 2','documents','[]'::jsonb,'content',
      jsonb_build_object('summary','Ebonized dining chair','intent','Match the table','requirements',jsonb_build_array('Seat height 18 in','Arms flush with the table'),
      'materials',jsonb_build_array('Ebonized oak','Linen'),'targetDate','2026-12-01','revision',2,
      'measurements',jsonb_build_array(jsonb_build_object('label','Seat height','value',18,'unit','in')),
      'drawings',jsonb_build_array(jsonb_build_object('name','Chair elevation','revision','B')))),
    'approval_artifact',jsonb_build_object('title','Care pack','documents',jsonb_build_array(jsonb_build_object('bucket',
      'project-documents','path',pg_temp.doc_path(4),'title','Care pack folio')),'content',jsonb_build_object(
      'source','spec_book_artifact','question','Approve the care pack?'))),
   'each non-plan kind reads exactly its allowlisted projection for actor '||n);
  SELECT string_agg(f,',') INTO leak FROM unnest(ARRAY['secret','7770','price','cost','sku','vendor','mill','sidemark','note',
    'budget','allowance','fabricator','url','media','checksum','productid','snapshot','context','trade',pg_temp.uid(1)::text,
    pg_temp.uid(843)::text,pg_temp.uid(844)::text,pg_temp.uid(852)::text]) f WHERE strpos(lower(members::text),lower(f))>0;
  PERFORM pg_temp.assert_true(leak IS NULL,'no poison from the native rows for actor '||n||' ['||COALESCE(leak,'')||']');
  INSERT INTO ev_results VALUES('nonplan'||n,ev);
 END LOOP;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The client reads what was issued (SQ-2280 F2, SQ-2281 F3): renaming or
-- re-timing every member row after the send changes no title, issuedAt,
-- content or document title. Triggers are off for the edits, so even rows
-- that are immutable after issue change underneath.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role=replica;
UPDATE public.project_documents SET title='Renamed '||title WHERE id IN (pg_temp.uid(701),pg_temp.uid(702),pg_temp.uid(704));
UPDATE public.plan_sheets SET title='Renamed sheet',sheet_number='Z'||sheet_number WHERE id IN (pg_temp.uid(711),pg_temp.uid(712));
UPDATE public.plan_issues SET name='Renamed issue',issued_at=issued_at+interval '1 day' WHERE id=pg_temp.uid(741);
UPDATE public.plan_prints SET created_at=created_at+interval '1 day' WHERE id IN (pg_temp.uid(721),pg_temp.uid(722));
UPDATE public.project_approval_artifacts SET artifact_title='Renamed care pack',question='Renamed question?',
  created_at=created_at+interval '1 day' WHERE id=pg_temp.uid(771);
UPDATE public.product_configurations SET name='Renamed chair',issued_at=now()+interval '1 day' WHERE id=pg_temp.uid(851);
UPDATE public.custom_commission_revisions SET issued_at=now()+interval '1 day' WHERE id=pg_temp.uid(861);
UPDATE public.project_review_editions SET published_at=published_at+interval '1 day' WHERE id=pg_temp.uid(841);
UPDATE public.project_review_items SET item_snapshot=item_snapshot||'{"name":"Renamed sofa"}' WHERE id=pg_temp.uid(842);
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 FOREACH n IN ARRAY ARRAY[6,5] LOOP
  PERFORM pg_temp.actor(n);
  PERFORM pg_temp.assert_true(public.get_my_service_acceptance_evidence(pg_temp.uid(102))=(SELECT value FROM ev_results
    WHERE key='reader'||n),'plan evidence reads exactly as sent after its member rows were renamed and re-timed, actor '||n);
  PERFORM pg_temp.assert_true(public.get_my_service_acceptance_evidence(pg_temp.uid(103))=(SELECT value FROM ev_results
    WHERE key='nonplan'||n),'non-plan evidence reads exactly as sent after its member rows were renamed and re-timed, actor '||n);
 END LOOP;
END $$;
RESET ROLE;

-- A sent request whose manifest names a kind with no projection fails closed.
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
 WHERE id=pg_temp.uid(103);
SELECT pg_temp.fixture_request(4,'refused1');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.send(4);
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
 WHERE id=pg_temp.uid(104);
SELECT pg_temp.fixture_request(5,'refused2');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.send(5);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; r integer; BEGIN
 FOREACH r IN ARRAY ARRAY[104,105] LOOP
  FOREACH n IN ARRAY ARRAY[6,5] LOOP
   PERFORM pg_temp.actor(n);
   PERFORM pg_temp.expect_error(format('SELECT public.get_my_service_acceptance_evidence(%L)',pg_temp.uid(r)),'23514',
    'service_acceptance_evidence_not_client_readable','reader fails closed on unreadable request '||r||' for actor '||n);
  END LOOP;
 END LOOP;
END $$;
RESET ROLE;
-- Admission refuses those kinds before writing anything and admits a manifest
-- of every readable kind. create_service_acceptance_request ships inactive.
UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
SELECT pg_temp.actor(1);
SELECT pg_temp.expect_error(format('SELECT public.create_service_acceptance_request(%L,%L,%L,%L)',pg_temp.project(),
  (SELECT id FROM public.project_scope_editions WHERE project_id=pg_temp.project() AND status='active'),pg_temp.uid(880+k),
  'client-evidence-admit-'||k),'23514','service_acceptance_evidence_not_client_readable',
  'admission refuses a '||(SELECT members->0->>'kind' FROM public.evidence_manifests WHERE id=pg_temp.uid(880+k))||' member')
FROM generate_series(1,2) k;
SELECT pg_temp.assert_true((SELECT count(*)=5 FROM public.service_acceptance_requests WHERE project_id=pg_temp.project()),
 'a refused admission writes no request');
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM public.create_service_acceptance_request(pg_temp.project(),
    (SELECT id FROM public.project_scope_editions WHERE project_id=pg_temp.project() AND status='active'),
    (SELECT (value->>'manifestId')::uuid FROM ev_results WHERE key='manifest2'),'client-evidence-admit-readable');
  got:=(SELECT 'admitted:'||count(*) FROM public.service_acceptance_requests WHERE project_id=pg_temp.project()
    AND lifecycle IN ('draft','sent') AND evidence_manifest_id=(SELECT (value->>'manifestId')::uuid FROM ev_results WHERE key='manifest2'));
  RAISE EXCEPTION 'probe rolled back';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'probe rolled back' THEN got:=SQLERRM; END IF;
 END;
 PERFORM pg_temp.assert_true(got='admitted:1','admission accepts a manifest of every readable non-plan kind ['||COALESCE(got,'')||']');
END $$;
UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';

-- ---------------------------------------------------------------------------
-- The send pins what it serves (SQ-2281 F2): a served object missing at send
-- refuses the send, which writes nothing; once the object is back, the send
-- pins it, the signer reads it, and it is frozen.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role=replica;
UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
 WHERE id=pg_temp.uid(105);
SELECT pg_temp.fixture_request(6,'manifest3');
DELETE FROM storage.objects WHERE bucket_id='project-documents' AND name=pg_temp.doc_path(3);
SET LOCAL session_replication_role=origin;
SELECT pg_temp.expect_error('SELECT pg_temp.send(6)','23514','service_acceptance_evidence_object_missing',
 'send refuses a served object that is missing at send');
SELECT pg_temp.assert_sql(format($q$SELECT (SELECT lifecycle='draft' AND sent_at IS NULL FROM public.service_acceptance_requests
  WHERE id=%1$L) AND NOT EXISTS(SELECT 1 FROM public.service_acceptance_evidence_snapshots WHERE request_id=%1$L)
 AND (SELECT after_send_done_at IS NULL FROM public.outbound_drafts WHERE id=%2$L)$q$,pg_temp.uid(106),pg_temp.uid(206)),
 'the refused send leaves the request an unsent draft with no snapshot');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.assert_sql(format($q$WITH i AS (INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
  VALUES('project-documents',%L,%L,'{"eTag":"lighting"}') RETURNING 1) SELECT count(*)=1 FROM i$q$,pg_temp.doc_path(3),pg_temp.uid(1)),
 'the studio uploads the lighting print again before the send');
RESET ROLE;
SELECT pg_temp.send(6) FROM public.outbound_drafts WHERE id=pg_temp.uid(206) AND after_send_done_at IS NULL;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(6);
SELECT pg_temp.assert_true(public._can_read_service_acceptance_evidence_object(pg_temp.doc_path(3))
  AND (SELECT metadata->>'eTag'='lighting' FROM storage.objects WHERE bucket_id='project-documents' AND name=pg_temp.doc_path(3)),
 'the send pinned the uploaded object and the signer reads it');
SELECT pg_temp.actor(1);
SELECT pg_temp.expect_error(format($q$UPDATE storage.objects SET metadata=metadata||'{"eTag":"late"}'
  WHERE bucket_id='project-documents' AND name=%L$q$,pg_temp.doc_path(3)),'23514','bound by a sent request',
 'after the send the studio cannot overwrite the pinned object');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions'),'capability still off after reads');
DO $$ BEGIN RAISE NOTICE 'C4 client evidence: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
