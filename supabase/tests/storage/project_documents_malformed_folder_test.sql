-- ═══════════════════════════════════════════════════════════════════════════
-- project-documents: a non-uuid first folder never breaks a listing (00892)
--
-- The regression this pins (SQ-2342): every authenticated storage policy on
-- project-documents cast (storage.foldername(name))[1] straight to uuid. RLS
-- quals run ahead of the caller's own filter, so ONE object whose first folder
-- is not a uuid (service-role `fulfillment/...` writes; a harness's
-- `rc2-journey/...`) made a designer's list of her own `<project>/` folder
-- raise 22P02 — and with it every authenticated reader's listing of the bucket.
--
-- Sections:
--   A  every actor lists the project folder and scans the whole bucket without
--      error; malformed objects are invisible to all of them
--   B  tenancy is unchanged: lead, co-member, team member see every project
--      file; the client sees only client_visible ones; an outsider sees none;
--      proposal and discovery folio objects keep their own readers
--   C  writes: a non-uuid first folder is refused as an RLS violation (42501),
--      not a cast error; UPDATE/DELETE touch no malformed row; valid writes
--      still pass
--   D  shape: every first-folder uuid cast in the seven policies is guarded
--   E  discriminator: the pre-00892 SELECT policy, restored in a savepoint,
--      makes the same probe raise 22P02 — the fixture exercises the defect
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/storage/project_documents_malformed_folder_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors ────────────────────────────────────────────────────────────────
-- Lead designer (D) and co-member (C) share studio S1. Teammate (T) is an
-- active project_team_members row. Client (K) is the project's and the
-- proposal's client. Outsider (O) designs in another studio S2.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT u.id, u.email, '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM (VALUES
  ('58920000-0000-4000-8000-0000000000d1'::uuid, 'sq2342-lead@test.invalid'),
  ('58920000-0000-4000-8000-0000000000c1'::uuid, 'sq2342-comember@test.invalid'),
  ('58920000-0000-4000-8000-0000000000e1'::uuid, 'sq2342-teammate@test.invalid'),
  ('58920000-0000-4000-8000-0000000000a1'::uuid, 'sq2342-client@test.invalid'),
  ('58920000-0000-4000-8000-0000000000f1'::uuid, 'sq2342-outsider@test.invalid')
) AS u(id, email);

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('58920000-0000-4000-8000-0000000000d1', 'sq2342-lead@test.invalid', 'Lead', true, now(), now()),
  ('58920000-0000-4000-8000-0000000000c1', 'sq2342-comember@test.invalid', 'Co-member', true, now(), now()),
  ('58920000-0000-4000-8000-0000000000e1', 'sq2342-teammate@test.invalid', 'Teammate', true, now(), now()),
  ('58920000-0000-4000-8000-0000000000a1', 'sq2342-client@test.invalid', 'Client', false, now(), now()),
  ('58920000-0000-4000-8000-0000000000f1', 'sq2342-outsider@test.invalid', 'Outsider', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug) VALUES
  ('58921000-0000-4000-8000-000000000001', 'design_studio', 'SQ-2342 studio', 'sq2342-studio'),
  ('58921000-0000-4000-8000-000000000002', 'design_studio', 'SQ-2342 other studio', 'sq2342-other-studio');

INSERT INTO public.organization_members (user_id, organization_id, role) VALUES
  ('58920000-0000-4000-8000-0000000000d1', '58921000-0000-4000-8000-000000000001', 'owner'),
  ('58920000-0000-4000-8000-0000000000c1', '58921000-0000-4000-8000-000000000001', 'member'),
  ('58920000-0000-4000-8000-0000000000f1', '58921000-0000-4000-8000-000000000002', 'owner');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES ('58922000-0000-4000-8000-000000000001', 'SQ-2342 project',
        '58920000-0000-4000-8000-0000000000d1', '58920000-0000-4000-8000-0000000000a1',
        '58920000-0000-4000-8000-0000000000d1', 'active');

