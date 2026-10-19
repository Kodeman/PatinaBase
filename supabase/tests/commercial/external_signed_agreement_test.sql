-- US-39: transactional private evidence and ordinary purchasing lifecycle.
BEGIN;
SET LOCAL statement_timeout = '60s';
-- Match the Storage API's deletion transaction; RLS/our trigger must still deny.
SET LOCAL storage.allow_delete_query = 'true';
CREATE FUNCTION pg_temp.as_actor(actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
 PERFORM set_config('request.jwt.claim.sub', coalesce(actor::text,''), true);
END $$;
CREATE FUNCTION pg_temp.refuses(command text, message_pattern text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN message := SQLERRM; END;
 ASSERT message IS NOT NULL AND message ~ message_pattern,
   format('Expected refusal %s, got %s for %s', message_pattern, coalesce(message, 'SUCCESS'), command);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.refuses(text,text) TO authenticated, anon;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
SELECT ('83500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 'external-'||n||'@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'
FROM generate_series(1,3) n;
INSERT INTO profiles (id,email,full_name,is_designer)
SELECT id,email,'External fixture',id <> '83500000-0000-4000-8000-000000000002' FROM auth.users
WHERE email LIKE 'external-%@test.invalid' ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES
 ('83500000-0000-4000-8000-000000000010','design_studio','External studio','external-agreement-fixture');
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000010','owner','active',now());
INSERT INTO user_roles(user_id,role_id,granted_by)
SELECT '83500000-0000-4000-8000-000000000001',id,'83500000-0000-4000-8000-000000000001'
FROM roles WHERE name='studio_owner' ON CONFLICT DO NOTHING;
INSERT INTO designer_clients (id,designer_id,client_id,client_name,status,source) VALUES
 ('83500000-0000-4000-8000-000000000020','83500000-0000-4000-8000-000000000001',
 '83500000-0000-4000-8000-000000000002','External client','proposal','direct');
INSERT INTO projects(id,name,designer_id,client_id,created_by,studio_id,site_address) VALUES
 ('83500000-0000-4000-8000-000000000100','External project','83500000-0000-4000-8000-000000000001',
 '83500000-0000-4000-8000-000000000002','83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000010','123 Fixture Lane'),
 ('83500000-0000-4000-8000-000000000101','Other project','83500000-0000-4000-8000-000000000003',
 '83500000-0000-4000-8000-000000000002','83500000-0000-4000-8000-000000000003',null,null);
INSERT INTO project_rooms(id,project_id,name) VALUES
 ('83500000-0000-4000-8000-000000000200','83500000-0000-4000-8000-000000000100','Living');
INSERT INTO vendors(id,name) VALUES ('83500000-0000-4000-8000-000000000300','Fixture vendor');
INSERT INTO project_ffe_items(id,project_id,project_room_id,assignment_scope,name,status,item_type,quantity,
 unit_price_cents,trade_price_cents,line_total_cents,vendor_id,vendor_name,design_disposition,custom_fields)
SELECT ('83500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'83500000-0000-4000-8000-000000000100',
 '83500000-0000-4000-8000-000000000200','room','Fixture chair '||n,'specified','fixed',1,
 10000,7000,10000,'83500000-0000-4000-8000-000000000300','Fixture vendor','selected',
 '{"image_url":"https://example.invalid/synthetic-chair.jpg"}'::jsonb
FROM generate_series(401,403) n;
INSERT INTO project_budget_versions(id,project_id,version,created_by) VALUES
 ('83500000-0000-4000-8000-000000000500','83500000-0000-4000-8000-000000000100',1,'83500000-0000-4000-8000-000000000001');
INSERT INTO project_budget_lines(budget_version_id,project_room_id,room_name,category,low_cents,target_cents,high_cents) VALUES
 ('83500000-0000-4000-8000-000000000500','83500000-0000-4000-8000-000000000200','Living','Uncategorized',10000,20000,30000);
-- Simulate hostile generic policies; restrictive bucket boundaries must win.
CREATE POLICY us39_generic_storage ON storage.objects FOR ALL TO authenticated,anon USING (true) WITH CHECK (true);
CREATE POLICY us39_generic_buckets ON storage.buckets FOR ALL TO authenticated,anon USING (true) WITH CHECK (true);
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 UPDATE storage.buckets SET public=true WHERE id='project-agreements';
 ASSERT NOT FOUND,'private bucket cannot be made public under generic policy';
 DELETE FROM storage.buckets WHERE id='project-agreements';
 ASSERT NOT FOUND,'private bucket cannot be deleted under generic policy';
 PERFORM pg_temp.refuses($q$insert into storage.objects(bucket_id,name,owner_id) values ('project-agreements','83500000-0000-4000-8000-000000000101/83500000-0000-4000-8000-000000000699.pdf','83500000-0000-4000-8000-000000000001')$q$,'row-level security');
 PERFORM pg_temp.refuses($q$insert into storage.objects(bucket_id,name,owner_id) values ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000699.pdf','83500000-0000-4000-8000-000000000003')$q$,'row-level security');
 PERFORM pg_temp.refuses($q$insert into project_external_agreement_evidence(project_id,storage_object_id,storage_key,signed_on,covers_project,attested_by) values ('83500000-0000-4000-8000-000000000100',extensions.gen_random_uuid(),'fake',current_date,true,'83500000-0000-4000-8000-000000000001')$q$,'permission denied');
 ASSERT public.get_project_purchasing_agreement('83500000-0000-4000-8000-000000000100')->>'state'='missing','missing stays closed';
 PERFORM pg_temp.refuses($q$select public.create_furnishings_authorization_from_schedule('83500000-0000-4000-8000-000000000100','Missing agreement',array['83500000-0000-4000-8000-000000000401'::uuid],0)$q$,'no executed design-services origin');
END $$;
-- These are synthetic local storage metadata rows, never real signed evidence.
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES
 ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf','83500000-0000-4000-8000-000000000001','{"mimetype":"application/pdf","size":128}'),
 ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000602.pdf','83500000-0000-4000-8000-000000000001','{"mimetype":"text/plain","size":128}'),
 ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000603.pdf','83500000-0000-4000-8000-000000000001','{"mimetype":"application/pdf","size":20971521}'),
 ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000604.pdf','83500000-0000-4000-8000-000000000001','{"mimetype":"application/pdf"}');
DO $$
DECLARE k text := '83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf'; n int;
BEGIN
 PERFORM pg_temp.refuses(format('select public.record_project_external_agreement_evidence(%L,%L,current_date,false)','83500000-0000-4000-8000-000000000100',k),'Confirm project coverage');
 PERFORM pg_temp.refuses(format('select public.record_project_external_agreement_evidence(%L,%L,null,true)','83500000-0000-4000-8000-000000000100',k),'valid, nonfuture');
 PERFORM pg_temp.refuses(format('select public.record_project_external_agreement_evidence(%L,%L,current_date+1,true)','83500000-0000-4000-8000-000000000100',k),'valid, nonfuture');
 PERFORM pg_temp.refuses(format('select public.record_project_external_agreement_evidence(%L,%L,''infinity'',true)','83500000-0000-4000-8000-000000000100',k),'valid, nonfuture');
 FOR n IN 602..605 LOOP
  PERFORM pg_temp.refuses(format('select public.record_project_external_agreement_evidence(%L,%L,current_date,true)',
   '83500000-0000-4000-8000-000000000100',replace(k,'601.pdf',n||'.pdf')),'uploaded PDF');
 END LOOP;
 PERFORM pg_temp.refuses(format('select public.record_project_external_agreement_evidence(%L,%L,current_date,true)',
 '83500000-0000-4000-8000-000000000101',k),'access denied');
END $$;
RESET ROLE;
-- An object with correct path but another uploader must not be recordable.
UPDATE storage.objects SET owner_id='83500000-0000-4000-8000-000000000003' WHERE name LIKE '%601.pdf';
SET LOCAL ROLE authenticated;
SELECT pg_temp.refuses($q$select public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true)$q$,'belong to you');
RESET ROLE;
UPDATE storage.objects SET owner_id='83500000-0000-4000-8000-000000000001' WHERE name LIKE '%601.pdf';
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.refuses($q$select public.get_project_purchasing_agreement('83500000-0000-4000-8000-000000000100')$q$,'access denied');
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='project-agreements'),'client cannot read even with generic policy'; END $$;
RESET ROLE;
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT pg_temp.refuses($q$select public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true)$q$,'access denied');
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='project-agreements'),'anon cannot read even with generic policy'; END $$;
SELECT pg_temp.refuses($q$select public.get_project_purchasing_agreement('83500000-0000-4000-8000-000000000100')$q$,'permission denied');
RESET ROLE;
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
 a:=public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true);
 b:=public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true);
 ASSERT a=b,'same completed upload/date retries return identical evidence';
 ASSERT public.get_project_purchasing_agreement('83500000-0000-4000-8000-000000000100')->>'state'='external_recorded','external evidence eligible';
 PERFORM pg_temp.refuses($q$select public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000602.pdf',current_date,true)$q$,'cannot be replaced');
 UPDATE storage.objects SET name=name||'.changed' WHERE name LIKE '%601.pdf';
 ASSERT NOT FOUND,'authenticated overwrite denied even under generic policy';
 DELETE FROM storage.objects WHERE name LIKE '%601.pdf';
 ASSERT NOT FOUND,'authenticated deletion denied even under generic policy';
 PERFORM pg_temp.refuses($q$delete from public.project_external_agreement_evidence$q$,'permission denied');
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM project_commercial_documents WHERE project_id='83500000-0000-4000-8000-000000000100'),'record creates no origin or authorization';
 ASSERT NOT EXISTS (SELECT 1 FROM project_billing_authorities WHERE project_id='83500000-0000-4000-8000-000000000100'),'record grants no billing authority';
 ASSERT NOT EXISTS (SELECT 1 FROM project_ffe_items WHERE project_id='83500000-0000-4000-8000-000000000100' AND status='approved'),'record approves no items';
 ASSERT NOT EXISTS (SELECT 1 FROM commercial_document_signatures WHERE signer_user_id IN ('83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000002')),'record fabricates no signatures';
 PERFORM pg_temp.refuses($q$update public.project_external_agreement_evidence set signed_on=current_date-1$q$,'cannot be changed');
 PERFORM pg_temp.refuses($q$delete from storage.objects where name like '%601.pdf'$q$,'cannot be changed');
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM project_external_agreement_evidence WHERE project_id='83500000-0000-4000-8000-000000000100')=1,
   'studio author can read immutable evidence directly';
 ASSERT public.get_project_authority_summary('83500000-0000-4000-8000-000000000100') IS NULL,
   'external-only billing authority summary stays NULL';
