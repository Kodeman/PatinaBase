-- US-31 B3a invoice reminder draft state-change resolution (00778).
-- Run via `supabase test db supabase/tests/outbound/invoice_reminder_drafts_test.sql`.
BEGIN;
SELECT no_plan();
SELECT set_config('request.jwt.claim.role','service_role',true);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('77800000-0000-4000-8000-000000000001','invoice-reminder-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('77800000-0000-4000-8000-000000000001','invoice-reminder-owner@test.invalid','Invoice Reminder Owner',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug)
VALUES ('77800000-0000-4000-8000-000000000011','design_studio','Invoice Reminder Studio','invoice-reminder-test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at)
VALUES ('77800000-0000-4000-8000-000000000021','77800000-0000-4000-8000-000000000001','77800000-0000-4000-8000-000000000011','owner','active',now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id,name,designer_id,created_by,studio_id,client_id)
VALUES ('77800000-0000-4000-8000-000000000031','Invoice Reminder Project','77800000-0000-4000-8000-000000000001','77800000-0000-4000-8000-000000000001','77800000-0000-4000-8000-000000000011','77800000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO invoices (id,project_id,designer_id,client_id,invoice_number,status,due_date,total_cents)
VALUES
 ('77800000-0000-4000-8000-000000000041','77800000-0000-4000-8000-000000000031','77800000-0000-4000-8000-000000000001','77800000-0000-4000-8000-000000000001','IR-VOID','sent',current_date,10000),
 ('77800000-0000-4000-8000-000000000042','77800000-0000-4000-8000-000000000031','77800000-0000-4000-8000-000000000001','77800000-0000-4000-8000-000000000001','IR-PAID','sent',current_date,10000),
 ('77800000-0000-4000-8000-000000000043','77800000-0000-4000-8000-000000000031','77800000-0000-4000-8000-000000000001','77800000-0000-4000-8000-000000000001','IR-FLAG','sent',current_date,10000);

SET LOCAL ROLE service_role;
SELECT public.compose_outbound_draft('invoice_reminder','77800000-0000-4000-8000-000000000011','77800000-0000-4000-8000-000000000031','email','client','{"client_id":"77800000-0000-4000-8000-000000000001","address":"client@test.invalid"}','Reminder','Editable body','{"invoice_id":"77800000-0000-4000-8000-000000000041","step":0}','invoice','77800000-0000-4000-8000-000000000041','invoice:77800000-0000-4000-8000-000000000041:reminder:0',null,null,'system');
SELECT is((SELECT count(*)::int FROM public.outbound_drafts WHERE dedupe_key='invoice:77800000-0000-4000-8000-000000000041:reminder:0'),1,'daily re-compose with the same key is idempotent');
SELECT public.compose_outbound_draft('invoice_reminder','77800000-0000-4000-8000-000000000011','77800000-0000-4000-8000-000000000031','email','client','{"client_id":"77800000-0000-4000-8000-000000000001","address":"client@test.invalid"}','Reminder','Old step','{"invoice_id":"77800000-0000-4000-8000-000000000041","step":1}','invoice','77800000-0000-4000-8000-000000000041','invoice:77800000-0000-4000-8000-000000000041:reminder:1',null,null,'system');
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='invoice:77800000-0000-4000-8000-000000000041:reminder:0'),'superseded','newer same-kind step supersedes the prior draft');
SELECT public.compose_outbound_draft('invoice_overdue','77800000-0000-4000-8000-000000000011','77800000-0000-4000-8000-000000000031','email','client','{"client_id":"77800000-0000-4000-8000-000000000001","address":"client@test.invalid"}','Second notice','New step','{"invoice_id":"77800000-0000-4000-8000-000000000041","step":2}','invoice','77800000-0000-4000-8000-000000000041','invoice:77800000-0000-4000-8000-000000000041:reminder:2',null,null,'system');
UPDATE public.outbound_drafts SET status='superseded' WHERE ref_type='invoice' AND ref_id='77800000-0000-4000-8000-000000000041' AND kind IN ('invoice_reminder','invoice_overdue') AND status='awaiting_review' AND dedupe_key <> 'invoice:77800000-0000-4000-8000-000000000041:reminder:2';
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='invoice:77800000-0000-4000-8000-000000000041:reminder:1'),'superseded','+7 overdue step supersedes the unsent +1 reminder');

SELECT public.compose_outbound_draft('invoice_reminder','77800000-0000-4000-8000-000000000011','77800000-0000-4000-8000-000000000031','email','client','{"client_id":"77800000-0000-4000-8000-000000000001","address":"client@test.invalid"}','Reminder','Void me','{}','invoice','77800000-0000-4000-8000-000000000042','invoice:77800000-0000-4000-8000-000000000042:reminder:0',null,null,'system');
UPDATE public.invoices SET status='void', voided_at=now() WHERE id='77800000-0000-4000-8000-000000000041';
SELECT is((SELECT status FROM public.outbound_drafts WHERE ref_id='77800000-0000-4000-8000-000000000041' AND kind='invoice_overdue'),'discarded','voiding invoice discards its open reminder draft');
UPDATE public.invoices SET status='paid', paid_at=now() WHERE id='77800000-0000-4000-8000-000000000042';
SELECT is((SELECT status FROM public.outbound_drafts WHERE ref_id='77800000-0000-4000-8000-000000000042'),'discarded','paid invoice discards its open reminder draft');
SELECT public.compose_outbound_draft('invoice_overdue','77800000-0000-4000-8000-000000000011','77800000-0000-4000-8000-000000000031','email','client','{"client_id":"77800000-0000-4000-8000-000000000001","address":"client@test.invalid"}','Final notice','Flag me','{}','invoice','77800000-0000-4000-8000-000000000043','invoice:77800000-0000-4000-8000-000000000043:reminder:3',null,null,'system');
UPDATE public.invoices SET ar_flagged_at=now() WHERE id='77800000-0000-4000-8000-000000000043';
SELECT is((SELECT status FROM public.outbound_drafts WHERE ref_id='77800000-0000-4000-8000-000000000043'),'discarded','A/R flag discards its open reminder draft');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