INSERT INTO public.project_team_members (project_id, user_id, role)
VALUES ('58922000-0000-4000-8000-000000000001', '58920000-0000-4000-8000-0000000000e1', 'support_designer');

-- 'sent': a client reads only a sent proposal, and the folio policy's join
-- runs under the client's own proposals RLS.
INSERT INTO public.proposals (id, designer_id, client_id, title, status)
VALUES ('58923000-0000-4000-8000-000000000001', '58920000-0000-4000-8000-0000000000d1',
        '58920000-0000-4000-8000-0000000000a1', 'SQ-2342 proposal', 'sent');

INSERT INTO public.designer_clients (id, designer_id, client_id)
VALUES ('58924000-0000-4000-8000-000000000001', '58920000-0000-4000-8000-0000000000d1',
        '58920000-0000-4000-8000-0000000000a1');

-- Valid objects: two project files (one client-visible), one proposal folio
-- object (client-flagged), one discovery folio object. Malformed objects: the
-- two production shapes plus a harness shape and a near-uuid.
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('project-documents', '58922000-0000-4000-8000-000000000001/shared.pdf', '58920000-0000-4000-8000-0000000000d1'),
  ('project-documents', '58922000-0000-4000-8000-000000000001/studio-only.pdf', '58920000-0000-4000-8000-0000000000d1'),
  ('project-documents', '58923000-0000-4000-8000-000000000001/proposal.pdf', '58920000-0000-4000-8000-0000000000d1'),
  ('project-documents', '58924000-0000-4000-8000-000000000001/discovery.pdf', '58920000-0000-4000-8000-0000000000d1'),
  ('project-documents', 'fulfillment/po/sq2342.pdf', NULL),
  ('project-documents', 'fulfillment/evidence/x/sq2342.jpg', NULL),
  ('project-documents', 'rc2-journey/sq2342.pdf', NULL),
  ('project-documents', '58922000-0000-4000-8000-00000000000Z/near-uuid.pdf', NULL);

INSERT INTO public.project_documents (id, project_id, title, doc_type, storage_path, client_visible, uploaded_by)
VALUES
  ('58925000-0000-4000-8000-000000000001', '58922000-0000-4000-8000-000000000001', 'Shared', 'pdf',
   '58922000-0000-4000-8000-000000000001/shared.pdf', true, '58920000-0000-4000-8000-0000000000d1'),
  ('58925000-0000-4000-8000-000000000002', '58922000-0000-4000-8000-000000000001', 'Studio only', 'pdf',
   '58922000-0000-4000-8000-000000000001/studio-only.pdf', false, '58920000-0000-4000-8000-0000000000d1');

INSERT INTO public.project_documents (id, project_id, proposal_id, title, doc_type, storage_path, client_visible, uploaded_by)
VALUES ('58925000-0000-4000-8000-000000000003', NULL, '58923000-0000-4000-8000-000000000001', 'Proposal', 'pdf',
        '58923000-0000-4000-8000-000000000001/proposal.pdf', true, '58920000-0000-4000-8000-0000000000d1');

-- ── Probes ────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: storage RLS is evaluated as the assumed caller. Each probe
-- returns a tagged string instead of raising, so an error and a row count are
-- distinguishable. The GRANTs are needed because 00483 revokes TEMPORARY.
CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO PUBLIC;

