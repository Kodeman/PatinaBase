-- RC-7 E4: only initial actors, agreed scope and unfinished evidence are seeded.
-- Every C5 event, binding, approval, manifest and instruction is a native act in the spec.
BEGIN;
DO $$ BEGIN
 IF (SELECT system_identifier FROM pg_control_system()) <> 7702030541241491498 THEN
  RAISE EXCEPTION 'E4 fixture refuses a different Postgres system identifier'; END IF;
 IF EXISTS (SELECT 1 FROM public.projects WHERE id::text LIKE 'e4070000-%') THEN
  RAISE EXCEPTION 'E4 fixture residue'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='f0180000-0000-4000-8000-000000000002') THEN
  RAISE EXCEPTION 'F01 designer missing'; END IF;
END $$;
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role) VALUES
 ('e4070000-0000-4000-8000-000000000011','e4-maker@test.invalid','',now(),now(),now(),'authenticated','authenticated'),
 ('e4070000-0000-4000-8000-000000000012','e4-gc@test.invalid','',now(),now(),now(),'authenticated','authenticated'),
 ('e4070000-0000-4000-8000-000000000013','e4-client@test.invalid','',now(),now(),now(),'authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer) VALUES
 ('e4070000-0000-4000-8000-000000000011','e4-maker@test.invalid','E4 Cabinet Maker',false),
 ('e4070000-0000-4000-8000-000000000012','e4-gc@test.invalid','E4 General Contractor',false),
 ('e4070000-0000-4000-8000-000000000013','e4-client@test.invalid','E4 Fictional Client',false);
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
 ('e4070000-0000-4000-8000-000000000012','f0180000-0000-4000-8000-000000000001','admin','active');
INSERT INTO public.projects(id,name,designer_id,created_by,client_id,studio_id,status) VALUES
 ('e4070000-0000-4000-8000-000000000201','E4 Cabinetry Kitchen','f0180000-0000-4000-8000-000000000002',
 'f0180000-0000-4000-8000-000000000002','e4070000-0000-4000-8000-000000000013','f0180000-0000-4000-8000-000000000001','active');
-- An ordinary, priced intent line is converted through the product RPC in the journey.
INSERT INTO public.project_ffe_selection_threads(id,project_id,primary_ffe_item_id,created_by) VALUES
 ('e4070000-0000-4000-8000-000000000841','e4070000-0000-4000-8000-000000000201','e4070000-0000-4000-8000-000000000840','f0180000-0000-4000-8000-000000000002');
INSERT INTO public.project_ffe_items(id,project_id,name,selection_thread_id,item_type,quantity,unit_price_cents,line_total_cents,currency) VALUES
 ('e4070000-0000-4000-8000-000000000840','e4070000-0000-4000-8000-000000000201','Four kitchen cabinets','e4070000-0000-4000-8000-000000000841','fixed',1,2840000,2840000,'USD');
INSERT INTO public.proposals(id,project_id,designer_id,client_id,title,status,document_kind,commercial_state) VALUES
 ('e4070000-0000-4000-8000-000000000911','e4070000-0000-4000-8000-000000000201','f0180000-0000-4000-8000-000000000002',
 'e4070000-0000-4000-8000-000000000013','E4 agreed design scope','accepted','design_services','executed');
INSERT INTO public.project_commercial_documents(id,project_id,proposal_id,document_kind,is_origin,bound_at,executed_at,created_by) VALUES
 ('e4070000-0000-4000-8000-000000000901','e4070000-0000-4000-8000-000000000201','e4070000-0000-4000-8000-000000000911',
 'design_services',true,now(),now(),'f0180000-0000-4000-8000-000000000002');
INSERT INTO public.project_scope_editions(id,project_id,edition_number,kind,commercial_document_id,source_proposal_id,agreement_fingerprint,effective_at,content,content_hash,status) VALUES
 ('e4070000-0000-4000-8000-000000000301','e4070000-0000-4000-8000-000000000201',1,'baseline',
 'e4070000-0000-4000-8000-000000000901','e4070000-0000-4000-8000-000000000911','fixture',now(),'{}','fixture','active');
INSERT INTO public.project_scope_edition_packages(edition_id,package_key,label,inclusion,responsibilities) VALUES
 ('e4070000-0000-4000-8000-000000000301','pkg.e4','Kitchen cabinets','included',
 '{"design":"studio","purchasing":"gc","payer":"gc","fabrication_contract":"gc","installation":"gc"}'::jsonb),
 ('e4070000-0000-4000-8000-000000000301','pkg.e4detail','Pantry detailed route','included',
 '{"design":"studio","purchasing":"gc","payer":"gc","fabrication_contract":"gc","installation":"gc"}'::jsonb);
INSERT INTO public.project_packages(id,project_id,package_kind,code,title,package_key,created_by,idempotency_key,request_hash) VALUES
 ('e4070000-0000-4000-8000-000000000801','e4070000-0000-4000-8000-000000000201','cabinetry','E4-01','Kitchen cabinets','pkg.e4','f0180000-0000-4000-8000-000000000002','e4-package','fixture'),
 ('e4070000-0000-4000-8000-000000000802','e4070000-0000-4000-8000-000000000201','cabinetry','E4-02','Pantry detailed route','pkg.e4detail','f0180000-0000-4000-8000-000000000002','e4-detail','fixture');
INSERT INTO public.project_parties(id,project_id,profile_id,party_kind,stage,display_name,created_by) VALUES
 ('e4070000-0000-4000-8000-000000000811','e4070000-0000-4000-8000-000000000201','e4070000-0000-4000-8000-000000000012','gc','active','E4 GC','f0180000-0000-4000-8000-000000000002'),
 ('e4070000-0000-4000-8000-000000000812','e4070000-0000-4000-8000-000000000201','e4070000-0000-4000-8000-000000000011','sub','active','E4 Maker','f0180000-0000-4000-8000-000000000002');
INSERT INTO public.designer_clients(id,designer_id,client_id,status) VALUES
 ('e4070000-0000-4000-8000-000000000902','f0180000-0000-4000-8000-000000000002','e4070000-0000-4000-8000-000000000013','active');
INSERT INTO public.client_decisions(id,designer_client_id,designer_id,project_id,title,status,court,coordination_kind) VALUES
 ('e4070000-0000-4000-8000-000000000601','e4070000-0000-4000-8000-000000000902','f0180000-0000-4000-8000-000000000002','e4070000-0000-4000-8000-000000000201','E4 shop drawings; appliance clearances, sample and site verification','pending','designer','submittal'),
 ('e4070000-0000-4000-8000-000000000602','e4070000-0000-4000-8000-000000000902','f0180000-0000-4000-8000-000000000002','e4070000-0000-4000-8000-000000000201','E4 hardware substitution: K3/K4 drilling, approvals, price and schedule','pending','designer','submittal'),
 ('e4070000-0000-4000-8000-000000000603','e4070000-0000-4000-8000-000000000902','f0180000-0000-4000-8000-000000000002','e4070000-0000-4000-8000-000000000201','E4 detailed route maker verification','pending','designer','submittal');
INSERT INTO public.coordination_item_revisions(id,decision_id,rev_number,status,note) VALUES
 ('e4070000-0000-4000-8000-000000000701','e4070000-0000-4000-8000-000000000601',1,'submitted','Maker drawing, sample and verified field measure'),
 ('e4070000-0000-4000-8000-000000000702','e4070000-0000-4000-8000-000000000602',1,'submitted','Proposed pull changes K3/K4 drilling; +$380; +7 days; GC, maker and studio copied'),
 ('e4070000-0000-4000-8000-000000000703','e4070000-0000-4000-8000-000000000603',1,'submitted','Maker verified designer detail and appliance interfaces');
INSERT INTO public.plan_sheets(id,project_id,sheet_number,title) VALUES
 ('e4070000-0000-4000-8000-000000000821','e4070000-0000-4000-8000-000000000201','E4-1','Kitchen cabinet intent');
INSERT INTO public.plan_prints(id,sheet_id,batch_id,print_number,rev_letter,project_document_id,sha256) VALUES
 ('e4070000-0000-4000-8000-000000000822','e4070000-0000-4000-8000-000000000821','e4070000-0000-4000-8000-000000000823',1,'A','e4070000-0000-4000-8000-000000000824',repeat('a',64));
UPDATE public.plan_sheets SET current_print_id='e4070000-0000-4000-8000-000000000822',current_print_number=1 WHERE id='e4070000-0000-4000-8000-000000000821';
INSERT INTO public.plan_sheet_packages(sheet_id,package_id) VALUES
 ('e4070000-0000-4000-8000-000000000821','e4070000-0000-4000-8000-000000000801'),
 ('e4070000-0000-4000-8000-000000000821','e4070000-0000-4000-8000-000000000802');
INSERT INTO public.product_configurations(id,product_id,project_id,owner_user_id,version,schema_revision,status,evaluation,snapshot,snapshot_hash,approved_at,approved_by) VALUES
 ('e4070000-0000-4000-8000-000000000831','e4070000-0000-4000-8000-000000000832','e4070000-0000-4000-8000-000000000201',
 'f0180000-0000-4000-8000-000000000002',1,1,'approved','{}','{}',public._configuration_snapshot_hash('{}'),now(),'f0180000-0000-4000-8000-000000000002');
SET LOCAL session_replication_role=origin;
COMMIT;
