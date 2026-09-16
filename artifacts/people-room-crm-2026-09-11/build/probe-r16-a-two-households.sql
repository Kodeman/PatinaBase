-- r16 probe A — one person card in TWO households: whose figure does the seat
-- carry, and who may move it?
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- H1: the household that will actually source the seat's grant
INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000f1',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Probe household ONE', '{}'::uuid[], 250000);

-- H2: a SECOND household in the same studio
INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000f2',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Probe household TWO', '{}'::uuid[], 900000);

SELECT 'A-a H1 seat = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000f1',
  'd0e10000-0000-0000-0000-000000000005', 'client_rep',
  'b0000000-0000-0000-0000-00000000c0d1')::text AS step;

SELECT 'A-b after H1: threshold=' || COALESCE(pa.threshold_cents::text,'<null>')
       || ' clause=' || COALESCE(pa.source_clause,'<null>')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND pp.studio_contact_id='d0e10000-0000-0000-0000-000000000005'
   AND pa.scope='money' AND pa.effective_to IS NULL;

-- the same card added to the SECOND household. Nothing refuses it.
SELECT 'A-c H2 seat = ' || COALESCE(public.add_household_member(
  'aa000000-0000-4000-8000-0000000000f2',
  'd0e10000-0000-0000-0000-000000000005', 'client_rep',
  'b0000000-0000-0000-0000-00000000c0d1')::text, '<null>') AS step;

SELECT 'A-d after H2 add: threshold=' || COALESCE(pa.threshold_cents::text,'<null>')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.project_id='b0000000-0000-0000-0000-00000000c0d1'
   AND pp.studio_contact_id='d0e10000-0000-0000-0000-000000000005'
   AND pa.scope='money' AND pa.effective_to IS NULL;

-- and H2's owner moving H2's own figure rewrites it again
SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000f2', 1500000)
       IS NOT NULL AS h2_figure_written;

SELECT 'A-e H1 figure=' || (SELECT co_threshold_cents FROM client_households
                             WHERE id='aa000000-0000-4000-8000-0000000000f1')::text
       || ' H2 figure=' || (SELECT co_threshold_cents FROM client_households
                             WHERE id='aa000000-0000-4000-8000-0000000000f2')::text
       || ' SEAT grant=' || (SELECT pa.threshold_cents::text
                               FROM project_party_authority pa
                               JOIN project_parties pp ON pp.id = pa.engagement_id
                              WHERE pp.project_id='b0000000-0000-0000-0000-00000000c0d1'
                                AND pp.studio_contact_id='d0e10000-0000-0000-0000-000000000005'
                                AND pa.scope='money' AND pa.effective_to IS NULL);

SELECT 'A-f households naming this card: ' ||
       (SELECT count(*)::text FROM client_households
         WHERE 'd0e10000-0000-0000-0000-000000000005'::uuid = ANY (member_person_ids));
ROLLBACK;
