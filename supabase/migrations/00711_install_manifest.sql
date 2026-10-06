-- ═══════════════════════════════════════════════════════════════════════════
-- 00711 — Install manifest, punch items and the spec snapshot at send
--         (US-16 Phase 2, C-34; SQ-420)
-- ═══════════════════════════════════════════════════════════════════════════
-- d1 D1-09: install day, close-out without paperwork. Placement itself stays
-- the line's installed status, written by record_project_ffe_installed (00691,
-- P0-1); the manifest is where and when, and by whom.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- install_manifest_items   one row per FF&E line: room_location, install_on,
--   installer (a studio contact, or a name), state planned | at_receiver |
--   on_site | deferred, note. Read: can_buy_for_project.
-- upsert_install_manifest_item(p_ffe_item_id, p_request jsonb)
--   Keys: roomLocation, installOn, installerContactId, installerName, state,
--   note. Creates the row on first call; later calls patch the keys present
--   (JSON null clears).
-- install_punch_items      a punch item tied to a line: note, media_ids (≤ 20),
--   due_on, resolved_at/by, resolution_note. Read: can_buy_for_project.
-- upsert_install_punch_item(p_request jsonb)
--   Keys: id, ffeItemId, note, mediaIds, dueOn. Without id it creates (ffeItemId
--   and note required); with id it patches an open item.
-- resolve_install_punch_item(p_punch_id, p_note)  idempotent.
-- po_spec_snapshots        the resolved spec of each line on a PO when it went
--   out, numbered by revision. Read: can_send_purchase_order.
-- snapshot_purchase_order_spec(p_po_id) → revision
--   Values only (name, quantity, trade price, the resolved sku / finish /
--   material / colour-fabric / dimensions through _spec_book_resolve_field,
--   the COM spec and trade notes), hashed per line. A new revision is written
--   only when the line set or a line's hash differs from the latest revision;
--   otherwise the latest revision is returned. 0 when the PO has no lines.
--   po-send calls it on send (P2-15, SQ-432). service_role, or a co-member.
--
-- All three tables are SELECT-only to authenticated; writes go through the
-- RPCs above.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. install_manifest_items ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.install_manifest_items (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        REFERENCES public.organizations(id),
  project_id           uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ffe_item_id          uuid        NOT NULL UNIQUE REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  room_location        text,
  install_on           date,
  installer_contact_id uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  installer_name       text,
  state                text        NOT NULL DEFAULT 'planned',
  note                 text,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT install_manifest_items_state_ck
    CHECK (state IN ('planned', 'at_receiver', 'on_site', 'deferred')),
  CONSTRAINT install_manifest_items_text_ck
    CHECK ((room_location IS NULL OR char_length(room_location) <= 200)
       AND (installer_name IS NULL OR char_length(installer_name) <= 200)
       AND (note IS NULL OR char_length(note) <= 2000))
);

CREATE INDEX IF NOT EXISTS idx_install_manifest_items_project
  ON public.install_manifest_items (project_id, install_on);

DROP TRIGGER IF EXISTS set_updated_at_install_manifest_items ON public.install_manifest_items;
CREATE TRIGGER set_updated_at_install_manifest_items
  BEFORE UPDATE ON public.install_manifest_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.install_manifest_items IS
  'Where, when and by whom an FF&E line is installed (00711, C-34, d1 D1-09). Placement itself is the '
  'line''s installed status (record_project_ffe_installed, 00691). Read: can_buy_for_project. Written '
  'only through upsert_install_manifest_item.';

