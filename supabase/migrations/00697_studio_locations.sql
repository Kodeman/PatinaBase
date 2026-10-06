-- ═══════════════════════════════════════════════════════════════════════════
-- 00697 — Studio locations and a ship-to that points at one (C-13)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-402). d2 §M6 (locations part only), direction §7 C-13.
--
-- Ship-to has been free text (purchase_orders.ship_to, 00188:35-38), typed per
-- PO or, before R-PB3, filled by po-send with the client's house. A studio
-- keeps a short list of places goods go: its receiving warehouse (one marked
-- default), its studio, workrooms, storage, and a job site when that is the
-- right call. Each hangs off a company card in the rolodex, so the receiver is
-- a real party.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- studio_locations                  d2 §M6 columns. Read: active non-guest
--                                   members (is_active_studio_member, 00417).
--                                   Writes: the RPCs below. At most one
--                                   default receiver per studio (partial
--                                   unique index); an archived location is
--                                   never the default.
-- purchase_orders.ship_to_location_id
--                                   the chosen location. ship_to stays the
--                                   printed snapshot.
--
-- ── RPCs (SECURITY DEFINER, pinned search_path, PUBLIC/anon revoked) ───────
--   upsert_studio_location(p_org, p_request)   create or patch; setting
--       isDefaultReceiver moves the flag off the studio's other location.
--   archive_studio_location(p_location_id, p_archived DEFAULT true)
--       archive (drops the default flag) or restore.
--   set_purchase_order_ship_to_location(p_po_id, p_location_id)
--       extended sibling of set_purchase_order_ship_to (00690): same access
--       test (can_send_purchase_order) and the same sent-paper rule — once
--       sent, a missing ship-to may be filled but one on the paper is fixed
--       (R8). Writes the FK and the text snapshot together. The location must
--       be live and belong to the PO's studio (projects.studio_id, else a
--       studio the project owner is an active non-guest member of). NULL
--       clears both.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. studio_locations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.studio_locations (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind                      text        NOT NULL,
  -- The company card in the studio rolodex (the receiver, the workroom, …).
  studio_contact_id         uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  label                     text        NOT NULL,
  -- organizations.address shape: {street, city, state, zip, country}.
  address                   jsonb,
  receiving_hours           text,
  -- NULL = not recorded (a carrier booking must not read "no dock" from it).
  has_dock                  boolean,
  needs_liftgate            boolean,
  storage_free_days         integer,
  storage_rate_cents_month  integer,
  receiving_fee_cents_piece integer,
  instructions              text,
  is_default_receiver       boolean     NOT NULL DEFAULT false,
  archived_at               timestamptz,
  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT studio_locations_kind_ck
    CHECK (kind IN ('receiver', 'studio', 'workroom', 'storage', 'site')),
  CONSTRAINT studio_locations_label_ck
    CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT studio_locations_address_ck
    CHECK (address IS NULL OR (
      jsonb_typeof(address) = 'object'
      AND (address - ARRAY['street', 'city', 'state', 'zip', 'country']) = '{}'::jsonb
      AND NOT jsonb_path_exists(address, '$.* ? (@.type() != "string")')
    )),
  CONSTRAINT studio_locations_amounts_ck
    CHECK ((storage_free_days IS NULL OR storage_free_days >= 0)
       AND (storage_rate_cents_month IS NULL OR storage_rate_cents_month >= 0)
       AND (receiving_fee_cents_piece IS NULL OR receiving_fee_cents_piece >= 0)),
  CONSTRAINT studio_locations_default_live_ck
    CHECK (NOT is_default_receiver OR archived_at IS NULL)
);

-- One default receiver per studio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_locations_one_default_receiver
  ON public.studio_locations (organization_id)
  WHERE is_default_receiver;

CREATE INDEX IF NOT EXISTS idx_studio_locations_org_live
  ON public.studio_locations (organization_id)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_studio_locations ON public.studio_locations;
CREATE TRIGGER set_updated_at_studio_locations
  BEFORE UPDATE ON public.studio_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.studio_locations IS
  'Places a studio''s goods go (00697, C-13): receiver, studio, workroom, storage, site. Each '
  'hangs off a rolodex company card. At most one default receiver per studio. Read by active '
  'non-guest members; written only through upsert_studio_location / archive_studio_location.';

ALTER TABLE public.studio_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_locations_member_select ON public.studio_locations;
CREATE POLICY studio_locations_member_select ON public.studio_locations
  FOR SELECT TO authenticated
  USING (public.is_active_studio_member(organization_id));

REVOKE ALL ON TABLE public.studio_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_locations TO service_role;

