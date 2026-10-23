-- ═══════════════════════════════════════════════════════════════════════════
-- 00856 — Job destinations and planned line intent (US-51, P-10, F-05)
-- Lineage: upsert_studio_location 00697 → 00716 → 00856.
-- Private homes remain studio-visible (V26); no studio_locations RLS change.
-- Planned destinations never write purchase_orders or its sent ship-to paper.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.studio_locations
  ADD COLUMN IF NOT EXISTS is_private_home boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.studio_locations.is_private_home IS
  'A private-home marker, not an access restriction. Visible across the studio (V26).';

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
  IF p_org IS NULL OR NOT public.is_active_org_member(p_org) THEN
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
    ('isDefaultReceiver', 'is_default_receiver'),
    ('isPrivateHome', 'is_private_home')
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
  v_new.is_private_home := COALESCE(v_new.is_private_home, false);

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
      receiving_fee_cents_piece, instructions, is_default_receiver, is_private_home, created_by, updated_by
    )
    VALUES (
      p_org, v_new.kind, v_new.studio_contact_id, v_new.label, v_new.address,
      NULLIF(btrim(v_new.receiving_hours), ''), v_new.has_dock, v_new.needs_liftgate,
      v_new.storage_free_days, v_new.storage_rate_cents_month, v_new.receiving_fee_cents_piece,
      NULLIF(btrim(v_new.instructions), ''), v_new.is_default_receiver, v_new.is_private_home, v_uid, v_uid
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
      is_private_home           = v_new.is_private_home,
      updated_by                = v_uid
    WHERE id = v_id
    RETURNING * INTO v_new;
  END IF;

  RETURN v_new;
END;
$$;

CREATE TABLE IF NOT EXISTS public.project_destination_locations (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.studio_locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (project_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_project_destination_locations_location
  ON public.project_destination_locations(location_id);
COMMENT ON TABLE public.project_destination_locations IS
  'The studio places chosen for this job (P-10). Written through add/remove RPCs; not PO ship-to.';

ALTER TABLE public.project_destination_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_destination_locations_select ON public.project_destination_locations;
CREATE POLICY project_destination_locations_select ON public.project_destination_locations
  FOR SELECT TO authenticated USING (public.can_buy_for_project(project_id));
REVOKE ALL ON TABLE public.project_destination_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_destination_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_destination_locations TO service_role;

-- Keep the same studio boundary as set_purchase_order_ship_to_location,
-- including older projects whose studio is still inferred from the owner.
CREATE OR REPLACE FUNCTION public.validate_project_destination_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_location public.studio_locations%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  SELECT * INTO v_location FROM public.studio_locations WHERE id = NEW.location_id FOR SHARE;
  IF NOT FOUND OR NOT COALESCE(CASE WHEN v_project.studio_id IS NOT NULL
    THEN v_location.organization_id = v_project.studio_id
    ELSE EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = v_location.organization_id
        AND user_id = v_project.designer_id AND status = 'active' AND role <> 'guest'
    ) END, false) THEN
    RAISE EXCEPTION 'project destination: location is not in this project''s studio'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_location.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'project destination: location is archived'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_project_destination_location() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_project_destination_location ON public.project_destination_locations;
CREATE TRIGGER validate_project_destination_location
  BEFORE INSERT OR UPDATE ON public.project_destination_locations
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_destination_location();

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS planned_destination_location_id uuid
    REFERENCES public.studio_locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_ffe_items_planned_destination
  ON public.project_ffe_items(planned_destination_location_id)
  WHERE planned_destination_location_id IS NOT NULL;
-- The FK protects other FF&E writers too. Removing a job place clears only
-- planned intent, never the line's project or a PO's printed destination.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_ffe_items'::regclass
      AND conname = 'project_ffe_items_planned_job_destination_fk') THEN
    ALTER TABLE public.project_ffe_items
      ADD CONSTRAINT project_ffe_items_planned_job_destination_fk
      FOREIGN KEY (project_id, planned_destination_location_id)
      REFERENCES public.project_destination_locations(project_id, location_id)
      ON DELETE SET NULL (planned_destination_location_id);
  END IF;
END $$;
COMMENT ON COLUMN public.project_ffe_items.planned_destination_location_id IS
  'Planned intent only, chosen from this job''s destinations. Never changes a PO ship-to (F-05).';

CREATE OR REPLACE FUNCTION public.add_project_destination_location(p_project_id uuid, p_location_id uuid)
RETURNS public.project_destination_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_row public.project_destination_locations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_buy_for_project(p_project_id) THEN
    RAISE EXCEPTION 'add_project_destination_location: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  INSERT INTO public.project_destination_locations(project_id, location_id, created_by)
    VALUES (p_project_id, p_location_id, auth.uid())
    ON CONFLICT (project_id, location_id) DO NOTHING
    RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.project_destination_locations
      WHERE project_id = p_project_id AND location_id = p_location_id;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.add_project_destination_location(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_project_destination_location(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_project_destination_location(p_project_id uuid, p_location_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_buy_for_project(p_project_id) THEN
    RAISE EXCEPTION 'remove_project_destination_location: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  DELETE FROM public.project_destination_locations
    WHERE project_id = p_project_id AND location_id = p_location_id;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_project_destination_location(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_project_destination_location(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_project_ffe_planned_destination(p_ffe_item_id uuid, p_location_id uuid)
RETURNS public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_project_id uuid;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_buy_for_project(v_item.project_id) THEN
    RAISE EXCEPTION 'set_project_ffe_planned_destination: line not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_project_id := v_item.project_id;
  PERFORM 1 FROM public.projects WHERE id = v_project_id FOR UPDATE;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.project_id IS DISTINCT FROM v_project_id THEN
    RAISE EXCEPTION 'set_project_ffe_planned_destination: line moved or was removed; reload it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_destination_locations destination
      JOIN public.studio_locations location ON location.id = destination.location_id
    WHERE destination.project_id = v_item.project_id
      AND destination.location_id = p_location_id AND location.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'set_project_ffe_planned_destination: location must be an active job place'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.project_ffe_items SET planned_destination_location_id = p_location_id
    WHERE id = p_ffe_item_id RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;
REVOKE ALL ON FUNCTION public.set_project_ffe_planned_destination(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_ffe_planned_destination(uuid, uuid) TO authenticated;

COMMIT;
