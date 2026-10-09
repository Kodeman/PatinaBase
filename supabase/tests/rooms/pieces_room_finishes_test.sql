-- ═══════════════════════════════════════════════════════════════════════════
-- Room finishes on project_palettes (00760; US-21 T-56, SQ-662)
--
-- CONTRACT §2 "00760"; direction.md D16, ruling Q10.
-- Anchors: project_palettes + "Inherit project access for palettes" (00140:16-61),
-- "project_palettes_studio_rw" (00316:178).
--
-- Named cases, each one DO block:
--   shape          the 00140 policy is SELECT only; no write policy names the
--                  client; the per-room unique index and the array CHECK exist
--   studio_upsert  the studio upserts by room with ON CONFLICT
--                  (project_id, scope_room_id), the statement a supabase-js
--                  upsert({ onConflict: 'project_id,scope_room_id' }) emits;
--                  one row per room; project-wide palettes stay unlimited
--   client_read    a client JWT reads the project's finishes, old role rows too
--   client_write   a client UPDATE, DELETE, INSERT and upsert are refused
--   constraints    a second row for a room and a non-array swatches refuse
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rooms/pieces_room_finishes_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, project, rooms ────────────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('76000000-0000-4000-8000-000000000001', 'rf-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('76000000-0000-4000-8000-000000000002', 'rf-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('76000000-0000-4000-8000-000000000001', 'rf-designer@test.invalid', 'RF Designer', true, now(), now()),
  ('76000000-0000-4000-8000-000000000002', 'rf-client@test.invalid', 'RF Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES
  ('76010000-0000-4000-8000-000000000001', 'Room finishes project',
   '76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002',
   '76000000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('76020000-0000-4000-8000-000000000001', '76010000-0000-4000-8000-000000000001', 'Living', 0),
  ('76020000-0000-4000-8000-000000000002', '76010000-0000-4000-8000-000000000001', 'Dining', 1);

-- ── shape ─────────────────────────────────────────────────────────────────
DO $shape$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_palettes'
      AND policyname = 'Inherit project access for palettes'
      AND cmd = 'SELECT' AND roles = '{authenticated}'
  ) THEN
    RAISE EXCEPTION 'shape: "Inherit project access for palettes" must be FOR SELECT TO authenticated';
  END IF;

  -- The only write policy is the studio one, and it never names client_id.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_palettes'
      AND cmd <> 'SELECT' AND policyname <> 'project_palettes_studio_rw'
  ) THEN
    RAISE EXCEPTION 'shape: a write policy other than project_palettes_studio_rw exists on project_palettes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_palettes'
      AND cmd <> 'SELECT'
      AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%client_id%'
  ) THEN
    RAISE EXCEPTION 'shape: a project_palettes write policy names client_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index ix
    JOIN pg_class c ON c.oid = ix.indexrelid
    WHERE ix.indrelid = 'public.project_palettes'::regclass
      AND c.relname = 'project_palettes_one_per_room'
      AND ix.indisunique AND ix.indpred IS NULL
      AND pg_get_indexdef(ix.indexrelid) LIKE '%(project_id, scope_room_id)'
  ) THEN
    RAISE EXCEPTION 'shape: unique index project_palettes_one_per_room on (project_id, scope_room_id) is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_palettes'::regclass
      AND conname = 'project_palettes_swatches_is_array'
      AND contype = 'c' AND convalidated
  ) THEN
    RAISE EXCEPTION 'shape: validated CHECK project_palettes_swatches_is_array is missing';
  END IF;
END
$shape$;

