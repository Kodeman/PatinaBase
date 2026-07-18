-- ═══════════════════════════════════════════════════════════════════════════
-- 00371 — Back of House: fulfillment_create_vendor (I15 — first real-use gap)
--
-- Kody hit this minutes into the first prod walk (Order #1, "Prodwalk
-- Smokewalk", spec §7/S4): the Vendor Directory has always been list/edit-
-- only — VendorDirectoryTable (S4) links straight to the profile editor, but
-- nothing in the shipped RPC family (00353) ever creates a vendors row.
-- Local dev never surfaced the gap because the dev seed corpus pre-populates
-- vendors; prod's public.vendors started empty. See BOH-DECISIONS.md I15.
--
-- Same posture as the rest of the 00353 RPC family: SECURITY DEFINER, sets
-- the writer GUC ('app.fulfillment_writer'='rpc') before the fulfillment_
-- events insert (fulfillment_log_event, 00351/00353), REVOKE public/anon/
-- authenticated, GRANT service_role only. public.vendors itself predates BOH
-- (00001) and is NOT writer-guarded — inserting into it directly is fine;
-- only the fulfillment_events append needs the GUC. Actor resolved per the
-- 00297 idiom (agent_tasks family): COALESCE(p_actor, auth.uid()::text,
-- session_user::text) — p_actor defaults to NULL so the RPC is still usable
-- from a raw psql session for verification.
--
-- Deliberately does NOT touch vendor_profiles — fulfillment_update_vendor_
-- profile (00353) owns that upsert; the admin-portal create flow calls it
-- immediately after this RPC returns, landing the operator on the profile
-- editor to fill in protocol facts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fulfillment_create_vendor(
  p_name    text,
  p_website text DEFAULT NULL,
  p_notes   text DEFAULT NULL,
  p_actor   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_actor   text := COALESCE(p_actor, auth.uid()::text, session_user::text);
  v_name    text := trim(p_name);
  v_website text := NULLIF(trim(COALESCE(p_website, '')), '');
  v_notes   text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_vendor  public.vendors;
BEGIN
  PERFORM set_config('app.fulfillment_writer', 'rpc', true);

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'fulfillment_create_vendor: name is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.vendors WHERE lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'fulfillment_create_vendor: a vendor named "%" already exists', v_name;
  END IF;

  INSERT INTO public.vendors (name, website, notes)
  VALUES (v_name, v_website, v_notes)
  RETURNING * INTO v_vendor;

  PERFORM public.fulfillment_log_event(
    'vendor.created', v_actor, NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object('vendor_id', v_vendor.id, 'name', v_vendor.name),
    NULL, to_jsonb(v_vendor), v_started);

  RETURN v_vendor.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfillment_create_vendor(text, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_create_vendor(text, text, text, text) TO service_role;
