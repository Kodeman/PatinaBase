\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Two cards for ONE client-side human, sharing a phone (crm-model §4 rule 2,
-- direction §3.1's canonical duplicate band).
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f8d00000-0000-4000-8000-00000000000a','b0000000-0000-0000-0000-000000000001','person','client','Cyril Probe','612-555-9101','+16125559101','a0000000-0000-0000-0000-000000000004'),
       ('f8d00000-0000-4000-8000-00000000000b','b0000000-0000-0000-0000-000000000001','person','client','Cyril Probe','612-555-9101','+16125559101','a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

-- Act 1: card A is seated as client_rep from the agreement, authority $10,000
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f8e00000-0000-4000-8000-00000000000a','d0e00000-0000-0000-0000-00000000000a','client_rep','Cyril Probe','612-555-9101','f8d00000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f8e00000-0000-4000-8000-00000000000a','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

-- Act 2: the household names card B and seats it on the same job at $2,500
INSERT INTO public.client_households (id, organization_id, designer_id, display_name, co_threshold_cents)
VALUES ('f8f00000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Probe household',250000);
SELECT public.add_household_member('f8f00000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-00000000000b','client_rep','d0e00000-0000-0000-0000-00000000000a') AS seat_b;

\echo '--- E-a: before the merge, TWO people on the Directory, one money row each ---'
SELECT person_id, display_name, seat_count FROM public.people_directory WHERE display_name='Cyril Probe' ORDER BY person_id;
SELECT pa.engagement_id, pp.studio_contact_id, pa.threshold_cents, pa.source_clause, pa.source_household_id
  FROM public.project_party_authority pa JOIN public.project_parties pp ON pp.id=pa.engagement_id
 WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a' AND pp.display_name='Cyril Probe' AND pa.effective_to IS NULL ORDER BY 1;

-- Act 3: the duplicate band's own act
SELECT public.merge_studio_contacts('f8d00000-0000-4000-8000-00000000000a','f8d00000-0000-4000-8000-00000000000b','phone') AS survivor;

\echo '--- E-b: after the merge — ONE human, how many open money grants on this job? ---'
SELECT person_id, display_name, seat_count FROM public.people_directory WHERE display_name='Cyril Probe' ORDER BY person_id;
SELECT pp.id AS seat, pp.party_kind, pp.display_name, pa.threshold_cents, pa.source_clause,
       (pa.source_household_id IS NOT NULL) AS from_household
  FROM public.project_parties pp
  LEFT JOIN public.project_party_authority pa ON pa.engagement_id=pp.id AND pa.scope='money' AND pa.effective_to IS NULL
 WHERE pp.studio_contact_id='f8d00000-0000-4000-8000-00000000000a' ORDER BY pp.id;

\echo '--- E-c: raising the household figure to $9,000 ---'
SELECT co_threshold_cents FROM public.set_household_threshold('f8f00000-0000-4000-8000-000000000001', 900000);
SELECT pp.id AS seat, pa.threshold_cents, pa.source_clause
  FROM public.project_parties pp
  LEFT JOIN public.project_party_authority pa ON pa.engagement_id=pp.id AND pa.scope='money' AND pa.effective_to IS NULL
 WHERE pp.studio_contact_id='f8d00000-0000-4000-8000-00000000000a' ORDER BY pp.id;
SELECT pg_temp.reset_role();
ROLLBACK;