-- The storage API's list(): storage.search over one prefix.
CREATE OR REPLACE FUNCTION pg_temp.list_prefix(p_prefix text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT 'ok:' || COALESCE(string_agg(s.name, ',' ORDER BY s.name), '')
    INTO v
  FROM storage.search(p_prefix, 'project-documents', 100, 2, 0, '', 'name', 'asc') s;
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.list_prefix(text) TO PUBLIC;

-- Every object of the bucket the caller can see, by name.
CREATE OR REPLACE FUNCTION pg_temp.visible()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT 'ok:' || COALESCE(string_agg(o.name, ',' ORDER BY o.name), '')
    INTO v
  FROM storage.objects o
  WHERE o.bucket_id = 'project-documents'
    AND (o.name LIKE '5892%' OR o.name ~ '^(fulfillment|rc2-journey)/');
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.visible() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.try_insert(p_name text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('project-documents', p_name, auth.uid());
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_insert(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.touch_malformed()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_up integer; v_del integer;
BEGIN
  UPDATE storage.objects SET metadata = '{"sq2342":true}'::jsonb
   WHERE bucket_id = 'project-documents' AND name ~ '^(fulfillment|rc2-journey)/';
  GET DIAGNOSTICS v_up = ROW_COUNT;
  -- storage.protect_delete refuses a raw DELETE unless the Storage API's
  -- flag is set; set it as the API does so RLS is what decides.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name ~ '^(fulfillment|rc2-journey)/';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RETURN 'ok:' || v_up || '/' || v_del;
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.touch_malformed() TO PUBLIC;

-- ── A + B · listings never raise; malformed rows invisible; tenancy kept ────
DO $$
DECLARE
  c_project constant text := '58922000-0000-4000-8000-000000000001/';
  c_all constant text := '58922000-0000-4000-8000-000000000001/shared.pdf,58922000-0000-4000-8000-000000000001/studio-only.pdf';
  r record;
  v_list text;
  v_seen text;
  n integer := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- actor, expected list of the project folder, expected visible names
    ('58920000-0000-4000-8000-0000000000d1'::uuid, 'lead',
     'ok:shared.pdf,studio-only.pdf',
     'ok:58922000-0000-4000-8000-000000000001/shared.pdf,58922000-0000-4000-8000-000000000001/studio-only.pdf,58923000-0000-4000-8000-000000000001/proposal.pdf,58924000-0000-4000-8000-000000000001/discovery.pdf'),
    ('58920000-0000-4000-8000-0000000000c1'::uuid, 'co-member',
     'ok:shared.pdf,studio-only.pdf',
     'ok:58922000-0000-4000-8000-000000000001/shared.pdf,58922000-0000-4000-8000-000000000001/studio-only.pdf,58923000-0000-4000-8000-000000000001/proposal.pdf,58924000-0000-4000-8000-000000000001/discovery.pdf'),
    ('58920000-0000-4000-8000-0000000000e1'::uuid, 'teammate',
     'ok:shared.pdf,studio-only.pdf', 'ok:' || c_all),
    ('58920000-0000-4000-8000-0000000000a1'::uuid, 'client',
     'ok:shared.pdf',
     'ok:58922000-0000-4000-8000-000000000001/shared.pdf,58923000-0000-4000-8000-000000000001/proposal.pdf'),
    ('58920000-0000-4000-8000-0000000000f1'::uuid, 'outsider', 'ok:', 'ok:')
  ) AS t(actor, label, want_list, want_seen)
  LOOP
    PERFORM pg_temp.assume(r.actor);
    v_list := pg_temp.list_prefix(c_project);
    v_seen := pg_temp.visible();
    RESET ROLE;
    ASSERT v_list = r.want_list,
      format('FAIL A1 (%s): list of the project folder: want %s, got %s', r.label, r.want_list, v_list);
    ASSERT v_seen = r.want_seen,
      format('FAIL A2/B (%s): visible objects: want %s, got %s', r.label, r.want_seen, v_seen);
    ASSERT v_seen NOT LIKE '%fulfillment%' AND v_seen NOT LIKE '%rc2-journey%' AND v_seen NOT LIKE '%near-uuid%',
      format('FAIL A3 (%s): a malformed object is visible: %s', r.label, v_seen);
    n := n + 3;
  END LOOP;

  -- Listing the malformed folders themselves is empty, not an error.
  PERFORM pg_temp.assume('58920000-0000-4000-8000-0000000000d1');
  v_list := pg_temp.list_prefix('fulfillment/');
  RESET ROLE;
  ASSERT v_list = 'ok:', 'FAIL A4: lead listing fulfillment/ must be empty, got ' || v_list;
  n := n + 1;
  RAISE NOTICE 'PASS A+B: % assertions', n;
END $$;

-- ── C · writes ────────────────────────────────────────────────────────────
SAVEPOINT s_c;
DO $$
DECLARE v text; n integer := 0;
BEGIN
  PERFORM pg_temp.assume('58920000-0000-4000-8000-0000000000d1');
  v := pg_temp.try_insert('not-a-uuid/sq2342.pdf');
  ASSERT v = 'err:42501', 'FAIL C1: non-uuid first folder insert must be an RLS refusal (42501), got ' || v;
  v := pg_temp.try_insert('58922000-0000-4000-8000-000000000001/new.pdf');
  ASSERT v = 'ok', 'FAIL C2: lead insert under her project must pass, got ' || v;
  v := pg_temp.try_insert('58924000-0000-4000-8000-000000000001/new.pdf');
  ASSERT v = 'ok', 'FAIL C3: lead insert under her discovery folio must pass, got ' || v;
  v := pg_temp.touch_malformed();
  ASSERT v = 'ok:0/0', 'FAIL C4: lead must update/delete no malformed object, got ' || v;
  RESET ROLE;

  PERFORM pg_temp.assume('58920000-0000-4000-8000-0000000000c1');
  v := pg_temp.try_insert('58923000-0000-4000-8000-000000000001/new.pdf');
  ASSERT v = 'ok', 'FAIL C5: co-member insert under the proposal folio must pass, got ' || v;
  RESET ROLE;

  PERFORM pg_temp.assume('58920000-0000-4000-8000-0000000000f1');
  v := pg_temp.try_insert('58922000-0000-4000-8000-000000000001/intrude.pdf');
  ASSERT v = 'err:42501', 'FAIL C6: outsider insert under another studio project must be refused, got ' || v;
  RESET ROLE;
  n := 6;
  RAISE NOTICE 'PASS C: % assertions', n;
END $$;
ROLLBACK TO SAVEPOINT s_c;

-- ── D · shape: every first-folder cast is guarded ─────────────────────────
DO $$
DECLARE r record; v_casts integer; v_guards integer; n integer := 0;
BEGIN
  FOR r IN
    SELECT policyname, COALESCE(qual, '') || COALESCE(with_check, '') AS body
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'Project members can read documents', 'Designers upload project documents',
        'Designers update project documents', 'Designers delete project documents',
        'Designers manage discovery folio objects', 'Designers manage proposal folio objects',
        'Clients read flagged proposal folio objects')
  LOOP
    v_casts := (SELECT count(*) FROM regexp_matches(r.body, '\[1\]\)::uuid', 'g'));
    v_guards := (SELECT count(*) FROM regexp_matches(r.body, 'pg_input_is_valid\(\(storage\.foldername\((objects\.)?name\)\)\[1\], ''uuid''::text\)', 'g'));
    ASSERT v_casts > 0 AND v_casts = v_guards,
      format('FAIL D1 (%s): %s first-folder uuid casts but %s guards', r.policyname, v_casts, v_guards);
    n := n + 1;
  END LOOP;
  ASSERT n = 7, 'FAIL D2: expected 7 project-documents policies, found ' || n;
  RAISE NOTICE 'PASS D: % policies guarded', n;
END $$;

-- ── E · discriminator: the pre-00892 read policy still raises ─────────────
SAVEPOINT s_e;
DROP POLICY "Project members can read documents" ON storage.objects;
CREATE POLICY "Project members can read documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND (p.designer_id = auth.uid() OR public.is_studio_comember(p.designer_id))
      )
      OR public.is_project_team_member(((storage.foldername(storage.objects.name))[1])::uuid)
    )
  );
DO $$
DECLARE v text;
BEGIN
  PERFORM pg_temp.assume('58920000-0000-4000-8000-0000000000d1');
  v := pg_temp.list_prefix('58922000-0000-4000-8000-000000000001/');
  RESET ROLE;
  ASSERT v = 'err:22P02', 'FAIL E1: the unguarded policy must raise 22P02 on this fixture, got ' || v;
  RAISE NOTICE 'PASS E: unguarded shape raises %', v;
END $$;
ROLLBACK TO SAVEPOINT s_e;

ROLLBACK;
