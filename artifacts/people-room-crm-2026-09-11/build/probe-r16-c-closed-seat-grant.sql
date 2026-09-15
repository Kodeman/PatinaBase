-- r16 probe C — r15 MAJOR-1's residue: the ADD alone opens a new seat but
-- leaves the closed seat's household-sourced grant OPEN, so one card holds two
-- open money grants on one job.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000d1',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Probe household C', '{}'::uuid[], 250000);

INSERT INTO project_parties (id, project_id, party_kind, display_name,
                             studio_contact_id)
VALUES ('aa000000-0000-4000-8000-0000000000c1',
        'b0000000-0000-0000-0000-00000000c0d1', 'client_rep', 'Adaeze Okonkwo',
        'd0e10000-0000-0000-0000-000000000004');

SELECT 'C-a first add -> ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000d1',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'b0000000-0000-0000-0000-00000000c0d1')::text;

UPDATE project_parties
   SET stage='off_job', off_job_at = CURRENT_DATE - 30, off_job_reason='left the job'
 WHERE id = 'aa000000-0000-4000-8000-0000000000c1';

SELECT 'C-b second add -> ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000d1',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'b0000000-0000-0000-0000-00000000c0d1')::text;

SELECT 'C-c open money grants for this card on this job: ' || count(*)::text
       || ' — ' || string_agg('seat off_job_at=' || COALESCE(pp.off_job_at::text,'<null>')
                              || ' threshold=' || pa.threshold_cents::text, ' | ')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;
ROLLBACK;
