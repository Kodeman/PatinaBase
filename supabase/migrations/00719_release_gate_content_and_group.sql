-- ═══════════════════════════════════════════════════════════════════════════
-- 00719 — The release covers the order's content (R3), and the threshold
--         reads the job's open orders to the same maker (R4)
--         (US-17 T1 · G1+G2; SQ-449)
-- ═══════════════════════════════════════════════════════════════════════════
-- R3  A release stamped the total only (00710). After it the PO is an
--     editable draft, and the header, ship-to, supplies, payment schedule,
--     riders, spec columns and an accepted lower unit price (resolve_ack_line)
--     all went out under the old release. release_purchase_order now stamps
--     released_fingerprint = _po_release_fingerprint(po): md5 over the spec
--     lines (the snapshot's own line build, _po_spec_lines, which
--     snapshot_purchase_order_spec now calls), the header and supplies
--     columns, the ship-to (ship_to_location_id and the printed ship_to),
--     the po_payments schedule and the riders. A release clears only while
--     the fingerprint still matches, except that a sidemark filled into a
--     blank one does not count: po-send writes its default sidemark there
--     before the stamp. A NULL fingerprint is a release from before 00719 and
--     keeps the total-only rule, so nothing in flight is re-held at deploy.
-- R4  The gate read one PO's total, so splitting an order beat it. The gate
--     now reads _release_gate_total(po): this PO plus the same job's orders
--     to the same maker that are unsent drafts or held, or were sent in the
--     last 7 days (Kody's ruling). Each order is still released on its own.
-- po_release_state(po)  applies / released / cleared / reason / group total /
--     threshold for the order paper's release slot.
-- assign_po_number  refuses an unnumbered held PO (the backstop for T2's G3).
--
-- DECISION (SQ-449, option T): _po_release_cleared keeps its 6-argument
-- total-only body, which the 00718 acknowledgment paths call. The new
-- PO-aware rule (_po_release_cleared_po) serves po_is_sendable,
-- purchase_order_release_required, po_release_state and the guard trigger.
-- The trigger also judges an unsent draft confirmed without a send (the
-- acknowledgment), so both ack paths meet R3/R4 with their 00718 bodies
-- unchanged.
--
-- Lineage of the redefined functions (each is its live head's body, verbatim,
-- with only the change named here):
--   snapshot_purchase_order_spec      00711 → 00718 → 00719
--   purchase_order_release_required   00710 → 00719
--   po_is_sendable                    00710 → 00719
--   guard_purchase_order_release      00710 → 00719
--   hold_purchase_order_for_release   00710 → 00719
--   release_purchase_order            00710 → 00719
--   assign_po_number                  00188 → 00690 → 00719
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The spec lines, shared by the snapshot and the fingerprint ──────────

-- Internal: the resolved spec of each live line on a PO, ordered by line id;
-- NULL for a PO with no lines.
CREATE OR REPLACE FUNCTION public._po_spec_lines(p_po_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Values only, so a touched-but-unchanged line hashes the same.
  SELECT jsonb_agg(jsonb_build_object('ffeItemId', line.ffe_item_id, 'spec', line.spec,
                                      'hash', md5(line.spec::text))
                   ORDER BY line.ffe_item_id::text)
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
$$;

REVOKE ALL ON FUNCTION public._po_spec_lines(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_spec_lines(uuid) TO service_role;

-- snapshot_purchase_order_spec (00718 body): the line build is _po_spec_lines.
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
  -- 00718 (S3): a revision is what the vendor is sent; a held or cancelled
  -- order is not sent.
  IF v_po.status IN ('held_for_release', 'cancelled') THEN
    RAISE EXCEPTION 'snapshot_purchase_order_spec: purchase order % is %; it takes no spec revision', p_po_id, v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00719: the line build is shared with the release fingerprint.
  v_lines := public._po_spec_lines(p_po_id);

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

-- ─── 2. The release fingerprint ─────────────────────────────────────────────

-- Internal: what a release covers. Payments and riders are ordered by their
-- own values, so a schedule rewritten to the same rows reads the same.
-- p_blank_sidemark reads the sidemark as blank (see _po_release_cleared_po).
CREATE OR REPLACE FUNCTION public._po_release_fingerprint(p_po_id uuid, p_blank_sidemark boolean DEFAULT false)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT md5(jsonb_build_object(
           'lines', COALESCE(public._po_spec_lines(po.id), '[]'::jsonb),
           'header', jsonb_build_object(
             'sidemark', CASE WHEN p_blank_sidemark THEN NULL ELSE NULLIF(btrim(po.sidemark), '') END,
             'requestedShipOn', po.requested_ship_on,
             'billTo', po.bill_to,
             'freightTerms', po.freight_terms,
             'vendorNote', po.vendor_note,
             'suppliesPurchaseOrderId', po.supplies_purchase_order_id),
           'shipToLocationId', po.ship_to_location_id,
           'shipTo', po.ship_to,
           'payments', COALESCE((
             SELECT jsonb_agg(payment.entry ORDER BY payment.entry::text)
               FROM (SELECT jsonb_build_object('kind', pay.kind, 'amountCents', pay.amount_cents,
                                               'dueDate', pay.due_date, 'label', pay.label) AS entry
                       FROM public.po_payments AS pay
                      WHERE pay.purchase_order_id = po.id) AS payment
           ), '[]'::jsonb),
           'riders', COALESCE((
             SELECT jsonb_agg(rider.entry ORDER BY rider.entry::text)
               FROM (SELECT jsonb_build_object('kind', cost.kind, 'estimateCents', cost.estimate_cents,
                                               'actualCents', cost.actual_cents,
                                               'payeeVendorId', cost.payee_vendor_id,
                                               'payeeContactId', cost.payee_contact_id) AS entry
                       FROM public.po_cost_lines AS cost
                      WHERE cost.purchase_order_id = po.id) AS rider
           ), '[]'::jsonb)
         )::text)
    FROM public.purchase_orders AS po
   WHERE po.id = p_po_id;
$$;

REVOKE ALL ON FUNCTION public._po_release_fingerprint(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_release_fingerprint(uuid, boolean) TO service_role;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS released_fingerprint text;

COMMENT ON COLUMN public.purchase_orders.released_fingerprint IS
  'The paper an owner/admin released (00719): _po_release_fingerprint at release. A later change to the '
  'lines, header, ship-to, supplies, schedule or riders needs a new release. Null on a release from '
  'before 00719, which covers its total only.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'purchase_orders_release_record_ck'
       AND conrelid = 'public.purchase_orders'::regclass
       AND pg_get_constraintdef(oid) LIKE '%released_fingerprint%'
  ) THEN
    ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_release_record_ck;
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_release_record_ck
      CHECK ((status <> 'held_for_release' OR held_at IS NOT NULL)
         AND ((released_at IS NULL) = (released_total_cents IS NULL))
         AND (released_fingerprint IS NULL OR released_at IS NOT NULL)
         AND (hold_note IS NULL OR char_length(hold_note) <= 2000)
         AND (send_back_note IS NULL OR char_length(send_back_note) <= 2000));
  END IF;
END $$;

-- ─── 3. The group the threshold reads ───────────────────────────────────────

-- Internal: this PO's total plus the same job's orders to the same maker that
-- are unsent drafts or held, or were sent in the last 7 days. The studio is
-- the project's (purchase_order_studio_id resolves through it), so the same
-- project is the same studio.
CREATE OR REPLACE FUNCTION public._release_gate_total(p_po_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(po.total_cents, 0)::bigint + COALESCE((
           SELECT sum(COALESCE(sibling.total_cents, 0))
             FROM public.purchase_orders AS sibling
            WHERE sibling.project_id = po.project_id
              AND sibling.vendor_id = po.vendor_id
              AND sibling.id <> po.id
              AND sibling.status <> 'cancelled'
              AND ((sibling.sent_at IS NULL AND sibling.status IN ('draft', 'held_for_release'))
                   OR sibling.sent_at >= now() - interval '7 days')
         ), 0)
    FROM public.purchase_orders AS po
   WHERE po.id = p_po_id;
$$;

REVOKE ALL ON FUNCTION public._release_gate_total(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._release_gate_total(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_release_group
  ON public.purchase_orders (project_id, vendor_id)
  WHERE sent_at IS NULL;

-- ─── 4. The PO-aware sendability rule ───────────────────────────────────────

-- Internal: _po_release_cleared's rule with the group total and the
-- fingerprint. Takes the row's values so the trigger can judge NEW.
-- _release_gate_applies takes integer cents; a group total past its range is
-- far over any threshold (at most 1000000000), so it is clamped.
CREATE OR REPLACE FUNCTION public._po_release_cleared_po(
  p_po_id uuid,
  p_status text,
  p_sent_at timestamptz,
  p_studio_id uuid,
  p_total_cents integer,
  p_group_total_cents bigint,
  p_released_at timestamptz,
  p_released_total_cents integer,
  p_released_fingerprint text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_status IN ('cancelled', 'held_for_release') THEN false
    WHEN p_sent_at IS NOT NULL THEN true
    WHEN NOT public._release_gate_applies(p_studio_id, LEAST(p_group_total_cents, 2147483647)::integer) THEN true
    ELSE p_released_at IS NOT NULL
         AND COALESCE(p_total_cents, 0) <= p_released_total_cents
         AND (p_released_fingerprint IS NULL
              OR p_released_fingerprint = public._po_release_fingerprint(p_po_id)
              -- po-send writes its default sidemark into a blank one before
              -- it re-reads the gate and stamps sent_at.
              OR p_released_fingerprint = public._po_release_fingerprint(p_po_id, true))
  END;
$$;

REVOKE ALL ON FUNCTION public._po_release_cleared_po(uuid, text, timestamptz, uuid, integer, bigint, timestamptz, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_release_cleared_po(uuid, text, timestamptz, uuid, integer, bigint, timestamptz, integer, text)
  TO service_role;

-- purchase_order_release_required (00710 body): the group total.
CREATE OR REPLACE FUNCTION public.purchase_order_release_required(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((
    SELECT public._release_gate_applies(public.purchase_order_studio_id(po.id),
                                        LEAST(public._release_gate_total(po.id), 2147483647)::integer)
      FROM public.purchase_orders AS po
     WHERE po.id = p_po_id
       AND (auth.uid() IS NULL OR public.can_send_purchase_order(po.id))
  ), false);
$$;

COMMENT ON FUNCTION public.purchase_order_release_required(uuid) IS
  'R-PB2 (00710): true when the PO''s studio gate applies (every order waits, or the total is at or '
  'over the threshold). 00719: the total is _release_gate_total, the same job''s open and recently sent '
  'orders to the same maker. False for a PO the caller cannot see.';

-- po_is_sendable (00710 body): the PO-aware rule.
CREATE OR REPLACE FUNCTION public.po_is_sendable(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((
    SELECT public._po_release_cleared_po(
             po.id, po.status, po.sent_at, public.purchase_order_studio_id(po.id), po.total_cents,
             public._release_gate_total(po.id), po.released_at, po.released_total_cents,
             po.released_fingerprint)
      FROM public.purchase_orders AS po
     WHERE po.id = p_po_id
       AND (auth.uid() IS NULL OR public.can_send_purchase_order(po.id))
  ), false);
$$;

COMMENT ON FUNCTION public.po_is_sendable(uuid) IS
  'C-32 (00710): may this PO go to the vendor now? False when cancelled or held_for_release, or when '
  'the studio''s release gate applies and no owner/admin release covers the current paper; true for a '
  'PO already sent (a resend). 00719: the gate reads the group total, and a release covers its total '
  'and its fingerprint. False for a PO the caller cannot see. po-send (SQ-430) refuses 409 '
  'held_for_release on false; guard_purchase_order_release refuses the sent_at stamp regardless.';

-- ─── 5. The DB-level stop (00710 body) ──────────────────────────────────────
-- 00719: the PO-aware rule, judged on NEW with NEW's total in the group; and
-- an unsent draft that leaves draft for anything but held or cancelled (an
-- acknowledgment confirming it) is judged too, with the same refusal.

CREATE OR REPLACE FUNCTION public.guard_purchase_order_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_studio uuid;
BEGIN
  IF OLD.status = 'held_for_release' AND NEW.status NOT IN ('held_for_release', 'draft', 'cancelled') THEN
    RAISE EXCEPTION 'held_for_release: purchase order % waits for an owner or admin to release it', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF (OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL)
     OR (OLD.status = 'draft' AND NEW.sent_at IS NULL
         AND NEW.status NOT IN ('draft', 'held_for_release', 'cancelled')) THEN
    SELECT COALESCE(project.studio_id, public._primary_studio_for(project.designer_id)) INTO v_studio
      FROM public.projects AS project
     WHERE project.id = NEW.project_id;
    IF NOT public._po_release_cleared_po(
         NEW.id, NEW.status, NULL, v_studio, NEW.total_cents,
         public._release_gate_total(NEW.id) - COALESCE(OLD.total_cents, 0) + COALESCE(NEW.total_cents, 0),
         NEW.released_at, NEW.released_total_cents, NEW.released_fingerprint) THEN
      RAISE EXCEPTION 'held_for_release: purchase order % waits for an owner or admin to release it', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 6. Hold and release (00710 bodies) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hold_purchase_order_for_release(p_po_id uuid, p_note text DEFAULT NULL)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_po   public.purchase_orders%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status = 'held_for_release' THEN
    RETURN v_po;
  END IF;
  IF v_po.status <> 'draft' OR v_po.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: only an unsent draft can be held (purchase order % is %)',
      p_po_id, v_po.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00719 (R4): the group total.
  IF NOT public._release_gate_applies(public.purchase_order_studio_id(p_po_id),
                                      LEAST(public._release_gate_total(p_po_id), 2147483647)::integer) THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: the studio''s release gate does not apply to purchase order %; send it',
      p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: the note is at most 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET status = 'held_for_release',
         held_at = now(), held_by = v_uid, hold_note = v_note,
         released_at = NULL, released_by = NULL, released_total_cents = NULL,
         released_fingerprint = NULL
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_purchase_order(p_po_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_po     public.purchase_orders%ROWTYPE;
  v_studio uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'release_purchase_order: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'release_purchase_order: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_studio := public.purchase_order_studio_id(p_po_id);
  IF v_studio IS NULL OR NOT public.is_org_admin_or_owner(v_studio) THEN
    RAISE EXCEPTION 'release_purchase_order: only an owner or admin can release an order'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status = 'held_for_release' THEN
    NULL;
  -- 00719 (R4): the group total.
  ELSIF v_po.status = 'draft' AND v_po.sent_at IS NULL
        AND public._release_gate_applies(v_studio, LEAST(public._release_gate_total(p_po_id), 2147483647)::integer) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'release_purchase_order: purchase order % is not waiting for release', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET status = 'draft',
         released_at = now(), released_by = v_uid,
         released_total_cents = COALESCE(total_cents, 0),
         -- 00719 (R3): the release covers this paper.
         released_fingerprint = public._po_release_fingerprint(p_po_id)
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.release_purchase_order(uuid) IS
  'C-32 (00710, R-PB6): an owner/admin seat of the PO''s studio releases a held PO (or an unsent draft '
  'the gate applies to) at its current paper; the PO returns to draft and po_is_sendable turns true '
  'until the total rises above the released figure or the paper changes (00719 fingerprint).';

-- ─── 7. The release state the order paper reads ─────────────────────────────

CREATE OR REPLACE FUNCTION public.po_release_state(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po      public.purchase_orders%ROWTYPE;
  v_studio  uuid;
  v_group   bigint;
  v_applies boolean;
  v_cleared boolean;
  v_reason  text;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT public.can_send_purchase_order(p_po_id)) THEN
    RETURN NULL;
  END IF;
  v_studio := public.purchase_order_studio_id(p_po_id);
  v_group := public._release_gate_total(p_po_id);
  v_applies := public._release_gate_applies(v_studio, LEAST(v_group, 2147483647)::integer);
  v_cleared := public._po_release_cleared_po(
    p_po_id, v_po.status, v_po.sent_at, v_studio, v_po.total_cents, v_group,
    v_po.released_at, v_po.released_total_cents, v_po.released_fingerprint);

  -- A release that no longer clears and whose total held has a changed paper.
  IF NOT v_cleared AND v_po.status <> 'cancelled' THEN
    v_reason := CASE
      WHEN v_po.released_at IS NOT NULL AND COALESCE(v_po.total_cents, 0) > v_po.released_total_cents
        THEN 'total_rose'
      WHEN v_po.released_at IS NOT NULL
        THEN 'changed'
      WHEN v_applies AND NOT public._release_gate_applies(v_studio, v_po.total_cents)
        THEN 'group_over'
    END;
  END IF;

  RETURN jsonb_build_object(
    'applies', v_applies,
    'released', v_po.released_at IS NOT NULL,
    'cleared', v_cleared,
    'reason', v_reason,
    'group_total_cents', v_group,
    'threshold_cents', (SELECT o.release_threshold_cents FROM public.organizations AS o WHERE o.id = v_studio)
  );
END;
$$;

COMMENT ON FUNCTION public.po_release_state(uuid) IS
  'The release gate for one PO (00719): applies (the gate reads its group total), released, cleared '
  '(po_is_sendable''s rule), reason (total_rose | changed | group_over | null, only while not cleared), '
  'group_total_cents and threshold_cents. Null for a PO the caller cannot see (can_send_purchase_order).';

REVOKE ALL ON FUNCTION public.po_release_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_release_state(uuid) TO authenticated, service_role;

-- ─── 8. assign_po_number (00690 body) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_po_number(p_po_id UUID)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po     purchase_orders;
  v_number INTEGER;
BEGIN
  -- Studio-scoped lock; anyone else gets the same error as a missing row so
  -- the RPC leaks nothing.
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id
   FOR UPDATE;

  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'assign_po_number: purchase order % not found or access denied', p_po_id;
  END IF;

  -- Idempotent: already numbered → return the row unchanged (counter
  -- untouched).
  IF v_po.po_number IS NOT NULL THEN
    RETURN v_po;
  END IF;

  -- 00719: a held order takes no number from the sequence until released.
  IF v_po.status = 'held_for_release' THEN
    RAISE EXCEPTION 'held_for_release: a held order takes its number when it is released'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO po_counters (designer_id)
  VALUES (v_po.designer_id)
  ON CONFLICT (designer_id)
    DO UPDATE SET next_number = po_counters.next_number + 1
  RETURNING next_number INTO v_number;

  UPDATE purchase_orders
     SET po_number = 'PO-' || LPAD(v_number::TEXT, 4, '0')
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;