END $$;
RESET ROLE;
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM project_external_agreement_evidence), 'client cannot read evidence';
 PERFORM pg_temp.refuses($q$insert into storage.objects(bucket_id,name,owner_id) values ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000699.pdf','83500000-0000-4000-8000-000000000002')$q$,'row-level security');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.refuses($q$select * from project_external_agreement_evidence$q$,'permission denied');
SELECT pg_temp.refuses($q$insert into storage.objects(bucket_id,name,owner_id) values ('project-agreements','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000699.pdf',null)$q$,'row-level security|permission denied');
RESET ROLE;
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000001');
-- Immutable external evidence must never inherit the legacy direct-PO exemption.
SELECT pg_temp.refuses($q$select public.create_purchase_order('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000300','full_upfront',array['83500000-0000-4000-8000-000000000403'::uuid])$q$,'not covered by an executed furnishing authorization');
-- Publish a REAL checkpoint after recording; do not seed a bypass checkpoint.
SET LOCAL ROLE authenticated;
DO $$
DECLARE checkpoint jsonb; failure text;
BEGIN
 BEGIN checkpoint := public.publish_budget_checkpoint('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000500');
 EXCEPTION WHEN OTHERS THEN failure:=SQLERRM; END;
 ASSERT failure IS NULL, format('external-only project publishes ordinary checkpoint: %s',failure);
 ASSERT (SELECT status='open' FROM public.project_budget_checkpoints WHERE id=(checkpoint->>'checkpointId')::uuid),
   'external publication stays open, not acknowledged or overridden';
 PERFORM pg_temp.refuses($q$select public.create_furnishings_authorization_from_schedule('83500000-0000-4000-8000-000000000100','Open checkpoint',array['83500000-0000-4000-8000-000000000401'::uuid],0)$q$,'checkpoint');
 PERFORM pg_temp.refuses(format('select public.override_budget_checkpoint(%L,''  no  '')',checkpoint->>'checkpointId'),'reason');
 PERFORM public.override_budget_checkpoint((checkpoint->>'checkpointId')::uuid,'Reviewed with client; purchasing budget agreed.');
END $$;
-- Two ordinary authorizations, one digital and one paper; each needs its OWN signature.
DO $$
DECLARE wave jsonb; snapshot jsonb; n int;
BEGIN
 FOR n IN 401..402 LOOP
  wave:=public.create_furnishings_authorization_from_schedule('83500000-0000-4000-8000-000000000100','External fixture '||n,
   ARRAY[('83500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid],CASE WHEN n=402 THEN 25 ELSE 0 END);
  PERFORM set_config('us39.wave'||n,wave->>'proposalId',true);
  PERFORM pg_temp.refuses(format('select public.execute_furnishings_authorization_on_paper(%L,''Fixture Client'',current_date)',wave->>'proposalId'),'not executable from draft');
  snapshot:=public.get_commercial_document_send_snapshot((wave->>'proposalId')::uuid);
  PERFORM public.send_commercial_document((wave->>'proposalId')::uuid,snapshot->>'documentFingerprint',null,now()+interval '30 days');
 END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM project_ffe_items WHERE project_id='83500000-0000-4000-8000-000000000100' AND status='approved'),'preparation/send alone never approves items';
 ASSERT (SELECT bool_and(designer_client_id='83500000-0000-4000-8000-000000000020' AND project_address='123 Fixture Lane') FROM proposals WHERE id IN (current_setting('us39.wave401')::uuid,current_setting('us39.wave402')::uuid)),'external draft uses exact project relationship/address';
END $$;
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT public.execute_furnishings_authorization(current_setting('us39.wave401')::uuid,'Fixture Client');
RESET ROLE;
SELECT pg_temp.as_actor('83500000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.execute_furnishings_authorization_on_paper(current_setting('us39.wave402')::uuid,'Fixture Client',current_date);
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM commercial_document_signatures WHERE proposal_id IN (current_setting('us39.wave401')::uuid,current_setting('us39.wave402')::uuid) AND party_role='client')=2,'each authorization has its own client signature';
 ASSERT (SELECT count(*) FROM project_ffe_items WHERE project_id='83500000-0000-4000-8000-000000000100' AND status='approved')=2,'ordinary digital and paper approvals execute';
 ASSERT NOT EXISTS(SELECT 1 FROM project_billing_authorities WHERE project_id='83500000-0000-4000-8000-000000000100'),'purchasing never grants billing authority';
END $$;
-- Direct guard probes run as fixture owner; actual PO/payment RPCs run as author.
-- External purchasing retains signed snapshot and paid-deposit controls.
DO $$ BEGIN
 PERFORM pg_temp.refuses($q$update public.project_ffe_items set quantity=2,purchase_order_id='83500000-0000-4000-8000-000000000999' where id='83500000-0000-4000-8000-000000000401'$q$,'differs from its signed snapshot');
 PERFORM pg_temp.refuses($q$update public.project_ffe_items set unit_price_cents=11000,line_total_cents=11000,purchase_order_id='83500000-0000-4000-8000-000000000999' where id='83500000-0000-4000-8000-000000000401'$q$,'differs from its signed snapshot');
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE invoice_id uuid; invoice_total int;
BEGIN
 PERFORM public.create_purchase_order('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000300','full_upfront',ARRAY['83500000-0000-4000-8000-000000000401'::uuid]);
 ASSERT (SELECT purchase_order_id IS NOT NULL FROM public.project_ffe_items WHERE id='83500000-0000-4000-8000-000000000401'),'authorized zero-deposit external line accepts PO';
 SELECT d.deposit_invoice_id,i.total_cents INTO invoice_id,invoice_total FROM public.project_commercial_documents d JOIN public.invoices i ON i.id=d.deposit_invoice_id WHERE d.proposal_id=current_setting('us39.wave402')::uuid;
 ASSERT invoice_id IS NOT NULL AND invoice_total=2500,'paper authorization retains its real required deposit';
 PERFORM pg_temp.refuses($q$select public.create_purchase_order('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000300','full_upfront',array['83500000-0000-4000-8000-000000000402'::uuid])$q$,'deposit invoice must be paid');
 PERFORM public.record_invoice_payment(invoice_id,invoice_total,'check','EXTERNAL-DEP',now(),NULL);
 PERFORM public.create_purchase_order('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000300','full_upfront',ARRAY['83500000-0000-4000-8000-000000000402'::uuid]);
 ASSERT (SELECT purchase_order_id IS NOT NULL FROM public.project_ffe_items WHERE id='83500000-0000-4000-8000-000000000402'),'paid signed external line accepts PO';
END $$;
RESET ROLE;
-- A later existing authority must close the external-only path, not be replaced.
INSERT INTO proposals(id,designer_id,designer_client_id,client_id,project_id,title,document_kind,commercial_state,status)
VALUES ('83500000-0000-4000-8000-000000000700','83500000-0000-4000-8000-000000000001',
 '83500000-0000-4000-8000-000000000020','83500000-0000-4000-8000-000000000002',
 '83500000-0000-4000-8000-000000000100','Existing authority fixture','service_addendum','executed','accepted');
INSERT INTO project_commercial_documents(id,project_id,proposal_id,document_kind,created_by)
VALUES ('83500000-0000-4000-8000-000000000701','83500000-0000-4000-8000-000000000100',
 '83500000-0000-4000-8000-000000000700','service_addendum','83500000-0000-4000-8000-000000000001');
INSERT INTO project_billing_authorities(project_id,commercial_document_id,source_proposal_id,
 billing_ceiling_cents,retainer_activation_policy,billing_cadence,status)
VALUES ('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000701',
 '83500000-0000-4000-8000-000000000700',0,'immediate','monthly','exhausted');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.get_project_authority_summary('83500000-0000-4000-8000-000000000100')->>'state'='exhausted',
   'existing exhausted authority remains exhausted';
 ASSERT public.get_project_purchasing_agreement('83500000-0000-4000-8000-000000000100')->>'state'='missing',
   'external evidence cannot bypass an existing authority';
 PERFORM pg_temp.refuses($q$select public.create_purchase_order('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000300','full_upfront',array['83500000-0000-4000-8000-000000000403'::uuid])$q$,'not covered by an executed furnishing authorization');
 PERFORM pg_temp.refuses($q$select public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true)$q$,'existing hold');
END $$;
RESET ROLE;
UPDATE project_billing_authorities SET status='superseded' WHERE project_id='83500000-0000-4000-8000-000000000100';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.get_project_authority_summary('83500000-0000-4000-8000-000000000100')->>'state'='superseded',
   'existing superseded billing hold remains unchanged';
 PERFORM pg_temp.refuses($q$select public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000100','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true)$q$,'existing hold');
END $$;
RESET ROLE;
-- Patina-origin reads/eligibility remain distinct from imported evidence.
INSERT INTO projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
 ('83500000-0000-4000-8000-000000000102','Patina origin fixture','83500000-0000-4000-8000-000000000001',
 '83500000-0000-4000-8000-000000000002','83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000010');
INSERT INTO proposals(id,designer_id,designer_client_id,client_id,project_id,title,document_kind,commercial_state,status)
VALUES ('83500000-0000-4000-8000-000000000710','83500000-0000-4000-8000-000000000001',
 '83500000-0000-4000-8000-000000000020','83500000-0000-4000-8000-000000000002',
 '83500000-0000-4000-8000-000000000102','Patina origin fixture','design_services','executed','accepted');
INSERT INTO project_commercial_documents(project_id,proposal_id,document_kind,is_origin,created_by,executed_at)
VALUES ('83500000-0000-4000-8000-000000000102','83500000-0000-4000-8000-000000000710',
 'design_services',true,'83500000-0000-4000-8000-000000000001',now());
DO $$ BEGIN
 ASSERT public.project_has_design_agreement_eligibility('83500000-0000-4000-8000-000000000102'),
   'executed Patina origin retains purchasing eligibility';
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.get_project_purchasing_agreement('83500000-0000-4000-8000-000000000102')=
   '{"state":"patina_signed","evidence":null}'::jsonb,'Patina origin is not relabeled external';
 PERFORM pg_temp.refuses($q$select public.record_project_external_agreement_evidence('83500000-0000-4000-8000-000000000102','83500000-0000-4000-8000-000000000100/83500000-0000-4000-8000-000000000601.pdf',current_date,true)$q$,'existing hold');
END $$;
RESET ROLE;
INSERT INTO projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
 ('83500000-0000-4000-8000-000000000103','True legacy fixture','83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000002','83500000-0000-4000-8000-000000000001','83500000-0000-4000-8000-000000000010');
INSERT INTO project_ffe_items(id,project_id,assignment_scope,name,status,item_type,quantity,unit_price_cents,trade_price_cents,line_total_cents,vendor_id,vendor_name,design_disposition,custom_fields)
SELECT ('83500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=404 THEN '83500000-0000-4000-8000-000000000102'::uuid ELSE '83500000-0000-4000-8000-000000000103'::uuid END,
 'unassigned','Control chair','specified','fixed',1,10000,7000,10000,'83500000-0000-4000-8000-000000000300','Fixture vendor','selected','{}'::jsonb FROM generate_series(404,405) n;
SET LOCAL ROLE authenticated;
SELECT pg_temp.refuses($q$select public.create_purchase_order('83500000-0000-4000-8000-000000000102','83500000-0000-4000-8000-000000000300','full_upfront',array['83500000-0000-4000-8000-000000000404'::uuid])$q$,'not covered by an executed furnishing authorization');
SELECT public.create_purchase_order('83500000-0000-4000-8000-000000000103','83500000-0000-4000-8000-000000000300','full_upfront',ARRAY['83500000-0000-4000-8000-000000000405'::uuid]);
DO $$ BEGIN ASSERT (SELECT purchase_order_id IS NOT NULL FROM public.project_ffe_items WHERE id='83500000-0000-4000-8000-000000000405'),'true legacy keeps direct PO exemption'; END $$;
RESET ROLE;
ROLLBACK;
