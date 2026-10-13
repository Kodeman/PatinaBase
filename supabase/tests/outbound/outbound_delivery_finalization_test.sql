-- US-31 SQ-918 (SQ-905 F11): a delivered outbound draft is never handed back for a provider send (00782).
-- Run through `supabase test db supabase/tests/outbound/`; transaction is rolled back.
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('78200000-0000-4000-8000-000000000001','delivery-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('78200000-0000-4000-8000-000000000001','delivery-owner@test.invalid','Delivery Owner',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES ('78200000-0000-4000-8000-000000000011','design_studio','Delivery Studio','delivery-studio-782-test');
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at)
VALUES ('78200000-0000-4000-8000-000000000021','78200000-0000-4000-8000-000000000001','78200000-0000-4000-8000-000000000011','owner','active',now());
INSERT INTO projects (id,name,designer_id,created_by,studio_id)
VALUES ('78200000-0000-4000-8000-000000000031','Delivery project','78200000-0000-4000-8000-000000000001','78200000-0000-4000-8000-000000000001','78200000-0000-4000-8000-000000000011');

SET LOCAL ROLE service_role;
SELECT public.compose_outbound_draft('site_request_due','78200000-0000-4000-8000-000000000011','78200000-0000-4000-8000-000000000031','push','trade','{"client_id":"78200000-0000-4000-8000-000000000001"}',null,'Delivered body','{}','site_request','78200000-0000-4000-8000-000000000041','dedupe-782-1',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78200000-0000-4000-8000-000000000011','78200000-0000-4000-8000-000000000031','push','trade','{"client_id":"78200000-0000-4000-8000-000000000001"}',null,'Open body','{}','site_request','78200000-0000-4000-8000-000000000042','dedupe-782-2',now(),null,'system');

SELECT throws_ok($$SELECT public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'provider-782')$$,
  '23514','record_outbound_draft_delivery: draft is awaiting_review, not sending','a delivery is only recorded on a claimed draft');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'))).status,'sending','an undelivered draft is still claimed for send');
SELECT ok((public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),' provider-782 ')).delivered_at IS NOT NULL,'the provider acceptance is recorded');
SELECT is((SELECT delivery_message_id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'provider-782','the delivery keeps the provider message id');
-- now() is fixed inside this transaction, so date the first delivery apart from it.
UPDATE public.outbound_drafts SET delivered_at='2026-01-02T03:04:05Z' WHERE dedupe_key='dedupe-782-1';
SELECT lives_ok($$SELECT public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'provider-other')$$,'recording the delivery again is idempotent');
SELECT is((SELECT delivery_message_id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'provider-782','a repeat record keeps the first message id');
SELECT is((SELECT delivered_at FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'2026-01-02T03:04:05Z'::timestamptz,'a repeat record keeps the first delivery time');

SELECT throws_ok($$SELECT public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'))$$,
  '23514','claim_outbound_draft_for_send: draft was already delivered; finalize it','a delivered draft cannot be claimed for send');
SELECT throws_ok($$SELECT public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'))$$,
  '23514','release_outbound_draft_claim: draft was already delivered; finalize it','a delivered draft cannot be released to review');

UPDATE public.outbound_drafts SET claimed_at=now()-interval '11 minutes', expires_at=now()-interval '1 second' WHERE dedupe_key='dedupe-782-1';
SELECT throws_ok($$SELECT public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'))$$,
  '23514','claim_outbound_draft_for_send: draft was already delivered; finalize it','a stale, past-expiry delivered draft cannot be reclaimed');
SELECT is((SELECT status FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'sending','a delivered draft is never expired, released or reclaimed');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78200000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'))$$,
  '23514','claim_outbound_draft_for_send: draft was already delivered; finalize it','the studio cannot claim a delivered draft from the sheet');
SELECT throws_ok($$SELECT public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'))$$,
  '23514','release_outbound_draft_claim: draft was already delivered; finalize it','the stale-claim release cannot hand a delivered draft back');
SELECT throws_ok($$SELECT public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-2'),'forged')$$,
  '42501',NULL,'only the service role records a delivery');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((public.mark_outbound_draft_sent((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),NULL,'provider-782')).status,'sent','finalize marks the delivered draft sent');
SELECT ok((SELECT delivered_at IS NOT NULL FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-1'),'the sent draft keeps its delivery record');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-2'))).status,'sending','an open draft claims as before');
SELECT is((public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-782-2'))).status,'awaiting_review','an undelivered claim still releases to review');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
