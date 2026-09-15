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

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000020b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r20-outside@patina.dev','x',now(),now(),now());
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('a0000000-0000-4000-8000-0000000020b1','r20-outside@patina.dev','R20 Outside Member') ON CONFLICT (id) DO NOTHING;
-- a plain member of the DESIGNER'S SECOND studio ONLY. Not a member of b0000000…0001.
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('9b2e938a-e644-479a-ac8c-873c7afd17fa','a0000000-0000-4000-8000-0000000020b1','member','active');

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f7d00000-0000-4000-8000-0000000020a0','b0000000-0000-0000-0000-000000000001','person','client','Rhea R20','612-555-9301','+16125559301','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f7e00000-0000-4000-8000-0000000020a0','d0e00000-0000-0000-0000-00000000000a','client_rep','Rhea R20','612-555-9301','f7d00000-0000-4000-8000-0000000020a0','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-0000000020a0','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

\echo '=== B0: standing of the OUTSIDE caller ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000020b1');
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_recorded_studio,
       public.is_studio_comember('a0000000-0000-0000-0000-000000000004')      AS comember_of_designer,
       public.project_party_recorded_studio('f7e00000-0000-4000-8000-0000000020a0') AS recorded_studio;

\echo '=== B1: can the OUTSIDE caller even SEE the grant row? (00624 tenant leg) ==='
SELECT count(*) AS visible_authority_rows FROM public.project_party_authority WHERE engagement_id='f7e00000-0000-4000-8000-0000000020a0';

\echo '=== B2: can the OUTSIDE caller write the grant DIRECTLY? ==='
DO $$
DECLARE n int;
BEGIN
  UPDATE public.project_party_authority SET effective_to = CURRENT_DATE
   WHERE engagement_id='f7e00000-0000-4000-8000-0000000020a0' AND scope='money';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'B2 direct UPDATE rows=%', n;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B2 direct UPDATE raised: %', SQLERRM;
END $$;

\echo '=== B3: the OUTSIDE caller closes the seat (project_parties_studio_update: is_studio_comember(designer) only) ==='
DO $$
DECLARE n int;
BEGIN
  UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='R20 outside studio closed it'
   WHERE id='f7e00000-0000-4000-8000-0000000020a0';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'B3 seat close rows=%', n;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B3 seat close raised: %', SQLERRM;
END $$;
SELECT pg_temp.reset_role();
SELECT 'B4 after' AS step, pa.scope, pa.threshold_cents, pa.effective_to, pp.off_job_at
  FROM public.project_party_authority pa JOIN public.project_parties pp ON pp.id=pa.engagement_id
 WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000020a0';
ROLLBACK;
