-- US-31 SQ-923 (SQ-905 F15/F17): an attempted push is never pushed again, and one finalizer runs the hook (00784).
-- SQ-926 (SQ-905 F21, 00785): a stale attempt is never finalized; it goes back to review marked 'unknown'.
-- Run through `supabase test db supabase/tests/outbound/`; transaction is rolled back.
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('78400000-0000-4000-8000-000000000001','attempt-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('78400000-0000-4000-8000-000000000001','attempt-owner@test.invalid','Attempt Owner',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES ('78400000-0000-4000-8000-000000000011','design_studio','Attempt Studio','attempt-studio-784-test');
INSERT INTO organization_members (id,user_id,organization_id,role,status,joined_at)
VALUES ('78400000-0000-4000-8000-000000000021','78400000-0000-4000-8000-000000000001','78400000-0000-4000-8000-000000000011','owner','active',now());
INSERT INTO projects (id,name,designer_id,created_by,studio_id)
VALUES ('78400000-0000-4000-8000-000000000031','Attempt project','78400000-0000-4000-8000-000000000001','78400000-0000-4000-8000-000000000001','78400000-0000-4000-8000-000000000011');

SET LOCAL ROLE service_role;
SELECT public.compose_outbound_draft('site_request_due','78400000-0000-4000-8000-000000000011','78400000-0000-4000-8000-000000000031','push','trade','{"client_id":"78400000-0000-4000-8000-000000000001"}',null,'Attempted body','{}','site_request','78400000-0000-4000-8000-000000000041','dedupe-784-1',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78400000-0000-4000-8000-000000000011','78400000-0000-4000-8000-000000000031','push','trade','{"client_id":"78400000-0000-4000-8000-000000000001"}',null,'Open body','{}','site_request','78400000-0000-4000-8000-000000000042','dedupe-784-2',now(),null,'system');
SELECT public.compose_outbound_draft('site_request_due','78400000-0000-4000-8000-000000000011','78400000-0000-4000-8000-000000000031','push','trade','{"client_id":"78400000-0000-4000-8000-000000000001"}',null,'Delivered body','{}','site_request','78400000-0000-4000-8000-000000000043','dedupe-784-3',now(),null,'system');

-- The attempt stamp: only on an unattempted claim.
SELECT throws_ok($$SELECT public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '23514','record_outbound_draft_send_attempt: draft is awaiting_review and cannot start a provider attempt','an attempt needs a claimed draft');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))).status,'sending','the push draft is claimed');
SELECT ok((public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))).send_attempted_at IS NOT NULL,'the attempt is recorded before the provider call');
SELECT throws_ok($$SELECT public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '23514','record_outbound_draft_send_attempt: draft is sending and cannot start a provider attempt','a second sender cannot start another attempt');

-- An attempted push is never released, reclaimed or finalized while its claim is fresh.
SELECT throws_ok($$SELECT public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '23514','release_outbound_draft_claim: draft was already attempted; finalize it','the sender cannot release an attempted push');
SELECT throws_ok($$SELECT public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '23514','claim_outbound_draft_for_send: draft is sending or has a fresh claim','a fresh attempted claim is not reclaimed');
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '23514','claim_outbound_draft_finalize: draft is sending and was not delivered','an in-flight attempt is not finalized while its claim is fresh');

-- 00785: a stale attempt with no recorded delivery is never finalized; it goes back to review marked unknown.
UPDATE public.outbound_drafts SET claimed_at=now()-interval '11 minutes', expires_at=now()-interval '1 second' WHERE dedupe_key='dedupe-784-1';
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '23514','claim_outbound_draft_finalize: draft is sending and was not delivered','a stale attempted push is not finalized as delivered-unknown');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))).last_send_outcome,'unknown','a stale, past-expiry attempted push is handed back marked unknown, not reclaimed');
SELECT ok((SELECT status='awaiting_review' AND claimed_at IS NULL AND send_attempted_at IS NULL AND delivered_at IS NULL AND sent_at IS NULL
             FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'),'the unknown push is back in review, neither pushed again nor marked sent');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78400000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '42501',NULL,'the studio cannot reclaim an attempted push from the sheet');
SELECT throws_ok($$SELECT public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '42501',NULL,'the stale-claim release cannot hand an attempted push back');
SELECT throws_ok($$SELECT public.record_outbound_draft_send_attempt((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-2'))$$,
  '42501',NULL,'only the service role records an attempt');
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'))$$,
  '42501',NULL,'only the service role claims a finalize');
SELECT throws_ok($$SELECT public.release_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-1'),now())$$,
  '42501',NULL,'only the service role releases a finalize');
RESET ROLE;

SET LOCAL ROLE service_role;
-- A recorded delivery finalizes, claimed by one finalizer at a time.
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'))).status,'sending','an email-like draft claims without an attempt stamp');
SELECT ok((public.record_outbound_draft_delivery((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'),'provider-784')).delivered_at IS NOT NULL,'the delivery is recorded');
SELECT is((public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'))).delivery_message_id,'provider-784','a delivered draft is claimed for finalize with its message id');
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'))$$,
  '23514','claim_outbound_draft_finalize: draft is already being finalized','a second finalizer loses the claim');
SELECT is(public.release_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'),now()-interval '1 minute'),false,'a release with another finalizer''s token changes nothing');
SELECT ok((SELECT finalizing_at IS NOT NULL FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'),'the winning finalizer keeps its claim');
SELECT is(public.release_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'),(SELECT finalizing_at FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3')),true,'a failed finalizer hands its own claim back');
SELECT ok((public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'))).finalizing_at IS NOT NULL,'a handed-back claim is taken at once');
UPDATE public.outbound_drafts SET finalizing_at=now()-interval '11 minutes' WHERE dedupe_key='dedupe-784-3';
SELECT is((public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'))).finalizing_at,now(),'a crashed finalizer''s claim is recovered once stale');
SELECT is((public.mark_outbound_draft_sent((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'),NULL,NULL)).status,'sent','the finalizer marks the draft sent');
SELECT is((public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'))).status,'sent','a finalize of a sent draft returns it for the caller to report');
SELECT is(public.release_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3'),(SELECT finalizing_at FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-3')),false,'a sent draft has no finalize claim to release');

-- An unattempted claim still releases to review.
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-2'))$$,
  '23514','claim_outbound_draft_finalize: draft is awaiting_review and was not delivered','an open draft cannot be finalized');
SELECT is((public.claim_outbound_draft_for_send((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-2'))).status,'sending','an open draft claims as before');
SELECT throws_ok($$SELECT public.claim_outbound_draft_finalize((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-2'))$$,
  '23514','claim_outbound_draft_finalize: draft is sending and was not delivered','an unattempted claim cannot be finalized');
SELECT is((public.release_outbound_draft_claim((SELECT id FROM public.outbound_drafts WHERE dedupe_key='dedupe-784-2'))).status,'awaiting_review','an unattempted claim still releases to review');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
