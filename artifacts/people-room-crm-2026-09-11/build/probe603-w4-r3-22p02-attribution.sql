\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
INSERT INTO organizations (id, name, slug, type) VALUES ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio');
INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
INSERT INTO profiles (id, email, full_name) VALUES ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','A') ON CONFLICT (id) DO NOTHING;
INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','owner','active');
INSERT INTO storage.objects (bucket_id, name) VALUES ('project-documents','fulfillment/po/PO-2026-00001-A.pdf');
INSERT INTO storage.objects (bucket_id, name) VALUES ('compliance-documents','fb000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-0000000000c1/11111111-1111-4111-8111-111111111111/a.pdf');

\echo '=== WITH the new policy in place ==='
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='compliance-documents';
  RAISE NOTICE 'bucket-scoped scan OK: % rows', n;
EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'bucket-scoped scan 22P02: %', SQLERRM; END $$;
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM storage.objects;
  RAISE NOTICE 'FULL scan OK: % rows', n;
EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'FULL scan 22P02: %', SQLERRM; END $$;

\echo '=== WITHOUT the new policy (attribution) ==='
RESET role; SELECT set_config('request.jwt.claims', NULL, true);
DROP POLICY compliance_documents_member_read ON storage.objects;
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM storage.objects;
  RAISE NOTICE 'FULL scan (policy dropped) OK: % rows', n;
EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'FULL scan (policy dropped) 22P02: %', SQLERRM; END $$;
ROLLBACK;
