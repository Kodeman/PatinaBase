-- US-31 B3b lifecycle: decision reminders and overdue notices are drafts until sent.
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('77900000-0000-4000-8000-000000000001','decision-designer@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('77900000-0000-4000-8000-000000000002','decision-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('77900000-0000-4000-8000-000000000001','decision-designer@test.invalid','Decision Designer',now(),now()),
 ('77900000-0000-4000-8000-000000000002','decision-client@test.invalid','Decision Client',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES
 ('77900000-0000-4000-8000-000000000011','design_studio','Decision Draft Studio','decision-draft-studio');
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at) VALUES
 ('77900000-0000-4000-8000-000000000021','77900000-0000-4000-8000-000000000001','77900000-0000-4000-8000-000000000011','owner','active',now());
INSERT INTO projects (id,name,designer_id,created_by,studio_id,client_id) VALUES
 ('77900000-0000-4000-8000-000000000031','Decision Draft Project','77900000-0000-4000-8000-000000000001','77900000-0000-4000-8000-000000000001','77900000-0000-4000-8000-000000000011','77900000-0000-4000-8000-000000000002');
INSERT INTO designer_clients (id,designer_id,client_id) VALUES
 ('77900000-0000-4000-8000-000000000041','77900000-0000-4000-8000-000000000001','77900000-0000-4000-8000-000000000002');
INSERT INTO client_decisions (id,designer_client_id,project_id,title,status) VALUES
 ('77900000-0000-4000-8000-000000000051','77900000-0000-4000-8000-000000000041','77900000-0000-4000-8000-000000000031','Decision to resolve','pending');

SET LOCAL ROLE service_role;
SELECT public.compose_outbound_draft('decision_reminder','77900000-0000-4000-8000-000000000011','77900000-0000-4000-8000-000000000031','email','client','{"client_id":"77900000-0000-4000-8000-000000000002","address":"decision-client@test.invalid"}','Reminder','Reminder copy','{}','client_decision','77900000-0000-4000-8000-000000000051','decision:77900000-0000-4000-8000-000000000051:decision_reminder:1',now(),null,'system');
SELECT public.compose_outbound_draft('decision_overdue','77900000-0000-4000-8000-000000000011','77900000-0000-4000-8000-000000000031','email','client','{"client_id":"77900000-0000-4000-8000-000000000002","address":"decision-client@test.invalid"}','Overdue','Overdue copy','{}','client_decision','77900000-0000-4000-8000-000000000051','decision:77900000-0000-4000-8000-000000000051:decision_overdue:2026-10-13',now(),null,'system');
SELECT is((SELECT count(*)::int FROM public.outbound_drafts WHERE ref_type='client_decision' AND ref_id='77900000-0000-4000-8000-000000000051' AND status='awaiting_review'),2,'reminder and overdue composers leave review drafts');
RESET ROLE;
UPDATE public.client_decisions SET status='responded' WHERE id='77900000-0000-4000-8000-000000000051';
SELECT is((SELECT count(*)::int FROM public.outbound_drafts WHERE ref_type='client_decision' AND ref_id='77900000-0000-4000-8000-000000000051' AND status='discarded'),2,'decision response resolves reminder and overdue drafts');
SELECT * FROM finish();
ROLLBACK;
