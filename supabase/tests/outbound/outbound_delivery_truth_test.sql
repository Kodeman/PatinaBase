-- US-31 SQ-926 (SQ-905 F19/F21, 00785): delivery is provider acceptance only; side effects run once.
-- Run through `supabase test db supabase/tests/outbound/`; transaction is rolled back.
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('78500000-0000-4000-8000-000000000001','truth-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('78500000-0000-4000-8000-000000000002','truth-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES
  ('78500000-0000-4000-8000-000000000001','truth-owner@test.invalid','Truth Owner',now(),now()),
  ('78500000-0000-4000-8000-000000000002','truth-client@test.invalid','Truth Client',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES ('78500000-0000-4000-8000-000000000011','design_studio','Truth Studio','truth-studio-785-test');
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at)
VALUES ('78500000-0000-4000-8000-000000000021','78500000-0000-4000-8000-000000000001','78500000-0000-4000-8000-000000000011','owner','active',now());
INSERT INTO projects (id,name,designer_id,created_by,studio_id)
VALUES ('78500000-0000-4000-8000-000000000031','Truth project','78500000-0000-4000-8000-000000000001','78500000-0000-4000-8000-000000000001','78500000-0000-4000-8000-000000000011');

SET LOCAL ROLE service_role;
SELECT public.compose_outbound_draft('site_request_due','78500000-0000-4000-8000-000000000011','78500000-0000-4000-8000-000000000031','push','trade','{"client_id":"78500000-0000-4000-8000-000000000002"}',null,'Rejected body','{}','site_request','78500000-0000-4000-8000-000000000041','dedupe-785-rejected',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78500000-0000-4000-8000-000000000011','78500000-0000-4000-8000-000000000031','push','trade','{"client_id":"78500000-0000-4000-8000-000000000002"}',null,'Stale body','{}','site_request','78500000-0000-4000-8000-000000000042','dedupe-785-stale',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78500000-0000-4000-8000-000000000011','78500000-0000-4000-8000-000000000031','push','trade','{"client_id":"78500000-0000-4000-8000-000000000002"}',null,'Fresh body','{}','site_request','78500000-0000-4000-8000-000000000043','dedupe-785-fresh',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78500000-0000-4000-8000-000000000011','78500000-0000-4000-8000-000000000031','push','trade','{"client_id":"78500000-0000-4000-8000-000000000002"}',null,'Delivered body','{}','site_request','78500000-0000-4000-8000-000000000044','dedupe-785-delivered',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78500000-0000-4000-8000-000000000011','78500000-0000-4000-8000-000000000031','push','trade','{"client_id":"78500000-0000-4000-8000-000000000002"}',null,'Hook body','{}','site_request','78500000-0000-4000-8000-000000000045','dedupe-785-hook',now(),null,'system');

-- F21: an explicit provider rejection clears the attempt and hands the draft back to review.
SELECT throws_ok($$SELECT public.record_outbound_draft_send_rejected((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))$$,
  '23514','record_outbound_draft_send_rejected: draft is awaiting_review and has no open provider attempt','a rejection needs an open attempt');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))).status,'sending','the push draft is claimed');
SELECT throws_ok($$SELECT public.record_outbound_draft_send_rejected((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))$$,
  '23514','record_outbound_draft_send_rejected: draft is sending and has no open provider attempt','an unattempted claim is released, not rejected');
