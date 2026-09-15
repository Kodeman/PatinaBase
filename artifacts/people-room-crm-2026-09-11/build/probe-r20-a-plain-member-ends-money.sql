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
VALUES ('a0000000-0000-4000-8000-0000000020a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r20-plain@patina.dev','x',now(),now(),now()),
       ('a0000000-0000-4000-8000-0000000020b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r20-outside@patina.dev','x',now(),now(),now());
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('a0000000-0000-4000-8000-0000000020a1','r20-plain@patina.dev','R20 Plain Member'),
  ('a0000000-0000-4000-8000-0000000020b1','r20-outside@patina.dev','R20 Outside Member')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-0000000020a1','member','active'),
       ('9b2e938a-e644-479a-ac8c-873c7afd17fa','a0000000-0000-4000-8000-0000000020b1','member','active');

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f7d00000-0000-4000-8000-0000000020a0','b0000000-0000-0000-0000-000000000001','person','client','Rhea R20','612-555-9301','+16125559301','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f7e00000-0000-4000-8000-0000000020a0','d0e00000-0000-0000-0000-00000000000a','client_rep','Rhea R20','612-555-9301','f7d00000-0000-4000-8000-0000000020a0','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-0000000020a0','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

\echo '=== A1: PLAIN member of the RECORDED studio tries to end the money grant DIRECTLY (00624 PR-n) ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000020a1');
DO $$
DECLARE n int;
BEGIN
  UPDATE public.project_party_authority SET effective_to = CURRENT_DATE
   WHERE engagement_id='f7e00000-0000-4000-8000-0000000020a0' AND scope='money';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'A1 direct UPDATE rows=% (0 = refused by RLS, as PR-n intends)', n;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'A1 direct UPDATE raised: %', SQLERRM;
END $$;
SELECT pg_temp.reset_role();
SELECT 'A1 after' AS step, scope, threshold_cents, effective_to FROM public.project_party_authority WHERE engagement_id='f7e00000-0000-4000-8000-0000000020a0';

\echo '=== A2: the SAME plain member closes the seat (the room act) — does the grant end? ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000020a1');
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='R20 plain member closed it'
 WHERE id='f7e00000-0000-4000-8000-0000000020a0';
SELECT pg_temp.reset_role();
SELECT 'A2 after' AS step, scope, threshold_cents, effective_to FROM public.project_party_authority WHERE engagement_id='f7e00000-0000-4000-8000-0000000020a0';

ROLLBACK;
