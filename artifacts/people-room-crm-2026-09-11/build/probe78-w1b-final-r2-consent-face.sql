BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- CASE 1: a carded human whose CARD carries no phone at all, whose SEAT carries
-- a number the studio's record says is opted_out.
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, email)
VALUES ('eeee5555-0000-4000-8000-00000000bc01','b0000000-0000-0000-0000-000000000001','person','sub','Emailonly Sub','eo@example.test');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164, studio_contact_id, stage)
VALUES ('eeee5555-0000-4000-8000-00000000ba01',
        (SELECT id FROM public.projects WHERE name='Okonkwo residence'),
        'sub','Emailonly Sub','+16125557001','+16125557001','eeee5555-0000-4000-8000-00000000bc01','active');
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, opt_out_source, opt_out_recorded_at, opt_out_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125557001','opted_out','inbound_sms',now(),now());

-- CASE 2: the card and the seat carry DIFFERENT numbers; the seat's is opted_out,
-- the card's has no record at all.
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164)
VALUES ('eeee5555-0000-4000-8000-00000000bc02','b0000000-0000-0000-0000-000000000001','person','sub','Two-Number Sub','+16125557100','+16125557100');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164, studio_contact_id, stage)
VALUES ('eeee5555-0000-4000-8000-00000000ba02',
        (SELECT id FROM public.projects WHERE name='Okonkwo residence'),
        'sub','Two-Number Sub','+16125557200','+16125557200','eeee5555-0000-4000-8000-00000000bc02','active');
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, opt_out_source, opt_out_recorded_at, opt_out_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125557200','opted_out','inbound_sms',now(),now());

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo '--- the identity row the room renders ---'
SELECT display_name, role, phone, consent_status AS the_word_on_the_face
  FROM public.people_directory WHERE display_name IN ('Emailonly Sub','Two-Number Sub') ORDER BY 1;
\echo '--- the seat line beneath it ---'
SELECT display_name, phone_e164, consent_status AS the_word_on_the_seat
  FROM public.people_directory_seats WHERE display_name IN ('Emailonly Sub','Two-Number Sub') ORDER BY 1;
\echo '--- the record ---'
SELECT channel_value, status FROM public.studio_channel_consent
 WHERE channel_value IN ('+16125557001','+16125557200','+16125557100') ORDER BY 1;
SELECT pg_temp.reset_role();
ROLLBACK;
