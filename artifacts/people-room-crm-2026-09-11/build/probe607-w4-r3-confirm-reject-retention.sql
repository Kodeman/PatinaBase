\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
INSERT INTO organizations (id, name, slug, type) VALUES
  ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio'),
  ('fb000000-0000-4000-8000-000000000002','R3 Studio B','r3-studio-b','design_studio');
INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','owner','active'),
  ('fb000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-0000000000a2','owner','active');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by) VALUES
  ('fb000000-0000-4000-8000-0000000000c1','fb000000-0000-4000-8000-000000000001','company','trade','R3 Firm A','fb000000-0000-4000-8000-0000000000a1');
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, source, inbound)
VALUES ('fb000000-0000-4000-8000-0000000000d2','fb000000-0000-4000-8000-000000000001','company',
        'fb000000-0000-4000-8000-0000000000c1','coi_gl', CURRENT_DATE + 100,
        ARRAY['site_access']::text[], 'field_link', true);

\echo '--- 1. a member of ANOTHER studio may not confirm or reject'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a2','role','authenticated')::text, true);
DO $$ BEGIN PERFORM public.confirm_inbound_document('fb000000-0000-4000-8000-0000000000d2');
  RAISE EXCEPTION 'FAIL: cross-tenant confirm';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: cross-tenant confirm refused (%)', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.reject_inbound_document('fb000000-0000-4000-8000-0000000000d2','no');
  RAISE EXCEPTION 'FAIL: cross-tenant reject';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: cross-tenant reject refused (%)', SQLERRM; END $$;

\echo '--- 2. MINOR-16 re-check: may a plain studio member DELETE / UPDATE a compliance row directly?'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
DO $$ DECLARE n int; BEGIN
  UPDATE public.studio_compliance_documents
     SET rejected_at = now(), rejection_reason = 'typed straight onto the row'
   WHERE id='fb000000-0000-4000-8000-0000000000d2';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'direct UPDATE rows: % (0 = closed, 1 = OPEN)', n;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'direct UPDATE refused'; END $$;
DO $$ DECLARE n int; BEGIN
  DELETE FROM public.studio_compliance_documents WHERE id='fb000000-0000-4000-8000-0000000000d2';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'direct DELETE rows: % (0 = closed, 1 = OPEN)', n;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'direct DELETE refused'; END $$;
\echo '--- 3. and the paperwork token row: may a member UPDATE / DELETE it?'
DO $$ DECLARE n int; BEGIN
  UPDATE public.paperwork_link_tokens SET status='revoked' WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'token UPDATE rows: %', n;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: token UPDATE refused'; END $$;
DO $$ DECLARE n int; BEGIN
  DELETE FROM public.paperwork_link_tokens WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'token DELETE rows: %', n;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: token DELETE refused'; END $$;
ROLLBACK;
