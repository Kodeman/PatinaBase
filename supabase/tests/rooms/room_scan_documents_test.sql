-- ═══════════════════════════════════════════════════════════════════════════
-- room_scan_documents linkage view tests (migration 00339)
--
-- Covers:
--   1. Shape C (open lead): scan attached to a lead via leads.room_scan_id
--      (00029) resolves engagement_kind='lead', active_section='brief'.
--      Geometry header (via replace_room_scan_geometry, 00337) passes through
--      width_ft/depth_ft/floor_area_sqft/wall_height_ft/parse_status.
--   2. RLS phase 1: an authenticated designer with an ACTIVE room_scan_
--      association sees exactly that one scan; an unrelated authenticated
--      designer sees none; the owner sees their own.
--   3. Shape D (graduated relationship): flipping the lead's status out of
--      the open set and inserting a designer_clients row with lead_id set
--      re-resolves the SAME scan to engagement_kind='relationship',
--      active_section='discovery' — geometry columns are unchanged.
--   4. Shape A (project): a second scan with room_scans.project_id set
--      resolves engagement_kind='project', active_section='project'.
--   5. Orphan: a scan with no project/lead attachment resolves NULL
--      engagement_kind/engagement_id/document_client_name/active_section,
--      with owner_client_name populated as the fallback.
--   6. RLS phase 2: once the designer_clients relationship exists, the
--      designer sees every scan owned by that client (room_scans RLS is
--      client-scoped, not scan-scoped) — the unrelated designer still sees
--      none.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rooms/room_scan_documents_test.sql
--   ($SUPABASE_DB_URL local default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures (as superuser — bypasses RLS) ────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('9d000000-0000-4000-8000-000000000001', 'rsd-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('9d000000-0000-4000-8000-000000000002', 'rsd-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('9d000000-0000-4000-8000-000000000003', 'rsd-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, display_name, role, is_designer)
VALUES
  ('9d000000-0000-4000-8000-000000000001', 'rsd-owner@test.invalid',    'Rosa Owner',     NULL, 'homeowner', false),
  ('9d000000-0000-4000-8000-000000000002', 'rsd-designer@test.invalid', 'Dana Designer',  NULL, 'designer',  true),
  ('9d000000-0000-4000-8000-000000000003', 'rsd-outsider@test.invalid', 'Otto Outsider',  NULL, 'designer',  true)
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name,
  role         = EXCLUDED.role,
  is_designer  = EXCLUDED.is_designer;

-- ─── helpers (same idiom as supabase/tests/rooms/geometry_rls_test.sql) ────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_service()
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_service() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Scan (a): will carry an open lead, then graduate to a relationship.
INSERT INTO room_scans (id, user_id, name, status, room_type, floor_area)
VALUES ('9d000000-0000-4000-8000-0000000000a1',
        '9d000000-0000-4000-8000-000000000001',
        'Living Room Scan', 'ready', 'living_room', 120.0);

-- Scan (c): will carry a project link (Shape A).
INSERT INTO room_scans (id, user_id, name, status, room_type, floor_area)
VALUES ('9d000000-0000-4000-8000-0000000000a2',
        '9d000000-0000-4000-8000-000000000001',
        'Project Room Scan', 'ready', 'bedroom', 200.0);

-- Scan (d): orphan — no project, no lead, ever.
INSERT INTO room_scans (id, user_id, name, status, room_type, floor_area)
VALUES ('9d000000-0000-4000-8000-0000000000a3',
        '9d000000-0000-4000-8000-000000000001',
        'Orphan Scan', 'ready', 'office', 80.0);

-- Geometry header for scan (a) — via the real write RPC (00337), service-role.
DO $$
BEGIN
  PERFORM pg_temp.assume_service();
  PERFORM public.replace_room_scan_geometry(
    '9d000000-0000-4000-8000-0000000000a1'::uuid,
    jsonb_build_object(
      'parser_version', 1, 'units', 'ft',
      'width_ft', 12, 'depth_ft', 10, 'wall_height_ft', 8,
      'floor_area_sqft', 120),
    '[]'::jsonb
  );
  PERFORM pg_temp.reset_role();
END $$;

-- Lead attached to scan (a) via leads.room_scan_id (00029) — open (Shape C).
INSERT INTO leads (id, homeowner_id, designer_id, project_type, status, room_scan_id, created_at)
VALUES ('9d000000-0000-4000-8000-0000000000e1',
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002',
        'full_room', 'new',
        '9d000000-0000-4000-8000-0000000000a1',
        now());

-- Designer's association to scan (a) only — mirrors what submit_design_request
-- (00285) would have minted for the assigned designer.
INSERT INTO room_scan_associations (scan_id, consumer_id, designer_id, association_type, status, access_level, shared_at)
VALUES ('9d000000-0000-4000-8000-0000000000a1',
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002',
        'explicit', 'active', 'full', now());

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 1 — Shape C: open lead resolution + geometry passthrough
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.room_scan_documents
    WHERE scan_id = '9d000000-0000-4000-8000-0000000000a1';

  ASSERT v_row.engagement_kind = 'lead',
    'FAIL 1a: expected engagement_kind=lead, got ' || coalesce(v_row.engagement_kind, '<null>');
  ASSERT v_row.engagement_id = '9d000000-0000-4000-8000-0000000000e1',
    'FAIL 1b: expected engagement_id=lead id, got ' || coalesce(v_row.engagement_id::text, '<null>');
  ASSERT v_row.active_section = 'brief',
    'FAIL 1c: expected active_section=brief, got ' || coalesce(v_row.active_section, '<null>');
  ASSERT v_row.document_client_name = 'Rosa Owner',
    'FAIL 1d: expected document_client_name=Rosa Owner, got ' || coalesce(v_row.document_client_name, '<null>');
  ASSERT v_row.width_ft = 12 AND v_row.depth_ft = 10 AND v_row.wall_height_ft = 8
     AND v_row.floor_area_sqft = 120 AND v_row.parse_status = 'parsed',
    'FAIL 1e: geometry passthrough mismatch';

  RAISE NOTICE 'room_scan_documents: case 1 (Shape C) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 2 — RLS phase 1: association-scoped designer visibility
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Owner sees all 3 scans (own).
  PERFORM pg_temp.assume_user('9d000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.room_scan_documents;
  ASSERT v_count = 3, 'FAIL 2a: owner must see 3 scans, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Designer (association only, no dc relationship yet) sees exactly scan (a).
  PERFORM pg_temp.assume_user('9d000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM public.room_scan_documents;
  ASSERT v_count = 1, 'FAIL 2b: associated designer must see exactly 1 scan pre-graduation, got ' || v_count;
  SELECT count(*) INTO v_count FROM public.room_scan_documents
    WHERE scan_id = '9d000000-0000-4000-8000-0000000000a1';
  ASSERT v_count = 1, 'FAIL 2c: associated designer must see scan (a) specifically';
  PERFORM pg_temp.reset_role();

  -- Unrelated designer sees nothing.
  PERFORM pg_temp.assume_user('9d000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_count FROM public.room_scan_documents;
  ASSERT v_count = 0, 'FAIL 2d: unrelated designer must see 0 scans, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'room_scan_documents: case 2 (RLS phase 1) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 3 — Shape D: graduate the lead into a designer_clients relationship
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_dc_id uuid;
  v_row   record;
BEGIN
  -- accept_design_request (00330) moves the lead off the open-status set;
  -- ceremony_complete (00331) then inserts the relationship with lead_id set.
  UPDATE leads SET status = 'accepted'
    WHERE id = '9d000000-0000-4000-8000-0000000000e1';

  INSERT INTO designer_clients (designer_id, client_id, client_name, source, lead_id, status)
  VALUES ('9d000000-0000-4000-8000-000000000002',
          '9d000000-0000-4000-8000-000000000001',
          NULL, 'design_request',
          '9d000000-0000-4000-8000-0000000000e1',
          'lead')
  RETURNING id INTO v_dc_id;

  SELECT * INTO v_row FROM public.room_scan_documents
    WHERE scan_id = '9d000000-0000-4000-8000-0000000000a1';

  ASSERT v_row.engagement_kind = 'relationship',
    'FAIL 3a: expected engagement_kind=relationship, got ' || coalesce(v_row.engagement_kind, '<null>');
  ASSERT v_row.engagement_id = v_dc_id,
    'FAIL 3b: expected engagement_id=designer_clients id, got ' || coalesce(v_row.engagement_id::text, '<null>');
  ASSERT v_row.active_section = 'discovery',
    'FAIL 3c: expected active_section=discovery, got ' || coalesce(v_row.active_section, '<null>');
  ASSERT v_row.document_client_name = 'Rosa Owner',
    'FAIL 3d: expected document_client_name to fall back to Rosa Owner, got ' || coalesce(v_row.document_client_name, '<null>');
  -- Geometry columns must be byte-identical to case 1 — flipping the document
  -- resolution must not perturb the scan/geometry lens.
  ASSERT v_row.width_ft = 12 AND v_row.depth_ft = 10 AND v_row.wall_height_ft = 8
     AND v_row.floor_area_sqft = 120 AND v_row.parse_status = 'parsed',
    'FAIL 3e: geometry passthrough must be unchanged after the Shape C→D flip';

  RAISE NOTICE 'room_scan_documents: case 3 (Shape D) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 4 — Shape A: scan carrying its own project link
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project_id uuid;
  v_row        record;
BEGIN
  -- created_by = the scan's own owner (001), not the designer: room_scans_guard_routing
  -- (00265) only allows attaching a scan to a project whose designer_id OR
  -- created_by matches the scan's user_id.
  INSERT INTO projects (name, client_id, designer_id, status, created_by)
  VALUES ('Test Project', '9d000000-0000-4000-8000-000000000001',
          '9d000000-0000-4000-8000-000000000002', 'active',
          '9d000000-0000-4000-8000-000000000001')
  RETURNING id INTO v_project_id;

  UPDATE room_scans SET project_id = v_project_id
    WHERE id = '9d000000-0000-4000-8000-0000000000a2';

  SELECT * INTO v_row FROM public.room_scan_documents
    WHERE scan_id = '9d000000-0000-4000-8000-0000000000a2';

  ASSERT v_row.engagement_kind = 'project',
    'FAIL 4a: expected engagement_kind=project, got ' || coalesce(v_row.engagement_kind, '<null>');
  ASSERT v_row.engagement_id = v_project_id,
    'FAIL 4b: expected engagement_id=project id, got ' || coalesce(v_row.engagement_id::text, '<null>');
  ASSERT v_row.active_section = 'project',
    'FAIL 4c: expected active_section=project, got ' || coalesce(v_row.active_section, '<null>');
  ASSERT v_row.document_client_name = 'Rosa Owner',
    'FAIL 4d: expected document_client_name=Rosa Owner, got ' || coalesce(v_row.document_client_name, '<null>');

  RAISE NOTICE 'room_scan_documents: case 4 (Shape A) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 5 — Orphan scan: no document reference, owner fallback name present
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.room_scan_documents
    WHERE scan_id = '9d000000-0000-4000-8000-0000000000a3';

  ASSERT v_row.engagement_kind IS NULL,      'FAIL 5a: orphan scan must have NULL engagement_kind';
  ASSERT v_row.engagement_id IS NULL,        'FAIL 5b: orphan scan must have NULL engagement_id';
  ASSERT v_row.document_client_name IS NULL, 'FAIL 5c: orphan scan must have NULL document_client_name';
  ASSERT v_row.active_section IS NULL,       'FAIL 5d: orphan scan must have NULL active_section';
  ASSERT v_row.owner_client_name = 'Rosa Owner',
    'FAIL 5e: orphan scan must fall back to the owner profile name, got ' || coalesce(v_row.owner_client_name, '<null>');

  RAISE NOTICE 'room_scan_documents: case 5 (orphan) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 6 — RLS phase 2: post-graduation, the designer sees every client scan
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count integer;
BEGIN
  -- room_scans RLS is client-scoped for the designer_clients leg, not
  -- scan-scoped, so the designer now sees all 3 of the client's scans.
  PERFORM pg_temp.assume_user('9d000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM public.room_scan_documents;
  ASSERT v_count = 3, 'FAIL 6a: designer with a client relationship must see all 3 scans, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Unrelated designer still sees nothing.
  PERFORM pg_temp.assume_user('9d000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_count FROM public.room_scan_documents;
  ASSERT v_count = 0, 'FAIL 6b: unrelated designer must still see 0 scans, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'room_scan_documents: case 6 (RLS phase 2) passed.';
END $$;

ROLLBACK;
