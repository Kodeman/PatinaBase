\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
INSERT INTO organizations (id, name, slug, type) VALUES
  ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio'),
  ('fb000000-0000-4000-8000-000000000002','R3 Studio B','r3-studio-b','design_studio');
INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
INSERT INTO profiles (id, email, full_name, display_name) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','A Owner','A Owner'),
  ('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','B Owner','B Owner') ON CONFLICT (id) DO NOTHING;
INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','owner','active'),
  ('fb000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-0000000000a2','owner','active');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by) VALUES
  ('fb000000-0000-4000-8000-0000000000c1','fb000000-0000-4000-8000-000000000001','company','trade','R3 Firm A','fb000000-0000-4000-8000-0000000000a1');
INSERT INTO projects (id, name, designer_id, studio_id, status, created_by) VALUES
  ('fb000000-0000-4000-8000-000000000f01','R3 Job A','fb000000-0000-4000-8000-0000000000a1','fb000000-0000-4000-8000-000000000001','active','fb000000-0000-4000-8000-0000000000a1');
INSERT INTO project_parties (id, project_id, company_id, display_name, party_kind, created_by)
VALUES ('fb000000-0000-4000-8000-000000000fe1','fb000000-0000-4000-8000-000000000f01','fb000000-0000-4000-8000-0000000000c1','R3 Seat','sub','fb000000-0000-4000-8000-0000000000a1');
-- a studio-less legacy job (R-BI)
INSERT INTO projects (id, name, designer_id, studio_id, status, created_by) VALUES
  ('fb000000-0000-4000-8000-000000000f02','R3 Orphan Job','fb000000-0000-4000-8000-0000000000a1',NULL,'active','fb000000-0000-4000-8000-0000000000a1');

\echo '--- 1. record_touch resolves the studio from the SUBJECT'
SELECT public.record_touch('company','fb000000-0000-4000-8000-0000000000c1','email','out') AS t_card \gset
SELECT public.record_touch('engagement','fb000000-0000-4000-8000-000000000fe1','sms','in') AS t_seat \gset
SELECT id, organization_id, subject_type, channel_kind, direction FROM studio_touches WHERE id IN (:'t_card', :'t_seat');

\echo '--- 2. an unattributable subject writes NOTHING and answers NULL'
SELECT public.record_touch('project','fb000000-0000-4000-8000-000000000f02','sms','out') IS NULL AS studioless_null;
SELECT public.record_touch('company', gen_random_uuid(), 'email','out') IS NULL AS unknown_card_null;
SELECT public.record_touch('company', NULL, 'email','out') IS NULL AS null_subject_null;

\echo '--- 3. authority_check without a class is refused by the record'
DO $$ BEGIN
  PERFORM public.record_touch('engagement','fb000000-0000-4000-8000-000000000fe1','sms','in', now(), 'x', 'none', 'failed_no_authority');
  RAISE EXCEPTION 'FAIL: a checked touch with no class was written';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: authority-without-class refused'; END $$;

\echo '--- 4. RLS: the studio reads its own touches, a stranger reads none, nobody writes'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
SELECT count(*) AS own_studio_sees FROM studio_touches WHERE organization_id='fb000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a2','role','authenticated')::text, true);
SELECT count(*) AS stranger_sees FROM studio_touches WHERE organization_id='fb000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  INSERT INTO studio_touches (organization_id, subject_type, subject_id, direction)
  VALUES ('fb000000-0000-4000-8000-000000000001','company','fb000000-0000-4000-8000-0000000000c1','out');
  RAISE EXCEPTION 'FAIL: a member wrote a touch directly';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: direct INSERT refused'; END $$;
DO $$ BEGIN
  PERFORM public.record_touch('company','fb000000-0000-4000-8000-0000000000c1','email','out');
  RAISE EXCEPTION 'FAIL: authenticated executed record_touch';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: record_touch not executable by authenticated'; END $$;

\echo '--- 5. record_notice: wire shape, tenancy, and dropped refs'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
SELECT * FROM public.record_notice('fb000000-0000-4000-8000-000000000f01','Gate code changed to 4417',
  ARRAY['fb000000-0000-4000-8000-000000000fe1','fb000000-0000-4000-8000-0000000000c1', gen_random_uuid()]::uuid[]);
\echo '--- 5b. a stranger and a studio-less job get the SAME refusal'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a2','role','authenticated')::text, true);
DO $$ BEGIN
  PERFORM public.record_notice('fb000000-0000-4000-8000-000000000f01','x', '{}'::uuid[]);
  RAISE EXCEPTION 'FAIL: stranger filed a notice';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS stranger: %', SQLERRM; END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
DO $$ BEGIN
  PERFORM public.record_notice('fb000000-0000-4000-8000-000000000f02','x', '{}'::uuid[]);
  RAISE EXCEPTION 'FAIL: studio-less job filed a notice';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS studioless: %', SQLERRM; END $$;
DO $$ BEGIN
  PERFORM public.record_notice('fb000000-0000-4000-8000-000000000f01','   ', '{}'::uuid[]);
  RAISE EXCEPTION 'FAIL: an empty notice was filed';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS empty: %', SQLERRM; END $$;
ROLLBACK;