-- ── studio_upsert (the designer's JWT, under RLS) ─────────────────────────
SET LOCAL "request.jwt.claim.sub" TO '76000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $studio_upsert$
DECLARE
  v_living_id uuid;
  v_again_id  uuid;
  v_swatches  jsonb;
BEGIN
  -- First write for Living.
  INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
  VALUES ('76010000-0000-4000-8000-000000000001', '76020000-0000-4000-8000-000000000001', 'Living finishes',
          '[{"surface":"Walls","product":"Swiss Coffee","brand":"Benjamin Moore","brand_code":"OC-45","sheen":"eggshell","hex":"#F1EDE1","sort_order":0}]')
  ON CONFLICT (project_id, scope_room_id)
  DO UPDATE SET name = EXCLUDED.name, swatches = EXCLUDED.swatches
  RETURNING id INTO v_living_id;

  -- Second write for Living replaces the first row's finishes.
  INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
  VALUES ('76010000-0000-4000-8000-000000000001', '76020000-0000-4000-8000-000000000001', 'Living finishes',
          '[{"surface":"Walls","product":"Swiss Coffee","brand":"Benjamin Moore","brand_code":"OC-45","sheen":"matte","hex":"#F1EDE1","sort_order":0},
            {"surface":"Trim","product":"Chantilly Lace","brand":"Benjamin Moore","brand_code":"OC-65","sheen":"semi-gloss","hex":"#F5F5EE","sort_order":1}]')
  ON CONFLICT (project_id, scope_room_id)
  DO UPDATE SET name = EXCLUDED.name, swatches = EXCLUDED.swatches
  RETURNING id INTO v_again_id;

  IF v_again_id IS DISTINCT FROM v_living_id THEN
    RAISE EXCEPTION 'studio_upsert: a second upsert for the room must update the same row (% vs %)', v_living_id, v_again_id;
  END IF;

  SELECT swatches INTO v_swatches FROM public.project_palettes WHERE id = v_living_id;
  IF jsonb_array_length(v_swatches) <> 2
     OR v_swatches -> 0 ->> 'sheen' <> 'matte'
     OR v_swatches -> 1 ->> 'surface' <> 'Trim' THEN
    RAISE EXCEPTION 'studio_upsert: the room must hold the second finishes, got %', v_swatches;
  END IF;

  -- Dining is its own row.
  INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
  VALUES ('76010000-0000-4000-8000-000000000001', '76020000-0000-4000-8000-000000000002', 'Dining finishes',
          '[{"surface":"Ceiling","product":"Ceiling White","brand":"Sherwin-Williams","brand_code":"SW 7007","sheen":"flat","hex":"#ECEAE2","sort_order":0}]')
  ON CONFLICT (project_id, scope_room_id)
  DO UPDATE SET name = EXCLUDED.name, swatches = EXCLUDED.swatches;

  -- Project-wide palettes (no room) are not limited to one; one carries an
  -- old {role} swatch.
  INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches) VALUES
    ('76010000-0000-4000-8000-000000000001', NULL, 'Whole house',
     '[{"hex":"#3A4A3F","name":"Forest","role":"accent","brand":null,"brand_code":null,"sort_order":0}]'),
    ('76010000-0000-4000-8000-000000000001', NULL, 'Whole house, second', '[]');

  IF (SELECT count(*) FROM public.project_palettes
      WHERE project_id = '76010000-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'studio_upsert: the studio must read 4 rows (Living, Dining, two project-wide)';
  END IF;
  IF (SELECT count(*) FROM public.project_palettes
      WHERE project_id = '76010000-0000-4000-8000-000000000001'
        AND scope_room_id = '76020000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'studio_upsert: Living must hold exactly one row';
  END IF;
END
$studio_upsert$;

RESET ROLE;

-- ── client_read and client_write (the client's JWT, under RLS) ────────────
SET LOCAL "request.jwt.claim.sub" TO '76000000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"76000000-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $client_read$
BEGIN
  IF (SELECT count(*) FROM public.project_palettes
      WHERE project_id = '76010000-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'client_read: the client must read the project''s 4 palettes';
  END IF;
  IF (SELECT swatches -> 0 ->> 'role' FROM public.project_palettes
      WHERE project_id = '76010000-0000-4000-8000-000000000001' AND name = 'Whole house') <> 'accent' THEN
    RAISE EXCEPTION 'client_read: an old {role} swatch must stay readable';
  END IF;
END
$client_read$;

DO $client_write$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.project_palettes SET swatches = '[]'
  WHERE project_id = '76010000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'client_write: a client UPDATE changed % rows', v_rows;
  END IF;

  DELETE FROM public.project_palettes
  WHERE project_id = '76010000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'client_write: a client DELETE removed % rows', v_rows;
  END IF;

  BEGIN
    INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
    VALUES ('76010000-0000-4000-8000-000000000001', NULL, 'Client palette', '[]');
    RAISE EXCEPTION 'client_write: a client INSERT was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
    VALUES ('76010000-0000-4000-8000-000000000001', '76020000-0000-4000-8000-000000000001', 'Client finishes', '[]')
    ON CONFLICT (project_id, scope_room_id)
    DO UPDATE SET swatches = EXCLUDED.swatches;
    RAISE EXCEPTION 'client_write: a client upsert by room was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$client_write$;

RESET ROLE;

DO $client_write_after$
BEGIN
  IF (SELECT jsonb_array_length(swatches) FROM public.project_palettes
      WHERE project_id = '76010000-0000-4000-8000-000000000001'
        AND scope_room_id = '76020000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'client_write: the Living finishes changed under a client session';
  END IF;
  IF (SELECT count(*) FROM public.project_palettes
      WHERE project_id = '76010000-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'client_write: the project must still hold 4 palettes';
  END IF;
END
$client_write_after$;

-- ── constraints ───────────────────────────────────────────────────────────
DO $constraints$
BEGIN
  BEGIN
    INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
    VALUES ('76010000-0000-4000-8000-000000000001', '76020000-0000-4000-8000-000000000002', 'Dining, again', '[]');
    RAISE EXCEPTION 'constraints: a second row for a room was allowed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.project_palettes (project_id, scope_room_id, name, swatches)
    VALUES ('76010000-0000-4000-8000-000000000001', NULL, 'Object swatches', '{"surface":"Walls"}');
    RAISE EXCEPTION 'constraints: a non-array swatches was allowed';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$constraints$;

ROLLBACK;
