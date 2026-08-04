-- ═══════════════════════════════════════════════════════════════════════════
-- people_directory studio scope + client roster read (migration 00420)
--
-- Covers:
--   (a) COLUMN-ORDER REGRESSION — the view's first 12 columns are exactly
--       person_id, role, display_name, email, phone, profile_id, project_id,
--       designer_id, status_raw, last_touch_at, meta, scope — in that order,
--       with `scope` LAST. CREATE OR REPLACE VIEW cannot reorder columns; this
--       case fails loudly if a future edit tries.
--   (b) a studio co-member sees a teammate's client / lead / party rows with
--       scope = 'studio', and their OWN rows with scope = 'mine'.
--   (c) a GUEST co-member sees only their own rows (is_studio_comember and
--       is_active_studio_member both exclude guests) and ZERO contacts rows.
--   (d) the contacts branch: role = 'contact' for co-members; an archived card
--       carries status_raw = 'archived'.
--   (e) an 'architect' party appears in the party branch; a 'client'-kind party
--       does NOT (it would collide with the clients branch's role semantics).
--   (f) the team branch's meta carries job_title (and staff_role) for a
--       co-member teammate.
--   (g) CLIENT READ: the project's client sees ZERO project_parties rows when
--       nothing is opted in, EXACTLY the flipped row when show_to_client = true,
--       loses it when flipped back, cannot UPDATE or INSERT parties, and sees
--       exactly the opted-in row in v_project_roster's party branch.
--   (h) DEGENERATE CASE: a solo designer with no studio co-members sees the
--       same rows as before the migration (own clients / leads / parties),
--       and zero contacts.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/rls/people_directory_scope_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- A = studio owner · B = studio member (teammate) · G = studio GUEST
-- C = the client on A's project · S = a solo designer with no studio at all
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('bd000000-0000-4000-8000-000000000001', 'pd-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000002', 'pd-member@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000003', 'pd-guest@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000004', 'pd-client@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000005', 'pd-solo@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at)
VALUES
  ('bd000000-0000-4000-8000-000000000001', 'pd-owner@test.invalid',  'PD Owner',  NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000002', 'pd-member@test.invalid', 'PD Member', NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000003', 'pd-guest@test.invalid',  'PD Guest',  NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000004', 'pd-client@test.invalid', 'PD Client', NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000005', 'pd-solo@test.invalid',   'PD Solo',   NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('bd000000-0000-4000-8000-0000000000a1', 'design_studio', 'PD Studio', 'pd-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at, job_title, staff_role)
VALUES
  ('bd000000-0000-4000-8000-00000000ab01', 'bd000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW(), 'Principal',       'principal'),
  ('bd000000-0000-4000-8000-00000000ab02', 'bd000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW(), 'Junior Designer', 'design'),
  ('bd000000-0000-4000-8000-00000000ab03', 'bd000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW(), NULL,              NULL);

-- ── designer_clients: one per actor ────────────────────────────────────────
INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES
  ('bd000000-0000-4000-8000-0000000000c1', 'bd000000-0000-4000-8000-000000000001', 'A Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c2', 'bd000000-0000-4000-8000-000000000002', 'B Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c3', 'bd000000-0000-4000-8000-000000000003', 'G Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c5', 'bd000000-0000-4000-8000-000000000005', 'S Household', 'active');

-- ── leads: one open lead each for A, B and S ───────────────────────────────
INSERT INTO leads (id, designer_id, project_type, contact_name, status)
VALUES
  ('bd000000-0000-4000-8000-0000000000d1', 'bd000000-0000-4000-8000-000000000001', 'full_home', 'A Lead', 'new'),
  ('bd000000-0000-4000-8000-0000000000d2', 'bd000000-0000-4000-8000-000000000002', 'kitchen',   'B Lead', 'new'),
  ('bd000000-0000-4000-8000-0000000000d5', 'bd000000-0000-4000-8000-000000000005', 'bath',      'S Lead', 'new');

-- ── projects ───────────────────────────────────────────────────────────────
-- e1: A's project, client = C (the client-read cases live here)
-- e2: B's project (A reads it through co-membership + project team seat)
-- e5: S's solo project
INSERT INTO projects (id, name, designer_id, created_by, studio_id, client_id)
VALUES
  ('bd000000-0000-4000-8000-0000000000e1', 'A Project', 'bd000000-0000-4000-8000-000000000001',
   'bd000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-0000000000a1',
   'bd000000-0000-4000-8000-000000000004'),
  ('bd000000-0000-4000-8000-0000000000e2', 'B Project', 'bd000000-0000-4000-8000-000000000002',
   'bd000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-0000000000a1', NULL),
  ('bd000000-0000-4000-8000-0000000000e5', 'S Project', 'bd000000-0000-4000-8000-000000000005',
   'bd000000-0000-4000-8000-000000000005', NULL, NULL);

-- ── project team seats ─────────────────────────────────────────────────────
-- A sits on B's project (so project_parties' own-project RLS admits A's read of
-- B's parties — this migration widens the VIEW, never a base-table policy).
-- B sits on A's project (so A's team branch has a teammate row to read).
INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES
  ('bd000000-0000-4000-8000-0000000000f1', 'bd000000-0000-4000-8000-0000000000e2',
   'bd000000-0000-4000-8000-000000000001', 'support_designer', 'bd000000-0000-4000-8000-000000000002'),
  ('bd000000-0000-4000-8000-0000000000f2', 'bd000000-0000-4000-8000-0000000000e1',
   'bd000000-0000-4000-8000-000000000002', 'support_designer', 'bd000000-0000-4000-8000-000000000001');

-- ── parties ────────────────────────────────────────────────────────────────
-- On B's project: an architect (must appear in the party branch) and a
-- 'client'-kind party (must NOT — it collides with the clients branch).
-- On A's project: two gc rows, both opted OUT to start (case g flips one).
-- On S's project: one gc (the degenerate case still sees its own parties).
INSERT INTO project_parties (id, project_id, party_kind, display_name, show_to_client)
VALUES
  ('bd000000-0000-4000-8000-0000000000b2', 'bd000000-0000-4000-8000-0000000000e2', 'architect',  'Ana Architect', false),
  ('bd000000-0000-4000-8000-0000000000b3', 'bd000000-0000-4000-8000-0000000000e2', 'client',     'Cara Client',   false),
  ('bd000000-0000-4000-8000-0000000000b1', 'bd000000-0000-4000-8000-0000000000e1', 'gc',         'Gary GC',       false),
  ('bd000000-0000-4000-8000-0000000000b4', 'bd000000-0000-4000-8000-0000000000e1', 'installer',  'Ivan Installer',false),
  ('bd000000-0000-4000-8000-0000000000b5', 'bd000000-0000-4000-8000-0000000000e5', 'gc',         'Solo GC',       false);

-- ── rolodex cards ──────────────────────────────────────────────────────────
-- sc1: live person filed by B → A reads it as scope='studio'
-- sc2: ARCHIVED company filed by A → A reads it as scope='mine', status archived
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_name,
                             email, phone, specialties, created_by, archived_at)
VALUES
  ('bd000000-0000-4000-8000-00000000c001', 'bd000000-0000-4000-8000-0000000000a1', 'person',  'sub',
   'Rita Rolodex', NULL, 'rita@test.invalid', '555-0100', ARRAY['tile'],
   'bd000000-0000-4000-8000-000000000002', NULL),
  ('bd000000-0000-4000-8000-00000000c002', 'bd000000-0000-4000-8000-0000000000a1', 'company', 'vendor',
   NULL, 'Old Millworks', NULL, NULL, ARRAY['casework'],
   'bd000000-0000-4000-8000-000000000001', NOW());

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

-- ─── (a) column-order regression ────────────────────────────────────────────
DO $$
DECLARE
  v_cols  TEXT;
  v_total INTEGER;
BEGIN
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'people_directory'
    AND ordinal_position <= 12;

  ASSERT v_cols = 'person_id,role,display_name,email,phone,profile_id,project_id,'
               || 'designer_id,status_raw,last_touch_at,meta,scope',
    'FAIL a1: people_directory column ORDER drifted — got: ' || COALESCE(v_cols, 'NULL');

  SELECT count(*) INTO v_total
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'people_directory';
  ASSERT v_total = 12, 'FAIL a2: expected exactly 12 columns, got ' || v_total;

  -- scope must be the LAST column and text-typed.
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'people_directory'
     AND column_name = 'scope' AND ordinal_position = 12 AND data_type = 'text';
  ASSERT FOUND, 'FAIL a3: scope must be column 12 and of type text';

  RAISE NOTICE 'people_directory_scope: case (a) passed.';
END
$$;

-- ─── (b) co-member sees the teammate's rows as studio, own rows as mine ─────
DO $$
DECLARE
  v_scope TEXT;
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');   -- A

  -- own client → mine
  SELECT scope INTO v_scope FROM people_directory
   WHERE role = 'client' AND person_id = 'bd000000-0000-4000-8000-0000000000c1';
  ASSERT v_scope = 'mine', 'FAIL b1: own client should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  -- teammate's client → studio
  SELECT scope INTO v_scope FROM people_directory
   WHERE role = 'client' AND person_id = 'bd000000-0000-4000-8000-0000000000c2';
  ASSERT v_scope = 'studio', 'FAIL b2: teammate client should read scope=studio, got ' || COALESCE(v_scope, 'NULL');

  -- own lead → mine ; teammate's lead → studio
  SELECT scope INTO v_scope FROM people_directory
   WHERE role = 'lead' AND person_id = 'bd000000-0000-4000-8000-0000000000d1';
  ASSERT v_scope = 'mine', 'FAIL b3: own lead should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  SELECT scope INTO v_scope FROM people_directory
   WHERE role = 'lead' AND person_id = 'bd000000-0000-4000-8000-0000000000d2';
  ASSERT v_scope = 'studio', 'FAIL b4: teammate lead should read scope=studio, got ' || COALESCE(v_scope, 'NULL');

  -- teammate's project party (A is on B's project team, so base RLS admits it;
  -- before 00420 the VIEW's own predicate excluded it entirely)
  SELECT scope INTO v_scope FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000b2';
  ASSERT v_scope = 'studio', 'FAIL b5: teammate party should read scope=studio, got ' || COALESCE(v_scope, 'NULL');

  -- own project party → mine
  SELECT scope INTO v_scope FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000b1';
  ASSERT v_scope = 'mine', 'FAIL b6: own party should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  -- the guest's client row must NOT reach A (guest confers no co-membership)
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000c3';
  ASSERT v_count = 0, 'FAIL b7: a guest''s client row must not reach a co-member, got ' || v_count;

  -- the solo designer's rows must NOT reach A either
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id IN ('bd000000-0000-4000-8000-0000000000c5', 'bd000000-0000-4000-8000-0000000000d5');
  ASSERT v_count = 0, 'FAIL b8: an unrelated designer''s rows must not reach A, got ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'people_directory_scope: case (b) passed.';
END
$$;

-- ─── (c) a GUEST sees only their own rows, and zero contacts ───────────────
DO $$
DECLARE
  v_count INTEGER;
  v_scope TEXT;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000003');   -- G (guest)

  -- own client is still visible (the self-branch of is_studio_comember)
  SELECT scope INTO v_scope FROM people_directory
   WHERE role = 'client' AND person_id = 'bd000000-0000-4000-8000-0000000000c3';
  ASSERT v_scope = 'mine', 'FAIL c1: guest''s own client should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  -- but NOTHING of the studio's book
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id IN ('bd000000-0000-4000-8000-0000000000c1',
                       'bd000000-0000-4000-8000-0000000000c2',
                       'bd000000-0000-4000-8000-0000000000d1',
                       'bd000000-0000-4000-8000-0000000000d2');
  ASSERT v_count = 0, 'FAIL c2: a guest must see zero studio rows, got ' || v_count;

  -- and ZERO contacts (is_active_studio_member excludes guests)
  SELECT count(*) INTO v_count FROM people_directory WHERE role = 'contact';
  ASSERT v_count = 0, 'FAIL c3: a guest must see zero contacts rows, got ' || v_count;

  -- no studio-scoped row of any kind
  SELECT count(*) INTO v_count FROM people_directory WHERE scope = 'studio';
  ASSERT v_count = 0, 'FAIL c4: a guest must see zero scope=studio rows, got ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'people_directory_scope: case (c) passed.';
END
$$;

-- ─── (d) the contacts branch ────────────────────────────────────────────────
DO $$
DECLARE
  v_role   TEXT;
  v_scope  TEXT;
  v_status TEXT;
  v_name   TEXT;
  v_kind   TEXT;
  v_proj   UUID;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');   -- A

  -- the teammate-filed live person card
  SELECT role, scope, status_raw, display_name, meta->>'contact_kind', project_id
    INTO v_role, v_scope, v_status, v_name, v_kind, v_proj
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-00000000c001';
  ASSERT v_role   = 'contact',       'FAIL d1: contacts branch role should be contact, got ' || COALESCE(v_role, 'NULL');
  ASSERT v_scope  = 'studio',        'FAIL d2: B-filed card should read scope=studio, got ' || COALESCE(v_scope, 'NULL');
  ASSERT v_status = 'active',        'FAIL d3: a live card should read status_raw=active, got ' || COALESCE(v_status, 'NULL');
  ASSERT v_name   = 'Rita Rolodex',  'FAIL d4: display_name should fall back to full_name, got ' || COALESCE(v_name, 'NULL');
  ASSERT v_kind   = 'sub',           'FAIL d5: meta.contact_kind should carry the card kind, got ' || COALESCE(v_kind, 'NULL');
  ASSERT v_proj IS NULL,             'FAIL d6: a rolodex card is studio-scoped — project_id must be NULL';

  -- the self-filed ARCHIVED company card
  SELECT scope, status_raw, display_name INTO v_scope, v_status, v_name
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-00000000c002';
  ASSERT v_scope  = 'mine',          'FAIL d7: self-filed card should read scope=mine, got ' || COALESCE(v_scope, 'NULL');
  ASSERT v_status = 'archived',      'FAIL d8: an archived card should read status_raw=archived, got ' || COALESCE(v_status, 'NULL');
  ASSERT v_name   = 'Old Millworks', 'FAIL d9: a company card falls back to company_name, got ' || COALESCE(v_name, 'NULL');

  PERFORM pg_temp.reset_role();

  -- the plain member reads the same two cards (fully shared rolodex, R1)
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000002');   -- B
  PERFORM 1 FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-00000000c002';
  ASSERT FOUND, 'FAIL d10: a plain member must read a card filed by the owner';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'people_directory_scope: case (d) passed.';
END
$$;

-- ─── (e) architect IS in the party branch; a client-kind party is NOT ───────
DO $$
DECLARE
  v_role  TEXT;
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000002');   -- B (owns e2)

  SELECT role INTO v_role FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000b2';
  ASSERT v_role = 'architect', 'FAIL e1: an architect party should surface with role=architect, got ' || COALESCE(v_role, 'NULL');

  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000b3';
  ASSERT v_count = 0, 'FAIL e2: a client-kind party must be EXCLUDED from the party branch, got ' || v_count;

  -- meta carries the Wave 3/4 columns
  PERFORM 1 FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000b2'
     AND meta ? 'show_to_client' AND meta ? 'studio_contact_id';
  ASSERT FOUND, 'FAIL e3: party meta must carry show_to_client + studio_contact_id keys';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'people_directory_scope: case (e) passed.';
END
$$;

-- ─── (f) team branch meta carries job_title / staff_role ───────────────────
DO $$
DECLARE
  v_title TEXT;
  v_staff TEXT;
  v_scope TEXT;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');   -- A reads B's team row

  SELECT meta->>'job_title', meta->>'staff_role', scope
    INTO v_title, v_staff, v_scope
  FROM people_directory
   WHERE role = 'team' AND profile_id = 'bd000000-0000-4000-8000-000000000002';
  ASSERT v_title = 'Junior Designer', 'FAIL f1: team meta.job_title missing, got ' || COALESCE(v_title, 'NULL');
  ASSERT v_staff = 'design',          'FAIL f2: team meta.staff_role missing, got ' || COALESCE(v_staff, 'NULL');
  ASSERT v_scope = 'mine',            'FAIL f3: teammate on MY project should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'people_directory_scope: case (f) passed.';
END
$$;

-- ─── (g) the client's opted-in roster read ─────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_id    UUID;
  v_name  TEXT;
  v_raised BOOLEAN;
BEGIN
  -- g0: nothing opted in → the client sees ZERO parties and ZERO roster rows.
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000004');   -- C
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 0, 'FAIL g0a: with nothing opted in the client must see 0 parties, got ' || v_count;

  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_count = 0, 'FAIL g0b: with nothing opted in the client must see 0 roster party rows, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- The designer flips ONE row on (through their own 00212 policy).
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');   -- A
  UPDATE project_parties SET show_to_client = true
   WHERE id = 'bd000000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  -- g1: the client now sees EXACTLY that row — not the other party on the job.
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 1, 'FAIL g1a: the client must see exactly 1 opted-in party, got ' || v_count;

  SELECT id, display_name INTO v_id, v_name FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1';
  ASSERT v_id = 'bd000000-0000-4000-8000-0000000000b1',
    'FAIL g1b: the visible row must be the opted-in one, got ' || COALESCE(v_name, 'NULL');

  -- g1c: and the same single row through v_project_roster's party branch.
  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_count = 1, 'FAIL g1c: the client''s roster party branch must show exactly 1 row, got ' || v_count;

  SELECT roster_id INTO v_id FROM v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_id = 'bd000000-0000-4000-8000-0000000000b1',
    'FAIL g1d: the roster row must be the opted-in party';

  -- g2: the client CANNOT write. UPDATE matches no UPDATE policy → 0 rows.
  UPDATE project_parties SET display_name = 'Hacked'
   WHERE id = 'bd000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'FAIL g2a: the client must not UPDATE a party, rows affected: ' || v_count;

  -- g2b: INSERT is refused outright (no INSERT policy admits the client).
  v_raised := false;
  BEGIN
    INSERT INTO project_parties (id, project_id, party_kind, display_name)
    VALUES ('bd000000-0000-4000-8000-0000000000bf', 'bd000000-0000-4000-8000-0000000000e1', 'gc', 'Client Sneak');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL g2b: the client must not INSERT a party';
  PERFORM pg_temp.reset_role();

  -- g3: flipped back off → the client loses the row again.
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');
  UPDATE project_parties SET show_to_client = false
   WHERE id = 'bd000000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 0, 'FAIL g3a: flipping show_to_client back off must hide the row, got ' || v_count;

  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_count = 0, 'FAIL g3b: the roster party branch must be empty again, got ' || v_count;

  -- g4: the client reaches nothing on a project that is not theirs, opted in or not.
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');
  UPDATE project_parties SET show_to_client = true
   WHERE id = 'bd000000-0000-4000-8000-0000000000b2';                    -- on B's project
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e2';
  ASSERT v_count = 0, 'FAIL g4: an opted-in row on someone else''s project must stay invisible, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'people_directory_scope: case (g) passed.';
END
$$;

-- ─── (h) degenerate case: the solo designer is unchanged ───────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_scope TEXT;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000005');   -- S

  SELECT scope INTO v_scope FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000c5';
  ASSERT v_scope = 'mine', 'FAIL h1: solo designer''s client should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  SELECT scope INTO v_scope FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000d5';
  ASSERT v_scope = 'mine', 'FAIL h2: solo designer''s lead should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  SELECT scope INTO v_scope FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000b5';
  ASSERT v_scope = 'mine', 'FAIL h3: solo designer''s party should read scope=mine, got ' || COALESCE(v_scope, 'NULL');

  -- No studio → no studio rows and no rolodex.
  SELECT count(*) INTO v_count FROM people_directory WHERE scope = 'studio';
  ASSERT v_count = 0, 'FAIL h4: a solo designer must see zero scope=studio rows, got ' || v_count;

  SELECT count(*) INTO v_count FROM people_directory WHERE role = 'contact';
  ASSERT v_count = 0, 'FAIL h5: a solo designer must see zero contacts rows, got ' || v_count;

  -- Nothing from the studio's book leaked in.
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id IN ('bd000000-0000-4000-8000-0000000000c1',
                       'bd000000-0000-4000-8000-0000000000c2',
                       'bd000000-0000-4000-8000-0000000000b1',
                       'bd000000-0000-4000-8000-0000000000b2');
  ASSERT v_count = 0, 'FAIL h6: studio rows must not reach an unrelated designer, got ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'people_directory_scope: case (h) passed.';
  RAISE NOTICE 'All people_directory scope assertions passed.';
END
$$;

ROLLBACK;
