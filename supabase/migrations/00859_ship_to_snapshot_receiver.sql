-- 00859 / SQ-1780: receiving facts belong to the immutable printed snapshot.
-- Hardened 00716 authority unchanged except for snapshot composition.
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
    IF NOT COALESCE(v_ours, false) OR NOT public.is_active_org_member(v_loc.organization_id) THEN
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
      ), ''),
      (SELECT NULLIF(btrim(company_name), '') FROM public.studio_contacts WHERE id = v_loc.studio_contact_id),
      NULLIF(btrim(v_loc.receiving_hours), ''),
      NULLIF(btrim(v_loc.instructions), '')
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
