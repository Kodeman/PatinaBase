-- r7 probe C: a seat on a studio-LESS job contributes no number, so the
-- identity's worst-first consent word goes MORE permissive than the record
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Dana's second work mobile, refused IN THIS STUDIO'S OWN RECORD
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, source, recorded_at, opt_out_at, refusal_unanswered)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125558888','opted_out','inbound_sms',
        now(), now() - interval '3 days', false);

-- she takes a seat on a STUDIO-LESS job of the same studio, carrying that number
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, trade, phone_e164, studio_contact_id, created_by)
VALUES ('e7000000-0000-4000-8000-0000000000c1','b0000000-0000-0000-0000-0000000000d1','sub',
        'Dana Kowalski','electrical','+16125558888','d0e10000-0000-0000-0000-000000000011',
        'a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');   -- admin of Local Dev Studio

\echo '=== the record this studio holds for that number ==='
SELECT public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms','+16125558888') AS record_word;

\echo '=== the numbers the reduction actually sees for Dana ==='
SELECT * FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001',
                                            'd0e10000-0000-0000-0000-000000000011', '+16125550111');

\echo '=== what Dana''s Directory row prints ==='
SELECT display_name, consent_status, seat_count FROM public.people_directory
 WHERE person_id = 'd0e10000-0000-0000-0000-000000000011';

\echo '=== and her seat lines ==='
SELECT project_name, phone_e164, consent_status FROM public.people_directory_seats
 WHERE person_id = 'd0e10000-0000-0000-0000-000000000011' ORDER BY project_name;

\echo '=== CONTROL: move the same seat onto a job that RECORDS its studio ==='
SELECT pg_temp.reset_role();
UPDATE public.project_parties SET project_id = 'b0000000-0000-0000-0000-00000000c0d1'
 WHERE id = 'e7000000-0000-4000-8000-0000000000c1';
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT * FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001',
                                            'd0e10000-0000-0000-0000-000000000011', '+16125550111');
SELECT display_name, consent_status FROM public.people_directory
 WHERE person_id = 'd0e10000-0000-0000-0000-000000000011';

SELECT pg_temp.reset_role();
ROLLBACK;