SELECT ok((public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))).send_attempted_at IS NOT NULL,'the attempt is recorded');
SELECT is((public.record_outbound_draft_send_rejected((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))).last_send_outcome,'rejected','the rejection is recorded on the draft');
SELECT ok((SELECT status='awaiting_review' AND claimed_at IS NULL AND sent_by IS NULL AND send_attempted_at IS NULL AND delivered_at IS NULL
             FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'),'a rejected push is back in review with its attempt cleared');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))).status,'sending','the studio can send a rejected draft again');
SELECT ok((public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))).send_attempted_at IS NOT NULL,'the new attempt is recorded');
SELECT is((public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'),'apns-785')).last_send_outcome,NULL::text,'a recorded delivery clears the last outcome');
SELECT throws_ok($$SELECT public.record_outbound_draft_send_rejected((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-rejected'))$$,
  '23514','record_outbound_draft_send_rejected: draft is sending and has no open provider attempt','a delivered draft cannot be rejected');

-- F21: the expire sweep hands a stale undelivered attempt back marked unknown; fresh attempts and deliveries stay.
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-stale'))).status,'sending','the stale fixture is claimed');
SELECT ok((public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-stale'))).send_attempted_at IS NOT NULL,'the stale fixture is attempted');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-fresh'))).status,'sending','the fresh fixture is claimed');
SELECT ok((public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-fresh'))).send_attempted_at IS NOT NULL,'the fresh fixture is attempted');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-delivered'))).status,'sending','the delivered fixture is claimed');
SELECT ok((public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-delivered'))).send_attempted_at IS NOT NULL,'the delivered fixture is attempted');
SELECT ok((public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-delivered'),'apns-785-d')).delivered_at IS NOT NULL,'the delivered fixture is delivered');
UPDATE public.outbound_drafts SET claimed_at=now()-interval '11 minutes' WHERE dedupe_key IN ('dedupe-785-stale','dedupe-785-delivered');
SELECT lives_ok($$SELECT public.expire_outbound_drafts()$$,'the expire sweep runs');
SELECT ok((SELECT status='awaiting_review' AND last_send_outcome='unknown' AND send_attempted_at IS NULL AND claimed_at IS NULL AND delivered_at IS NULL AND sent_at IS NULL
             FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-stale'),'a stale undelivered attempt goes back to review marked unknown, never sent');
SELECT ok((SELECT status='sending' AND send_attempted_at IS NOT NULL AND last_send_outcome IS NULL
             FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-fresh'),'a fresh attempt is left in flight');
SELECT ok((SELECT status='sending' AND delivered_at IS NOT NULL AND last_send_outcome IS NULL
             FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-delivered'),'a stale delivered draft is left for its finalize');
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-stale'))$$,
  '23514','claim_outbound_draft_finalize: draft is awaiting_review and was not delivered','an unknown outcome is never finalized');

-- F19: the finalize-claim holder records that afterSend ran; the record outlives the claim.
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'))).status,'sending','the hook fixture is claimed');
SELECT ok((public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),'mail-785')).delivered_at IS NOT NULL,'the hook fixture is delivered');
SELECT ok((public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'))).after_send_done_at IS NULL,'a first finalize has not run the hook');
SELECT throws_ok($$SELECT public.record_outbound_draft_after_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),now()-interval '1 minute')$$,
  '23514','record_outbound_draft_after_send: draft is sending and the caller does not hold its finalize claim','only the finalize-claim holder records the hook');
SELECT ok((public.record_outbound_draft_after_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),(SELECT finalizing_at FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'))).after_send_done_at IS NOT NULL,'the holder records that the hook ran');
UPDATE public.outbound_drafts SET after_send_done_at=now()-interval '1 minute' WHERE dedupe_key='dedupe-785-hook';
SELECT is((public.record_outbound_draft_after_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),(SELECT finalizing_at FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'))).after_send_done_at,now()-interval '1 minute','a repeat record keeps the first stamp');
SELECT is(public.release_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),(SELECT finalizing_at FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook')),true,'a finalizer whose mark failed hands its claim back');
SELECT ok((public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'))).after_send_done_at IS NOT NULL,'the next finalizer sees the hook already ran');
SELECT is((public.mark_outbound_draft_sent((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),NULL,'mail-785')).status,'sent','the retry only marks the draft sent');
SELECT throws_ok($$SELECT public.record_outbound_draft_after_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-hook'),now())$$,
  '23514','record_outbound_draft_after_send: draft is sent and the caller does not hold its finalize claim','a sent draft takes no hook record');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78500000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.record_outbound_draft_send_rejected((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-fresh'))$$,
  '42501',NULL,'only the service role records a rejection');
SELECT throws_ok($$SELECT public.record_outbound_draft_after_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-785-fresh'),now())$$,
  '42501',NULL,'only the service role records a hook run');
RESET ROLE;

-- F19: a keyed client attention enqueues one push however often its hook runs.
SET LOCAL ROLE service_role;
SELECT ok(public.notify_client_attention('78500000-0000-4000-8000-000000000002','invoice','78500000-0000-4000-8000-000000000051','An invoice is coming due','Keyed attention',
  '{"idempotency_key":"outbound-draft-785-keyed"}'::jsonb,'{"kind":"exempt","reason":"internal"}'::jsonb) IS NOT NULL,'a keyed attention enqueues its push');
SELECT is(public.notify_client_attention('78500000-0000-4000-8000-000000000002','invoice','78500000-0000-4000-8000-000000000051','An invoice is coming due','Keyed attention',
  '{"idempotency_key":"outbound-draft-785-keyed"}'::jsonb,'{"kind":"exempt","reason":"internal"}'::jsonb),
  (SELECT id FROM public.notification_log WHERE user_id='78500000-0000-4000-8000-000000000002' AND channel='push' AND metadata->>'idempotency_key'='outbound-draft-785-keyed'),
  'a repeat of the same key returns the first push');
SELECT is((SELECT count(*)::int FROM public.notification_log WHERE user_id='78500000-0000-4000-8000-000000000002' AND channel='push'
             AND metadata->>'entity_id'='78500000-0000-4000-8000-000000000051'),1,'the repeat enqueues no second push');
SELECT is((SELECT count(*)::int FROM public.notification_log WHERE user_id='78500000-0000-4000-8000-000000000002' AND channel='in_app'
             AND metadata->>'entity_id'='78500000-0000-4000-8000-000000000051'),1,'the repeat writes no second in-app row');
SELECT ok(public.notify_client_attention('78500000-0000-4000-8000-000000000002','invoice','78500000-0000-4000-8000-000000000051','An invoice is coming due','Another draft',
  '{"idempotency_key":"outbound-draft-785-other"}'::jsonb,'{"kind":"exempt","reason":"internal"}'::jsonb) IS NOT NULL,'another key enqueues its own push');
SELECT is((SELECT count(*)::int FROM public.notification_log WHERE user_id='78500000-0000-4000-8000-000000000002' AND channel='push'
             AND metadata->>'entity_id'='78500000-0000-4000-8000-000000000051'),2,'each key has one push');
SELECT ok(public.notify_client_attention('78500000-0000-4000-8000-000000000002','invoice','78500000-0000-4000-8000-000000000052','An invoice is ready','Unkeyed',
  '{}'::jsonb,'{"kind":"exempt","reason":"internal"}'::jsonb) IS NOT NULL,'an unkeyed attention enqueues as before');
SELECT ok(public.notify_client_attention('78500000-0000-4000-8000-000000000002','invoice','78500000-0000-4000-8000-000000000052','An invoice is ready','Unkeyed',
  '{}'::jsonb,'{"kind":"exempt","reason":"internal"}'::jsonb) IS NOT NULL,'an unkeyed repeat enqueues as before');
SELECT is((SELECT count(*)::int FROM public.notification_log WHERE user_id='78500000-0000-4000-8000-000000000002' AND channel='push'
             AND metadata->>'entity_id'='78500000-0000-4000-8000-000000000052'),2,'unkeyed calls keep their old behavior');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