-- ─── 2. purchase_orders.ship_to_location_id ─────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS ship_to_location_id uuid
    REFERENCES public.studio_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_ship_to_location
  ON public.purchase_orders (ship_to_location_id)
  WHERE ship_to_location_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_orders.ship_to_location_id IS
  'The studio location this PO ships to (00697, C-13). ship_to keeps the printed snapshot. '
  'Written with it by set_purchase_order_ship_to_location.';

-- ─── 3. upsert_studio_location ──────────────────────────────────────────────
-- p_request (camelCase): id?, kind, studioContactId, label, address,
-- receivingHours, hasDock, needsLiftgate, storageFreeDays,
-- storageRateCentsMonth, receivingFeeCentsPiece, instructions,
-- isDefaultReceiver. Without id it inserts (kind and label required); with
-- id it patches the keys present (JSON null clears). An archived location is
-- restored with archive_studio_location before it is edited.

CREATE OR REPLACE FUNCTION public.upsert_studio_location(p_org uuid, p_request jsonb)
RETURNS public.studio_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_id      uuid;
  v_unknown text;
  v_patch   jsonb;
  v_row     public.studio_locations%ROWTYPE;
  v_new     public.studio_locations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_location: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_org IS NULL OR NOT public.is_active_studio_member(p_org) THEN
    RAISE EXCEPTION 'upsert_studio_location: studio % not found or access denied', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_studio_location: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;

  WITH m(key, col) AS (VALUES
    ('kind', 'kind'),
    ('studioContactId', 'studio_contact_id'),
    ('label', 'label'),
    ('address', 'address'),
    ('receivingHours', 'receiving_hours'),
    ('hasDock', 'has_dock'),
    ('needsLiftgate', 'needs_liftgate'),
    ('storageFreeDays', 'storage_free_days'),
    ('storageRateCentsMonth', 'storage_rate_cents_month'),
    ('receivingFeeCentsPiece', 'receiving_fee_cents_piece'),
    ('instructions', 'instructions'),
    ('isDefaultReceiver', 'is_default_receiver')
  )
  SELECT
    (SELECT string_agg(k, ', ' ORDER BY k)
       FROM jsonb_object_keys(v_req) AS k
      WHERE k <> 'id' AND NOT EXISTS (SELECT 1 FROM m WHERE m.key = k)),
    (SELECT COALESCE(jsonb_object_agg(m.col, v_req -> m.key), '{}'::jsonb)
       FROM m WHERE v_req ? m.key)
  INTO v_unknown, v_patch;

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'upsert_studio_location: unknown keys %', v_unknown
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize default-receiver moves within the studio.
  PERFORM 1 FROM public.organizations WHERE id = p_org FOR UPDATE;

  v_id := NULLIF(v_req ->> 'id', '')::uuid;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.studio_locations
    WHERE id = v_id AND organization_id = p_org
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'upsert_studio_location: location % not found or access denied', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'upsert_studio_location: location % is archived; restore it first', v_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_new := jsonb_populate_record(v_row, v_patch);
  v_new.label := NULLIF(btrim(v_new.label), '');
  v_new.is_default_receiver := COALESCE(v_new.is_default_receiver, false);

  IF v_new.kind IS NULL OR v_new.label IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_location: a kind and a label are required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_new.studio_contact_id IS DISTINCT FROM v_row.studio_contact_id
     AND v_new.studio_contact_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.studio_contacts
       WHERE id = v_new.studio_contact_id AND organization_id = p_org AND entity_kind = 'company'
     ) THEN
    RAISE EXCEPTION 'upsert_studio_location: studio contact % is not a company card in this studio', v_new.studio_contact_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_new.is_default_receiver THEN
    UPDATE public.studio_locations
       SET is_default_receiver = false, updated_by = v_uid
     WHERE organization_id = p_org
       AND is_default_receiver
       AND id IS DISTINCT FROM v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.studio_locations (
      organization_id, kind, studio_contact_id, label, address, receiving_hours,
      has_dock, needs_liftgate, storage_free_days, storage_rate_cents_month,
      receiving_fee_cents_piece, instructions, is_default_receiver, created_by, updated_by
    )
    VALUES (
      p_org, v_new.kind, v_new.studio_contact_id, v_new.label, v_new.address,
      NULLIF(btrim(v_new.receiving_hours), ''), v_new.has_dock, v_new.needs_liftgate,
      v_new.storage_free_days, v_new.storage_rate_cents_month, v_new.receiving_fee_cents_piece,
      NULLIF(btrim(v_new.instructions), ''), v_new.is_default_receiver, v_uid, v_uid
    )
    RETURNING * INTO v_new;
  ELSE
    UPDATE public.studio_locations SET
      kind                      = v_new.kind,
      studio_contact_id         = v_new.studio_contact_id,
      label                     = v_new.label,
      address                   = v_new.address,
      receiving_hours           = NULLIF(btrim(v_new.receiving_hours), ''),
      has_dock                  = v_new.has_dock,
      needs_liftgate            = v_new.needs_liftgate,
      storage_free_days         = v_new.storage_free_days,
      storage_rate_cents_month  = v_new.storage_rate_cents_month,
      receiving_fee_cents_piece = v_new.receiving_fee_cents_piece,
      instructions              = NULLIF(btrim(v_new.instructions), ''),
      is_default_receiver       = v_new.is_default_receiver,
      updated_by                = v_uid
    WHERE id = v_id
    RETURNING * INTO v_new;
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.upsert_studio_location(uuid, jsonb) IS
  'Create or patch a studio location (00697, C-13). Active non-guest members of p_org only. '
  'isDefaultReceiver: true moves the default off the studio''s other location.';

