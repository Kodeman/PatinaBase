-- r20 BLOCKING-1 / QA BLOCKING-1 — the negative controls for the fix.
-- The same two shapes probe-r20-a and probe-r20-b measured, re-run against the
-- gated 00634. One transaction, ROLLBACKed. Local only.
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
       ('5af65c68-b648-4771-9168-6ac04c390095','a0000000-0000-4000-8000-0000000020b1','member','active');

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f7d00000-0000-4000-8000-0000000020a0','b0000000-0000-0000-0000-000000000001','person','client','Rhea R20','612-555-9301','+16125559301','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f7e00000-0000-4000-8000-0000000020a0','d0e00000-0000-0000-0000-00000000000a','client_rep','Rhea R20','612-555-9301','f7d00000-0000-4000-8000-0000000020a0','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-0000000020a0','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

\echo '=== A: a PLAIN member of the RECORDED studio closes the seat ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000020a1');
DO $$
DECLARE v_msg text;
BEGIN
  UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='R20 plain member closed it'
   WHERE id='f7e00000-0000-4000-8000-0000000020a0';
  RAISE NOTICE 'A the close LANDED — the gate is not there';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  RAISE NOTICE 'A the close was refused: %', v_msg;
END $$;
SELECT pg_temp.reset_role();
SELECT 'A after' AS step, pa.scope, pa.threshold_cents, pa.effective_to, pp.off_job_at, pp.off_job_reason
  FROM public.project_party_authority pa JOIN public.project_parties pp ON pp.id = pa.engagement_id
 WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000020a0';

\echo '=== B: a PLAIN member of the designer''s SECOND studio closes the seat ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000020b1');
SELECT 'B0' AS step,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_recorded,
       public.is_studio_comember('a0000000-0000-0000-0000-000000000004')      AS comember_of_designer,
       (SELECT count(*) FROM public.project_party_authority
         WHERE engagement_id='f7e00000-0000-4000-8000-0000000020a0')          AS authority_rows_visible;
DO $$
DECLARE v_msg text;
BEGIN
  UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='R20 outside member closed it'
   WHERE id='f7e00000-0000-4000-8000-0000000020a0';
  RAISE NOTICE 'B the close LANDED — the cross-tenant gate is not there';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  RAISE NOTICE 'B the close was refused: %', v_msg;
END $$;
SELECT pg_temp.reset_role();
SELECT 'B after' AS step, pa.scope, pa.threshold_cents, pa.effective_to, pp.off_job_at, pp.off_job_reason
  FROM public.project_party_authority pa JOIN public.project_parties pp ON pp.id = pa.engagement_id
 WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000020a0';

\echo '=== C: the PRINCIPAL (owner of the recorded studio) closes it ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='The owner closed it'
 WHERE id='f7e00000-0000-4000-8000-0000000020a0';
SELECT pg_temp.reset_role();
SELECT 'C after' AS step, pa.scope, pa.threshold_cents, pa.effective_to, pp.off_job_at
  FROM public.project_party_authority pa JOIN public.project_parties pp ON pp.id = pa.engagement_id
 WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000020a0';

ROLLBACK;
