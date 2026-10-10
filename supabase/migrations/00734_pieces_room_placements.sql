-- ═══════════════════════════════════════════════════════════════════════════
-- 00734 — One line in several rooms: room placements, phase 1
--         (US-21 slice 1, W2; D7 phase 1; T-14, SQ-620)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 "00734 in full" (artifacts/pieces-building-room-2026-10-08/
-- build/CONTRACT.md); direction.md §3.4 D7 and its worked cases; ruling Q4
-- (a join table, the primary room kept, three phases).
--
-- New objects only. No CREATE OR REPLACE base: nothing existing is rewritten.
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W2
-- reset owner, T-17, does it; CONTRACT §4).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_ffe_placements
--   One row per room a line is placed in, with that room's share of the
--   line's quantity (in the line's unit) and an optional area note. Unique
--   per (line, room). project_ffe_items.project_room_id stays the PRIMARY
--   room: every consumer that does not know about placements keeps showing
--   the primary room and never multiplies or splits money by placement
--   (CONTRACT §1.3). The line's quantity may exceed the placements' sum; the
--   difference is the waste (913 ordered over 830 measured prints 83).
--
-- project_ffe_placement_events
--   Append-only record of a placement change made after the line is released
--   (ffe_line_authorization_state not null, 00705:79) or on a PO
--   (purchase_order_id set). Q4's lock is on money and quantity, so such a
--   change is allowed and recorded, never silent (D7 case 3). before/after
--   are {primaryRoomId, placements:[{roomId, quantity, areaNote}]}.
--
-- set_line_placements(p_ffe_item_id uuid, p_placements jsonb) RETURNS jsonb
--   Takes [{roomId, quantity, areaNote?}] and replaces the line's set.
--   - every room belongs to the line's project; no room twice;
--   - quantity is a whole number > 0; sum(quantity) ≤ line.quantity;
--   - the first element is primary: it sets project_room_id and
--     assignment_scope = 'room';
--   - [] deletes the rows and leaves the primary room as it is;
--   - a set of one row is stored (a single room) and prints nothing extra;
--   - on a PO the primary room may not change (phase 3, 00754, lifts this);
--   - it never writes quantity, unit or any money column.
--   Rows are upserted on (ffe_item_id, project_room_id) rather than deleted
--   and re-inserted, so a room kept across edits keeps its placement id
--   (00754 hangs per-placement receipts off it, ON DELETE CASCADE).
--   Returns {placements:[{placementId, roomId, roomName, quantity, areaNote,
--   sortOrder}], wasteQuantity: line.quantity - sum}.
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- Both tables: SELECT TO authenticated USING can_buy_for_project(project_id)
-- (00702:60). No client policy: a client JWT reads 0 rows. INSERT, UPDATE and
-- DELETE are revoked from authenticated and anon; the only writer is
-- set_line_placements (SECURITY DEFINER, gate _ffe_require_studio_project,
-- 00717:75).
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, DROP … IF EXISTS before
-- every policy and trigger, CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_ffe_placements ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_ffe_placements (
  id              uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ffe_item_id     uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_room_id uuid        NOT NULL REFERENCES public.project_rooms(id) ON DELETE CASCADE,
  quantity        integer     NOT NULL,
  area_note       text,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_ffe_placements_quantity_check CHECK (quantity > 0),
  CONSTRAINT project_ffe_placements_item_room_key UNIQUE (ffe_item_id, project_room_id)
);

CREATE INDEX IF NOT EXISTS idx_project_ffe_placements_project
  ON public.project_ffe_placements (project_id);
CREATE INDEX IF NOT EXISTS idx_project_ffe_placements_room
  ON public.project_ffe_placements (project_room_id);

DROP TRIGGER IF EXISTS set_updated_at_project_ffe_placements ON public.project_ffe_placements;
CREATE TRIGGER set_updated_at_project_ffe_placements
  BEFORE UPDATE ON public.project_ffe_placements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.project_ffe_placements IS
  'The rooms one FF&E line is placed in, each with its share of the line quantity (00734, D7 phase 1). '
  'project_ffe_items.project_room_id stays the primary room. line.quantity >= sum(quantity); the '
  'difference is waste. Read: can_buy_for_project. Written only through set_line_placements.';

ALTER TABLE public.project_ffe_placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ffe_placements_studio_select ON public.project_ffe_placements;
CREATE POLICY project_ffe_placements_studio_select ON public.project_ffe_placements
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.project_ffe_placements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_ffe_placements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_ffe_placements TO service_role;