REVOKE ALL ON FUNCTION public.upsert_studio_location(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_studio_location(uuid, jsonb) TO authenticated;

-- ─── 4. archive_studio_location ─────────────────────────────────────────────
-- POs that point at an archived location keep the FK and their snapshot.

CREATE OR REPLACE FUNCTION public.archive_studio_location(
  p_location_id uuid, p_archived boolean DEFAULT true
)
RETURNS public.studio_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.studio_locations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.studio_locations WHERE id = p_location_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_active_studio_member(v_row.organization_id) THEN
    RAISE EXCEPTION 'archive_studio_location: location % not found or access denied', p_location_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.studio_locations SET
    archived_at = CASE WHEN COALESCE(p_archived, true) THEN COALESCE(archived_at, now()) END,
    is_default_receiver = CASE WHEN COALESCE(p_archived, true) THEN false ELSE is_default_receiver END,
    updated_by = auth.uid()
  WHERE id = p_location_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.archive_studio_location(uuid, boolean) IS
  'Archive (p_archived true, the default; drops the default-receiver flag) or restore a studio '
  'location (00697). Active non-guest members of its studio only.';

REVOKE ALL ON FUNCTION public.archive_studio_location(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_studio_location(uuid, boolean) TO authenticated;

-- ─── 5. set_purchase_order_ship_to_location ─────────────────────────────────
-- The snapshot prints the label, then street, then "city, state zip".

CREATE OR REPLACE FUNCTION public.set_purchase_order_ship_to_location(
  p_po_id uuid, p_location_id uuid
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po       public.purchase_orders%ROWTYPE;
  v_project  public.projects%ROWTYPE;
  v_loc      public.studio_locations%ROWTYPE;
  v_ours     boolean;
  v_snapshot text;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to_location: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Same rule as set_purchase_order_ship_to (00690): after send, a missing
  -- ship-to may be filled, but one already on sent paper is fixed (R8).
  IF v_po.sent_at IS NOT NULL AND NULLIF(btrim(COALESCE(v_po.ship_to, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to_location: purchase order % was already sent; ship-to is fixed on sent paper', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to_location: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_po.project_id;
    SELECT * INTO v_loc FROM public.studio_locations WHERE id = p_location_id;
    -- The PO's studio: projects.studio_id, else any studio the project owner
    -- holds an active non-guest seat in.
    v_ours := FOUND AND CASE
      WHEN v_project.studio_id IS NOT NULL THEN v_loc.organization_id = v_project.studio_id
      ELSE EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = v_loc.organization_id
          AND user_id = v_project.designer_id
          AND status = 'active'
          AND role <> 'guest'
      )
    END;
    IF NOT COALESCE(v_ours, false) OR NOT public.is_active_studio_member(v_loc.organization_id) THEN
      RAISE EXCEPTION 'set_purchase_order_ship_to_location: location % is not a location of this purchase order''s studio', p_location_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_loc.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'set_purchase_order_ship_to_location: location % is archived', p_location_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_snapshot := NULLIF(concat_ws(E'\n',
      v_loc.label,
      NULLIF(btrim(v_loc.address ->> 'street'), ''),
      NULLIF(concat_ws(' ',
        NULLIF(concat_ws(', ',
          NULLIF(btrim(v_loc.address ->> 'city'), ''),
          NULLIF(btrim(v_loc.address ->> 'state'), '')
        ), ''),
        NULLIF(btrim(v_loc.address ->> 'zip'), '')
      ), '')
    ), '');
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET ship_to_location_id = p_location_id,
         ship_to = v_snapshot
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.set_purchase_order_ship_to_location(uuid, uuid) IS
  'Point a PO at a studio location (00697, C-13): writes ship_to_location_id and the printed '
  'ship_to snapshot together. Same access and sent-paper rule as set_purchase_order_ship_to '
  '(00690). The location must be live and belong to the PO''s studio. NULL clears both.';

REVOKE ALL ON FUNCTION public.set_purchase_order_ship_to_location(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_ship_to_location(uuid, uuid) TO authenticated;
