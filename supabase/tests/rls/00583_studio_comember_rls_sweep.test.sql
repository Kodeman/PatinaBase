-- ═══════════════════════════════════════════════════════════════════════════
-- 00583 — the studio co-member sweep, table by table
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00582_client_discovery_studio_rls.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00583_studio_comember_rls_sweep.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh -f /rls/
--
-- Fixture, all seeded by a local reset:
--   designer  a0000000-…-0004  Leah Hartwell, owner of Local Dev Studio
--                              b0000000-…-0001 (seed/organizations.sql)
--   co-member a0000000-…-0003  Studio Manager, ADMIN of the SAME studio
--   client    a0000000-…-0005  the designer's engaged homeowner
--   outsider  cf100000-0000-4000-8000-000000000001  owner of Phase One
--                              Synthetic Studio, shares no org with the
--                              designer (seed/cloudflare-phase1-staging.sql)
--   project   b0000000-…-00d1  Aspen Loft Refresh, designer_id = …0004
--   proposal  b0000000-…-0001, lead d0c10000-…-00a1, and the …0004↔…0005
--             engagement, looked up by pg_temp.engagement() because its id is
--             generated at seed time
--
-- Every section runs inside a SAVEPOINT; the file ROLLBACKs. Every fixture row
-- is written as postgres (RLS-exempt) so each section measures the READER's or
-- WRITER's authority, never the setup's.
--
-- READ THIS BEFORE ADDING A CASE. A policy leg that joins to a parent table is
-- evaluated with the CALLER's RLS on that parent, so a widened child is only
-- reachable if the parent is already co-member visible. Every parent used below
-- has such a leg (designer_clients_studio_rw 00316, projects_studio_select
-- 00316, proposals_design_studio_select 00399, purchase_orders_studio_read) —
-- EXCEPT public.room_scans, which has no SELECT leg keyed on its own user_id.
-- Section E therefore reaches its designer-owned scan through an active
-- room_scan_association, the only route that exists; without 00583's
-- room_scans_studio_update the UPDATE there is still 0 rows.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '120s';

-- ─── helpers (same shape as 00582_client_discovery_studio_rls.test.sql) ─────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- The seeded engagement's id is generated at seed time, not a literal, so it is
-- looked up rather than hard-coded (the 00582 test does the same).
CREATE OR REPLACE FUNCTION pg_temp.engagement()
RETURNS uuid AS $$
  SELECT id FROM public.designer_clients
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND client_id   = 'a0000000-0000-0000-0000-000000000005'
   ORDER BY created_at, id
   LIMIT 1;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.engagement() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.discovery_object()
RETURNS text AS $$
  SELECT pg_temp.engagement()::text || '/00583-discovery.pdf';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.discovery_object() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_co  boolean; v_co_ds  boolean;
  v_out boolean; v_out_ds boolean;
BEGIN
  ASSERT pg_temp.engagement() IS NOT NULL,
    'FIXTURE: the seeded designer↔client engagement must exist '
    '(seed/designer-clients.sql)';
  ASSERT EXISTS (SELECT 1 FROM public.projects
                  WHERE id = 'b0000000-0000-0000-0000-0000000000d1'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded project b0000000-…-00d1 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.proposals
                  WHERE id = 'b0000000-0000-0000-0000-000000000001'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded proposal b0000000-…-0001 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.leads
                  WHERE id = 'd0c10000-0000-0000-0000-0000000000a1'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded lead d0c10000-…-00a1 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.rooms
                  WHERE user_id = 'a0000000-0000-0000-0000-000000000005'),
    'FIXTURE: the client …0005 must own at least one room';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_co    := public.is_studio_comember('a0000000-0000-0000-0000-000000000004');
  v_co_ds := public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  v_out    := public.is_studio_comember('a0000000-0000-0000-0000-000000000004');
  v_out_ds := public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();

  ASSERT v_co AND v_co_ds,
    'FIXTURE: a0000000-…-0003 must be a studio co-member of the designer under '
    'BOTH helpers or nothing below proves the widening';
  ASSERT NOT v_out AND NOT v_out_ds,
    'FIXTURE: cf100000-…-0001 must NOT be a co-member of the designer under '
    'either helper or the leak sections prove nothing';

  RAISE NOTICE '00583 fixture: co-member and outsider confirmed';
END $$;

-- ─── fixture rows (written as postgres) ────────────────────────────────────

INSERT INTO public.field_captures (id, client_capture_id, designer_id, title)
VALUES ('58300000-0000-4000-8000-0000000000e1',
        '58300000-0000-4000-8000-0000000000e9',
        'a0000000-0000-0000-0000-000000000004', '00583 capture');

