-- 00876 — C5 external presence safety and item concurrency authority.
-- Builds on 00875 external fulfilments and the native FF&E pricing writers.
-- Ruling #198: spec versions are optional overlays, not item edit authority.
-- This checkpoint adds package assignment and binding integrity to the native
-- item-version seam. Conversion and commercial writer guards remain required
-- before submission; no mutation RPC is activated here.
ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public._ffe_bump_item_row_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._ffe_bump_item_row_version() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS zzzz_ffe_item_row_version_trg ON public.project_ffe_items;
CREATE TRIGGER zzzz_ffe_item_row_version_trg
  BEFORE UPDATE ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public._ffe_bump_item_row_version();

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS scope_package_key text,
  ADD COLUMN IF NOT EXISTS external_fulfilment_id uuid
    REFERENCES public.project_external_fulfilments(id) ON DELETE RESTRICT;
ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_scope_package_key_check,
  DROP CONSTRAINT IF EXISTS project_ffe_items_single_provenance_check,
  DROP CONSTRAINT IF EXISTS project_ffe_items_external_unpriced_check;
ALTER TABLE public.project_ffe_items
  ADD CONSTRAINT project_ffe_items_scope_package_key_check
    CHECK (scope_package_key ~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  ADD CONSTRAINT project_ffe_items_single_provenance_check CHECK (
    NOT (trade_scope_document_id IS NOT NULL AND
      (source_commercial_document_id IS NOT NULL OR source_authorization_item_id IS NOT NULL))
    AND NOT (external_fulfilment_id IS NOT NULL AND
      (trade_scope_document_id IS NOT NULL OR source_commercial_document_id IS NOT NULL
       OR source_authorization_item_id IS NOT NULL))),
  ADD CONSTRAINT project_ffe_items_external_unpriced_check CHECK (
    external_fulfilment_id IS NULL OR
    (COALESCE(unit_price_cents,0)=0 AND COALESCE(line_total_cents,0)=0
     AND purchase_order_id IS NULL AND scope_package_key IS NOT NULL));
CREATE INDEX IF NOT EXISTS project_ffe_items_external_fulfilment_idx
  ON public.project_ffe_items(external_fulfilment_id) WHERE external_fulfilment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_ffe_scope_assignment_receipts (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  client_request_id text NOT NULL CHECK (length(btrim(client_request_id))>0),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id,client_request_id)
);
ALTER TABLE public.project_ffe_scope_assignment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_ffe_scope_assignment_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Invoker trigger: a caller-set GUC is not authority. Only the revoked definer
-- writer's actual execution owner can cross this boundary with its marker.
CREATE OR REPLACE FUNCTION public._ffe_guard_scope_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE changed boolean; writer boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.external_fulfilment_id IS NOT NULL THEN
      RAISE EXCEPTION 'external_presence_delete_refused' USING ERRCODE='check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    changed:=NEW.scope_package_key IS NOT NULL OR NEW.external_fulfilment_id IS NOT NULL;
  ELSE
    changed:=NEW.scope_package_key IS DISTINCT FROM OLD.scope_package_key
      OR NEW.external_fulfilment_id IS DISTINCT FROM OLD.external_fulfilment_id
      OR (NEW.project_id IS DISTINCT FROM OLD.project_id
          AND (NEW.scope_package_key IS NOT NULL OR OLD.scope_package_key IS NOT NULL
               OR NEW.external_fulfilment_id IS NOT NULL OR OLD.external_fulfilment_id IS NOT NULL));
  END IF;
  writer:=COALESCE(current_setting('patina.ffe_scope_binding_writer',true),'')='00876'
    AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc
      WHERE oid='public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text)'::regprocedure));
  IF changed AND NOT writer THEN
    RAISE EXCEPTION 'ffe_scope_binding_rpc_required' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NEW.external_fulfilment_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.project_external_fulfilments f
      WHERE f.id=NEW.external_fulfilment_id AND f.project_id=NEW.project_id
        AND f.package_key=NEW.scope_package_key) THEN
      RAISE EXCEPTION 'external_presence_binding_mismatch' USING ERRCODE='check_violation';
    END IF;
    IF NEW.status='installed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      RAISE EXCEPTION 'external_presence_verified_install_required' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._ffe_guard_scope_binding() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS zzzy_ffe_scope_binding_trg ON public.project_ffe_items;
