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
--   (i) DUAL-STUDIO PINNING (00421): a designer active in TWO studios has no
--       per-row studio dimension on their clients/leads, so a co-member from
--       EITHER studio sees ALL of them. Pinned as KNOWN, ACCEPTED semantics.
--   (j) CO-MEMBER READ COMPLETION (00421): a co-member with NO seat on the
--       project team now SELECTs that project's parties + team rows and both
--       v_project_roster branches; a guest co-member and an unrelated designer
--       still see none; and the co-member's WRITES still fail.
--   (k) ISSUANCE EVIDENCE (00478): the client branch's meta.has_sent_proposal
--       and meta.issued_on_paper tell a drafted-and-linked agreement from an
--       emailed one, from one handed over on paper, and from a genuinely sent
--       legacy row 00328 could not backfill — and the answer does not change
--       with the caller's own RLS on `proposals`.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/rls/people_directory_scope_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- A = studio owner · B = studio member (teammate) · G = studio GUEST
-- C = the client on A's project · S = a solo designer with no studio at all
-- 00421 additions:
-- M = active non-guest member of studio 1 with NO project-team seat anywhere
--     (the actor whose Call Sheet rendered EMPTY before 00421)
-- D = designer active in BOTH studios · N = member of studio 2 ONLY
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('bd000000-0000-4000-8000-000000000001', 'pd-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000002', 'pd-member@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000003', 'pd-guest@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000004', 'pd-client@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000005', 'pd-solo@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000006', 'pd-dual@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000007', 'pd-studio2@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bd000000-0000-4000-8000-000000000008', 'pd-seatless@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at)
VALUES
  ('bd000000-0000-4000-8000-000000000001', 'pd-owner@test.invalid',  'PD Owner',  NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000002', 'pd-member@test.invalid', 'PD Member', NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000003', 'pd-guest@test.invalid',  'PD Guest',  NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000004', 'pd-client@test.invalid', 'PD Client', NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000005', 'pd-solo@test.invalid',   'PD Solo',   NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000006', 'pd-dual@test.invalid',   'PD Dual',   NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000007', 'pd-studio2@test.invalid','PD Studio2',NULL, NOW(), NOW()),
  ('bd000000-0000-4000-8000-000000000008', 'pd-seatless@test.invalid','PD Seatless', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('bd000000-0000-4000-8000-0000000000a1', 'design_studio', 'PD Studio',     'pd-studio-test'),
  ('bd000000-0000-4000-8000-0000000000a2', 'design_studio', 'PD Studio Two', 'pd-studio-two-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at, job_title, staff_role)
VALUES
  ('bd000000-0000-4000-8000-00000000ab01', 'bd000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW(), 'Principal',       'principal'),
  ('bd000000-0000-4000-8000-00000000ab02', 'bd000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW(), 'Junior Designer', 'design'),
  ('bd000000-0000-4000-8000-00000000ab03', 'bd000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW(), NULL,              NULL),
  -- 00421: D holds an active non-guest seat in BOTH studios
  ('bd000000-0000-4000-8000-00000000ab04', 'bd000000-0000-4000-8000-000000000006', 'bd000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW(), 'Associate',       'design'),
  ('bd000000-0000-4000-8000-00000000ab05', 'bd000000-0000-4000-8000-000000000006', 'bd000000-0000-4000-8000-0000000000a2', 'member', 'active', NOW(), 'Associate',       'design'),
  -- N is in studio 2 ONLY; M is in studio 1 ONLY and sits on no project team
  ('bd000000-0000-4000-8000-00000000ab06', 'bd000000-0000-4000-8000-000000000007', 'bd000000-0000-4000-8000-0000000000a2', 'member', 'active', NOW(), 'Studio Two Hand', 'design'),
  ('bd000000-0000-4000-8000-00000000ab07', 'bd000000-0000-4000-8000-000000000008', 'bd000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW(), 'Studio Manager',  'ops');

-- ── designer_clients: one per actor ────────────────────────────────────────
-- c6 / c7 are BOTH D's. The names label which studio's work D was doing when
-- the card was filed — but designer_clients carries NO studio column, so that
-- label lives only in this fixture's head. Case (i) pins the consequence.
INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES
  ('bd000000-0000-4000-8000-0000000000c1', 'bd000000-0000-4000-8000-000000000001', 'A Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c2', 'bd000000-0000-4000-8000-000000000002', 'B Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c3', 'bd000000-0000-4000-8000-000000000003', 'G Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c5', 'bd000000-0000-4000-8000-000000000005', 'S Household', 'active'),
  ('bd000000-0000-4000-8000-0000000000c6', 'bd000000-0000-4000-8000-000000000006', 'D Household (studio-1 side)', 'active'),
  ('bd000000-0000-4000-8000-0000000000c7', 'bd000000-0000-4000-8000-000000000006', 'D Household (studio-2 side)', 'active');

-- ── leads: one open lead each for A, B and S; two for D (one per "side") ───
INSERT INTO leads (id, designer_id, project_type, contact_name, status)
VALUES
  ('bd000000-0000-4000-8000-0000000000d1', 'bd000000-0000-4000-8000-000000000001', 'full_home', 'A Lead', 'new'),
  ('bd000000-0000-4000-8000-0000000000d2', 'bd000000-0000-4000-8000-000000000002', 'kitchen',   'B Lead', 'new'),
  ('bd000000-0000-4000-8000-0000000000d5', 'bd000000-0000-4000-8000-000000000005', 'bath',      'S Lead', 'new'),
  ('bd000000-0000-4000-8000-0000000000d6', 'bd000000-0000-4000-8000-000000000006', 'kitchen',   'D Lead (studio-1 side)', 'new'),
  ('bd000000-0000-4000-8000-0000000000d7', 'bd000000-0000-4000-8000-000000000006', 'bath',      'D Lead (studio-2 side)', 'new');

-- ── 00478 issuance-evidence fixtures ───────────────────────────────────────
-- Five more of A's households, one per shape the meta keys have to tell apart.
-- Only the legacy one carries a client_id: the fallback join matches on the
-- (designer, client) pair, so giving two of them the same pair would let the
-- orphan proposal bleed across households and hide the very distinction under
-- test.
INSERT INTO designer_clients (id, designer_id, client_id, client_name, status)
VALUES
  ('bd000000-0000-4000-8000-0000000000c8', 'bd000000-0000-4000-8000-000000000001', NULL,
   'A Drafted Household',  'proposal'),
  ('bd000000-0000-4000-8000-0000000000c9', 'bd000000-0000-4000-8000-000000000001', NULL,
   'A Sent Household',     'proposal'),
  ('bd000000-0000-4000-8000-0000000000ca', 'bd000000-0000-4000-8000-000000000001', NULL,
   'A Dispatch Household', 'proposal'),
  ('bd000000-0000-4000-8000-0000000000cb', 'bd000000-0000-4000-8000-000000000001', NULL,
   'A Paper Household',    'proposal'),
  ('bd000000-0000-4000-8000-0000000000cc', 'bd000000-0000-4000-8000-000000000001',
   'bd000000-0000-4000-8000-000000000004', 'A Legacy Household', 'proposal');

-- The proposals. Inserted as postgres, which is the only role
-- guard_commercial_proposal_authority lets past a non-draft commercial_state
-- on INSERT.
INSERT INTO proposals (id, designer_id, client_id, designer_client_id, title,
                       status, document_kind, commercial_state, sent_at, issued_on_paper)
VALUES
  -- drafted and linked, never issued: the false-signal case J7 exists for
  ('bd000000-0000-4000-8000-0000000000f1', 'bd000000-0000-4000-8000-000000000001', NULL,
   'bd000000-0000-4000-8000-0000000000c8', 'A Drafted Agreement',
   'draft', 'design_services', 'draft', NULL, false),
  -- really emailed: sent_at written by send_commercial_document
  ('bd000000-0000-4000-8000-0000000000f2', 'bd000000-0000-4000-8000-000000000001', NULL,
   'bd000000-0000-4000-8000-0000000000c9', 'A Sent Agreement',
   'sent', 'design_services', 'sent', NOW(), false),
  -- a dispatch row exists but sent_at is missing: the second, independent tell
  ('bd000000-0000-4000-8000-0000000000f3', 'bd000000-0000-4000-8000-000000000001', NULL,
   'bd000000-0000-4000-8000-0000000000ca', 'A Dispatched Agreement',
   'sent', 'design_services', 'sent', NULL, false),
  -- issued on paper (00477): no sent_at, no dispatch row, stamp true
  ('bd000000-0000-4000-8000-0000000000f4', 'bd000000-0000-4000-8000-000000000001', NULL,
   'bd000000-0000-4000-8000-0000000000cb', 'A Paper Agreement',
   'sent', 'design_services', 'sent', NULL, true),
  -- 00328 orphan: genuinely sent, but designer_client_id was never backfilled
  ('bd000000-0000-4000-8000-0000000000f5', 'bd000000-0000-4000-8000-000000000001',
   'bd000000-0000-4000-8000-000000000004', NULL, 'A Legacy Agreement',
   'sent', 'design_services', 'sent', NOW(), false);

INSERT INTO proposal_send_dispatches (
  id, proposal_id, sent_at, designer_id, client_id, proposal_title,
  recipient_email, designer_name, sender_name, client_portal_path,
  provider_idempotency_key, email_log_id, in_app_log_id)
VALUES
  ('bd000000-0000-4000-8000-0000000000f9', 'bd000000-0000-4000-8000-0000000000f3', NOW(),
   'bd000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000004',
   'A Dispatched Agreement', 'pd-client@test.invalid', 'PD Owner', 'PD Owner',
   '/proposals/bd000000-0000-4000-8000-0000000000f3',
   'pd-test-idem-f3', 'bd000000-0000-4000-8000-0000000000fa',
   'bd000000-0000-4000-8000-0000000000fb');

-- T: a co-member of A through a CONTRACTOR org only. is_studio_comember admits
-- them (so they see A's households); is_design_studio_comember — which gates
-- proposals since 00401 — does not. This is the viewer an invoker-side EXISTS
-- would have lied to.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('bd000000-0000-4000-8000-000000000009', 'pd-trade@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at)
VALUES ('bd000000-0000-4000-8000-000000000009', 'pd-trade@test.invalid', 'PD Trade', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('bd000000-0000-4000-8000-0000000000a3', 'contractor', 'PD Trade Co', 'pd-trade-co-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('bd000000-0000-4000-8000-00000000ab08', 'bd000000-0000-4000-8000-000000000001',
   'bd000000-0000-4000-8000-0000000000a3', 'member', 'active', NOW()),
  ('bd000000-0000-4000-8000-00000000ab09', 'bd000000-0000-4000-8000-000000000009',
   'bd000000-0000-4000-8000-0000000000a3', 'member', 'active', NOW());

-- ── a saved vendor (00421 §3: the studio's shared maker book) ──────────────
INSERT INTO vendors (id, name)
VALUES ('bd000000-0000-4000-8000-00000000ee01', 'PD Test Millworks');

INSERT INTO saved_vendors (id, designer_id, vendor_id, notes)
VALUES ('bd000000-0000-4000-8000-00000000ee02', 'bd000000-0000-4000-8000-000000000001',
        'bd000000-0000-4000-8000-00000000ee01', 'A saved this one');

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
END
$$;

-- ─── (i) DUAL-STUDIO transitivity — KNOWN, ACCEPTED semantics (00421) ───────
--
-- D holds an active non-guest seat in studio 1 AND studio 2. B is in studio 1
-- only; N is in studio 2 only. Neither designer_clients nor leads carries a
-- studio column — ownership is a single designer_id — so is_studio_comember(D)
-- is true for a member of EITHER studio and there is no per-row dimension to
-- filter on. Result: B sees BOTH of D's client cards and BOTH of D's leads,
-- including the ones D filed while working the other studio's book, and N sees
-- the same two from the other side.
--
-- This is DELIBERATE and ACCEPTED for this wave, not an oversight. It is the
-- exact semantics 00316 already shipped for PROJECT sharing (projects_studio_
-- select is likewise keyed on designer_id alone, so a dual-studio designer's
-- projects have always been visible to co-members of either studio). Making
-- the people rows narrower than the projects that hang off them would be an
-- inconsistency, not a fix.
--
-- REVISIT IF multi-studio designers become real (today the product has no UI
-- for joining a second studio, and _primary_studio_for picks exactly one). The
-- fix then is a per-row studio dimension carried on the row itself — NOT a
-- narrower helper, which would silently break the single-studio majority.
-- This case exists to make that decision loud if anyone changes it.
DO $$
DECLARE
  v_count INTEGER;
  v_scope TEXT;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000002');   -- B (studio 1 only)

  SELECT count(*) INTO v_count FROM people_directory
   WHERE role = 'client'
     AND person_id IN ('bd000000-0000-4000-8000-0000000000c6',
                       'bd000000-0000-4000-8000-0000000000c7');
  ASSERT v_count = 2,
    'FAIL i1: a studio-1 co-member must see BOTH of a dual-studio designer''s '
    'client cards (accepted transitivity — see the case header), got ' || v_count;

  SELECT count(*) INTO v_count FROM people_directory
   WHERE role = 'lead'
     AND person_id IN ('bd000000-0000-4000-8000-0000000000d6',
                       'bd000000-0000-4000-8000-0000000000d7');
  ASSERT v_count = 2,
    'FAIL i2: a studio-1 co-member must see BOTH of a dual-studio designer''s '
    'leads, got ' || v_count;

  -- both read as studio scope (they are not B's own rows)
  SELECT scope INTO v_scope FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000c7';
  ASSERT v_scope = 'studio',
    'FAIL i3: the other studio''s card must still read scope=studio, got ' || COALESCE(v_scope, 'NULL');
  PERFORM pg_temp.reset_role();

  -- Symmetric from the other side: N (studio 2 only) sees the same two cards.
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000007');   -- N
  SELECT count(*) INTO v_count FROM people_directory
   WHERE role = 'client'
     AND person_id IN ('bd000000-0000-4000-8000-0000000000c6',
                       'bd000000-0000-4000-8000-0000000000c7');
  ASSERT v_count = 2,
    'FAIL i4: a studio-2 co-member must see BOTH of the dual-studio designer''s '
    'client cards, got ' || v_count;

  -- but N reaches NOTHING of studio 1's own book (D is the only bridge, and a
  -- bridge on a ROW, not on a whole studio: A's and B's rows stay in studio 1)
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id IN ('bd000000-0000-4000-8000-0000000000c1',
                       'bd000000-0000-4000-8000-0000000000c2',
                       'bd000000-0000-4000-8000-0000000000d1',
                       'bd000000-0000-4000-8000-0000000000d2');
  ASSERT v_count = 0,
    'FAIL i5: co-membership must NOT transit studio→studio through a shared '
    'member — only that member''s OWN rows cross, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- and an unrelated designer still sees none of D's rows
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000005');   -- S
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id IN ('bd000000-0000-4000-8000-0000000000c6',
                       'bd000000-0000-4000-8000-0000000000c7',
                       'bd000000-0000-4000-8000-0000000000d6',
                       'bd000000-0000-4000-8000-0000000000d7');
  ASSERT v_count = 0, 'FAIL i6: an unrelated designer must see none of D''s rows, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'people_directory_scope: case (i) passed.';
END
$$;

-- ─── (j) CO-MEMBER READ COMPLETION — the 00421 policies ────────────────────
--
-- M is an active non-guest member of studio 1 who sits on NO project team.
-- Before 00421 that actor's Call Sheet was EMPTY: 00420 widened the VIEW but
-- project_parties (00212), project_team_members (00084/00087) and
-- saved_vendors (00009) were still own-project / own-row, so every widened
-- branch was hollow under security_invoker. These assertions FAIL on any
-- checkout where 00421 is missing.
DO $$
DECLARE
  v_count  INTEGER;
  v_raised BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000008');   -- M

  -- j1: the base tables themselves
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 2,
    'FAIL j1a: a seatless co-member must SELECT both parties on a teammate''s '
    'project, got ' || v_count;

  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e2';
  ASSERT v_count = 2,
    'FAIL j1b: …and both parties on the other teammate''s project, got ' || v_count;

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND removed_at IS NULL;
  ASSERT v_count = 1,
    'FAIL j1c: a seatless co-member must SELECT the project''s team seats, got ' || v_count;

  -- j2: BOTH v_project_roster branches resolve for that same caller
  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_count = 2, 'FAIL j2a: roster party branch must show 2 rows, got ' || v_count;

  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1' AND source = 'team';
  ASSERT v_count = 1, 'FAIL j2b: roster team branch must show 1 row, got ' || v_count;

  -- j3: the previously-hollow people_directory branches now yield rows
  SELECT count(*) INTO v_count FROM people_directory
   WHERE person_id IN ('bd000000-0000-4000-8000-0000000000b1',
                       'bd000000-0000-4000-8000-0000000000b4',
                       'bd000000-0000-4000-8000-0000000000b2');
  ASSERT v_count = 3,
    'FAIL j3a: the party branch must yield the studio''s parties to a seatless '
    'co-member, got ' || v_count;

  SELECT count(*) INTO v_count FROM people_directory
   WHERE role = 'maker' AND person_id = 'bd000000-0000-4000-8000-00000000ee01';
  ASSERT v_count = 1,
    'FAIL j3b: the makers branch must yield the studio''s saved vendor, got ' || v_count;

  SELECT count(*) INTO v_count FROM saved_vendors
   WHERE vendor_id = 'bd000000-0000-4000-8000-00000000ee01';
  ASSERT v_count = 1,
    'FAIL j3c: a co-member must SELECT the studio''s saved_vendors row, got ' || v_count;

  -- j4: WRITES still fail — every 00421 policy is SELECT-only.
  UPDATE project_parties SET display_name = 'Comember Overreach'
   WHERE id = 'bd000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'FAIL j4a: a co-member must not UPDATE a party, rows affected: ' || v_count;

  UPDATE project_team_members SET role = 'lead_designer'
   WHERE id = 'bd000000-0000-4000-8000-0000000000f2';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'FAIL j4b: a co-member must not UPDATE a team seat, rows affected: ' || v_count;

  UPDATE saved_vendors SET notes = 'stolen'
   WHERE id = 'bd000000-0000-4000-8000-00000000ee02';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'FAIL j4c: a co-member must not UPDATE a teammate''s saved vendor, rows affected: ' || v_count;

  DELETE FROM project_parties WHERE id = 'bd000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'FAIL j4d: a co-member must not DELETE a party, rows affected: ' || v_count;

  v_raised := false;
  BEGIN
    INSERT INTO project_parties (id, project_id, party_kind, display_name)
    VALUES ('bd000000-0000-4000-8000-0000000000be', 'bd000000-0000-4000-8000-0000000000e1', 'gc', 'Comember Sneak');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL j4e: a co-member must not INSERT a party';

  v_raised := false;
  BEGIN
    INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
    VALUES ('bd000000-0000-4000-8000-0000000000fe', 'bd000000-0000-4000-8000-0000000000e1',
            'bd000000-0000-4000-8000-000000000008', 'support_designer',
            'bd000000-0000-4000-8000-000000000008');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL j4f: a co-member must not INSERT a team seat (self-promotion)';

  v_raised := false;
  BEGIN
    INSERT INTO saved_vendors (id, designer_id, vendor_id)
    VALUES ('bd000000-0000-4000-8000-00000000ee03', 'bd000000-0000-4000-8000-000000000001',
            'bd000000-0000-4000-8000-00000000ee01');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL j4g: a co-member must not INSERT a saved vendor on a teammate''s behalf';
  PERFORM pg_temp.reset_role();

  -- j5: a GUEST co-member still sees NONE of it
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000003');   -- G
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id IN ('bd000000-0000-4000-8000-0000000000e1',
                        'bd000000-0000-4000-8000-0000000000e2');
  ASSERT v_count = 0, 'FAIL j5a: a guest must see zero parties, got ' || v_count;

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id IN ('bd000000-0000-4000-8000-0000000000e1',
                        'bd000000-0000-4000-8000-0000000000e2');
  ASSERT v_count = 0, 'FAIL j5b: a guest must see zero team seats, got ' || v_count;

  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id IN ('bd000000-0000-4000-8000-0000000000e1',
                        'bd000000-0000-4000-8000-0000000000e2');
  ASSERT v_count = 0, 'FAIL j5c: a guest must see zero roster rows, got ' || v_count;

  SELECT count(*) INTO v_count FROM saved_vendors
   WHERE vendor_id = 'bd000000-0000-4000-8000-00000000ee01';
  ASSERT v_count = 0, 'FAIL j5d: a guest must see zero saved_vendors rows, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- j6: an unrelated designer still sees none of it either
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000005');   -- S
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id IN ('bd000000-0000-4000-8000-0000000000e1',
                        'bd000000-0000-4000-8000-0000000000e2');
  ASSERT v_count = 0, 'FAIL j6a: an unrelated designer must see zero parties, got ' || v_count;

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id IN ('bd000000-0000-4000-8000-0000000000e1',
                        'bd000000-0000-4000-8000-0000000000e2');
  ASSERT v_count = 0, 'FAIL j6b: an unrelated designer must see zero team seats, got ' || v_count;

  SELECT count(*) INTO v_count FROM saved_vendors
   WHERE vendor_id = 'bd000000-0000-4000-8000-00000000ee01';
  ASSERT v_count = 0, 'FAIL j6c: an unrelated designer must see zero saved_vendors rows, got ' || v_count;

  -- j7: and the CLIENT's read stays exactly as narrow as 00420 made it —
  -- the co-member widening must not have leaked a second path to the client.
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000004');   -- C
  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'bd000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 0,
    'FAIL j7: the client must still see only opted-in rows (all off by now), got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'people_directory_scope: case (j) passed.';
END
$$;

-- ─── (k) 00478 issuance evidence in the client branch's meta ───────────────
-- The distinction the People Room, the Nurture queue and the Desk's reconnect
-- band all rest on: a linked proposal is not an issued one, an emailed one is
-- not a paper one, and neither reads as the other.
DO $$
DECLARE
  v_sent  BOOLEAN;
  v_paper BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000001');   -- A

  -- k0: both keys are always present, so a consumer can tell "false" from
  -- "this view predates the fix".
  PERFORM 1 FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000c1'
     AND meta ? 'has_sent_proposal' AND meta ? 'issued_on_paper';
  ASSERT FOUND, 'FAIL k0: the client branch must always carry both evidence keys';

  -- k1: no proposal at all → both false
  SELECT (meta->>'has_sent_proposal')::boolean, (meta->>'issued_on_paper')::boolean
    INTO v_sent, v_paper
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000c1';
  ASSERT v_sent = false AND v_paper = false,
    'FAIL k1: a household with no proposal must read false/false, got '
    || v_sent || '/' || v_paper;

  -- k2: a DRAFT proposal is not evidence of anything leaving the studio
  SELECT (meta->>'has_sent_proposal')::boolean, (meta->>'issued_on_paper')::boolean
    INTO v_sent, v_paper
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000c8';
  ASSERT v_sent = false AND v_paper = false,
    'FAIL k2: a merely-drafted proposal must NOT read as sent, got '
    || v_sent || '/' || v_paper;

  -- k3: sent_at set → sent
  SELECT (meta->>'has_sent_proposal')::boolean, (meta->>'issued_on_paper')::boolean
    INTO v_sent, v_paper
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000c9';
  ASSERT v_sent = true AND v_paper = false,
    'FAIL k3: a proposal with sent_at must read as sent, got '
    || v_sent || '/' || v_paper;

  -- k4: a dispatch row with no sent_at still means it went out
  SELECT (meta->>'has_sent_proposal')::boolean INTO v_sent
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000ca';
  ASSERT v_sent = true,
    'FAIL k4: a dispatch row alone must count as a real send, got ' || v_sent;

  -- k5: issued on paper is its own state — never sent, never a draft
  SELECT (meta->>'has_sent_proposal')::boolean, (meta->>'issued_on_paper')::boolean
    INTO v_sent, v_paper
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000cb';
  ASSERT v_paper = true, 'FAIL k5a: a paper issuance must stamp issued_on_paper';
  ASSERT v_sent = false,
    'FAIL k5b: a paper issuance must NOT read as a send (no email left), got ' || v_sent;

  -- k6: 00328's orphan — designer_client_id NULL, matched on the pair
  SELECT (meta->>'has_sent_proposal')::boolean INTO v_sent
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000cc';
  ASSERT v_sent = true,
    'FAIL k6: a genuinely sent proposal 00328 could not backfill must still '
    'read as sent, got ' || v_sent;

  PERFORM pg_temp.reset_role();

  -- k7: the RLS-independence claim. T shares only a CONTRACTOR org with A, so
  -- proposals are invisible to them while the households are not. The evidence
  -- must still be the truth — an invoker-side EXISTS would answer false here
  -- and re-print "not yet sent" over a sent agreement.
  PERFORM pg_temp.assume_user('bd000000-0000-4000-8000-000000000009');   -- T

  PERFORM 1 FROM people_directory
   WHERE person_id = 'bd000000-0000-4000-8000-0000000000c9' AND scope = 'studio';
  ASSERT FOUND, 'FAIL k7a: a contractor-org co-member should still see A''s household';

  PERFORM 1 FROM proposals WHERE id = 'bd000000-0000-4000-8000-0000000000f2';
  ASSERT NOT FOUND,
    'FAIL k7b: fixture assumption broken — this viewer must NOT be able to '
    'select the proposal, or the case proves nothing';

  SELECT (meta->>'has_sent_proposal')::boolean INTO v_sent
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000c9';
  ASSERT v_sent = true,
    'FAIL k7c: issuance evidence must not depend on the caller''s RLS on '
    'proposals, got ' || v_sent;

  SELECT (meta->>'issued_on_paper')::boolean INTO v_paper
  FROM people_directory WHERE person_id = 'bd000000-0000-4000-8000-0000000000cb';
  ASSERT v_paper = true,
    'FAIL k7d: the paper stamp must not depend on the caller''s RLS on '
    'proposals, got ' || v_paper;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'people_directory_scope: case (k) passed.';
  RAISE NOTICE 'All people_directory scope assertions passed.';
END
$$;

ROLLBACK;
