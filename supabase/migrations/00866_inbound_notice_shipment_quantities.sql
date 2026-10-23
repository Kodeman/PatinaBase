-- ═══════════════════════════════════════════════════════════════════════════
-- 00866 — Receiver inbound notices list the shipment's pieces and quantities.
-- Lineage: compose_receiver_inbound_draft (00706) → shared helper (00718).
-- Grafts only the pieces aggregation from 00718; the 00720 public wrapper,
-- draft creation, signature and service-role-only helper ACL stay unchanged.
-- Shipments without lines (including advance notices) retain the whole PO.
-- No backfill: existing drafts are left as composed.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._compose_receiver_inbound_draft(
  p_po_id uuid,
  p_shipment_id uuid,
  p_shipped_on date,
  p_eta date,
  p_carrier text,
  p_tracking text
)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po       public.purchase_orders%ROWTYPE;
  v_location public.studio_locations%ROWTYPE;
  v_contact  public.studio_contacts%ROWTYPE;
  v_vendor   text;
  v_label    text;
  v_sidemark text;
  v_pieces   text;
  v_draft    public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  SELECT * INTO v_location FROM public.studio_locations WHERE id = v_po.ship_to_location_id;
  IF v_location.studio_contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM public.studio_contacts WHERE id = v_location.studio_contact_id;
  END IF;
  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_label := public._procurement_po_label(v_po);
  v_sidemark := COALESCE(NULLIF(btrim(v_po.sidemark), ''), v_label);
  IF EXISTS (SELECT 1 FROM public.po_shipment_lines WHERE shipment_id = p_shipment_id) THEN
    SELECT string_agg(format('- %s × %s', line.qty, item.name), E'\n' ORDER BY item.sort_order, item.name)
      INTO v_pieces
    FROM public.po_shipment_lines AS line
    JOIN public.project_ffe_items AS item ON item.id = line.ffe_item_id
    WHERE line.shipment_id = p_shipment_id;
  ELSE
    SELECT string_agg(format('- %s × %s', item.quantity, item.name), E'\n' ORDER BY item.sort_order, item.name)
      INTO v_pieces
    FROM public.project_ffe_items AS item
    WHERE item.purchase_order_id = v_po.id AND item.removed_at IS NULL;
  END IF;

  INSERT INTO public.procurement_drafts (
    organization_id, project_id, kind, purchase_order_id, shipment_id, to_contact_id, to_email, subject, body
  ) VALUES (
    v_location.organization_id, v_po.project_id, 'receiver_inbound_notice', v_po.id, p_shipment_id,
    v_contact.id, NULLIF(btrim(v_contact.email), ''),
    format('Inbound: %s, sidemark %s', COALESCE(v_vendor, 'a vendor shipment'), v_sidemark),
    format(E'Hello %s,\n\nA shipment from %s is on its way to %s, sidemark %s.\n\n%s%s%s\n\nPieces:\n%s\n\nPlease inspect on arrival and note any damage on the delivery receipt.\n\nThank you,\n%s',
      COALESCE(NULLIF(btrim(v_contact.full_name), ''), 'there'),
      COALESCE(v_vendor, 'our vendor'), COALESCE(v_location.label, 'you'), v_sidemark,
      format('Shipped %s', to_char(p_shipped_on, 'FMMonth FMDD, YYYY')),
      CASE WHEN p_eta IS NOT NULL
           THEN format(', expected %s', to_char(p_eta, 'FMMonth FMDD, YYYY')) ELSE '' END,
      CASE WHEN p_carrier IS NOT NULL OR p_tracking IS NOT NULL
           THEN format(E'.\nCarrier: %s%s', COALESCE(p_carrier, 'not given'),
                       CASE WHEN p_tracking IS NOT NULL THEN ', tracking ' || p_tracking ELSE '' END)
           ELSE '.' END,
      COALESCE(v_pieces, '- (see the packing list)'),
      public._procurement_signoff(v_location.organization_id, v_po.project_id))
  )
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

REVOKE ALL ON FUNCTION public._compose_receiver_inbound_draft(uuid, uuid, date, date, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._compose_receiver_inbound_draft(uuid, uuid, date, date, text, text)
  TO service_role;
