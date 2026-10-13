-- US-31 B1 outbound draft lifecycle, modes, rollout, and isolation (00775).
-- Run through `supabase test db supabase/tests/outbound/`; transaction is rolled back.
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('77500000-0000-4000-8000-000000000001','outbound-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('77500000-0000-4000-8000-000000000002','outbound-member@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('77500000-0000-4000-8000-000000000003','outbound-outsider@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('77500000-0000-4000-8000-000000000001','outbound-owner@test.invalid','Outbound Owner',now(),now()),
 ('77500000-0000-4000-8000-000000000002','outbound-member@test.invalid','Outbound Member',now(),now()),
 ('77500000-0000-4000-8000-000000000003','outbound-outsider@test.invalid','Outbound Outsider',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES
 ('77500000-0000-4000-8000-000000000011','design_studio','Outbound A','outbound-a-test'),
 ('77500000-0000-4000-8000-000000000012','design_studio','Outbound B','outbound-b-test');
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at) VALUES
 ('77500000-0000-4000-8000-000000000021','77500000-0000-4000-8000-000000000001','77500000-0000-4000-8000-000000000011','owner','active',now()),
 ('77500000-0000-4000-8000-000000000022','77500000-0000-4000-8000-000000000002','77500000-0000-4000-8000-000000000011','member','active',now()),
 ('77500000-0000-4000-8000-000000000023','77500000-0000-4000-8000-000000000003','77500000-0000-4000-8000-000000000012','owner','active',now());
INSERT INTO projects (id,name,designer_id,created_by,studio_id) VALUES
 ('77500000-0000-4000-8000-000000000031','Outbound project A','77500000-0000-4000-8000-000000000001','77500000-0000-4000-8000-000000000001','77500000-0000-4000-8000-000000000011'),
 ('77500000-0000-4000-8000-000000000032','Outbound project B','77500000-0000-4000-8000-000000000003','77500000-0000-4000-8000-000000000003','77500000-0000-4000-8000-000000000012');

SELECT is(public.studio_outbound_mode('77500000-0000-4000-8000-000000000011','invoice_reminder'), 'review', 'mode defaults to review');
SELECT is(public.outbound_review_active('77500000-0000-4000-8000-000000000011'), false, 'rollout defaults disabled');

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.compose_outbound_draft('invoice_reminder','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','email','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"client-a@test.invalid"}','Reminder','First body','{}','invoice','77500000-0000-4000-8000-000000000041','dedupe-775-1',now(),null,'system')$$, 'service can compose draft');
SELECT is((SELECT count(*)::int FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-1'),1,'compose inserts one draft');
SELECT lives_ok($$SELECT public.compose_outbound_draft('invoice_reminder','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','email','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"client-a@test.invalid"}','Changed title','Changed body','{}','invoice','77500000-0000-4000-8000-000000000041','dedupe-775-1',now(),null,'system')$$, 'duplicate compose is idempotent');
SELECT is((SELECT subject FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-1'),'Reminder','idempotent compose returns the existing row unchanged');
SELECT lives_ok($$SELECT public.compose_outbound_draft('invoice_reminder','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','email','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"client-a@test.invalid"}','New reminder','Second body','{}','invoice','77500000-0000-4000-8000-000000000041','dedupe-775-2',now(),null,'system')$$, 'newer compose succeeds');
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-1'),'superseded','new draft supersedes older open same-reference kind');

SELECT lives_ok($$SELECT public.compose_outbound_draft('client_digest','77500000-0000-4000-8000-000000000012',NULL,'email','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"client-a@test.invalid"}','Studio B digest','B body','{}','client','77500000-0000-4000-8000-000000000001','digest-b-775',now(),null,'system')$$,'compose the same client digest in another studio');
SELECT lives_ok($$SELECT public.compose_outbound_draft('client_digest','77500000-0000-4000-8000-000000000011',NULL,'email','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"client-a@test.invalid"}','Studio A digest','A body','{}','client','77500000-0000-4000-8000-000000000001','digest-a-775',now(),null,'system')$$,'compose newer digest in the original studio');
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='digest-b-775'),'awaiting_review','composing in one studio does not supersede another studio draft');

SELECT lives_ok($$SELECT public.compose_outbound_draft('decision_reminder','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','sms','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"+15555550101"}',null,'Claim body','{}','decision','77500000-0000-4000-8000-000000000042','dedupe-775-3',now(),null,'system')$$,'compose sms draft');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-3'))).status,'sending','claim moves awaiting review to sending');
UPDATE public.outbound_drafts SET claimed_at=now()-interval '11 minutes' WHERE dedupe_key='dedupe-775-3';
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-3'))).status,'sending','stalled sending draft can be reclaimed');
SELECT is((public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-3'))).status,'awaiting_review','release returns claim to review');

SELECT lives_ok($$SELECT public.compose_outbound_draft('delivery_confirm','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','push','client','{"client_id":"77500000-0000-4000-8000-000000000001"}',null,'Sent body','{}','delivery','77500000-0000-4000-8000-000000000043','dedupe-775-4',now(),null,'system')$$,'compose push draft');
SELECT public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-4'));
SELECT is((public.mark_outbound_draft_sent((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-4'),'77500000-0000-4000-8000-000000000001','provider-775')).status,'sent','mark sent completes claimed draft');
SELECT is((SELECT message_id FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-4'),'provider-775','mark sent stores provider message id');

SELECT lives_ok($$SELECT public.compose_outbound_draft('client_digest','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','email','client','{"client_id":"77500000-0000-4000-8000-000000000001","address":"client-a@test.invalid"}','Digest','Will expire','{}','digest','77500000-0000-4000-8000-000000000044','dedupe-775-5',now(),now()-interval '1 second','system')$$,'compose expiring draft');
SELECT is(public.expire_outbound_drafts(),1,'expiry marks due open draft expired');
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-5'),'expired','expiry persisted');
SELECT lives_ok($$SELECT public.compose_outbound_draft('site_request_due','77500000-0000-4000-8000-000000000011','77500000-0000-4000-8000-000000000031','email','trade','{"address":"trade@test.invalid"}','Request','Resolved request','{}','site_request','77500000-0000-4000-8000-000000000045','dedupe-775-6',now(),null,'system')$$,'compose resolvable draft');
SELECT is(public.resolve_outbound_drafts('site_request','77500000-0000-4000-8000-000000000045'),1,'resolution discards matching draft');
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='dedupe-775-6'),'discarded','resolved draft is discarded');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','77500000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT public.set_studio_outbound_mode('77500000-0000-4000-8000-000000000011','invoice_reminder','scheduled')$$,'studio owner can opt in to scheduled mode');
SELECT is(public.studio_outbound_mode('77500000-0000-4000-8000-000000000011','invoice_reminder'),'scheduled','scheduled mode is persisted');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','77500000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.set_studio_outbound_mode('77500000-0000-4000-8000-000000000011','invoice_reminder','scheduled')$$,'42501',NULL,'non-owner cannot set scheduled mode');
SELECT is((SELECT count(*)::int FROM public.outbound_drafts WHERE project_id='77500000-0000-4000-8000-000000000031'),6,'org member with project access reads studio drafts');
SELECT is((SELECT count(*)::int FROM public.outbound_drafts WHERE organization_id='77500000-0000-4000-8000-000000000012'),0,'member of another studio cannot read drafts');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