INSERT INTO public.purchase_orders
  (id, designer_id, project_id, vendor_id, payment_pattern)
VALUES ('58300000-0000-4000-8000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-0000000000d1',
        '11111111-1111-1111-1111-111111111104', 'net_30');

INSERT INTO public.receiving_inspections
  (id, purchase_order_id, inspected_by, outcome)
VALUES ('58300000-0000-4000-8000-0000000000d2',
        '58300000-0000-4000-8000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', 'clean');

-- Scan A is the CLIENT's — reachable to the co-member through
-- room_scans_studio_designer_read (00316). Scan B is the DESIGNER's, reachable
-- only through the association below (see the header note).
INSERT INTO public.room_scans (id, user_id, name) VALUES
  ('58300000-0000-4000-8000-0000000000a1',
   'a0000000-0000-0000-0000-000000000005', '00583 scan A (client-owned)'),
  ('58300000-0000-4000-8000-0000000000b1',
   'a0000000-0000-0000-0000-000000000004', '00583 scan B (designer-owned)');

INSERT INTO public.room_scan_associations
  (id, scan_id, designer_id, consumer_id, association_type, status, access_level)
VALUES ('58300000-0000-4000-8000-0000000000b2',
        '58300000-0000-4000-8000-0000000000b1',
        'a0000000-0000-0000-0000-000000000003',
        'a0000000-0000-0000-0000-000000000004',
        'suggested', 'active', 'full');

INSERT INTO public.room_scan_images (id, scan_id, role, image_url, captured_at)
VALUES ('58300000-0000-4000-8000-0000000000c1',
        '58300000-0000-4000-8000-0000000000a1', 'hero',
        'photos/a0000000-0000-0000-0000-000000000005/x/hero.jpg', now());