-- ─── 2. project_ffe_placement_events ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_ffe_placement_events (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ffe_item_id uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  before      jsonb       NOT NULL,
  after       jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_ffe_placement_events_item
  ON public.project_ffe_placement_events (ffe_item_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_project_ffe_placement_events_project
  ON public.project_ffe_placement_events (project_id);

COMMENT ON TABLE public.project_ffe_placement_events IS
  'Append-only record of placement changes made after a line is released or on a PO (00734, D7 case 3). '
  'No money and no quantity move here. Read: can_buy_for_project. Written only by set_line_placements.';

ALTER TABLE public.project_ffe_placement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ffe_placement_events_studio_select ON public.project_ffe_placement_events;
CREATE POLICY project_ffe_placement_events_studio_select ON public.project_ffe_placement_events
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.project_ffe_placement_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_ffe_placement_events TO authenticated;
GRANT SELECT, INSERT ON TABLE public.project_ffe_placement_events TO service_role;

-- ─── 3. set_line_placements ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_line_placements(p_ffe_item_id uuid, p_placements jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item     public.project_ffe_items%ROWTYPE;
  v_elem     jsonb;
  v_ord      bigint;
  v_room_id  uuid;
  v_qty      numeric;
  v_note     text;
  v_rooms    uuid[] := ARRAY[]::uuid[];
  v_sum      bigint := 0;
  v_primary  uuid;
  v_locked   boolean;
  v_before   jsonb;
  v_after    jsonb;
BEGIN
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RAISE EXCEPTION 'Placements are a list of rooms.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item
  FROM public.project_ffe_items
  WHERE id = p_ffe_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line not found' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public._ffe_require_studio_project(v_item.project_id);

  -- Validate every element before writing anything.
  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem -> 'roomId') IS DISTINCT FROM 'string'
       OR (v_elem ->> 'roomId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Each placement names a room.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_room_id := (v_elem ->> 'roomId')::uuid;

    IF jsonb_typeof(v_elem -> 'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_qty := (v_elem ->> 'quantity')::numeric;
    IF v_qty <= 0 OR v_qty <> trunc(v_qty) OR v_qty > 2147483647 THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms room
      WHERE room.id = v_room_id AND room.project_id = v_item.project_id
    ) THEN
      RAISE EXCEPTION 'That room is not in this project.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_room_id = ANY (v_rooms) THEN
      RAISE EXCEPTION 'A room appears twice in the placements.'
        USING ERRCODE = 'unique_violation';
    END IF;

    v_rooms := v_rooms || v_room_id;
    v_sum := v_sum + v_qty::integer;
  END LOOP;

  IF v_sum > v_item.quantity THEN
    RAISE EXCEPTION 'The rooms add up to %, more than the % on the line.', v_sum, v_item.quantity
      USING ERRCODE = 'check_violation',
            HINT = 'Change the line''s quantity first; once released, through Record a change.';
  END IF;

  v_primary := CASE WHEN cardinality(v_rooms) > 0 THEN v_rooms[1] ELSE v_item.project_room_id END;

  IF v_item.purchase_order_id IS NOT NULL
     AND v_primary IS DISTINCT FROM v_item.project_room_id THEN
    RAISE EXCEPTION 'The primary room is fixed while the line is on an order.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_locked := v_item.purchase_order_id IS NOT NULL
              OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL;

  SELECT jsonb_build_object(
           'primaryRoomId', v_item.project_room_id,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_before
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  -- Replace the set: drop rooms no longer named, upsert the rest.
  DELETE FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id
    AND NOT (p.project_room_id = ANY (v_rooms));

  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    v_note := NULLIF(btrim(v_elem ->> 'areaNote'), '');
    INSERT INTO public.project_ffe_placements AS p
      (ffe_item_id, project_id, project_room_id, quantity, area_note, sort_order)
    VALUES
      (v_item.id, v_item.project_id, (v_elem ->> 'roomId')::uuid,
       (v_elem ->> 'quantity')::numeric::integer, v_note, (v_ord - 1)::integer)
    ON CONFLICT (ffe_item_id, project_room_id) DO UPDATE
      SET quantity   = EXCLUDED.quantity,
          area_note  = EXCLUDED.area_note,
          sort_order = EXCLUDED.sort_order
      WHERE (p.quantity, p.area_note, p.sort_order)
            IS DISTINCT FROM (EXCLUDED.quantity, EXCLUDED.area_note, EXCLUDED.sort_order);
  END LOOP;

  -- The first placement is the primary room. Only quantity-free columns move.
  IF cardinality(v_rooms) > 0
     AND (v_item.project_room_id IS DISTINCT FROM v_primary
          OR v_item.assignment_scope IS DISTINCT FROM 'room') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
    SET project_room_id = v_primary,
        assignment_scope = 'room'
    WHERE id = v_item.id;
  END IF;

  SELECT jsonb_build_object(
           'primaryRoomId', v_primary,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_after
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  IF v_locked AND v_after IS DISTINCT FROM v_before THEN
    INSERT INTO public.project_ffe_placement_events
      (ffe_item_id, project_id, changed_by, before, after)
    VALUES
      (v_item.id, v_item.project_id, auth.uid(), v_before, v_after);
  END IF;

  RETURN jsonb_build_object(
    'placements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'placementId', p.id,
               'roomId', p.project_room_id,
               'roomName', room.name,
               'quantity', p.quantity,
               'areaNote', p.area_note,
               'sortOrder', p.sort_order)
             ORDER BY p.sort_order, p.created_at)
      FROM public.project_ffe_placements p
      JOIN public.project_rooms room ON room.id = p.project_room_id
      WHERE p.ffe_item_id = v_item.id), '[]'::jsonb),
    'wasteQuantity', v_item.quantity - v_sum
  );
END;
$$;

COMMENT ON FUNCTION public.set_line_placements(uuid, jsonb) IS
  'Replaces the rooms a line is placed in (00734, D7 phase 1): [{roomId, quantity, areaNote?}]. '
  'Rooms in the line''s project, whole quantities > 0, sum <= line quantity. The first room is primary '
  '(project_room_id, assignment_scope room); [] keeps the primary and clears the rows. On a PO the '
  'primary room is fixed. After release or a PO the change is recorded in project_ffe_placement_events. '
  'Never writes quantity, unit or money. Returns {placements, wasteQuantity}.';

REVOKE ALL ON FUNCTION public.set_line_placements(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_placements(uuid, jsonb) TO authenticated;
