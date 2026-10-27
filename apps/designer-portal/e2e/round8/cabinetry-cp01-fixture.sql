-- CP-01 fictional GC cabinetry package, owned by SQ-2079 (X06). Local 127.0.0.1 only.
-- Seeded the way supabase/tests/round8/external_package_reading_body.psql seeds the
-- 00884 reader: replica-mode SETUP of already-recorded facts. It activates nothing,
-- calls no writer RPC, and creates NO purchase order, studio purchase or invoice.
-- Service-fixture rows do NOT prove authenticated activation of any C5 act.
-- Actors: F01 designer f0180000-...-0002 records; Sam (f2079000-...-0011) verifies;
-- Ana (f2079000-...-0012) is the GC seat. Every id is prefix-scoped 'f2079000-'.
BEGIN;
CREATE FUNCTION pg_temp.cp(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('f2079000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'f2079000-%')
     OR EXISTS (SELECT 1 FROM public.projects WHERE id::text LIKE 'f2079000-%')
     OR EXISTS (SELECT 1 FROM public.project_external_fulfilments WHERE id::text LIKE 'f2079000-%') THEN
    RAISE EXCEPTION 'SQ-2079 fixture residue: refusing to overwrite';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'f0180000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'SQ-2079 fixture needs the round8 F01 designer';
  END IF;
  IF EXISTS (SELECT 1 FROM public.server_capabilities WHERE key = 'scope_editions' AND enabled) THEN
    RAISE EXCEPTION 'SQ-2079 fixture refuses an activated scope_editions capability';
  END IF;
END $$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role) VALUES
 (pg_temp.cp(11),'cp01-sam@test.invalid','',now(),now(),now(),'authenticated','authenticated'),
 (pg_temp.cp(12),'cp01-ana@test.invalid','',now(),now(),now(),'authenticated','authenticated'),
 (pg_temp.cp(13),'cp01-client@test.invalid','',now(),now(),now(),'authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer) VALUES
 (pg_temp.cp(11),'cp01-sam@test.invalid','CP01 Sam Ortiz',false),
 (pg_temp.cp(12),'cp01-ana@test.invalid','CP01 Ana Ruiz',false),
 (pg_temp.cp(13),'cp01-client@test.invalid','CP01 Fictional Client',false);
INSERT INTO public.projects(id,name,designer_id,created_by,client_id,studio_id,status) VALUES
 (pg_temp.cp(201),'CP01 Fictional Kitchen','f0180000-0000-4000-8000-000000000002','f0180000-0000-4000-8000-000000000002',
  pg_temp.cp(13),'f0180000-0000-4000-8000-000000000001','active');
INSERT INTO public.proposals(id,project_id,designer_id,client_id,title,status,document_kind,commercial_state) VALUES
 (pg_temp.cp(911),pg_temp.cp(201),'f0180000-0000-4000-8000-000000000002',pg_temp.cp(13),'CP01 agreement','accepted','design_services','executed');
INSERT INTO public.project_commercial_documents(id,project_id,proposal_id,document_kind,is_origin,bound_at,executed_at,created_by) VALUES
 (pg_temp.cp(901),pg_temp.cp(201),pg_temp.cp(911),'design_services',true,now(),now(),'f0180000-0000-4000-8000-000000000002');
INSERT INTO public.project_scope_editions(id,project_id,edition_number,kind,commercial_document_id,source_proposal_id,
 agreement_fingerprint,effective_at,content,content_hash,status) VALUES
 (pg_temp.cp(301),pg_temp.cp(201),1,'baseline',pg_temp.cp(901),pg_temp.cp(911),'fixture',now(),'{}','fixture','active');
INSERT INTO public.project_scope_edition_packages(edition_id,package_key,label,inclusion,responsibilities) VALUES
 (pg_temp.cp(301),'pkg.cp01','Kitchen cabinetry','included',
  '{"design":"studio","purchasing":"gc","payer":"gc","fabrication_contract":"gc","installation":"gc"}'::jsonb);
INSERT INTO public.project_packages(id,project_id,package_kind,code,title,package_key,created_by,idempotency_key,request_hash) VALUES
 (pg_temp.cp(801),pg_temp.cp(201),'cabinetry','CP-01','Kitchen cabinetry','pkg.cp01','f0180000-0000-4000-8000-000000000002','cp01-package','fixture');
INSERT INTO public.project_parties(id,project_id,profile_id,party_kind,stage,display_name,created_by) VALUES
 (pg_temp.cp(811),pg_temp.cp(201),pg_temp.cp(12),'gc','active','CP01 Ana Ruiz','f0180000-0000-4000-8000-000000000002'),
 (pg_temp.cp(812),pg_temp.cp(201),pg_temp.cp(11),'sub','active','CP01 Sam Ortiz','f0180000-0000-4000-8000-000000000002');
INSERT INTO public.project_party_authority(id,engagement_id,scope,effective_from,granted_by,threshold_cents,idempotency_key,fabrication_grant_request) VALUES
 (pg_temp.cp(850),pg_temp.cp(811),'fabrication',current_date,'f0180000-0000-4000-8000-000000000002',5000000,'cp01-grant',
  jsonb_build_object('project_id',pg_temp.cp(201),'profile_id',pg_temp.cp(12)));
INSERT INTO public.designer_clients(id,designer_id,client_id,status) VALUES
 (pg_temp.cp(902),'f0180000-0000-4000-8000-000000000002',pg_temp.cp(13),'active');
INSERT INTO public.client_decisions(id,designer_client_id,designer_id,project_id,title,status,court,coordination_kind) VALUES
 (pg_temp.cp(601),pg_temp.cp(902),'f0180000-0000-4000-8000-000000000002',pg_temp.cp(201),'CP01 Northline shop drawings','pending','designer','submittal'),
 (pg_temp.cp(602),pg_temp.cp(902),'f0180000-0000-4000-8000-000000000002',pg_temp.cp(201),'CP01 H-14 hardware substitution','pending','designer','submittal');
INSERT INTO public.coordination_item_revisions(id,decision_id,rev_number,status,reviewed_by,reviewed_at,note) VALUES
 (pg_temp.cp(701),pg_temp.cp(601),1,'approved','f0180000-0000-4000-8000-000000000002',now(),'CP01 maker shop drawing round');
INSERT INTO public.plan_issues(id,project_id,issue_number,name,idempotency_key,request_hash,set_checksum,sheet_count,created_by) VALUES
 (pg_temp.cp(821),pg_temp.cp(201),1,'CP01 cabinet issue A','cp01-issue-1',repeat('a',64),repeat('1',64),1,'f0180000-0000-4000-8000-000000000002'),
 (pg_temp.cp(822),pg_temp.cp(201),2,'CP01 cabinet issue B','cp01-issue-2',repeat('a',64),repeat('2',64),1,'f0180000-0000-4000-8000-000000000002');
INSERT INTO public.project_external_fulfilments(id,project_id,scope_edition_id,package_key,units,kind,
 buyer_party_kind,payer_party_kind,contracting_party_kind,party_engagement_id,reported_price_cents,price_visibility,
 status,created_by,client_request_id,request_hash) VALUES
 (pg_temp.cp(401),pg_temp.cp(201),pg_temp.cp(301),'pkg.cp01',ARRAY['k-1','k-2','k-3','k-4','k-5','k-6'],'gc_cabinetry',
  'gc','gc','gc',pg_temp.cp(811),2840000,'studio_only','received','f0180000-0000-4000-8000-000000000002','cp01-fulfilment','fixture');
-- The maker's submittal is bound to issue B before its approval (C5 §3.1 U3/U5).
INSERT INTO public.project_external_fulfilment_evidence_bindings(id,fulfilment_id,decision_id,units,covers_plan_issue_id,
 covers_configuration_snapshot_hash,bound_by,client_request_id,request_hash) VALUES
 (pg_temp.cp(501),pg_temp.cp(401),pg_temp.cp(601),ARRAY['k-1','k-2'],pg_temp.cp(822),NULL,
  'f0180000-0000-4000-8000-000000000002','cp01-binding','fixture');
-- Exact instruction contents: issue B plus the maker's approved round.
INSERT INTO public.evidence_manifests(id,project_id,package_id,purpose,members,manifest_hash,created_by,idempotency_key,request_hash)
SELECT pg_temp.cp(851),pg_temp.cp(201),pg_temp.cp(801),'fabrication_instruction',
 jsonb_build_array(
  jsonb_build_object('kind','plan_issue','id',pg_temp.cp(822),'version',2,'sha256',repeat('2',64)),
  jsonb_build_object('kind','coordination_item_revision','id',pg_temp.cp(701),'rev',1,'sha256',repeat('7',64))),
 repeat('c',64),'f0180000-0000-4000-8000-000000000002','cp01-manifest',repeat('d',64);
INSERT INTO public.evidence_manifest_members(manifest_id,plan_issue_id) VALUES (pg_temp.cp(851),pg_temp.cp(822));
INSERT INTO public.evidence_manifest_members(manifest_id,coordination_item_revision_id) VALUES (pg_temp.cp(851),pg_temp.cp(701));
INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence,plan_issue_id,recorded_by,event_seq,client_request_id,request_hash) VALUES
 (pg_temp.cp(1001),pg_temp.cp(401),'package_issued',jsonb_build_object('planIssueId',pg_temp.cp(821),'configurationSnapshotHash',NULL),
  pg_temp.cp(821),'f0180000-0000-4000-8000-000000000002',1,'cp01-issue-a','fixture'),
 (pg_temp.cp(1002),pg_temp.cp(401),'package_issued',jsonb_build_object('planIssueId',pg_temp.cp(822),'configurationSnapshotHash',NULL),
  pg_temp.cp(822),'f0180000-0000-4000-8000-000000000002',2,'cp01-issue-b','fixture');
-- Recorded by the designer, verified by Sam: Sam's verification stays Sam's.
INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence,evidence_level,recorded_by,
 verified_by,verified_at,verification_seq,event_seq,client_request_id,request_hash) VALUES
 (pg_temp.cp(1003),pg_temp.cp(401),'contract_reported','{"contractAmountCents":2750000}','verified',
  'f0180000-0000-4000-8000-000000000002',pg_temp.cp(11),now(),1,3,'cp01-contract','fixture');
