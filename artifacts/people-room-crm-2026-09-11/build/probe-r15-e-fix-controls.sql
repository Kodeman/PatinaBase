-- r15 MAJOR-1 fix controls. Same fixture as probe-r15-a, carried one act
-- further: the household's figure is RAISED while one of its seats is closed.
-- E-a/E-b: the closed seat is not reused, a new seat is opened.
-- E-c: the live seat's grant moves with the figure.
-- E-d: the CLOSED seat's grant is ENDED (effective_to), not grown.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000a2',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Probe household E', '{}'::uuid[], 250000);

-- a client_rep seat that is OPEN, given the household's grant, then closed by
-- the studio the way "Close this seat" closes it
INSERT INTO project_parties (id, project_id, party_kind, display_name,
                             studio_contact_id)
VALUES ('aa000000-0000-4000-8000-0000000000b2',
        'b0000000-0000-0000-0000-00000000c0d1', 'client_rep', 'Adaeze Okonkwo',
        'd0e10000-0000-0000-0000-000000000004');

SELECT 'E-a first add returned ' ||
       CASE WHEN public.add_household_member(
         'aa000000-0000-4000-8000-0000000000a2',
         'd0e10000-0000-0000-0000-000000000004',
         'client_rep',
         'b0000000-0000-0000-0000-00000000c0d1')
         = 'aa000000-0000-4000-8000-0000000000b2'
       THEN 'the OPEN seat it should reuse' ELSE 'an unexpected seat' END;

UPDATE project_parties
   SET stage='off_job', off_job_at = CURRENT_DATE - 30, off_job_reason='left the job'
 WHERE id = 'aa000000-0000-4000-8000-0000000000b2';

SELECT 'E-b second add opened a NEW seat: ' ||
       CASE WHEN public.add_household_member(
         'aa000000-0000-4000-8000-0000000000a2',
         'd0e10000-0000-0000-0000-000000000004',
         'client_rep',
         'b0000000-0000-0000-0000-00000000c0d1')
         <> 'aa000000-0000-4000-8000-0000000000b2'
       THEN 'yes' ELSE 'NO — the closed seat was reused' END;

SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000a2', 500000) IS NOT NULL
   AS figure_written;

SELECT 'E-c live seat: threshold=' || COALESCE(pa.threshold_cents::text,'<null>')
       || ' effective_to=' || COALESCE(pa.effective_to::text,'<null>')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pp.off_job_at IS NULL;

SELECT 'E-d closed seat: threshold=' || COALESCE(pa.threshold_cents::text,'<null>')
       || ' effective_to=' || COALESCE(pa.effective_to::text,'<null>')
       || ' off_job_at=' || COALESCE(pp.off_job_at::text,'<null>')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.id = 'aa000000-0000-4000-8000-0000000000b2';
ROLLBACK;
