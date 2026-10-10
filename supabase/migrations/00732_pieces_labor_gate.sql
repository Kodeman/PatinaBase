-- ═══════════════════════════════════════════════════════════════════════════
-- 00732 — The labor gate in SQL (US-21 slice 1, W2; T-12, SQ-618)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 00732 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). D4 + D5: a line points at its piece for a reason (link_kind,
-- 00729), and labor is a line on its piece, billed on its own line, never on
-- the maker's PO (Q5, R-PB7). Trade Scope stays for lump sums.
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
-- link_ffe_pair(p_child, p_parent, p_kind DEFAULT 'com')
--   CREATE OR REPLACE base: 00702_com_pair_submittals.sql:108.
--   SIGNATURE CHANGE: DROP FUNCTION IF EXISTS link_ffe_pair(uuid, uuid), then
--   CREATE with the third argument; grants re-issued. A two-argument call
--   still resolves through the default, so useLinkFfePair keeps working until
--   it passes kind.
--   Full copy of the base plus:
--     - p_kind is 'com' or 'accessory'. 'labor' is refused: labor goes through
--       add_labor_line. Any other value is refused.
--     - a labor line is never re-linked or unlinked here (it stays on its
--       piece; 00729's labor_is_linked CHECK would refuse it anyway).
--     - the UPDATE writes link_kind with parent_ffe_item_id in the same
--       statement: NULL with a NULL parent (unlink), else p_kind. Story log
--       #3: since 00729 VALIDATEd link_kind_iff_parent, the 00702 body's
--       unlink refuses; this restores it.
--   The one-level check (00702:147) and the "already a piece" check
--   (00702:151) are kept as written.
--
-- add_labor_line(p_parent_ffe_item_id uuid, p_request jsonb) RETURNS jsonb
--   New. p_request: {name, quantity?, unit?, roughCents?, vendorId?}.
--   Inserts a child line: line_kind 'labor', link_kind 'labor', the parent's
--   room and assignment scope, disposition 'candidate', unit price 0 (client
--   price is set where every line's is). Its thread's need_label is the name.
--   Refuses when the parent is
--     a labor line, or itself a child (one level only);
--     removed;
--     a Trade Scope presence line (trade_scope_document_id, 00423:289). This
--       is the Trade Scope reconciliation: a labor line never sits under a
--       lump-sum scope, so the two never bill the same work;
--     on a PO (purchase_order_id);
--     released (ffe_line_authorization_state(id) not null, 00705:79).
--   Returns {selectionId, parentFfeItemId}.
--
-- create_purchase_order: NO REWRITE. The outer (00450:15-52) already refuses
--   any line whose vendor_id is not p_vendor_id (00450:38-43), so a labor
--   line reaches a maker's PO only when the maker is its vendor: the
--   "installer is the vendor" exception. supabase/tests/procurement/
--   pieces_labor_gate_test.sql proves both directions.
--
-- Every write RPC: _ffe_require_studio_project, SECURITY DEFINER,
-- search_path public, pg_temp; app.ffe_mutation_rpc on before any
-- project_ffe_items write.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W2
-- reset owner, T-17).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. link_ffe_pair gains its kind ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.link_ffe_pair(uuid, uuid);

CREATE OR REPLACE FUNCTION public.link_ffe_pair(
  p_child uuid,
  p_parent uuid,
  p_kind text DEFAULT 'com'
)
RETURNS public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_child public.project_ffe_items%ROWTYPE;
  v_parent public.project_ffe_items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00732: labor is attached only by add_labor_line.
  IF p_kind = 'labor' THEN
    RAISE EXCEPTION 'link_ffe_pair: labor is added to its piece with add_labor_line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('com', 'accessory') THEN
    RAISE EXCEPTION 'link_ffe_pair: kind must be com or accessory'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Lock in id order so concurrent pairings cannot deadlock.
  PERFORM 1 FROM public.project_ffe_items
   WHERE id IN (p_child, p_parent) ORDER BY id FOR UPDATE;

  SELECT * INTO v_child FROM public.project_ffe_items WHERE id = p_child;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_child.project_id);
  IF v_child.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'link_ffe_pair: line was removed'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00732: a labor line stays on its piece.
  IF v_child.line_kind = 'labor' THEN
    RAISE EXCEPTION 'link_ffe_pair: a labor line stays on its piece'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_parent IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.project_ffe_items WHERE id = p_parent;
    IF NOT FOUND OR v_parent.project_id IS DISTINCT FROM v_child.project_id THEN
      RAISE EXCEPTION 'link_ffe_pair: the piece must be a line on the same project'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_parent = p_child THEN
      RAISE EXCEPTION 'link_ffe_pair: a line cannot supply itself'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'link_ffe_pair: the piece was removed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.parent_ffe_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'link_ffe_pair: the piece already supplies another line'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_ffe_items
       WHERE parent_ffe_item_id = p_child AND removed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'link_ffe_pair: this line is itself a piece other lines supply'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET parent_ffe_item_id = p_parent,
         link_kind = CASE WHEN p_parent IS NULL THEN NULL ELSE p_kind END,
         updated_at = now()
   WHERE id = p_child
  RETURNING * INTO v_child;
  RETURN v_child;
END;
$$;

