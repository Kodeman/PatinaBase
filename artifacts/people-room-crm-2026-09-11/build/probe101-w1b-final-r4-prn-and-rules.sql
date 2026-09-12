\set ON_ERROR_STOP on
\echo '=== I1: studio_channel_consent PK / uniqueness (the party branch LEFT JOIN) ==='
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.studio_channel_consent'::regclass AND contype IN ('p','u');
\echo '=== I2: studio_contact_rules.subject_type vocabulary vs studio_contacts.entity_kind ==='
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.studio_contact_rules'::regclass AND conname ~ 'subject_type';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.studio_contacts'::regclass AND conname ~ 'entity_kind';
\echo '=== I3: a company rule really does print through contact_rule_summary ==='
BEGIN;
INSERT INTO public.studio_contact_rules (subject_type, subject_id, channels_forbidden, set_by)
VALUES ('company','d0e20000-0000-0000-0000-000000000002',
        ARRAY['sms']::text[],'a0000000-0000-0000-0000-000000000004');
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT display_name, contact_rule_summary FROM public.people_directory
 WHERE person_id='d0e20000-0000-0000-0000-000000000002';
ROLLBACK;

\echo '=== I4: PR-n — DELETE of a money grant by a plain member ==='
BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,aud,role)
VALUES ('a0000000-0000-0000-0000-0000000000f3','plain2@patina.dev','x',now(),'authenticated','authenticated');
INSERT INTO public.profiles (id,email,full_name) VALUES ('a0000000-0000-0000-0000-0000000000f3','plain2@patina.dev','Plain Two')
ON CONFLICT (id) DO UPDATE SET full_name='Plain Two';
INSERT INTO public.organization_members (organization_id,user_id,role,status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000f3','member','active');
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
SELECT count(*) AS money_grants_visible FROM public.project_party_authority WHERE scope='money';
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.project_party_authority WHERE scope='money';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'I4 plain member DELETE of money grants removed % rows', n;
EXCEPTION WHEN others THEN RAISE NOTICE 'I4 refused -> %', SQLERRM; END $$;
DO $$
DECLARE n int;
BEGIN
  UPDATE public.project_party_authority SET threshold_cents=999999999 WHERE scope='money';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'I4 plain member UPDATE of money thresholds changed % rows', n;
EXCEPTION WHEN others THEN RAISE NOTICE 'I4 refused -> %', SQLERRM; END $$;
DO $$
BEGIN
  INSERT INTO public.project_party_authority (engagement_id, scope)
  VALUES ((SELECT engagement_id FROM public.project_party_authority LIMIT 1),'draw_certify');
  RAISE NOTICE 'I4 plain member INSERT draw_certify LANDED (PR-n breach)';
EXCEPTION WHEN others THEN RAISE NOTICE 'I4 plain member INSERT draw_certify refused -> %', SQLERRM; END $$;
ROLLBACK;