-- A throwaway project of the designer's, for the DELETE leg. Written as
-- postgres: set_project_studio_id() admits a migration-shaped insert
-- (session_user = postgres, role none/postgres) unconditionally.
INSERT INTO public.projects (id, name, created_by, designer_id)
VALUES ('58300000-0000-4000-8000-000000000031', '00583 disposable project',
        'a0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.weekly_pulses (id, project_id, designer_id, week_of)
VALUES ('58300000-0000-4000-8000-0000000000f1',
        'b0000000-0000-0000-0000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', date_trunc('week', now())::date);

INSERT INTO public.client_invitations (id, token, email, designer_id)
VALUES ('58300000-0000-4000-8000-000000000071'::uuid, '00583-token',
        '00583-invite@test.invalid', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.match_ceremonies (id, lead_id, designer_id)
VALUES ('58300000-0000-4000-8000-000000000072',
        'd0c10000-0000-0000-0000-0000000000a1',
        'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.proposal_captures (id, designer_id, source_url)
VALUES ('58300000-0000-4000-8000-000000000073',
        'a0000000-0000-0000-0000-000000000004',
        'https://example.invalid/00583');

INSERT INTO public.ffe_categories (id, slug, label, designer_id, is_system)
VALUES ('58300000-0000-4000-8000-000000000074',
        '00583-seating', '00583 Seating',
        'a0000000-0000-0000-0000-000000000004', false);

INSERT INTO public.products
  (id, name, captured_at, layer, studio_id, vendor_contact, lead_time_weeks,
   payment_terms, category, usage_notes)
VALUES ('58300000-0000-4000-8000-000000000075', '00583 studio piece', now(),
        'studio', 'b0000000-0000-0000-0000-000000000001',
        '{"email": "rep@test.invalid"}'::jsonb, 8, 'net_30', 'seating',
        'Studio-wide favourite');

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('project-documents', pg_temp.discovery_object(),
   'a0000000-0000-0000-0000-000000000004'),
  ('project-documents',
   'b0000000-0000-0000-0000-0000000000d1/00583-project.pdf',
   'a0000000-0000-0000-0000-000000000004'),
  ('room-scans',
   'usdz/a0000000-0000-0000-0000-000000000004/58300000-0000-4000-8000-0000000000b1/scan.usdz',
   'a0000000-0000-0000-0000-000000000004'),
  ('field-media',
   'project/b0000000-0000-0000-0000-0000000000d1/00583-field.jpg',
   'a0000000-0000-0000-0000-000000000004');

-- ═══════════════════════════════════════════════════════════════════════════
-- A · Field — field_captures, receiving_inspections
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_a;

DO $$
DECLARE v_seen integer; v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.field_captures
   WHERE id = '58300000-0000-4000-8000-0000000000e1';
  ASSERT v_seen = 1, 'FAIL A1: co-member must SELECT the designer''s field capture; got ' || v_seen;

  INSERT INTO public.field_captures (client_capture_id, designer_id, title)
  VALUES ('58300000-0000-4000-8000-0000000000e8',
          'a0000000-0000-0000-0000-000000000004', '00583 co-member capture');

  SELECT count(*) INTO v_seen FROM public.receiving_inspections
   WHERE id = '58300000-0000-4000-8000-0000000000d2';
  ASSERT v_seen = 1, 'FAIL A2: co-member must SELECT the inspection on the designer''s PO; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.field_captures
   WHERE id = '58300000-0000-4000-8000-0000000000e1';
  ASSERT v_seen = 0, 'FAIL A3: outsider must not see the field capture; got ' || v_seen;

  BEGIN
    INSERT INTO public.field_captures (client_capture_id, designer_id, title)
    VALUES ('58300000-0000-4000-8000-0000000000e7',
            'a0000000-0000-0000-0000-000000000004', '00583 outsider capture');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'FAIL A4: outsider must be refused (42501) writing a field capture';

  SELECT count(*) INTO v_seen FROM public.receiving_inspections
   WHERE id = '58300000-0000-4000-8000-0000000000d2';
  ASSERT v_seen = 0, 'FAIL A5: outsider must not see the inspection; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 A passed: field_captures + receiving_inspections';
END $$;

ROLLBACK TO SAVEPOINT s_a;

-- ═══════════════════════════════════════════════════════════════════════════
-- B · scans — room_scan_images select/insert, room_scans update
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_b;

DO $$
DECLARE v_seen integer; v_rows integer; v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.room_scan_images
   WHERE id = '58300000-0000-4000-8000-0000000000c1';
  ASSERT v_seen = 1,
    'FAIL B1: co-member must SELECT the client scan''s image through the '
    'delegated read; got ' || v_seen;

  INSERT INTO public.room_scan_images (scan_id, role, image_url, captured_at)
  VALUES ('58300000-0000-4000-8000-0000000000b1', 'hero',
          'photos/00583/comember.jpg', now());

  UPDATE public.room_scans SET name = '00583 co-member touched'
   WHERE id = '58300000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL B2: co-member must UPDATE the designer''s room scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.room_scan_images
   WHERE id = '58300000-0000-4000-8000-0000000000c1';
  ASSERT v_seen = 0, 'FAIL B3: outsider must not see the scan image; got ' || v_seen;

  BEGIN
    INSERT INTO public.room_scan_images (scan_id, role, image_url, captured_at)
    VALUES ('58300000-0000-4000-8000-0000000000b1', 'hero',
            'photos/00583/outsider.jpg', now());
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'FAIL B4: outsider must be refused (42501) writing a scan image';

  UPDATE public.room_scans SET name = '00583 outsider touched'
   WHERE id = '58300000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL B5: outsider must update no room scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 B passed: room_scan_images + room_scans';
END $$;

ROLLBACK TO SAVEPOINT s_b;

-- ═══════════════════════════════════════════════════════════════════════════
-- C · the Document's daily surfaces
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_c;

DO $$
DECLARE v_seen integer; v_rows integer; v_msg text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.weekly_pulses
   WHERE id = '58300000-0000-4000-8000-0000000000f1';
  ASSERT v_seen = 1, 'FAIL C1: co-member must SELECT the designer''s weekly pulse; got ' || v_seen;

  INSERT INTO public.margin_notes (project_id, designer_id, body)
  VALUES ('b0000000-0000-0000-0000-0000000000d1',
          'a0000000-0000-0000-0000-000000000004', '00583 co-member note');

  INSERT INTO public.project_tasks (project_id, title)
  VALUES ('b0000000-0000-0000-0000-0000000000d1', '00583 co-member task');

  INSERT INTO public.project_documents (project_id, title, doc_type, uploaded_by)
  VALUES ('b0000000-0000-0000-0000-0000000000d1', '00583 co-member doc', 'pdf',
          'a0000000-0000-0000-0000-000000000003');

  INSERT INTO public.project_parties (project_id, party_kind, display_name)
  VALUES ('b0000000-0000-0000-0000-0000000000d1', 'gc', '00583 co-member party');

  INSERT INTO public.leads (designer_id, project_type)
  VALUES ('a0000000-0000-0000-0000-000000000004', 'full_home');

  SELECT count(*) INTO v_seen FROM public.client_invitations
   WHERE id = '58300000-0000-4000-8000-000000000071'::uuid;
  ASSERT v_seen = 1, 'FAIL C2: co-member must SELECT the designer''s client invitation; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.match_ceremonies
   WHERE id = '58300000-0000-4000-8000-000000000072';
  ASSERT v_seen = 1, 'FAIL C3: co-member must SELECT the designer''s match ceremony; got ' || v_seen;

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000031';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL C4: co-member must DELETE the designer''s project; rows=' || v_rows;

  -- RECORDED, NOT A BUG IN 00583. The colleague creating a project in the
  -- OWNER's name is refused — not by RLS but by set_project_studio_id(), the
  -- SECURITY DEFINER authority trigger, which requires
  -- NEW.designer_id = auth.uid() on every direct authenticated INSERT. RLS
  -- cannot lift a trigger, so 00583's projects_studio_insert leg widens nothing
  -- beyond what 00168 already allowed (both helpers admit the caller herself).
  -- Asserted so a future reader does not chase it as a policy defect.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.projects (name, created_by, designer_id)
    VALUES ('00583 co-member project', 'a0000000-0000-0000-0000-000000000003',
            'a0000000-0000-0000-0000-000000000004');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'studio_id_not_designer_studio',
    'FAIL C5: creating a project in a colleague''s name must still be refused '
    'by set_project_studio_id(); got ' || COALESCE(v_msg, '<inserted>');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 C passed: co-member on the daily surfaces';
END $$;

ROLLBACK TO SAVEPOINT s_c;

SAVEPOINT s_c_out;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.weekly_pulses
   WHERE id = '58300000-0000-4000-8000-0000000000f1';
  ASSERT v_seen = 0, 'FAIL C4: outsider must not see the weekly pulse; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.client_invitations
   WHERE id = '58300000-0000-4000-8000-000000000071'::uuid;
  ASSERT v_seen = 0, 'FAIL C5: outsider must not see the client invitation; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.match_ceremonies
   WHERE id = '58300000-0000-4000-8000-000000000072';
  ASSERT v_seen = 0, 'FAIL C6: outsider must not see the match ceremony; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 C-out passed: outsider blocked on reads';
END $$;

ROLLBACK TO SAVEPOINT s_c_out;

SAVEPOINT s_c_out_w;

DO $$
DECLARE v_blocked boolean; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  v_blocked := false;
  BEGIN
    INSERT INTO public.margin_notes (project_id, designer_id, body)
    VALUES ('b0000000-0000-0000-0000-0000000000d1',
            'a0000000-0000-0000-0000-000000000004', '00583 outsider note');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C7: outsider must be refused writing a margin note';

  v_blocked := false;
  BEGIN
    INSERT INTO public.project_tasks (project_id, title)
    VALUES ('b0000000-0000-0000-0000-0000000000d1', '00583 outsider task');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C8: outsider must be refused writing a project task';

  v_blocked := false;
  BEGIN
    INSERT INTO public.project_documents (project_id, title, doc_type)
    VALUES ('b0000000-0000-0000-0000-0000000000d1', '00583 outsider doc', 'pdf');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C9: outsider must be refused writing a project document';

  v_blocked := false;
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name)
    VALUES ('b0000000-0000-0000-0000-0000000000d1', 'gc', '00583 outsider party');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C10: outsider must be refused writing a project party';

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000031';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL C11: outsider must delete none of the designer''s projects; rows=' || v_rows;

  v_blocked := false;
  BEGIN
    INSERT INTO public.leads (designer_id, project_type)
    VALUES ('a0000000-0000-0000-0000-000000000004', 'full_home');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C12: outsider must be refused creating a lead for the designer';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 C-out-w passed: outsider blocked on writes';
END $$;

ROLLBACK TO SAVEPOINT s_c_out_w;

-- ═══════════════════════════════════════════════════════════════════════════
-- D · the proposal fleet, the catalog, the client record
--     (is_design_studio_comember)
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_d;

DO $$
DECLARE v_seen integer; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.proposal_captures
   WHERE id = '58300000-0000-4000-8000-000000000073';
  ASSERT v_seen = 1, 'FAIL D1: co-member must SELECT the designer''s proposal capture; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.ffe_categories
   WHERE id = '58300000-0000-4000-8000-000000000074';
  ASSERT v_seen = 1, 'FAIL D2: co-member must SELECT the designer''s FF&E category; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.rooms
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005';
  ASSERT v_seen >= 1,
    'FAIL D3: co-member must read the engaged client''s rooms through the '
    'engagement; got ' || v_seen;

  DELETE FROM public.products WHERE id = '58300000-0000-4000-8000-000000000075';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL D4: an active studio member must DELETE a studio-layer product; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.proposal_captures
   WHERE id = '58300000-0000-4000-8000-000000000073';
  ASSERT v_seen = 0, 'FAIL D5: outsider must not see the proposal capture; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.ffe_categories
   WHERE id = '58300000-0000-4000-8000-000000000074';
  ASSERT v_seen = 0, 'FAIL D6: outsider must not see the FF&E category; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.rooms
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005';
  ASSERT v_seen = 0, 'FAIL D7: outsider must not read the client''s rooms; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 D passed: proposal fleet, catalog, client record';
END $$;

ROLLBACK TO SAVEPOINT s_d;

-- Deleted inside its own savepoint so the product survives for a rerun.
SAVEPOINT s_d_products_out;

DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  DELETE FROM public.products WHERE id = '58300000-0000-4000-8000-000000000075';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL D8: a member of another studio must delete no studio-layer product '
    'of this studio; rows=' || v_rows;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 D-out passed: outsider deletes no studio product';
END $$;

ROLLBACK TO SAVEPOINT s_d_products_out;

-- ═══════════════════════════════════════════════════════════════════════════
-- E · storage.objects — project-documents (both paths), room-scans,
--     field-media, proposal-assets
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_e;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'project-documents'
     AND name = pg_temp.discovery_object();
  ASSERT v_seen = 1, 'FAIL E1: co-member must read the discovery-folio object; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'project-documents'
     AND name = 'b0000000-0000-0000-0000-0000000000d1/00583-project.pdf';
  ASSERT v_seen = 1, 'FAIL E2: co-member must read the project-keyed object; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'room-scans'
     AND name = 'usdz/a0000000-0000-0000-0000-000000000004/58300000-0000-4000-8000-0000000000b1/scan.usdz';
  ASSERT v_seen = 1, 'FAIL E3: co-member must read the room-scans artifact; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name = 'project/b0000000-0000-0000-0000-0000000000d1/00583-field.jpg';
  ASSERT v_seen = 1, 'FAIL E4: co-member must read the field-media object; got ' || v_seen;

  -- proposal-assets is PUBLIC-read (00099's "Proposal assets are publicly
  -- readable"), so SELECT proves nothing there. The widened verb is the write.
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('proposal-assets',
          'b0000000-0000-0000-0000-000000000001/00583-comember-asset.jpg',
          'a0000000-0000-0000-0000-000000000003');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 E passed: co-member across four buckets';
END $$;

ROLLBACK TO SAVEPOINT s_e;

SAVEPOINT s_e_out;

DO $$
DECLARE v_seen integer; v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'project-documents'
     AND name IN (pg_temp.discovery_object(),
                  'b0000000-0000-0000-0000-0000000000d1/00583-project.pdf');
  ASSERT v_seen = 0, 'FAIL E5: outsider must read neither project-documents object; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'room-scans'
     AND name = 'usdz/a0000000-0000-0000-0000-000000000004/58300000-0000-4000-8000-0000000000b1/scan.usdz';
  ASSERT v_seen = 0, 'FAIL E6: outsider must not read the room-scans artifact; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name = 'project/b0000000-0000-0000-0000-0000000000d1/00583-field.jpg';
  ASSERT v_seen = 0, 'FAIL E7: outsider must not read the field-media object; got ' || v_seen;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('proposal-assets',
            'b0000000-0000-0000-0000-000000000001/00583-outsider-asset.jpg',
            'cf100000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'FAIL E8: outsider must be refused uploading a proposal asset';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 E-out passed: outsider blocked across four buckets';
END $$;

ROLLBACK TO SAVEPOINT s_e_out;

-- ═══════════════════════════════════════════════════════════════════════════
-- F · the field-media `name`-binding fix (00282:189)
--
-- Before 00583 the designer branch of "Field team can read field media" read
-- storage.foldername(p.name) — the PROJECT'S NAME — so it matched nothing and
-- the OWNING DESIGNER could not read her own project's field media. She is not
-- an is_project_team_member row here, so this row is reachable only through the
-- repaired branch.
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_f;

DO $$
DECLARE v_seen integer; v_team boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  v_team := public.is_project_team_member('b0000000-0000-0000-0000-0000000000d1'::uuid);
  ASSERT NOT v_team,
    'FAIL F1: the designer must NOT be a project_team_members row, or the '
    'team branch would carry this read and the fix would be unproven';

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name = 'project/b0000000-0000-0000-0000-0000000000d1/00583-field.jpg';
  ASSERT v_seen = 1,
    'FAIL F2: the OWNING designer must read her project''s field media — this '
    'was 0 before 00583 because `name` bound to projects.name; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00583 F passed: field-media name-binding fix';
END $$;

ROLLBACK TO SAVEPOINT s_f;

ROLLBACK;