COMMENT ON FUNCTION public.link_ffe_pair(uuid, uuid, text) IS
  'Pairs a supplying line (the COM fabric, an accessory) with the piece it covers (00702, C-24; kind '
  '00732); NULL parent unlinks and clears link_kind. Kind com (default) or accessory; labor goes through '
  'add_labor_line and a labor line is never re-linked here. Same project, both active, one level. Gate: '
  '_ffe_require_studio_project.';

REVOKE ALL ON FUNCTION public.link_ffe_pair(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_ffe_pair(uuid, uuid, text) TO authenticated;

-- ─── 2. add_labor_line ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_labor_line(
  p_parent_ffe_item_id uuid,
  p_request jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_keys constant text[] := ARRAY['name', 'quantity', 'unit', 'roughCents', 'vendorId'];
  v_parent public.project_ffe_items%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_name text;
  v_quantity integer := 1;
  v_unit text := 'each';
  v_rough integer;
  v_vendor_id uuid;
  v_vendor_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_parent FROM public.project_ffe_items
   WHERE id = p_parent_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_parent.project_id);

  -- ── The request ──
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR (p_request - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'add_labor_line: the request is an object with keys %', array_to_string(v_keys, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  v_name := CASE WHEN jsonb_typeof(p_request->'name') = 'string'
                 THEN NULLIF(btrim(p_request->>'name'), '') END;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'add_labor_line: a labor line needs a name'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'quantity', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'quantity') <> 'number'
       OR (p_request->>'quantity')::numeric <> trunc((p_request->>'quantity')::numeric)
       OR (p_request->>'quantity')::numeric <= 0
       OR (p_request->>'quantity')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'add_labor_line: quantity is a whole number above 0'
        USING ERRCODE = 'check_violation';
    END IF;
    v_quantity := (p_request->>'quantity')::numeric::integer;
  END IF;

  -- The value list is project_ffe_items_unit_check (00729); it names itself.
  IF jsonb_typeof(COALESCE(p_request->'unit', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'unit') <> 'string' THEN
      RAISE EXCEPTION 'add_labor_line: unit is a string'
        USING ERRCODE = 'check_violation';
    END IF;
    v_unit := p_request->>'unit';
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'roughCents', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'roughCents') <> 'number'
       OR (p_request->>'roughCents')::numeric <> trunc((p_request->>'roughCents')::numeric)
       OR (p_request->>'roughCents')::numeric < 0
       OR (p_request->>'roughCents')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'add_labor_line: roughCents is whole cents, 0 or more'
        USING ERRCODE = 'check_violation';
    END IF;
    v_rough := (p_request->>'roughCents')::numeric::integer;
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'vendorId', 'null'::jsonb)) <> 'null' THEN
    BEGIN
      v_vendor_id := CASE WHEN jsonb_typeof(p_request->'vendorId') = 'string'
                          THEN (p_request->>'vendorId')::uuid END;
    EXCEPTION WHEN invalid_text_representation THEN
      v_vendor_id := NULL;
    END;
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;
    IF v_vendor_id IS NULL OR NOT FOUND THEN
      RAISE EXCEPTION 'add_labor_line: vendor not found'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── The piece ──
  IF v_parent.line_kind = 'labor' THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a piece, not to another labor line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.parent_ffe_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a piece, not to a line that supplies one'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece was removed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.trade_scope_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: this line is a Trade Scope; its work is billed by the scope, not as labor'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece is on an order. Labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.ffe_line_authorization_state(v_parent.id) IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece is released. Labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, assignment_scope, name, quantity, unit,
    rough_cents, vendor_id, vendor_name, line_kind, link_kind,
    parent_ffe_item_id, design_disposition, added_via, sort_order
  ) VALUES (
    v_parent.project_id, v_parent.project_room_id, v_parent.assignment_scope,
    v_name, v_quantity, v_unit, v_rough, v_vendor_id, v_vendor_name,
    'labor', 'labor', v_parent.id, 'candidate', 'labor',
    COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items
               WHERE project_id = v_parent.project_id), 0)
  ) RETURNING * INTO v_item;

  -- Every line has its spec row (precedent 00678:1437).
  INSERT INTO public.project_ffe_specs (ffe_item_id, updated_by)
  VALUES (v_item.id, auth.uid())
  ON CONFLICT (ffe_item_id) DO NOTHING;

  -- D2: a created line's thread is named for it (00729 backfill, 00730).
  UPDATE public.project_ffe_selection_threads
     SET need_label = v_name
   WHERE id = v_item.selection_thread_id
     AND need_label IS NULL;

  RETURN jsonb_build_object('selectionId', v_item.id, 'parentFfeItemId', v_parent.id);
END;
$$;

COMMENT ON FUNCTION public.add_labor_line(uuid, jsonb) IS
  'Adds a labor line under its piece (00732, D5, Q5): line_kind and link_kind labor, the piece''s room '
  'and scope, disposition candidate. Refuses a piece that is labor, a child, removed, a Trade Scope '
  'presence line, on a PO, or released. Labor bills on its own line, never on the maker''s PO. '
  'Gate: _ffe_require_studio_project.';

REVOKE ALL ON FUNCTION public.add_labor_line(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_labor_line(uuid, jsonb) TO authenticated;