ALTER TABLE public.install_manifest_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS install_manifest_items_studio_select ON public.install_manifest_items;
CREATE POLICY install_manifest_items_studio_select ON public.install_manifest_items
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.install_manifest_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.install_manifest_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.install_manifest_items TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_install_manifest_item(p_ffe_item_id uuid, p_request jsonb)
RETURNS public.install_manifest_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys    constant text[] := ARRAY['roomLocation', 'installOn', 'installerContactId', 'installerName',
                                     'state', 'note'];
  v_item    public.project_ffe_items%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_row     public.install_manifest_items%ROWTYPE;
  v_org     uuid;
  v_install date;
  v_contact uuid;
  v_room    text;
  v_name    text;
  v_state   text;
  v_note    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(v_req) AS entry WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')) THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: every value is a string or null'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_item.project_id) THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: line not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: line was removed' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_item.project_id;
  v_org := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));

  BEGIN
    v_install := NULLIF(btrim(COALESCE(v_req->>'installOn', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: installOn must be a date (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_contact := NULLIF(btrim(COALESCE(v_req->>'installerContactId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: installerContactId must be an id'
      USING ERRCODE = 'check_violation';
  END;
  IF v_contact IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.studio_contacts
     WHERE id = v_contact AND organization_id IS NOT DISTINCT FROM v_org AND v_org IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: installerContactId must be one of the studio''s contacts'
      USING ERRCODE = 'check_violation';
  END IF;
  v_room := NULLIF(btrim(COALESCE(v_req->>'roomLocation', '')), '');
  v_name := NULLIF(btrim(COALESCE(v_req->>'installerName', '')), '');
  v_state := NULLIF(btrim(COALESCE(v_req->>'state', '')), '');
  v_note := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');
  IF v_state IS NOT NULL AND v_state NOT IN ('planned', 'at_receiver', 'on_site', 'deferred') THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: state must be planned, at_receiver, on_site or deferred'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_room) > 200 OR char_length(v_name) > 200 OR char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'upsert_install_manifest_item: roomLocation and installerName are at most 200 characters, note 2000'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.install_manifest_items WHERE ffe_item_id = v_item.id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.install_manifest_items (
      organization_id, project_id, ffe_item_id, room_location, install_on, installer_contact_id,
      installer_name, state, note, created_by, updated_by
    ) VALUES (
      v_org, v_item.project_id, v_item.id, v_room, v_install, v_contact,
      v_name, COALESCE(v_state, 'planned'), v_note, v_uid, v_uid
    )
    ON CONFLICT (ffe_item_id) DO NOTHING
    RETURNING * INTO v_row;
    IF v_row.id IS NOT NULL THEN
      RETURN v_row;
    END IF;
    -- A concurrent first write won the row: patch it instead.
    SELECT * INTO v_row FROM public.install_manifest_items WHERE ffe_item_id = v_item.id FOR UPDATE;
  END IF;

  UPDATE public.install_manifest_items SET
    room_location = CASE WHEN v_req ? 'roomLocation' THEN v_room ELSE room_location END,
    install_on = CASE WHEN v_req ? 'installOn' THEN v_install ELSE install_on END,
    installer_contact_id = CASE WHEN v_req ? 'installerContactId' THEN v_contact ELSE installer_contact_id END,
    installer_name = CASE WHEN v_req ? 'installerName' THEN v_name ELSE installer_name END,
    state = CASE WHEN v_req ? 'state' THEN COALESCE(v_state, 'planned') ELSE state END,
    note = CASE WHEN v_req ? 'note' THEN v_note ELSE note END,
    updated_by = v_uid
  WHERE id = v_row.id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_install_manifest_item(uuid, jsonb) IS
  'Install manifest row for a line (00711, C-34): creates on first call, then patches the keys present. '
  'Gate: can_buy_for_project. installerContactId must be the studio''s contact.';

REVOKE ALL ON FUNCTION public.upsert_install_manifest_item(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_install_manifest_item(uuid, jsonb) TO authenticated;

-- ─── 2. install_punch_items ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.install_punch_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES public.organizations(id),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ffe_item_id     uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  note            text        NOT NULL,
  media_ids       uuid[]      NOT NULL DEFAULT '{}',
  due_on          date,
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution_note text,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT install_punch_items_text_ck
    CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000
       AND (resolution_note IS NULL OR char_length(resolution_note) <= 2000)
       AND cardinality(media_ids) <= 20),
  CONSTRAINT install_punch_items_resolved_ck
    CHECK (resolved_at IS NOT NULL OR (resolved_by IS NULL AND resolution_note IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_install_punch_items_item
  ON public.install_punch_items (ffe_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_install_punch_items_open
  ON public.install_punch_items (project_id)
  WHERE resolved_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_install_punch_items ON public.install_punch_items;
CREATE TRIGGER set_updated_at_install_punch_items
  BEFORE UPDATE ON public.install_punch_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.install_punch_items IS
  'Punch items tied to an FF&E line (00711, C-34, d1 D1-09): "touch-up on left arm · due 13 Nov". '
  'Read: can_buy_for_project. Written only through upsert_install_punch_item / '
  'resolve_install_punch_item.';

ALTER TABLE public.install_punch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS install_punch_items_studio_select ON public.install_punch_items;
CREATE POLICY install_punch_items_studio_select ON public.install_punch_items
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.install_punch_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.install_punch_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.install_punch_items TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_install_punch_item(p_request jsonb)
RETURNS public.install_punch_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys    constant text[] := ARRAY['id', 'ffeItemId', 'note', 'mediaIds', 'dueOn'];
  v_row     public.install_punch_items%ROWTYPE;
  v_item    public.project_ffe_items%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_id      uuid;
  v_item_id uuid;
  v_note    text;
  v_due     date;
  v_media   uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_install_punch_item: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_install_punch_item: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'upsert_install_punch_item: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_req - 'mediaIds') AS entry
    WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')
  ) OR jsonb_typeof(COALESCE(v_req->'mediaIds', 'null'::jsonb)) NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'upsert_install_punch_item: mediaIds must be an array; every other value a string or null'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_id := NULLIF(btrim(COALESCE(v_req->>'id', '')), '')::uuid;
    v_item_id := NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '')::uuid;
    SELECT array_agg(value::uuid) INTO v_media
      FROM jsonb_array_elements_text(COALESCE(v_req->'mediaIds', '[]'::jsonb)) AS value;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'upsert_install_punch_item: id, ffeItemId and mediaIds must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_due := NULLIF(btrim(COALESCE(v_req->>'dueOn', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'upsert_install_punch_item: dueOn must be a date (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  v_note := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');
  IF char_length(v_note) > 2000 OR COALESCE(cardinality(v_media), 0) > 20 THEN
    RAISE EXCEPTION 'upsert_install_punch_item: note is at most 2000 characters, mediaIds 20'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.install_punch_items WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_row.project_id) THEN
      RAISE EXCEPTION 'upsert_install_punch_item: punch item % not found or access denied', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_item_id IS NOT NULL AND v_item_id <> v_row.ffe_item_id THEN
      RAISE EXCEPTION 'upsert_install_punch_item: ffeItemId cannot change; record a new punch item'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_row.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'upsert_install_punch_item: punch item % is resolved; record a new one', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_req ? 'note' AND v_note IS NULL THEN
      RAISE EXCEPTION 'upsert_install_punch_item: a punch item needs a note'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.install_punch_items SET
      note = CASE WHEN v_req ? 'note' THEN v_note ELSE note END,
      media_ids = CASE WHEN v_req ? 'mediaIds' THEN COALESCE(v_media, '{}') ELSE media_ids END,
      due_on = CASE WHEN v_req ? 'dueOn' THEN v_due ELSE due_on END,
      updated_by = v_uid
    WHERE id = v_id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  IF v_item_id IS NULL OR v_note IS NULL THEN
    RAISE EXCEPTION 'upsert_install_punch_item: ffeItemId and note are required'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_item_id;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_item.project_id) THEN
    RAISE EXCEPTION 'upsert_install_punch_item: line not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'upsert_install_punch_item: line was removed' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_item.project_id;

  INSERT INTO public.install_punch_items (
    organization_id, project_id, ffe_item_id, note, media_ids, due_on, created_by, updated_by
  ) VALUES (
    COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)),
    v_item.project_id, v_item.id, v_note, COALESCE(v_media, '{}'), v_due, v_uid, v_uid
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_install_punch_item(jsonb) IS
  'Punch item on a line (00711, C-34): create (ffeItemId + note), or patch an open one. '
  'Gate: can_buy_for_project.';

REVOKE ALL ON FUNCTION public.upsert_install_punch_item(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_install_punch_item(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_install_punch_item(p_punch_id uuid, p_note text DEFAULT NULL)
RETURNS public.install_punch_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_row  public.install_punch_items%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'resolve_install_punch_item: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM public.install_punch_items WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_row.project_id) THEN
    RAISE EXCEPTION 'resolve_install_punch_item: punch item % not found or access denied', p_punch_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_row.resolved_at IS NOT NULL THEN
    RETURN v_row;
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'resolve_install_punch_item: the note is at most 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.install_punch_items
     SET resolved_at = now(), resolved_by = v_uid, resolution_note = v_note, updated_by = v_uid
   WHERE id = p_punch_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.resolve_install_punch_item(uuid, text) IS
  'Resolves a punch item (00711, C-34), with an optional note. Idempotent. Gate: can_buy_for_project.';

REVOKE ALL ON FUNCTION public.resolve_install_punch_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_install_punch_item(uuid, text) TO authenticated;

-- ─── 3. po_spec_snapshots ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_spec_snapshots (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        REFERENCES public.organizations(id),
  purchase_order_id uuid        NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  revision          integer     NOT NULL,
  ffe_item_id       uuid        REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  spec              jsonb       NOT NULL,
  content_hash      text        NOT NULL,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_spec_snapshots_revision_ck CHECK (revision >= 1),
  CONSTRAINT po_spec_snapshots_line_uq UNIQUE (purchase_order_id, revision, ffe_item_id)
);

CREATE INDEX IF NOT EXISTS idx_po_spec_snapshots_po
  ON public.po_spec_snapshots (purchase_order_id, revision DESC);

COMMENT ON TABLE public.po_spec_snapshots IS
  'The resolved spec of each line on a PO at send, one revision per changed send (00711, C-34). '
  'Read: can_send_purchase_order. Written only through snapshot_purchase_order_spec.';

ALTER TABLE public.po_spec_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_spec_snapshots_studio_select ON public.po_spec_snapshots;
CREATE POLICY po_spec_snapshots_studio_select ON public.po_spec_snapshots
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id));

REVOKE ALL ON TABLE public.po_spec_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_spec_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_spec_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_purchase_order_spec(p_po_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_po       public.purchase_orders%ROWTYPE;
  v_latest   integer;
  v_current  text;
  v_previous text;
  v_lines    jsonb;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR (v_uid IS NOT NULL AND NOT public.can_send_purchase_order(p_po_id)) THEN
    RAISE EXCEPTION 'snapshot_purchase_order_spec: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Values only, so a touched-but-unchanged line hashes the same.
  SELECT jsonb_agg(jsonb_build_object('ffeItemId', line.ffe_item_id, 'spec', line.spec,
                                      'hash', md5(line.spec::text))
                   ORDER BY line.ffe_item_id::text)
    INTO v_lines
    FROM (
      SELECT i.id AS ffe_item_id,
             jsonb_build_object(
               'name', i.name,
               'quantity', i.quantity,
               'unitTradeCents', i.trade_price_cents,
               'sku', public._spec_book_resolve_field(
                 to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
                 p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'sku', '')::timestamptz,
                 sp.field_provenance->>'sku')->'value',
               'finish', public._spec_book_resolve_field(
                 to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
                 p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'finish', '')::timestamptz,
                 sp.field_provenance->>'finish')->'value',
               'material', public._spec_book_resolve_field(
                 to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
                 p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'material', '')::timestamptz,
                 sp.field_provenance->>'material')->'value',
               'colorFabric', public._spec_book_resolve_field(
                 to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
                 p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz,
                 sp.field_provenance->>'colorFabric')->'value',
               'dimensions', public._spec_book_resolve_field(
                 sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
                 p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz,
                 sp.field_provenance->>'dimensions')->'value',
               'comSpec', sp.com_spec,
               'tradeNotes', sp.trade_notes
             ) AS spec
        FROM public.project_ffe_items AS i
        LEFT JOIN public.project_ffe_specs AS sp ON sp.ffe_item_id = i.id
        LEFT JOIN public.products AS p ON p.id = i.product_id
       WHERE i.purchase_order_id = p_po_id
         AND i.removed_at IS NULL
    ) AS line;

  IF v_lines IS NULL THEN
    RETURN 0;
  END IF;

  SELECT max(revision) INTO v_latest FROM public.po_spec_snapshots WHERE purchase_order_id = p_po_id;

  SELECT string_agg((line->>'ffeItemId') || ':' || (line->>'hash'), ',' ORDER BY line->>'ffeItemId')
    INTO v_current FROM jsonb_array_elements(v_lines) AS line;
  IF v_latest IS NOT NULL THEN
    SELECT string_agg(COALESCE(ffe_item_id::text, '') || ':' || content_hash, ',' ORDER BY ffe_item_id::text)
      INTO v_previous
      FROM public.po_spec_snapshots
     WHERE purchase_order_id = p_po_id AND revision = v_latest;
    IF v_previous = v_current THEN
      RETURN v_latest;
    END IF;
  END IF;

  INSERT INTO public.po_spec_snapshots (
    organization_id, purchase_order_id, revision, ffe_item_id, spec, content_hash, created_by
  )
  SELECT public.purchase_order_studio_id(p_po_id), p_po_id, COALESCE(v_latest, 0) + 1,
         (line->>'ffeItemId')::uuid, line->'spec', line->>'hash', v_uid
    FROM jsonb_array_elements(v_lines) AS line;

  RETURN COALESCE(v_latest, 0) + 1;
END;
$$;

COMMENT ON FUNCTION public.snapshot_purchase_order_spec(uuid) IS
  'Snapshots the resolved spec of each live line on a PO (00711, C-34): a new revision only when the line '
  'set or a line''s values changed since the latest; returns the revision (0 for a PO with no lines). '
  'po-send calls it on send (SQ-432). service_role, or a co-member (can_send_purchase_order).';

REVOKE ALL ON FUNCTION public.snapshot_purchase_order_spec(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_purchase_order_spec(uuid) TO authenticated, service_role;