INSERT INTO public.project_external_fulfilment_verifications(event_id,fulfilment_id,client_request_id,request_hash,verified_by) VALUES
 (pg_temp.cp(1003),pg_temp.cp(401),'cp01-verify','fixture',pg_temp.cp(11));
INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence,affected_units,authority_id,manifest_id,
 manifest_hash,amount_cents,actor_id,evidence_route,coverage,recorded_by,event_seq,client_request_id,request_hash) VALUES
 (pg_temp.cp(1004),pg_temp.cp(401),'fabrication_instruction',
  jsonb_build_object('manifestId',pg_temp.cp(851),'authorizingPartyId',pg_temp.cp(811)),
  ARRAY['k-1','k-2'],pg_temp.cp(850),pg_temp.cp(851),repeat('c',64),900000,'f0180000-0000-4000-8000-000000000002','shop_drawing',
  jsonb_build_array(jsonb_build_object('unit','k-1','revisionIds',jsonb_build_array(pg_temp.cp(701))),
                    jsonb_build_object('unit','k-2','revisionIds',jsonb_build_array(pg_temp.cp(701)))),
  'f0180000-0000-4000-8000-000000000002',4,'cp01-instruction','fixture');
INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence,affected_units,recorded_by,event_seq,client_request_id,request_hash) VALUES
 (pg_temp.cp(1005),pg_temp.cp(401),'hold',jsonb_build_object('decisionId',pg_temp.cp(602)),ARRAY['k-3','k-4'],
  'f0180000-0000-4000-8000-000000000002',5,'cp01-hold-hw','fixture'),
 (pg_temp.cp(1006),pg_temp.cp(401),'hold',jsonb_build_object('decisionId',pg_temp.cp(601)),ARRAY['k-5'],
  'f0180000-0000-4000-8000-000000000002',6,'cp01-hold-k5','fixture');
INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence,releases_event_id,recorded_by,event_seq,client_request_id,request_hash) VALUES
 (pg_temp.cp(1007),pg_temp.cp(401),'release_hold',jsonb_build_object('releasesEventId',pg_temp.cp(1006),'decisionId',pg_temp.cp(601)),
  pg_temp.cp(1006),'f0180000-0000-4000-8000-000000000002',7,'cp01-release-k5','fixture');
INSERT INTO public.project_external_fulfilment_events(id,fulfilment_id,event_kind,evidence,recorded_by,event_seq,client_request_id,request_hash) VALUES
 (pg_temp.cp(1008),pg_temp.cp(401),'received','{}','f0180000-0000-4000-8000-000000000002',8,'cp01-received','fixture');
SET LOCAL session_replication_role = origin;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id = 'f2079000-0000-4000-8000-000000000401') <> 8 THEN
    RAISE EXCEPTION 'SQ-2079 fixture: expected eight recorded events';
  END IF;
END $$;
COMMIT;
