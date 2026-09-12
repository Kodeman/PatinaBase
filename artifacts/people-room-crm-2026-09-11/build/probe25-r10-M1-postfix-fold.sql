-- probe25 (r10 M1): the SAME seed against the SHIPPED (fixed) fold.
BEGIN;
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
SELECT '11111111-0000-4000-8000-000000000001', p.id, 'sub', 'Ruth Ojala', '(612) 555-0504',
       'opted_out', '2025-05-02T00:00:00Z', '2025-12-03T00:00:00Z',
       'written', 'Signed the Lindqvist kickoff form', '2025-05-02T00:00:00Z',
       'field-sms-v1', pr.id
  FROM projects p
  JOIN profiles pr ON pr.id = p.designer_id
 WHERE p.studio_id IS NOT NULL
 ORDER BY p.id LIMIT 1;

SELECT public.backfill_channel_consent_from_parties() AS folded;

SELECT status, refusal_unanswered, opt_out_at, opt_out_source, opt_out_evidence,
       opt_out_recorded_at, opt_out_recorded_by,
       source AS consent_source, evidence AS consent_evidence
  FROM studio_channel_consent
 WHERE channel_kind = 'sms' AND channel_value = '+16125550504';

-- and the seat, after the mirror's R-AQ wordless branch fired
SELECT sms_consent_status, sms_opt_out_at, sms_consent_source, sms_consent_evidence,
       sms_consent_recorded_at, sms_consent_recorded_by
  FROM project_parties WHERE id = '11111111-0000-4000-8000-000000000001';
ROLLBACK;