CREATE TRIGGER zzzy_ffe_scope_binding_trg BEFORE INSERT OR UPDATE OR DELETE
  ON public.project_ffe_items FOR EACH ROW EXECUTE FUNCTION public._ffe_guard_scope_binding();

CREATE OR REPLACE FUNCTION public._ffe_scope_assignment_receipt_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='INSERT'
     AND COALESCE(current_setting('patina.ffe_scope_binding_writer',true),'')='00876'
     AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc
       WHERE oid='public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text)'::regprocedure)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'scope_assignment_receipt_immutable' USING ERRCODE='check_violation';
END $$;
REVOKE ALL ON FUNCTION public._ffe_scope_assignment_receipt_guard() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS ffe_scope_assignment_receipt_guard ON public.project_ffe_scope_assignment_receipts;
CREATE TRIGGER ffe_scope_assignment_receipt_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.project_ffe_scope_assignment_receipts FOR EACH ROW
  EXECUTE FUNCTION public._ffe_scope_assignment_receipt_guard();

CREATE OR REPLACE FUNCTION public.assign_ffe_items_to_scope_package(
  p_project_id uuid,p_item_ids uuid[],p_package_key text,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  receipt public.project_ffe_scope_assignment_receipts%ROWTYPE;
  v_edition_id uuid; matched integer; h text; result jsonb;
  marker text:=current_setting('patina.ffe_scope_binding_writer',true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  PERFORM public._external_assert_access(p_project_id);
  IF p_client_request_id IS NULL OR length(btrim(p_client_request_id))=0 THEN
    RAISE EXCEPTION 'scope_assignment_request_required' USING ERRCODE='check_violation';
  END IF;
  h:=encode(extensions.digest(jsonb_build_array(p_project_id,p_item_ids,p_package_key)::text,'sha256'),'hex');
  PERFORM public._ffe_lock_job_labels(p_project_id);
  SELECT * INTO receipt FROM public.project_ffe_scope_assignment_receipts
    WHERE project_id=p_project_id AND client_request_id=p_client_request_id;
  IF FOUND THEN
    PERFORM public._external_assert_replay(p_project_id,receipt.requested_by,h,receipt.request_hash);
    RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT id INTO v_edition_id FROM public.project_scope_editions
    WHERE project_id=p_project_id AND status='active' FOR SHARE;
  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_scope_edition_packages
    WHERE edition_id=v_edition_id
      AND package_key=p_package_key) THEN
    RAISE EXCEPTION 'package_key_not_in_edition' USING ERRCODE='check_violation';
  END IF;
  PERFORM 1 FROM public.project_ffe_items WHERE project_id=p_project_id AND id=ANY(p_item_ids)
    ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS matched=ROW_COUNT;
  IF p_item_ids IS NULL OR cardinality(p_item_ids)=0 OR array_ndims(p_item_ids)<>1
     OR matched<>cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'scope_assignment_item_off_project' USING ERRCODE='check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_items
    WHERE id=ANY(p_item_ids) AND external_fulfilment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'scope_assignment_external_line' USING ERRCODE='check_violation';
  END IF;
  PERFORM set_config('patina.ffe_scope_binding_writer','00876',true);
  UPDATE public.project_ffe_items SET scope_package_key=p_package_key
    WHERE project_id=p_project_id AND id=ANY(p_item_ids);
  result:=jsonb_build_object('projectId',p_project_id,'itemIds',p_item_ids,'packageKey',p_package_key,'replayed',false);
  INSERT INTO public.project_ffe_scope_assignment_receipts(project_id,client_request_id,requested_by,request_hash,result)
    VALUES(p_project_id,p_client_request_id,auth.uid(),h,result);
  PERFORM set_config('patina.ffe_scope_binding_writer',COALESCE(marker,''),true);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text) FROM PUBLIC,anon,authenticated,service_role;
