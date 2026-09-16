-- ═══════════════════════════════════════════════════════════════════════════
-- probe108 — W1b final review r5, MAJOR-2
-- r4 MAJOR-4 was "the row printed consent_status opted_out with
-- sms_consented_at 2025-05-02 and sms_opt_out_at NULL, so R-Q composed
-- 'Written consent, 2 May 2025' for a human the record refuses."
-- identity_consent_evidence() (00626:701-727) now takes both dates off the
-- DECIDING record, which is R-BC. But channel_consent_status() (00594:1016)
-- folds refusal_unanswered INTO the word, and 00594's own backfill
-- (00594:658-690) mints records with status='granted', refusal_unanswered=true,
-- a real consented_at and NO opt_out_at — "INCLUDING a winner whose status
-- reads `granted`". The deciding record is then internally contradictory and
-- the view reproduces the same bad shape faithfully.
-- Local Postgres only. Every act is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
\pset pager off
BEGIN;

INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone_e164, profile_id, studio_contact_id,
   stage, created_by)
VALUES ('bbbb0000-0000-4000-8000-0000000000b1','d0e00000-0000-0000-0000-00000000000a',
        'sub','Folded Refusal Trade','+16125559301',
        'a0000000-0000-0000-0000-000000000002',NULL,'active',
        'a0000000-0000-0000-0000-000000000004');

-- exactly the record 00594's backfill can mint: granted + unanswered refusal
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, consented_at,
   refusal_unanswered, source, evidence, recorded_at, recorded_by)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559301','granted',
        '2025-05-02T00:00:00Z', true, 'written','signed field sheet',
        '2025-05-02T00:00:00Z','a0000000-0000-0000-0000-000000000004');

\echo '=== the record ==='
SELECT channel_value, status, refusal_unanswered, consented_at, opt_out_at,
       public.channel_consent_status(organization_id,'sms',channel_value) AS verdict
  FROM public.studio_channel_consent WHERE channel_value='+16125559301';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== the Directory row the room renders, and R-Q composed from it ==='
SELECT display_name, consent_status,
       meta->>'sms_consent_status' AS meta_word,
       meta->>'sms_consented_at'   AS sms_consented_at,
       meta->>'sms_opt_out_at'     AS sms_opt_out_at
  FROM public.people_directory WHERE display_name='Folded Refusal Trade';

\echo '=== identity_consent_evidence, which is R-BC-correct and still yields it ==='
SELECT * FROM public.identity_consent_evidence(
  'b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',NULL);

ROLLBACK;
