-- r15 probe A: add_household_member() reuses a CLOSED (off_job_at) client_rep
-- seat and writes the household's money grant onto it.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000a1',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Probe household', '{}'::uuid[], 250000);

-- a CLOSED client_rep seat on Cedar Lane Study, and no other seat for this card
INSERT INTO project_parties (id, project_id, party_kind, display_name,
                             studio_contact_id, off_job_at, off_job_reason)
VALUES ('aa000000-0000-4000-8000-0000000000b1',
        'b0000000-0000-0000-0000-00000000c0d1', 'client_rep', 'Adaeze Okonkwo',
        'd0e10000-0000-0000-0000-000000000004',
        CURRENT_DATE - 30, 'left the job');

SELECT 'A-a existing client_rep seats for this card on this job: ' || count(*)::text
       || ' (all closed: ' || (count(*) FILTER (WHERE off_job_at IS NOT NULL))::text || ')'
  FROM project_parties
 WHERE project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND party_kind='client_rep';

SELECT 'A-b add_household_member returned seat ' ||
       COALESCE(public.add_household_member(
         'aa000000-0000-4000-8000-0000000000a1',
         'd0e10000-0000-0000-0000-000000000004',
         'client_rep',
         'b0000000-0000-0000-0000-00000000c0d1')::text, '<null>')
       || ' (the closed one is aa000000-0000-4000-8000-0000000000b1)';

SELECT 'A-c seats for this card on this job now: ' || count(*)::text
  FROM project_parties
 WHERE project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND party_kind='client_rep';

SELECT 'A-d ' || CASE WHEN pp.off_job_at IS NOT NULL
              THEN 'MONEY GRANT ON A CLOSED SEAT'
              ELSE 'grant on an open seat' END
       || ': threshold=' || COALESCE(pa.threshold_cents::text,'<null>')
       || ' source=' || COALESCE(pa.source_clause,'<null>')
       || ' seat_off_job_at=' || COALESCE(pp.off_job_at::text,'<null>')
       || ' effective_to=' || COALESCE(pa.effective_to::text,'<null>')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004';
ROLLBACK;
