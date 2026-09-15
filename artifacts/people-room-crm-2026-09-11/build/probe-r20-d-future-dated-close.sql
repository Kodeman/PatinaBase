\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f7d00000-0000-4000-8000-0000000020d1','b0000000-0000-0000-0000-000000000001','person','client','Dov R20','612-555-9401','+16125559401','a0000000-0000-0000-0000-000000000004'),
       ('f7d00000-0000-4000-8000-0000000020d2','b0000000-0000-0000-0000-000000000001','person','client','Dov R20','612-555-9401','+16125559401','a0000000-0000-0000-0000-000000000004');
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

-- card A: the agreement's $10,000
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f7e00000-0000-4000-8000-0000000020d1','d0e00000-0000-0000-0000-00000000000a','client_rep','Dov R20','612-555-9401','f7d00000-0000-4000-8000-0000000020d1','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-0000000020d1','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');
-- card B: the household's $2,500
INSERT INTO public.client_households (id, organization_id, designer_id, display_name, co_threshold_cents)
VALUES ('f7f00000-0000-4000-8000-0000000020d1','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','R20 household',250000);
SELECT public.add_household_member('f7f00000-0000-4000-8000-0000000020d1','f7d00000-0000-4000-8000-0000000020d2','client_rep','d0e00000-0000-0000-0000-00000000000a');

\echo '=== D1: close card B seat with a FUTURE off_job_at (the room sends today; PostgREST may send any date) ==='
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE + 30, off_job_reason='Leaves at the end of the month.'
 WHERE studio_contact_id='f7d00000-0000-4000-8000-0000000020d2';
SELECT pp.id AS seat, pp.off_job_at, pa.threshold_cents, pa.effective_to,
       (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE) AS still_live_to_a_reader
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id
 WHERE pp.studio_contact_id='f7d00000-0000-4000-8000-0000000020d2';

\echo '=== D2: merge_seat_collision reads off_job_at IS NULL, so the fold goes through ==='
SELECT public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000020d1','f7d00000-0000-4000-8000-0000000020d2','phone') AS survivor;

\echo '=== D3: what one human on one job now carries (useProjectAuthority window) ==='
SELECT pp.id AS seat, pp.off_job_at, pa.threshold_cents, pa.source_clause, pa.effective_to
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id AND pa.scope='money'
 WHERE pp.studio_contact_id='f7d00000-0000-4000-8000-0000000020d1'
   AND pp.project_id='d0e00000-0000-0000-0000-00000000000a'
   AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE)
 ORDER BY pp.off_job_at NULLS FIRST;
ROLLBACK;
