\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
INSERT INTO organizations (id, name, slug, type) VALUES
  ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio'),
  ('fb000000-0000-4000-8000-000000000002','R3 Studio B','r3-studio-b','design_studio');
INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
INSERT INTO profiles (id, email, full_name) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','A'),('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','owner','active'),
  ('fb000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-0000000000a2','owner','active');

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('compliance-documents','fb000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-0000000000c1/11111111-1111-4111-8111-111111111111/a.pdf', NULL),
  ('compliance-documents','fb000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-0000000000c2/22222222-2222-4222-8222-222222222222/b.pdf', NULL);

\echo '--- bucket posture'
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='compliance-documents';

\echo '--- A owner reads only A objects'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
SELECT name FROM storage.objects WHERE bucket_id='compliance-documents' ORDER BY name;
\echo '--- A owner cannot INSERT into the bucket'
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES ('compliance-documents','fb000000-0000-4000-8000-000000000001/x/y/z.pdf');
  RAISE EXCEPTION 'FAIL: authenticated wrote a compliance object';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: authenticated INSERT refused';
END $$;
\echo '--- A owner cannot DELETE/UPDATE'
DO $$
DECLARE n int;
BEGIN
  UPDATE storage.objects SET name=name WHERE bucket_id='compliance-documents';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'update rows: %', n;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: UPDATE refused';
END $$;

\echo '--- B owner reads only B objects'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a2','role','authenticated')::text, true);
SELECT name FROM storage.objects WHERE bucket_id='compliance-documents' ORDER BY name;

\echo '--- 22P02: a NON-uuid first segment in ANOTHER bucket, scanned by an authenticated member'
RESET role;
SELECT set_config('request.jwt.claims', NULL, true);
INSERT INTO storage.objects (bucket_id, name) VALUES ('project-documents','fulfillment/po/PO-2026-00001-A.pdf');
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM storage.objects;
  RAISE NOTICE 'full scan OK, rows visible: %', n;
EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'REPRO 22P02 on a full authenticated scan: %', SQLERRM;
END $$;
ROLLBACK;
