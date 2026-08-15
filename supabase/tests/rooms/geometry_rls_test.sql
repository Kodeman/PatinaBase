-- ═══════════════════════════════════════════════════════════════════════════
-- Room scan geometry tests (migration 00337)
--
-- Covers:
--   1. service_role replace_room_scan_geometry lands a header + elements;
--      wall_ref (parent apple_id) resolves to wall_element_id; object shape.
--   2. Delegated RLS: the scan OWNER reads header + all elements; an unrelated
--      authenticated designer (no association, no studio link) reads NONE.
--   3. Lockdown: an authenticated user CANNOT EXECUTE either write RPC
--      (REVOKE ... FROM authenticated holds).
--   4. mark_room_scan_geometry_error: insert path sets attempts=1; a second
--      call increments to 2; parse_status='error', parse_error carried.
--   5. replace is an atomic swap — a re-run flips status back to 'parsed',
--      leaves exactly the new element set (no duplication), and does not
--      touch parse_attempts ("bump nothing").
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rooms/geometry_rls_test.sql
--   ($SUPABASE_DB_URL local default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures (as superuser — bypasses RLS) ────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('9c000000-0000-4000-8000-000000000001', 'geo-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('9c000000-0000-4000-8000-000000000002', 'geo-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, role, is_designer)
VALUES
  ('9c000000-0000-4000-8000-000000000001', 'geo-owner@test.invalid',    'Geo Owner',    'homeowner', false),
  ('9c000000-0000-4000-8000-000000000002', 'geo-designer@test.invalid', 'Geo Designer', 'designer',  true)
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

-- Scan owned by the owner; the designer has NO association / studio link to it.
INSERT INTO room_scans (id, user_id, name, status, room_type, floor_area)
VALUES ('9c000000-0000-4000-8000-0000000000f1',
        '9c000000-0000-4000-8000-000000000001',
        'Geo Living Room', 'ready', 'living_room', 266.0);

-- A second scan with no geometry header yet (for the error insert-path case).
INSERT INTO room_scans (id, user_id, name, status, room_type)
VALUES ('9c000000-0000-4000-8000-0000000000f2',
        '9c000000-0000-4000-8000-000000000001',
        'Geo Bedroom', 'ready', 'bedroom');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assume_service()
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO authenticated, service_role;

-- Realistic payload: 2 walls + 1 window (child of wall A) + 1 detected object.
-- wall_ref on the window carries wall A's apple_id → must resolve to its row id.
CREATE TEMP TABLE geo_payload (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
INSERT INTO geo_payload VALUES
  ('header', jsonb_build_object(
      'parser_version', 1,
      'source_schema_version', 'roomplan-1',
      'source_etag', 'etag-abc',
      'units', 'ft',
      'origin_yaw_deg', 12.5,
      'origin_offset_m', jsonb_build_object('x', 0.1, 'z', -0.2),
      'width_ft', 19, 'depth_ft', 14, 'wall_height_ft', 8,
      'floor_polygon', jsonb_build_array(
          jsonb_build_array(0,0), jsonb_build_array(19,0),
          jsonb_build_array(19,14), jsonb_build_array(0,14)),
      'floor_area_sqft', 266,
      'confidence_summary', jsonb_build_object('high', 2, 'medium', 1, 'low', 0))),
  ('elements', jsonb_build_array(
      jsonb_build_object('kind','wall','apple_id','9c000000-0000-4000-8000-0000000000a1',
        'confidence','high','label','North wall','position',0,
        'x1_ft',0,'z1_ft',0,'x2_ft',19,'z2_ft',0,'height_ft',8),
      jsonb_build_object('kind','wall','apple_id','9c000000-0000-4000-8000-0000000000a2',
        'confidence','high','label','West wall','position',1,
        'x1_ft',0,'z1_ft',0,'x2_ft',0,'z2_ft',14,'height_ft',8),
      jsonb_build_object('kind','window','apple_id','9c000000-0000-4000-8000-0000000000b1',
        'wall_ref','9c000000-0000-4000-8000-0000000000a1',
        'confidence','high','label','Window','position',2,
        'from_ft',2.5,'to_ft',6.5,'sill_ft',2.5,'head_ft',7,'width_ft',4,'height_ft',4.5),
      jsonb_build_object('kind','object','apple_id','9c000000-0000-4000-8000-0000000000c1',
        'confidence','medium','label','Sofa','position',3,
        'cat','sofa','center_x_ft',9.5,'center_z_ft',11,
        'width_ft',7,'depth_ft',3,'height_ft',2.8,'rotation_deg',0)));

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 1 — service_role replace lands the header + elements; wall_ref resolves
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scan     uuid := '9c000000-0000-4000-8000-0000000000f1';
  v_hdr      jsonb;
  v_els      jsonb;
  v_count    integer;
  v_wall_id  uuid;
  v_win_wall uuid;
BEGIN
  SELECT v INTO v_hdr FROM geo_payload WHERE k = 'header';
  SELECT v INTO v_els FROM geo_payload WHERE k = 'elements';

  PERFORM pg_temp.assume_service();
  PERFORM public.replace_room_scan_geometry(v_scan, v_hdr, v_els);
  PERFORM pg_temp.reset_role();

  -- header shape (read as superuser — ground truth, RLS bypassed)
  ASSERT (SELECT parse_status = 'parsed' AND parsed_at IS NOT NULL
            AND parser_version = 1 AND units = 'ft'
            AND floor_area_sqft = 266 AND parse_attempts = 0
            AND source_etag = 'etag-abc'
          FROM public.room_scan_geometry WHERE scan_id = v_scan),
    'FAIL 1a: header shape after parse';

  ASSERT (SELECT jsonb_array_length(floor_polygon) = 4
          FROM public.room_scan_geometry WHERE scan_id = v_scan),
    'FAIL 1b: floor_polygon carried (4 vertices)';

  SELECT count(*) INTO v_count FROM public.room_scan_geometry_elements WHERE scan_id = v_scan;
  ASSERT v_count = 4, 'FAIL 1c: expected 4 elements, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.room_scan_geometry_elements
    WHERE scan_id = v_scan AND kind = 'wall';
  ASSERT v_count = 2, 'FAIL 1d: expected 2 walls, got ' || v_count;

  -- the North wall's row id, and the window's resolved wall_element_id
  SELECT id INTO v_wall_id FROM public.room_scan_geometry_elements
    WHERE scan_id = v_scan AND kind = 'wall'
      AND apple_id = '9c000000-0000-4000-8000-0000000000a1';
  SELECT wall_element_id INTO v_win_wall FROM public.room_scan_geometry_elements
    WHERE scan_id = v_scan AND kind = 'window';
  ASSERT v_win_wall IS NOT NULL, 'FAIL 1e: window wall_ref must resolve, got NULL';
  ASSERT v_win_wall = v_wall_id,
    'FAIL 1f: window resolved to the wrong wall (' || COALESCE(v_win_wall::text,'NULL') || ' != ' || v_wall_id::text || ')';

  -- window carries its opening dims; object carries cat + box dims
  ASSERT (SELECT from_ft = 2.5 AND to_ft = 6.5 AND sill_ft = 2.5 AND head_ft = 7 AND width_ft = 4
          FROM public.room_scan_geometry_elements WHERE scan_id = v_scan AND kind = 'window'),
    'FAIL 1g: window opening dims';
  ASSERT (SELECT cat = 'sofa' AND center_x_ft = 9.5 AND depth_ft = 3 AND height_ft = 2.8
          FROM public.room_scan_geometry_elements WHERE scan_id = v_scan AND kind = 'object'),
    'FAIL 1h: object box dims';

  RAISE NOTICE 'geometry: case 1 (service_role replace + wall_ref resolution) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 2 — delegated RLS: owner reads all; unrelated designer reads none
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scan  uuid := '9c000000-0000-4000-8000-0000000000f1';
  v_count integer;
BEGIN
  -- Owner sees the header + every element.
  PERFORM pg_temp.assume_user('9c000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.room_scan_geometry WHERE scan_id = v_scan;
  ASSERT v_count = 1, 'FAIL 2a: owner must read the geometry header, got ' || v_count;
  SELECT count(*) INTO v_count FROM public.room_scan_geometry_elements WHERE scan_id = v_scan;
  ASSERT v_count = 4, 'FAIL 2b: owner must read all 4 elements, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Unrelated designer (no association, no studio link) sees nothing.
  PERFORM pg_temp.assume_user('9c000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM public.room_scan_geometry WHERE scan_id = v_scan;
  ASSERT v_count = 0, 'FAIL 2c: unrelated designer must not read the header, got ' || v_count;
  SELECT count(*) INTO v_count FROM public.room_scan_geometry_elements WHERE scan_id = v_scan;
  ASSERT v_count = 0, 'FAIL 2d: unrelated designer must not read elements, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'geometry: case 2 (delegated RLS) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 3 — lockdown: authenticated cannot EXECUTE the write RPCs
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scan uuid := '9c000000-0000-4000-8000-0000000000f1';
  v_err  text;
BEGIN
  PERFORM pg_temp.assume_user('9c000000-0000-4000-8000-000000000001');  -- even the owner
  BEGIN
    PERFORM public.replace_room_scan_geometry(v_scan, '{}'::jsonb, '[]'::jsonb);
    v_err := '<none>';
  EXCEPTION WHEN insufficient_privilege THEN v_err := 'denied';
            WHEN OTHERS THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'denied', 'FAIL 3a: authenticated must be denied EXECUTE on replace, got ' || v_err;

  BEGIN
    PERFORM public.mark_room_scan_geometry_error(v_scan, 'x');
    v_err := '<none>';
  EXCEPTION WHEN insufficient_privilege THEN v_err := 'denied';
            WHEN OTHERS THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'denied', 'FAIL 3b: authenticated must be denied EXECUTE on mark_error, got ' || v_err;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'geometry: case 3 (RPC lockdown) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 4 — mark_room_scan_geometry_error: insert path + increment
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scan uuid := '9c000000-0000-4000-8000-0000000000f2';  -- no header yet
BEGIN
  PERFORM pg_temp.assume_service();
  PERFORM public.mark_room_scan_geometry_error(v_scan, 'parse boom');
  ASSERT (SELECT parse_status = 'error' AND parse_error = 'parse boom' AND parse_attempts = 1
          FROM public.room_scan_geometry WHERE scan_id = v_scan),
    'FAIL 4a: error insert path (status/error/attempts=1)';

  PERFORM public.mark_room_scan_geometry_error(v_scan, 'boom again');
  ASSERT (SELECT parse_status = 'error' AND parse_error = 'boom again' AND parse_attempts = 2
          FROM public.room_scan_geometry WHERE scan_id = v_scan),
    'FAIL 4b: error conflict path increments attempts to 2';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'geometry: case 4 (error RPC) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 5 — replace is an atomic swap: re-run flips status back to parsed,
-- leaves exactly the new set (no dupes), leaves parse_attempts untouched.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scan  uuid := '9c000000-0000-4000-8000-0000000000f1';
  v_hdr   jsonb;
  v_els   jsonb;
  v_count integer;
BEGIN
  SELECT v INTO v_hdr FROM geo_payload WHERE k = 'header';
  SELECT v INTO v_els FROM geo_payload WHERE k = 'elements';

  -- First force the header into an error state to prove the re-parse resets it.
  PERFORM pg_temp.assume_service();
  PERFORM public.mark_room_scan_geometry_error(v_scan, 'transient');   -- attempts 0 -> 1
  PERFORM public.replace_room_scan_geometry(v_scan, v_hdr, v_els);     -- swap
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT parse_status = 'parsed' AND parse_error IS NULL AND parse_attempts = 1
          FROM public.room_scan_geometry WHERE scan_id = v_scan),
    'FAIL 5a: re-parse resets status/error but leaves attempts (bump nothing)';

  SELECT count(*) INTO v_count FROM public.room_scan_geometry_elements WHERE scan_id = v_scan;
  ASSERT v_count = 4, 'FAIL 5b: swap must leave exactly 4 elements (no duplication), got ' || v_count;

  -- window still resolves to a wall after the swap (fresh ids)
  ASSERT (SELECT wall_element_id IS NOT NULL
          FROM public.room_scan_geometry_elements WHERE scan_id = v_scan AND kind = 'window'),
    'FAIL 5c: window wall_ref re-resolves after swap';

  RAISE NOTICE 'geometry: case 5 (atomic swap) passed.';
  RAISE NOTICE 'All room scan geometry assertions passed.';
END $$;

ROLLBACK;
