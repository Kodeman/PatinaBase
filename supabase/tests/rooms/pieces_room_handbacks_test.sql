-- ═══════════════════════════════════════════════════════════════════════════
-- Room hand-backs: READY FOR LEAH (00742; US-21 T-34, SQ-640)
--
-- CONTRACT §2 "00742"; direction.md D18, ruling Q13.
-- Anchors: hand_back_project_room (00742), can_buy_for_project (00702:60),
-- _ffe_require_studio_project (00717:75).
--
-- Named cases, each one DO block:
--   hand_back       returns {handedBackAt}; one row per act, who and when
--   before_after    every project_ffe_items row is identical before and after
--                   (no disposition, select or release; placeholders stay)
--   refusals        no session; a client; an unknown room; anon cannot execute
--   rls             a client JWT reads 0 rows and cannot write; the studio
--                   reads its rows and cannot write directly
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rooms/pieces_room_handbacks_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, project, rooms, lines ─────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('74200000-0000-4000-8000-000000000001', 'hb-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('74200000-0000-4000-8000-000000000002', 'hb-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('74200000-0000-4000-8000-000000000001', 'hb-designer@test.invalid', 'HB Designer', true, now(), now()),
  ('74200000-0000-4000-8000-000000000002', 'hb-client@test.invalid', 'HB Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES
  ('74210000-0000-4000-8000-000000000001', 'Hand-back project',
   '74200000-0000-4000-8000-000000000001', '74200000-0000-4000-8000-000000000002',
   '74200000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('74220000-0000-4000-8000-000000000001', '74210000-0000-4000-8000-000000000001', 'Living', 0),
  ('74220000-0000-4000-8000-000000000002', '74210000-0000-4000-8000-000000000001', 'Dining', 1);

INSERT INTO public.vendors (id, name)
VALUES ('74230000-0000-4000-8000-000000000001', 'HB Upholstery');

-- In Living: a candidate with a maker and price, an alternate, and a
-- placeholder (no product, no maker, no price). In Dining: one line.
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, unit_price_cents, vendor_id,
  assignment_scope, project_room_id, design_disposition
) VALUES
  ('74240000-0000-4000-8000-000000000001', '74210000-0000-4000-8000-000000000001',
   'Sofa', 'specified', 1, 'each', 480000, '74230000-0000-4000-8000-000000000001',
   'room', '74220000-0000-4000-8000-000000000001', 'candidate'),
  ('74240000-0000-4000-8000-000000000002', '74210000-0000-4000-8000-000000000001',
   'Sofa, second option', 'specified', 1, 'each', 520000, '74230000-0000-4000-8000-000000000001',
   'room', '74220000-0000-4000-8000-000000000001', 'alternate'),
  ('74240000-0000-4000-8000-000000000003', '74210000-0000-4000-8000-000000000001',
   'Side table (placeholder)', 'specified', 2, 'each', NULL, NULL,
   'room', '74220000-0000-4000-8000-000000000001', 'candidate'),
  ('74240000-0000-4000-8000-000000000004', '74210000-0000-4000-8000-000000000001',
   'Dining chairs', 'specified', 6, 'each', 90000, '74230000-0000-4000-8000-000000000001',
   'room', '74220000-0000-4000-8000-000000000002', 'candidate');

-- Snapshot of EVERY project_ffe_items row, taken before any hand-back.
CREATE TEMP TABLE hb_items_before ON COMMIT DROP AS
SELECT i.id, to_jsonb(i) AS row_json FROM public.project_ffe_items i;

-- ── hand_back ─────────────────────────────────────────────────────────────
DO $hand_back$
DECLARE
  v_result jsonb;
  v_second jsonb;
  v_row    public.project_room_handbacks%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"74200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.hand_back_project_room('74220000-0000-4000-8000-000000000001');
  IF v_result IS NULL OR NOT (v_result ? 'handedBackAt') OR v_result ->> 'handedBackAt' IS NULL
     OR (SELECT count(*) FROM jsonb_object_keys(v_result)) <> 1 THEN
    RAISE EXCEPTION 'hand_back: must return exactly {handedBackAt}, got %', v_result;
  END IF;

  SELECT * INTO v_row FROM public.project_room_handbacks
  WHERE project_room_id = '74220000-0000-4000-8000-000000000001';
  IF v_row.project_id <> '74210000-0000-4000-8000-000000000001'
     OR v_row.handed_back_by <> '74200000-0000-4000-8000-000000000001'
     OR v_row.handed_back_at <> (v_result ->> 'handedBackAt')::timestamptz THEN
    RAISE EXCEPTION 'hand_back: the row must carry the room''s project, the caller and the returned time, got %',
      to_jsonb(v_row);
  END IF;

  -- A second act is its own row (append-only).
  v_second := public.hand_back_project_room('74220000-0000-4000-8000-000000000001');
  IF (SELECT count(*) FROM public.project_room_handbacks
      WHERE project_room_id = '74220000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'hand_back: a second hand-back must append a second row';
  END IF;

  -- The Dining room too.
  PERFORM public.hand_back_project_room('74220000-0000-4000-8000-000000000002');
  IF (SELECT count(*) FROM public.project_room_handbacks
      WHERE project_id = '74210000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'hand_back: the project must hold 3 hand-backs';
  END IF;
END
$hand_back$;

-- ── before_after: no disposition, select or release ───────────────────────
DO $before_after$
DECLARE
  v_missing bigint;
  v_extra   bigint;
BEGIN
  SELECT count(*) INTO v_missing FROM (
    SELECT id, row_json FROM hb_items_before
    EXCEPT
    SELECT i.id, to_jsonb(i) FROM public.project_ffe_items i
  ) d;
  SELECT count(*) INTO v_extra FROM (
    SELECT i.id, to_jsonb(i) FROM public.project_ffe_items i
    EXCEPT
    SELECT id, row_json FROM hb_items_before
  ) d;
  IF v_missing <> 0 OR v_extra <> 0 THEN
    RAISE EXCEPTION 'before_after: project_ffe_items changed across hand_back_project_room (% gone or changed, % new or changed)',
      v_missing, v_extra;
  END IF;
  IF (SELECT count(*) FROM hb_items_before) <> (SELECT count(*) FROM public.project_ffe_items) THEN
    RAISE EXCEPTION 'before_after: the project_ffe_items row count changed';
  END IF;

  -- Spelled out for the fixture: the placeholder stays a placeholder and no
  -- line became selected.
  IF EXISTS (SELECT 1 FROM public.project_ffe_items
             WHERE project_id = '74210000-0000-4000-8000-000000000001'
               AND design_disposition = 'selected') THEN
    RAISE EXCEPTION 'before_after: a hand-back selected a line';
  END IF;
  IF (SELECT vendor_id IS NOT NULL OR unit_price_cents IS NOT NULL OR product_id IS NOT NULL
      FROM public.project_ffe_items WHERE id = '74240000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'before_after: the placeholder was filled';
  END IF;
END
$before_after$;

-- ── refusals ──────────────────────────────────────────────────────────────
DO $refusals$
DECLARE
  v_msg text;
BEGIN
  -- No session.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.hand_back_project_room('74220000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'refusals: a hand-back without a session was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'authentication required' THEN RAISE; END IF;
  END;

  -- The client.
  PERFORM set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000002', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"74200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.hand_back_project_room('74220000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'refusals: the client was allowed to hand back a room';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'project not found or access denied' THEN RAISE; END IF;
  END;

  -- An unknown room, as the studio: the same refusal, so existence never leaks.
  PERFORM set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"74200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.hand_back_project_room('74220000-0000-4000-8000-0000000000ff');
    RAISE EXCEPTION 'refusals: an unknown room was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'project not found or access denied' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.project_room_handbacks
      WHERE project_id = '74210000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'refusals: a refused hand-back wrote a row';
  END IF;

  IF has_function_privilege('anon', 'public.hand_back_project_room(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'refusals: anon can execute hand_back_project_room';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hand_back_project_room(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'refusals: authenticated cannot execute hand_back_project_room';
  END IF;
END
$refusals$;

-- ── rls: a client JWT reads 0 rows; the studio reads them ────────────────
SET LOCAL "request.jwt.claim.sub" TO '74200000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"74200000-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_client$
BEGIN
  IF (SELECT count(*) FROM public.project_room_handbacks) <> 0 THEN
    RAISE EXCEPTION 'rls: a client JWT must read 0 hand-backs';
  END IF;

  BEGIN
    INSERT INTO public.project_room_handbacks (project_id, project_room_id, handed_back_by)
    VALUES ('74210000-0000-4000-8000-000000000001', '74220000-0000-4000-8000-000000000001',
            '74200000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'rls: a direct insert by the client was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$rls_client$;

RESET ROLE;

SET LOCAL "request.jwt.claim.sub" TO '74200000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" TO '{"sub":"74200000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_studio$
BEGIN
  IF (SELECT count(*) FROM public.project_room_handbacks
      WHERE project_id = '74210000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'rls: the studio must read its 3 hand-backs';
  END IF;

  BEGIN
    INSERT INTO public.project_room_handbacks (project_id, project_room_id, handed_back_by)
    VALUES ('74210000-0000-4000-8000-000000000001', '74220000-0000-4000-8000-000000000001',
            '74200000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'rls: a direct insert by the studio was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE public.project_room_handbacks SET handed_back_at = now()
    WHERE project_id = '74210000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'rls: a direct update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    DELETE FROM public.project_room_handbacks
    WHERE project_id = '74210000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'rls: a direct delete was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$rls_studio$;

RESET ROLE;

ROLLBACK;
