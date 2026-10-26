-- 00876 — C5 external presence safety and item concurrency authority.
-- Builds on 00875 external fulfilments and the native FF&E pricing writers.
-- Ruling #198: spec versions are optional overlays, not item edit authority.
-- Adds assignment, immutable conversion receipts (ruling #206), native pricing
-- preservation, cancellation, restore and verified-install safety. Commercial
-- writer grafts below preserve their native bodies. Bounded monetary census is
-- retained in verification/SQ-2069/resume7-monetary-census.json; reader parity is
-- SQ-2127. The N harness awaits the W3-exit committed-state DB window.
-- No mutation RPC is activated here. Native graft lineage: pricing lock 00809;
-- restore 00808 via shared binding trigger; record/verify external events 00875.
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
  IF TG_OP='UPDATE' AND OLD.external_fulfilment_id IS NOT NULL
    AND public._ffe_external_pricing_snapshot(NEW) IS DISTINCT FROM public._ffe_external_pricing_snapshot(OLD)
    AND NOT (COALESCE(current_setting('patina.ffe_external_conversion_writer',true),'')='00876'
      AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc
        WHERE oid='public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text)'::regprocedure))) THEN
    RAISE EXCEPTION 'external_presence_pricing_frozen' USING ERRCODE='check_violation';
  END IF;
  IF NEW.external_fulfilment_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.project_external_fulfilments f
      WHERE f.id=NEW.external_fulfilment_id AND f.project_id=NEW.project_id
        AND f.package_key=NEW.scope_package_key) THEN
      RAISE EXCEPTION 'external_presence_binding_mismatch' USING ERRCODE='check_violation';
    END IF;
    -- Native restore (00808) holds the job-label lock before item locks, as do
    -- cancellation and edition writers. Recheck responsibility without reversing
    -- that lock order; archiving remains an exit act and keeps its native policy.
    IF TG_OP='UPDATE' AND OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL THEN
      IF current_user<>pg_get_userbyid((SELECT proowner FROM pg_proc
        WHERE oid='public.restore_project_selection(uuid)'::regprocedure))
        OR COALESCE(current_setting('app.ffe_mutation_rpc',true),'')<>'on' THEN
        RAISE EXCEPTION 'external_presence_restore_rpc_required' USING ERRCODE='insufficient_privilege';
      END IF;
      PERFORM public._assert_scope_composition_enabled();
      PERFORM public._external_assert_access(NEW.project_id);
      PERFORM public._external_assert_active(NEW.project_id,NEW.scope_package_key);
      IF EXISTS(SELECT 1 FROM public.project_external_fulfilments f
        WHERE f.id=NEW.external_fulfilment_id AND f.status='cancelled') THEN
        RAISE EXCEPTION 'external_presence_cancelled_restore_refused' USING ERRCODE='check_violation';
      END IF;
    END IF;
    IF NEW.status='installed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
      AND NOT (current_user=pg_get_userbyid((SELECT proowner FROM pg_proc
        WHERE oid='public.verify_external_fulfilment_event(uuid,text)'::regprocedure))
        AND EXISTS(SELECT 1 FROM public.project_external_fulfilment_events e
          WHERE e.id::text=COALESCE(current_setting('patina.external_install_event',true),'')
            AND e.fulfilment_id=NEW.external_fulfilment_id AND e.event_kind='installed'
            AND e.evidence_level='verified' AND e.verified_by=auth.uid())) THEN
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

-- Ruling #206: a studio estimate is per-line history, never the externally
-- reported contract amount. Native 00809 owns these pricing fields and derives
-- markup from the final cents in zzz_ffe_markup_truth_trg.
CREATE OR REPLACE FUNCTION public._ffe_external_pricing_snapshot(p_item public.project_ffe_items)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT jsonb_build_object('unit_price_cents',p_item.unit_price_cents,
  'line_total_cents',p_item.line_total_cents,'quantity',p_item.quantity,
  'trade_price_cents',p_item.trade_price_cents,'retail_unit_cents',p_item.retail_unit_cents,
  'markup_percent',p_item.markup_percent,'price_basis',p_item.price_basis,
  'pending_cost_prev_cents',p_item.pending_cost_prev_cents,
  'pending_cost_changed_at',p_item.pending_cost_changed_at,
  'pending_markup_held_percent',p_item.pending_markup_held_percent,
  'currency',p_item.currency,'line_kind',p_item.line_kind);
$$;
REVOKE ALL ON FUNCTION public._ffe_external_pricing_snapshot(public.project_ffe_items) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.project_ffe_external_conversion_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
 fulfilment_id uuid NOT NULL REFERENCES public.project_external_fulfilments(id) ON DELETE RESTRICT,
 client_request_id text NOT NULL CHECK(length(btrim(client_request_id))>0),
 requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 request_hash text NOT NULL,
 direction text NOT NULL CHECK(direction IN ('external','studio')),
 row_version bigint NOT NULL,
 pricing_snapshot jsonb NOT NULL,
 conversion_receipt_id uuid REFERENCES public.project_ffe_external_conversion_receipts(id) ON DELETE RESTRICT,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,client_request_id),
 CHECK((direction='studio')=(conversion_receipt_id IS NOT NULL))
);
ALTER TABLE public.project_ffe_external_conversion_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_ffe_external_conversion_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public._ffe_external_conversion_receipt_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='INSERT'
  AND COALESCE(current_setting('patina.ffe_external_conversion_writer',true),'')='00876'
  AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc
   WHERE oid='public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text)'::regprocedure)) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'external_conversion_receipt_immutable' USING ERRCODE='check_violation';
END $$;
REVOKE ALL ON FUNCTION public._ffe_external_conversion_receipt_guard() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS ffe_external_conversion_receipt_guard ON public.project_ffe_external_conversion_receipts;
CREATE TRIGGER ffe_external_conversion_receipt_guard BEFORE INSERT OR UPDATE OR DELETE
 ON public.project_ffe_external_conversion_receipts FOR EACH ROW
 EXECUTE FUNCTION public._ffe_external_conversion_receipt_guard();

CREATE OR REPLACE FUNCTION public.set_ffe_item_external_fulfilment(
 p_item_id uuid,p_fulfilment_id uuid,p_row_version bigint,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 old_item public.project_ffe_items%ROWTYPE; new_item public.project_ffe_items%ROWTYPE;
 f public.project_external_fulfilments%ROWTYPE;
 receipt public.project_ffe_external_conversion_receipts%ROWTYPE;
 original public.project_ffe_external_conversion_receipts%ROWTYPE;
 project uuid; old_fid uuid; h text; snapshot jsonb; restored public.project_ffe_items%ROWTYPE;
 receipt_id uuid:=gen_random_uuid(); result jsonb; refusal text;
 binding_marker text:=current_setting('patina.ffe_scope_binding_writer',true);
 conversion_marker text:=current_setting('patina.ffe_external_conversion_writer',true);
 pricing_marker text:=current_setting('app.ffe_pricing_writer',true);
 mutation_marker text:=current_setting('app.ffe_mutation_rpc',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 SELECT project_id,external_fulfilment_id INTO project,old_fid FROM public.project_ffe_items WHERE id=p_item_id;
 PERFORM public._external_assert_access(project);
 IF p_client_request_id IS NULL OR length(btrim(p_client_request_id))=0 THEN
  RAISE EXCEPTION 'external_conversion_request_required' USING ERRCODE='check_violation';
 END IF;
 PERFORM 1 FROM public.projects WHERE id=project FOR UPDATE;
 PERFORM public._ffe_lock_job_labels(project);
 h:=encode(extensions.digest(jsonb_build_array(p_item_id,p_fulfilment_id,p_row_version)::text,'sha256'),'hex');
 SELECT * INTO receipt FROM public.project_ffe_external_conversion_receipts
  WHERE project_id=project AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(project,receipt.requested_by,h,receipt.request_hash);
  RETURN receipt.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_fulfilment_id IS NULL AND old_fid IS NULL THEN
  RAISE EXCEPTION 'external_conversion_not_bound' USING ERRCODE='check_violation';
 END IF;
 -- This helper takes the active/latest edition before the fulfilment. The
 -- locked item is re-read afterward; an intervening move never changes tenant.
 f:=public._external_lock(COALESCE(p_fulfilment_id,old_fid));
 IF f.project_id IS DISTINCT FROM project THEN
  RAISE EXCEPTION 'external_presence_binding_mismatch' USING ERRCODE='check_violation';
 END IF;
 SELECT * INTO STRICT old_item FROM public.project_ffe_items WHERE id=p_item_id FOR UPDATE;
 IF old_item.project_id IS DISTINCT FROM project OR old_item.external_fulfilment_id IS DISTINCT FROM old_fid THEN
  RAISE EXCEPTION 'external_conversion_item_changed' USING ERRCODE='serialization_failure';
 END IF;
 IF p_row_version IS DISTINCT FROM old_item.row_version THEN
  RAISE EXCEPTION 'external_conversion_version_conflict' USING ERRCODE='serialization_failure';
 END IF;
 IF p_fulfilment_id IS NOT NULL THEN
  IF old_fid IS NOT NULL THEN
   RAISE EXCEPTION 'external_conversion_requires_reverse' USING ERRCODE='check_violation';
  END IF;
  PERFORM public._external_assert_active(project,f.package_key);
  IF f.status IN ('cancelled','installed') THEN
   RAISE EXCEPTION 'fulfilment_terminal' USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  refusal:=public._ffe_pricing_lock_reason(old_item);
  IF refusal IS NOT NULL THEN RAISE EXCEPTION '%',refusal USING ERRCODE='check_violation'; END IF;
  IF EXISTS(SELECT 1 FROM public.studio_purchases WHERE ffe_item_id=p_item_id AND status IN ('recorded','billed')) THEN
   RAISE EXCEPTION 'external_conversion_studio_purchase_live' USING ERRCODE='check_violation';
  END IF;
  IF old_item.source_commercial_document_id IS NOT NULL OR old_item.source_authorization_item_id IS NOT NULL
    OR old_item.status='installed' THEN
   RAISE EXCEPTION 'external_conversion_committed_line' USING ERRCODE='check_violation';
  END IF;
  snapshot:=public._ffe_external_pricing_snapshot(old_item);
 ELSE
  -- Reversal is an exit act: no active-edition or rail check, but any reported
  -- contract (not only a verified one) permanently closes this route.
  IF EXISTS(SELECT 1 FROM public.project_external_fulfilment_events
   WHERE fulfilment_id=f.id AND event_kind='contract_reported') THEN
   RAISE EXCEPTION 'external_conversion_contract_reported' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO original FROM public.project_ffe_external_conversion_receipts
   WHERE item_id=p_item_id AND fulfilment_id=f.id AND direction='external'
   ORDER BY row_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'external_conversion_snapshot_required' USING ERRCODE='check_violation'; END IF;
  snapshot:=original.pricing_snapshot;
  restored:=jsonb_populate_record(NULL::public.project_ffe_items,snapshot);
 END IF;
 PERFORM set_config('patina.ffe_scope_binding_writer','00876',true);
 PERFORM set_config('patina.ffe_external_conversion_writer','00876',true);
 PERFORM set_config('app.ffe_mutation_rpc','on',true);
 PERFORM set_config('app.ffe_pricing_writer','on',true);
 IF p_fulfilment_id IS NOT NULL THEN
  UPDATE public.project_ffe_items SET external_fulfilment_id=f.id,scope_package_key=f.package_key,
   unit_price_cents=0,line_total_cents=0,trade_price_cents=NULL,retail_unit_cents=NULL,
   price_basis=NULL,pending_cost_prev_cents=NULL,pending_cost_changed_at=NULL,pending_markup_held_percent=NULL
   WHERE id=p_item_id RETURNING * INTO new_item;
 ELSE
  UPDATE public.project_ffe_items SET external_fulfilment_id=NULL,
   unit_price_cents=restored.unit_price_cents,line_total_cents=restored.line_total_cents,
   quantity=restored.quantity,trade_price_cents=restored.trade_price_cents,retail_unit_cents=restored.retail_unit_cents,
   price_basis=restored.price_basis,pending_cost_prev_cents=restored.pending_cost_prev_cents,
   pending_cost_changed_at=restored.pending_cost_changed_at,pending_markup_held_percent=restored.pending_markup_held_percent,
   currency=restored.currency,line_kind=restored.line_kind
   WHERE id=p_item_id RETURNING * INTO new_item;
  IF public._ffe_external_pricing_snapshot(new_item) IS DISTINCT FROM snapshot THEN
   RAISE EXCEPTION 'external_conversion_restore_mismatch' USING ERRCODE='check_violation';
  END IF;
 END IF;
 result:=jsonb_build_object('receiptId',receipt_id,'itemId',p_item_id,'fulfilmentId',f.id,
  'direction',CASE WHEN p_fulfilment_id IS NULL THEN 'studio' ELSE 'external' END,
  'rowVersion',new_item.row_version,'priorRowVersion',old_item.row_version,
  'pricingSnapshot',snapshot,'replayed',false);
 INSERT INTO public.project_ffe_external_conversion_receipts(id,project_id,item_id,fulfilment_id,client_request_id,
  requested_by,request_hash,direction,row_version,pricing_snapshot,conversion_receipt_id,result)
 VALUES(receipt_id,project,p_item_id,f.id,p_client_request_id,auth.uid(),h,result->>'direction',
  old_item.row_version,snapshot,original.id,result);
 PERFORM public._ffe_pricing_audit('ffe_external_conversion:'||(result->>'direction'),old_item,new_item);
 PERFORM set_config('app.ffe_pricing_writer',COALESCE(pricing_marker,''),true);
 PERFORM set_config('app.ffe_mutation_rpc',COALESCE(mutation_marker,''),true);
 PERFORM set_config('patina.ffe_external_conversion_writer',COALESCE(conversion_marker,''),true);
 PERFORM set_config('patina.ffe_scope_binding_writer',COALESCE(binding_marker,''),true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;

-- Native 00809 body, unchanged except the external refusal before studio pricing.
CREATE OR REPLACE FUNCTION public._ffe_pricing_lock_reason(p_item public.project_ffe_items)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_item.external_fulfilment_id IS NOT NULL THEN 'External presence lines are not studio commerce.'
    WHEN p_item.removed_at IS NOT NULL THEN 'This line was removed.'
    WHEN p_item.design_disposition = 'superseded'
      THEN 'This line was replaced. Price the line that replaced it.'
    WHEN p_item.line_kind = 'labor' THEN 'Labor lines are priced with the labor price.'
    WHEN p_item.trade_scope_document_id IS NOT NULL THEN 'Trade scope lines change through their scope.'
    WHEN p_item.purchase_order_id IS NOT NULL OR EXISTS (
      SELECT 1
      FROM public.furnishing_authorization_items AS auth_item
      JOIN public.project_commercial_documents AS document ON document.id = auth_item.commercial_document_id
      JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
      WHERE (auth_item.source_ffe_item_id = p_item.id OR auth_item.id = p_item.source_authorization_item_id)
        AND proposal.commercial_state IN ('sent', 'client_signed', 'executed')
    ) THEN 'Released lines change through Record a change.'
    WHEN EXISTS (
      SELECT 1
      FROM public.furnishing_authorization_items AS auth_item
      JOIN public.project_commercial_documents AS document ON document.id = auth_item.commercial_document_id
      JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
      WHERE auth_item.source_ffe_item_id = p_item.id
        AND COALESCE(proposal.commercial_state, 'draft') = 'draft'
    ) THEN 'This line is on a drafted release. Send it or void the draft first.'
    WHEN EXISTS (
      SELECT 1 FROM public.invoice_line_items AS invoice_line
      WHERE invoice_line.ffe_item_id = p_item.id
    ) THEN 'This line is invoiced, so its price stays as billed.'
    WHEN EXISTS (
      SELECT 1 FROM public.project_ffe_specs AS spec
      WHERE spec.ffe_item_id = p_item.id
        AND spec.configuration_id IS NOT NULL
        AND spec.configuration_locked_at IS NOT NULL
    ) THEN 'This configured line is locked. Change it through a configuration revision.'
  END;
$$;

-- Native 00875 event bodies, preserving replay/access/rail and immutable ledger semantics.
CREATE OR REPLACE FUNCTION public.record_external_fulfilment_event(
 p_fulfilment_id uuid,p_event_kind text,p_evidence jsonb,p_affected_units text[],p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 held public.project_external_fulfilment_events%ROWTYPE; h text; seq bigint; s text;
 marker text:=current_setting('patina.external_writer',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 f:=public._external_lock(p_fulfilment_id);
 h:=encode(extensions.digest(jsonb_build_array(p_event_kind,p_evidence,p_affected_units)::text,'sha256'),'hex');
 SELECT * INTO e FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(f.project_id,e.recorded_by,h,e.request_hash);
  RETURN jsonb_build_object('eventId',e.id,'status',f.status,'evidenceLevel',e.evidence_level,'replayed',true);
 END IF;
 IF p_event_kind='fabrication_instruction' THEN RAISE EXCEPTION 'fabrication_instruction_not_active' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF p_event_kind='package_issued' THEN RAISE EXCEPTION 'package_issue_owner_required' USING ERRCODE='insufficient_privilege'; END IF;
 IF f.status IN ('installed','cancelled') THEN RAISE EXCEPTION 'fulfilment_terminal' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NOT (p_event_kind='cancelled' AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND event_kind='contract_reported')) THEN
  PERFORM public._external_assert_active(f.project_id,f.package_key);
 END IF;
 IF p_event_kind='cancelled' AND EXISTS(SELECT 1 FROM public.project_ffe_items
  WHERE external_fulfilment_id=f.id AND removed_at IS NULL) THEN
  RAISE EXCEPTION 'fulfilment_cancel_lines_live' USING ERRCODE='check_violation';
 END IF;
 IF p_event_kind='hold' THEN
  IF NOT public._external_units_valid(p_affected_units) OR NOT p_affected_units<@f.units THEN
   RAISE EXCEPTION 'fulfilment_units_invalid' USING ERRCODE='check_violation'; END IF;
 ELSIF p_affected_units IS NOT NULL THEN RAISE EXCEPTION 'fulfilment_units_invalid' USING ERRCODE='check_violation'; END IF;
 IF p_event_kind='release_hold' THEN
  SELECT * INTO held FROM public.project_external_fulfilment_events WHERE id=(p_evidence->>'releasesEventId')::uuid
   AND fulfilment_id=f.id AND event_kind='hold';
  IF held.id IS NULL OR EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE releases_event_id=held.id) THEN
   RAISE EXCEPTION 'fulfilment_hold_not_open' USING ERRCODE='check_violation'; END IF;
  -- Until C4 supplies broader approval authorities, only a bound, approved
  -- submittal explicitly named by this hold can release it.
  PERFORM 1 FROM public.client_decisions WHERE id=(held.evidence->>'decisionId')::uuid AND project_id=f.project_id FOR SHARE;
  IF p_evidence->>'decisionId' IS DISTINCT FROM held.evidence->>'decisionId'
    OR NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_evidence_bindings b JOIN public.coordination_item_revisions r ON r.decision_id=b.decision_id
     WHERE b.fulfilment_id=f.id AND b.decision_id=(held.evidence->>'decisionId')::uuid AND r.status='approved' AND held.affected_units<@b.units) THEN
   RAISE EXCEPTION 'fulfilment_hold_evidence_required' USING ERRCODE='check_violation'; END IF;
 END IF;
 SELECT COALESCE(max(event_seq),0)+1 INTO seq FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id;
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilment_events(fulfilment_id,event_kind,evidence,affected_units,releases_event_id,recorded_by,event_seq,client_request_id,request_hash)
 VALUES(f.id,p_event_kind,p_evidence,p_affected_units,held.id,auth.uid(),seq,p_client_request_id,h) RETURNING * INTO e;
 s:=public._external_refresh_status(f.id);
 PERFORM set_config('patina.external_writer',COALESCE(marker,''),true);
 RETURN jsonb_build_object('eventId',e.id,'status',s,'evidenceLevel',e.evidence_level,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.verify_external_fulfilment_event(p_event_id uuid,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 receipt public.project_external_fulfilment_verifications%ROWTYPE; fid uuid; seq bigint; s text;
 marker text:=current_setting('patina.external_verifier',true); writer text:=current_setting('patina.external_writer',true);
 install_marker text:=current_setting('patina.external_install_event',true);
 mutation_marker text:=current_setting('app.ffe_mutation_rpc',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 SELECT fulfilment_id INTO fid FROM public.project_external_fulfilment_events WHERE id=p_event_id;
 f:=public._external_lock(fid);
 SELECT * INTO receipt FROM public.project_external_fulfilment_verifications WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(f.project_id,receipt.verified_by,p_event_id::text,receipt.request_hash);
  RETURN jsonb_build_object('eventId',p_event_id,'status',f.status,'evidenceLevel','verified','replayed',true);
 END IF;
 PERFORM public._external_assert_active(f.project_id,f.package_key);
 -- The fulfilment lock serializes binding changes; item locks precede the
 -- target event lock, including when a transaction began before the reporter.
 IF EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE id=p_event_id AND event_kind='installed') THEN
  PERFORM 1 FROM public.project_ffe_items WHERE external_fulfilment_id=f.id ORDER BY id FOR UPDATE;
 END IF;
 SELECT * INTO STRICT e FROM public.project_external_fulfilment_events WHERE id=p_event_id FOR UPDATE;
 IF e.event_kind='cancelled' AND EXISTS(SELECT 1 FROM public.project_ffe_items WHERE external_fulfilment_id=f.id AND removed_at IS NULL) THEN
  RAISE EXCEPTION 'fulfilment_cancel_lines_live' USING ERRCODE='check_violation';
 END IF;
 IF e.event_kind='fabrication_instruction' THEN RAISE EXCEPTION 'fabrication_instruction_not_verifiable' USING ERRCODE='check_violation'; END IF;
 IF e.evidence_level='verified' THEN RAISE EXCEPTION 'fulfilment_event_already_verified' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF auth.uid()=e.recorded_by OR NOT EXISTS(SELECT 1 FROM public.organization_members m
   WHERE m.organization_id=public.project_recorded_studio(f.project_id) AND m.user_id=auth.uid() AND m.status='active' AND m.role IN ('owner','admin')) THEN
  RAISE EXCEPTION 'fulfilment_verifier_required' USING ERRCODE='insufficient_privilege'; END IF;
 SELECT COALESCE(max(verification_seq),0)+1 INTO seq FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id;
 PERFORM set_config('patina.external_verifier','00875',true);
 UPDATE public.project_external_fulfilment_events SET evidence_level='verified',verified_by=auth.uid(),verified_at=now(),verification_seq=seq WHERE id=e.id;
 PERFORM set_config('patina.external_verifier',COALESCE(marker,''),true);
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilment_verifications(event_id,fulfilment_id,client_request_id,request_hash,verified_by)
 VALUES(e.id,f.id,p_client_request_id,p_event_id::text,auth.uid());
 IF e.event_kind='installed' THEN
  PERFORM set_config('patina.external_install_event',e.id::text,true);
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET status='installed'
   WHERE external_fulfilment_id=f.id AND removed_at IS NULL AND status IS DISTINCT FROM 'installed';
  PERFORM set_config('app.ffe_mutation_rpc',COALESCE(mutation_marker,''),true);
  PERFORM set_config('patina.external_install_event',COALESCE(install_marker,''),true);
 END IF;
 s:=public._external_refresh_status(f.id);
 PERFORM set_config('patina.external_writer',COALESCE(writer,''),true);
 RETURN jsonb_build_object('eventId',e.id,'status',s,'evidenceLevel','verified','replayed',false);
END $$;

-- Purchasing safety: external presence never creates studio payables.
-- Native guard_project_ffe_purchase_authority lineage: 00412 → 00422 → 00423 → 00578 → 00835.
-- The existing item lock/row trigger serializes this refusal with conversion.
CREATE OR REPLACE FUNCTION public.guard_project_ffe_purchase_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.project_commercial_documents%ROWTYPE;
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_commercial_document_id IS NOT NULL AND (
      NEW.source_commercial_document_id IS DISTINCT FROM OLD.source_commercial_document_id
      OR NEW.source_authorization_item_id IS DISTINCT FROM OLD.source_authorization_item_id
    ) THEN
      RAISE EXCEPTION 'furnishing authorization provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423 (a)
    IF OLD.trade_scope_document_id IS NOT NULL
       AND NEW.trade_scope_document_id IS DISTINCT FROM OLD.trade_scope_document_id
    THEN
      RAISE EXCEPTION 'trade scope provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.external_fulfilment_id IS NOT NULL AND NEW.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'external_presence_purchase_order_refused'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00423 (b) — evaluated on INSERT and UPDATE alike, before any early return.
  IF NEW.trade_scope_document_id IS NOT NULL AND NEW.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'trade scope lines are not purchase-orderable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
    RETURN NEW;
  END IF;
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Legacy-origin projects retain the existing 00186 behavior.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.project_external_agreement_evidence e
    WHERE e.project_id = NEW.project_id
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.source_commercial_document_id
    AND project_id = NEW.project_id
    AND document_kind = 'furnishings_authorization';
  SELECT * INTO v_snapshot FROM public.furnishing_authorization_items
  WHERE id = NEW.source_authorization_item_id
    AND commercial_document_id = v_document.id;
  IF v_document.id IS NULL OR v_snapshot.id IS NULL
     OR v_document.executed_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.proposals p WHERE p.id = v_document.proposal_id
         AND p.commercial_state = 'executed'
     )
  THEN
    RAISE EXCEPTION 'FF&E item is not covered by an executed furnishing authorization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_snapshot.item_type = 'allowance' THEN
    IF NEW.quantity IS DISTINCT FROM v_snapshot.quantity THEN
      RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.line_total_cents IS NULL
       OR NEW.line_total_cents > v_snapshot.client_line_total_cents
       OR NEW.line_total_cents IS DISTINCT FROM
          (NEW.quantity * COALESCE(NEW.unit_price_cents, -1))
    THEN
      RAISE EXCEPTION 'FF&E allowance resolves above its signed ceiling or is internally inconsistent'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.quantity IS DISTINCT FROM v_snapshot.quantity
     OR NEW.unit_price_cents IS DISTINCT FROM v_snapshot.client_unit_price_cents
     OR NEW.line_total_cents IS DISTINCT FROM v_snapshot.client_line_total_cents
  THEN
    RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_document.deposit_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'furnishings deposit invoice must be paid before purchase ordering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Native record_studio_purchase lineage: 00703.
-- The existing item lock/row trigger serializes this refusal with conversion.
CREATE OR REPLACE FUNCTION public.record_studio_purchase(p_request jsonb)
RETURNS public.studio_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys constant text[] := ARRAY['projectId', 'ffeItemId', 'organizationId', 'kind', 'description',
    'payeeName', 'vendorId', 'studioContactId', 'purchasedOn', 'amountCents', 'taxCents',
    'buyerPremiumCents', 'shippingCents', 'currencyCode', 'paymentMethodId', 'paidByMemberId',
    'reimburseMember', 'receiptDocumentPath', 'returnable', 'returnBy', 'billableToClient', 'billingRule'];
  v_number_keys constant text[] := ARRAY['amountCents', 'taxCents', 'buyerPremiumCents', 'shippingCents'];
  v_bool_keys constant text[] := ARRAY['reimburseMember', 'returnable', 'billableToClient'];
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_project_id uuid;
  v_item_id uuid;
  v_org_id uuid;
  v_vendor_id uuid;
  v_contact_id uuid;
  v_pm_id uuid;
  v_member_id uuid;
  v_project public.projects%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_pm public.studio_payment_methods%ROWTYPE;
  v_kind text := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
  v_payee text := NULLIF(btrim(COALESCE(v_req->>'payeeName', '')), '');
  v_description text := NULLIF(btrim(COALESCE(v_req->>'description', '')), '');
  v_receipt text := NULLIF(btrim(COALESCE(v_req->>'receiptDocumentPath', '')), '');
  v_currency text := upper(COALESCE(NULLIF(btrim(COALESCE(v_req->>'currencyCode', '')), ''), 'USD'));
  v_rule text := COALESCE(NULLIF(btrim(COALESCE(v_req->>'billingRule', '')), ''), 'at_cost');
  v_purchased_on date;
  v_return_by date;
  v_amount numeric;
  v_tax numeric;
  v_premium numeric;
  v_shipping numeric;
  v_key text;
  v_row public.studio_purchases%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_studio_purchase: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_studio_purchase: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_studio_purchase: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key = ANY (v_number_keys) THEN 'number'
         WHEN v_key = ANY (v_bool_keys) THEN 'boolean'
         ELSE 'string' END) THEN
      RAISE EXCEPTION 'record_studio_purchase: % has the wrong type', v_key
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  BEGIN
    v_project_id := NULLIF(btrim(COALESCE(v_req->>'projectId', '')), '')::uuid;
    v_item_id := NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '')::uuid;
    v_org_id := NULLIF(btrim(COALESCE(v_req->>'organizationId', '')), '')::uuid;
    v_vendor_id := NULLIF(btrim(COALESCE(v_req->>'vendorId', '')), '')::uuid;
    v_contact_id := NULLIF(btrim(COALESCE(v_req->>'studioContactId', '')), '')::uuid;
    v_pm_id := NULLIF(btrim(COALESCE(v_req->>'paymentMethodId', '')), '')::uuid;
    v_member_id := NULLIF(btrim(COALESCE(v_req->>'paidByMemberId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_studio_purchase: projectId, ffeItemId, organizationId, vendorId, studioContactId, paymentMethodId and paidByMemberId must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_purchased_on := COALESCE(NULLIF(btrim(COALESCE(v_req->>'purchasedOn', '')), '')::date, v_utc_day);
    v_return_by := NULLIF(btrim(COALESCE(v_req->>'returnBy', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_studio_purchase: purchasedOn and returnBy must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;

  -- ── Subject: the line, its project, the studio ──
  IF v_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_studio_purchase: line not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_project_id IS NOT NULL AND v_project_id <> v_item.project_id THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is on another project'
        USING ERRCODE = 'check_violation';
    END IF;
    v_project_id := v_item.project_id;
  END IF;

  IF v_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_project_id;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_project_id) THEN
      RAISE EXCEPTION 'record_studio_purchase: project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_project_id := v_project.id;
    IF v_org_id IS NOT NULL
       AND v_org_id IS DISTINCT FROM COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)) THEN
      RAISE EXCEPTION 'record_studio_purchase: organizationId is not the project''s studio'
        USING ERRCODE = 'check_violation';
    END IF;
    v_org_id := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));
  ELSE
    -- Studio overhead: the named studio, else the caller's only studio.
    IF v_org_id IS NULL THEN
      SELECT CASE WHEN count(DISTINCT organization_id) = 1 THEN (array_agg(organization_id))[1] END
        INTO v_org_id
        FROM public.organization_members
       WHERE user_id = v_uid AND status = 'active' AND role <> 'guest';
      IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'record_studio_purchase: organizationId is required for a purchase without a project'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NOT public.is_active_org_member(v_org_id) THEN
      RAISE EXCEPTION 'record_studio_purchase: studio not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── The FF&E guard (create_purchase_order's line rules) ──
  IF v_item_id IS NOT NULL THEN
    PERFORM public._ffe_require_studio_project(v_project_id);
    IF v_item.removed_at IS NOT NULL OR v_item.design_disposition IS DISTINCT FROM 'selected' THEN
      RAISE EXCEPTION 'record_studio_purchase: only an active selected line can be bought'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.blocked IS TRUE THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is blocked pending a client decision'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.external_fulfilment_id IS NOT NULL THEN
      RAISE EXCEPTION 'external_presence_studio_purchase_refused'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_studio_purchase: trade scope lines are not bought'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.purchase_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is already on a purchase order'
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.ffe_status_rank(v_item.status) >= public.ffe_status_rank('ordered') THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is already %', v_item.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.studio_purchases
       WHERE ffe_item_id = v_item_id AND status IN ('recorded', 'billed')
    ) THEN
      RAISE EXCEPTION 'record_studio_purchase: the line was already bought'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── What, who, how much ──
  IF v_kind IS NULL OR v_kind NOT IN ('card_retail', 'one_off', 'antique_auction', 'expense', 'sample_fee') THEN
    RAISE EXCEPTION 'record_studio_purchase: kind must be card_retail, one_off, antique_auction, expense or sample_fee'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_payee IS NULL OR char_length(v_payee) > 200 THEN
    RAISE EXCEPTION 'record_studio_purchase: payeeName is required (at most 200 characters)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_description) > 500 OR char_length(v_receipt) > 1024 THEN
    RAISE EXCEPTION 'record_studio_purchase: description is at most 500 characters, receiptDocumentPath 1024'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_purchased_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_studio_purchase: purchasedOn % is in the future', v_purchased_on
      USING ERRCODE = 'check_violation';
  END IF;

  v_amount := (v_req->>'amountCents')::numeric;
  v_tax := COALESCE((v_req->>'taxCents')::numeric, 0);
  v_premium := COALESCE((v_req->>'buyerPremiumCents')::numeric, 0);
  v_shipping := COALESCE((v_req->>'shippingCents')::numeric, 0);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'record_studio_purchase: amountCents is required and must be positive'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_tax < 0 OR v_premium < 0 OR v_shipping < 0
     OR v_amount <> trunc(v_amount) OR v_tax <> trunc(v_tax)
     OR v_premium <> trunc(v_premium) OR v_shipping <> trunc(v_shipping)
     OR v_amount + v_tax + v_premium + v_shipping > 2147483647 THEN
    RAISE EXCEPTION 'record_studio_purchase: amounts are whole, non-negative cents'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'record_studio_purchase: currencyCode must be a three-letter code'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_rule NOT IN ('at_cost', 'cost_plus') THEN
    RAISE EXCEPTION 'record_studio_purchase: billingRule must be at_cost or cost_plus'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id) THEN
    RAISE EXCEPTION 'record_studio_purchase: vendor % not found', v_vendor_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.studio_contacts
     WHERE id = v_contact_id AND organization_id IS NOT DISTINCT FROM v_org_id AND v_org_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'record_studio_purchase: studioContactId must be a card in this studio''s rolodex'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_studio_purchase: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_studio_purchase: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_org_id IS NOT NULL AND v_pm.organization_id <> v_org_id THEN
      RAISE EXCEPTION 'record_studio_purchase: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_org_id := COALESCE(v_org_id, v_pm.organization_id);
  END IF;

  IF v_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE id = v_member_id AND organization_id = v_org_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'record_studio_purchase: paidByMemberId must be an active member of the studio'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE((v_req->>'reimburseMember')::boolean, false) AND v_member_id IS NULL THEN
    RAISE EXCEPTION 'record_studio_purchase: reimburseMember needs paidByMemberId'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_return_by IS NOT NULL AND NOT COALESCE((v_req->>'returnable')::boolean, false) THEN
    RAISE EXCEPTION 'record_studio_purchase: returnBy needs returnable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_return_by < v_purchased_on THEN
    RAISE EXCEPTION 'record_studio_purchase: returnBy is before purchasedOn'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.studio_purchases (
    organization_id, project_id, ffe_item_id, kind, description, payee_name, vendor_id,
    studio_contact_id, purchased_on, amount_cents, tax_cents, buyer_premium_cents, shipping_cents,
    currency_code, payment_method_id, paid_by_member_id, reimburse_member, receipt_document_path,
    returnable, return_by, billable_to_client, billing_rule, recorded_by
  ) VALUES (
    v_org_id, v_project_id, v_item_id, v_kind, v_description, v_payee, v_vendor_id,
    v_contact_id, v_purchased_on, v_amount::integer, v_tax::integer, v_premium::integer, v_shipping::integer,
    v_currency, v_pm_id, v_member_id, COALESCE((v_req->>'reimburseMember')::boolean, false), v_receipt,
    COALESCE((v_req->>'returnable')::boolean, false), v_return_by,
    COALESCE((v_req->>'billableToClient')::boolean, true), v_rule, v_uid
  )
  RETURNING * INTO v_row;

  IF v_item_id IS NOT NULL THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
       SET status = 'ordered',
           vendor_name = v_payee,
           updated_at = now()
     WHERE id = v_item_id
       AND public.ffe_status_rank(status) < public.ffe_status_rank('ordered');
  END IF;

  RETURN v_row;
END;
$$;

-- External presence cannot create studio receivables or labor prices.
-- Native invoice slot guard: 00709. Existing signature, ACL and stage-slot rules retained.
CREATE OR REPLACE FUNCTION public.guard_invoice_line_ffe_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_other text;
BEGIN
  IF NEW.ffe_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_line_ffe_slot:' || NEW.ffe_item_id::text, 0));

  -- Keep the source shared-locked until the invoice write commits. Conversion
  -- takes FOR UPDATE and then checks invoice references, so either winner
  -- excludes the other even for a direct line insert or a zero-cent bill.
  PERFORM 1 FROM public.project_ffe_items
    WHERE id = NEW.ffe_item_id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.project_ffe_items
    WHERE id = NEW.ffe_item_id AND external_fulfilment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'external_presence_invoice_refused'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT li.billing_stage INTO v_other
    FROM public.invoice_line_items AS li
   WHERE li.ffe_item_id = NEW.ffe_item_id
     AND li.id <> NEW.id
     AND (li.billing_stage = 'full') <> (NEW.billing_stage = 'full')
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'uniq_invoice_line_items_ffe_item: line % already holds a % slot; bill it in full or as a deposit and balance, not both',
      NEW.ffe_item_id, v_other
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Native labor-price writer: 00737 → 00755 → 00810. Job-label/item lock order retained.
CREATE OR REPLACE FUNCTION public.set_labor_line_price(
  p_ffe_item_id uuid,
  p_unit_price_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_ffe_item_id;
  SELECT * INTO v_item FROM public.project_ffe_items
   WHERE id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);

  IF v_item.external_fulfilment_id IS NOT NULL THEN
    RAISE EXCEPTION 'external_presence_labor_price_refused'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_unit_price_cents IS NULL OR p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'set_labor_line_price: the price is whole cents, 0 or more'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.line_kind IS DISTINCT FROM 'labor' THEN
    RAISE EXCEPTION 'Only a labor line takes a price here.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Released: on a sent, signed or executed authorization (the
  -- ffe_line_authorization check, 00736 → 00705:79), or on a PO.
  IF v_item.purchase_order_id IS NOT NULL
     OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL THEN
    RAISE EXCEPTION 'Released labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00755 (F-B1): a drafted line is frozen on its draft until sent or voided.
  IF EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items a
    JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE a.source_ffe_item_id = v_item.id
      AND COALESCE(p.commercial_state, 'draft') = 'draft'
  ) THEN
    RAISE EXCEPTION 'This line is on a drafted release. Send it or void the draft first.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET unit_price_cents = p_unit_price_cents,
         line_total_cents = quantity * p_unit_price_cents,
         updated_at = now()
   WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'unitPriceCents', v_item.unit_price_cents,
    'lineTotalCents', v_item.line_total_cents
  );
END;
$$;

-- 00876 authorization writer grafts. Native 00835 draft/digital/paper,
-- 00869 commercial send, 00808 labor constructor. Only external refusals
-- and sorted item locking are added; all other native bytes are preserved.

CREATE OR REPLACE FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_ids uuid[];
  v_line public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_room_name text;
  v_price bigint;
  v_subtotal bigint := 0;
  v_deposit numeric;
  v_uncovered text;
  v_labor_ids uuid[];
  v_readiness jsonb;
BEGIN
  -- (1) Shape.
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated author and a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NULL OR array_position(p_ffe_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'furnishings release requires a non-null list of schedule lines'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS s;
  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_deposit_percent IS NOT NULL
     AND (p_deposit_percent < 0 OR p_deposit_percent > 100) THEN
    RAISE EXCEPTION 'furnishings deposit percent must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Project + authoring authority.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (2b) 00733 (D5): labor is released with its piece. A labor line named
  -- without its piece is refused; every active labor line of a named piece
  -- joins the set. Lines of another project fall through to step (5)'s
  -- refusal unchanged.
  IF EXISTS (
    SELECT 1 FROM public.project_ffe_items labor
    WHERE labor.id = ANY (v_ids)
      AND labor.project_id = p_project_id
      AND labor.line_kind = 'labor'
      AND (labor.parent_ffe_item_id IS NULL
           OR NOT (labor.parent_ffe_item_id = ANY (v_ids)))
  ) THEN
    RAISE EXCEPTION 'Labor is released with its piece.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(labor.id ORDER BY labor.id), '{}'::uuid[]) INTO v_labor_ids
  FROM public.project_ffe_items labor
  WHERE labor.parent_ffe_item_id = ANY (v_ids)
    AND labor.project_id = p_project_id
    AND labor.line_kind = 'labor'
    AND labor.removed_at IS NULL
    AND NOT (labor.id = ANY (v_ids));
  -- The outer readiness gate (00445:116-121) saw only the named ids.
  FOREACH v_id IN ARRAY v_labor_ids
  LOOP
    v_readiness := public.get_project_ffe_readiness(v_id);
    IF NOT COALESCE((v_readiness->>'ready')::boolean, false) THEN
      RAISE EXCEPTION 'schedule line % is not ready for authorization: %',
        v_id, v_readiness->'missingFields'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT s) INTO v_ids
  FROM unnest(v_ids || v_labor_ids) AS s;

  -- (3) Executed design-services origin (00412 shape, byte-for-byte).
  IF NOT public.project_has_design_agreement_eligibility(p_project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) The latest checkpoint must be settled AND still describe its version.
  -- Verifying the fingerprint here (not only at execution) fails the studio
  -- early, while the instrument is still cheap to abandon.
  SELECT checkpoint.* INTO v_checkpoint
  FROM public.project_budget_checkpoints checkpoint
  JOIN public.project_budget_versions version
    ON version.id = checkpoint.budget_version_id
  WHERE checkpoint.project_id = p_project_id
  ORDER BY version.version DESC, checkpoint.published_at DESC, checkpoint.id DESC
  LIMIT 1 FOR SHARE OF checkpoint;
  IF v_checkpoint.id IS NULL
     OR v_checkpoint.status NOT IN ('acknowledged', 'overridden') THEN
    RAISE EXCEPTION 'latest furnishings checkpoint must be acknowledged or audited override'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id) THEN
    RAISE EXCEPTION 'budget checkpoint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (5) Every named schedule line, locked and proven releasable.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    IF NOT FOUND OR v_line.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423: a trade presence line is not furniture. It is priced on its own
    -- scope and billed by that scope's draws, so releasing it here would put the
    -- same money on two instruments — and the single-provenance CHECK would only
    -- say so at the client's signature. Refuse it while it is still the studio's
    -- problem, by name, the way the purchase-order sibling does.
    IF v_line.external_fulfilment_id IS NOT NULL THEN
      RAISE EXCEPTION 'external_presence_authorization_refused'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_line.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line "%" is trade work on its own scope and cannot be released as furnishings',
        v_line.name
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'tbd' THEN
      RAISE EXCEPTION 'schedule line % is still TBD; resolve it before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- The allowance snapshot divides the ceiling by quantity, and quantity has
    -- no CHECK on project_ffe_items. A zero would raise a bare 22012 out of the
    -- release; a negative would sign a negative unit price into the snapshot.
    IF COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'schedule line % has no quantity to authorize', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'fixed' THEN
      IF COALESCE(v_line.unit_price_cents, 0) <= 0 OR v_line.line_total_cents IS NULL THEN
        RAISE EXCEPTION 'fixed schedule line % has no client price to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_line.item_type = 'allowance' THEN
      IF COALESCE(v_line.budget_max_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'allowance schedule line % has no ceiling to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'schedule line % has unsupported item type %', v_id, v_line.item_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- A roomless line cannot be proven against a room-keyed budget, and the
    -- client's read has nowhere to file it. Distinct message on purpose: the
    -- studio's fix is to file the line, not to change the budget.
    IF v_line.project_room_id IS NULL THEN
      RAISE EXCEPTION 'schedule line % has no room; file it in a room before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_id
        AND COALESCE(p.commercial_state, 'draft') NOT IN ('declined', 'superseded')
    ) THEN
      RAISE EXCEPTION 'schedule line % is already named by a live authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.source_commercial_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line % is already bound to an executed authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_subtotal := v_subtotal + CASE
      WHEN v_line.item_type = 'fixed' THEN v_line.line_total_cents
      ELSE v_line.budget_max_cents END;
  END LOOP;

  -- (6) R6 COVERAGE, HARD. Every room in the release must be a room the client
  -- saw a budget for. There is deliberately NO drift check here: whether the
  -- schedule has outgrown its target is a conversation, not a constraint. That
  -- the room was never budgeted at all is a defect.
  SELECT r.name INTO v_uncovered
  FROM public.project_ffe_items i
  JOIN public.project_rooms r ON r.id = i.project_room_id
  WHERE i.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_checkpoint.budget_version_id
        AND l.project_room_id = i.project_room_id
    )
  ORDER BY r.name
  LIMIT 1;
  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'room "%" is not covered by the acknowledged budget', v_uncovered
      USING ERRCODE = 'check_violation';
  END IF;

  -- (7) Deposit: explicit argument, else the signed agreement's standing term,
  -- else the house default.
  -- LEFT JOIN, not JOIN: an inner join drops an authority with no terms row
  -- BEFORE the ORDER BY/LIMIT, so the answer would silently come from an older
  -- authority instead of the newest one. The newest active authority decides,
  -- and if it names no term the house default does.
  v_deposit := COALESCE(
    p_deposit_percent,
    (SELECT t.furnishings_deposit_percent
     FROM public.project_billing_authorities ba
     LEFT JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
     WHERE ba.project_id = p_project_id AND ba.status = 'active'
     ORDER BY ba.effective_at DESC
     LIMIT 1),
    50
  );

  -- (8) The client-facing edition. Identities come from the executed origin
  -- (00412:1941-1956 shape) — there is no source draft to inherit them from.
  -- NOTE: no proposal_items clone. The schedule IS the line population.
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind IN ('design_services', 'design_build')
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;
  IF v_origin.id IS NULL THEN
    SELECT relationship.id INTO v_origin.designer_client_id
    FROM public.designer_clients relationship
    WHERE relationship.designer_id = v_project.designer_id
      AND relationship.client_id = v_project.client_id;
    IF v_origin.designer_client_id IS NULL THEN
      RAISE EXCEPTION 'The project needs its studio-client relationship before purchasing authorization'
        USING ERRCODE = 'check_violation';
    END IF;
    v_origin.project_address := v_project.site_address;
    v_origin.feedback_enabled := true;
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_name,
    'Furnishings released from the project schedule.',
    public._cents_to_int4(v_subtotal, 'this release'), 0, 0, 0, 0,
    public._cents_to_int4(v_subtotal, 'this release'), v_deposit, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'furnishings_authorization', 'draft'
  );

  -- (9) Bind it to the project and the checkpoint it was proven against.
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, budget_checkpoint_id,
    created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_name,
    v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  -- (10) Freeze each line. An allowance is authorized at its CEILING: the
  -- client signs for "up to this much", and the per-unit figure is that ceiling
  -- divided by quantity. Integer division truncates, so for quantity > 1 the
  -- unit price can round down by up to (quantity - 1) cents against the
  -- ceiling — deliberate: client_line_total_cents is the authoritative ceiling
  -- and the guard compares totals, never quantity × unit.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    SELECT r.name INTO v_room_name FROM public.project_rooms r
    WHERE r.id = v_line.project_room_id;
    v_price := CASE WHEN v_line.item_type = 'fixed'
      THEN v_line.line_total_cents ELSE v_line.budget_max_cents END;

    INSERT INTO public.furnishing_authorization_items (
      commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, product_id, name, room_name, category, item_type,
      quantity, client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, vendor_id, vendor_name,
      snapshot, sort_order
    ) VALUES (
      v_document_id, NULL, v_line.id, v_line.project_room_id, v_line.product_id,
      v_line.name, v_room_name, COALESCE(v_line.ffe_category, 'Uncategorized'),
      v_line.item_type, v_line.quantity,
      CASE WHEN v_line.item_type = 'fixed' THEN v_line.unit_price_cents
           ELSE (v_line.budget_max_cents / v_line.quantity)::integer END,
      v_price::integer,
      v_line.trade_price_cents, v_line.markup_percent, v_line.vendor_id,
      v_line.vendor_name,
      -- 00744 (D7 phase 2): one row per line, whatever its rooms. room_name
      -- above stays the primary; the snapshot names every room and its share.
      public._furnishing_authorization_item_snapshot(v_line),
      v_line.sort_order
    );
  END LOOP;

  -- No GUC save/restore here on purpose: unlike the send/execute/void rails,
  -- this body sets no transaction-local capability. Every write it makes is
  -- authorized by being SECURITY DEFINER (the ledger guard's postgres check);
  -- an exception handler that restores a setting nothing set would read as
  -- load-bearing and is not.
  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', array_length(v_ids, 1),
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text :=
    current_setting('app.proposal_accept_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5356 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = v_actor
    AND document_kind = 'furnishings_authorization';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, project INTO v_row_5356
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'furnishings_authorization'
    AND project.client_id = v_actor
    AND project.status = 'active'
    AND (
      v_proposal.project_id IS NULL
      OR v_proposal.project_id = project.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_document := v_row_5356.document;
  v_project := v_row_5356.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_actor
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM lead_membership.id
  FROM public.organization_members AS lead_membership
  WHERE lead_membership.organization_id = v_project.studio_id
    AND lead_membership.user_id = v_project.designer_id
  ORDER BY lead_membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_project.studio_id
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = v_actor
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00876: conversion and authorization share the same source-item locks.
  PERFORM item.id FROM public.project_ffe_items AS item
  WHERE EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items AS source
    WHERE source.commercial_document_id = v_document.id
      AND source.source_ffe_item_id = item.id
  ) ORDER BY item.id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items AS source
    JOIN public.project_ffe_items AS item ON item.id = source.source_ffe_item_id
    WHERE source.commercial_document_id = v_document.id
      AND item.external_fulfilment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'external_presence_authorization_refused'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_budget_checkpoints AS checkpoint
    WHERE checkpoint.id = v_document.budget_checkpoint_id
      AND checkpoint.project_id = v_document.project_id
      AND checkpoint.status IN ('acknowledged', 'overridden')
      AND checkpoint.snapshot_fingerprint =
            public._budget_version_fingerprint(checkpoint.budget_version_id)
  ) THEN
    RAISE EXCEPTION
      'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.project_has_design_agreement_eligibility(v_document.project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin',
      v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;

  SELECT * INTO v_signature
  FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id
    AND party_role = 'client'
  FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL
       OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_applied_ids
    FROM public.project_ffe_items AS item
    WHERE item.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION
        'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    )
    RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true
    );

    UPDATE public.proposals
    SET status = 'accepted',
        commercial_state = 'executed',
        signed_at = v_signature.signed_at,
        signed_by_name = v_name,
        accepted_at = v_signature.signed_at,
        updated_at = now()
    WHERE id = p_proposal_id;

    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id,
        custom_fields
      )
      SELECT
        v_document.project_id, item.source_proposal_item_id, item.product_id,
        item.name, item.category, item.item_type, 'approved', item.quantity,
        item.client_unit_price_cents, item.trade_unit_cost_cents,
        item.markup_percent, item.client_line_total_cents, item.vendor_id,
        item.vendor_name, item.sort_order, v_document.id, item.id,
        COALESCE(item.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_proposal_item_id IS NOT NULL
      ORDER BY item.sort_order, item.id
      RETURNING id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_applied_ids
    FROM inserted;

    WITH linked AS (
      UPDATE public.project_ffe_items AS project_item
      SET source_commercial_document_id = v_document.id,
          source_authorization_item_id = item.id,
          status = CASE
            WHEN public.ffe_status_rank(project_item.status) <
                 public.ffe_status_rank('approved')
              THEN 'approved'
            ELSE project_item.status
          END,
          updated_at = now()
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_ffe_item_id IS NOT NULL
        AND project_item.id = item.source_ffe_item_id
      RETURNING project_item.id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_linked_ids
    FROM linked;

    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      )
      RETURNING id INTO v_deposit_invoice_id;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc',
        'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object(
          'commercialDocumentId', v_document.id,
          'kind', 'furnishings_deposit'
        )
      );

      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_actor
      );
    END IF;

    UPDATE public.project_commercial_documents
    SET executed_at = v_signature.signed_at,
        deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(v_signature.signed_at::date, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        NULL,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );
    PERFORM set_config(
      'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
    );
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId',
      COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'deposit_required_cents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'depositPaidCents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'deposit_paid_cents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4630 record;
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper furnishings execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal, document, project
  INTO v_row_4630
  FROM public.proposals AS proposal
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
   AND document.document_kind = 'furnishings_authorization'
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.designer_clients AS relationship
    ON relationship.id = proposal.designer_client_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS recorder_membership
    ON recorder_membership.organization_id = project.studio_id
   AND recorder_membership.user_id = v_recorder
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND relationship.designer_id = proposal.designer_id
    AND relationship.client_id = proposal.client_id
    AND project.client_id = proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND recorder_membership.status = 'active'
    AND recorder_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := v_row_4630.proposal;
  v_document := v_row_4630.document;
  v_project := v_row_4630.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_proposal.client_id
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_recorder
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_recorder
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.document_kind = 'furnishings_authorization'
    AND proposal.client_id = v_project.client_id
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;

  PERFORM relationship.id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_proposal.designer_client_id
    AND relationship.designer_id = v_proposal.designer_id
    AND relationship.client_id = v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00876: conversion and authorization share the same source-item locks.
  PERFORM item.id FROM public.project_ffe_items AS item
  WHERE EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items AS source
    WHERE source.commercial_document_id = v_document.id
      AND source.source_ffe_item_id = item.id
  ) ORDER BY item.id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items AS source
    JOIN public.project_ffe_items AS item ON item.id = source.source_ffe_item_id
    WHERE source.commercial_document_id = v_document.id
      AND item.external_fulfilment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'external_presence_authorization_refused'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00425 DELTA 4 (expiry). The client rail refuses an expired authorization
  -- here, because in the portal the link IS the offer. The paper rail does not:
  -- the client already signed, on the date the record carries, and a lapsed
  -- link is not a reason to throw that away. record_paper_client_signature and
  -- record_offline_signature (00399) have never had this guard either.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT public.project_has_design_agreement_eligibility(v_document.project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_furnishings_authorization_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_recorder
      );
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    -- 00475 (R109 ceremony class): the studio records this act, so the sheet
    -- states the impact and the anchor hardens. The date is the day the client
    -- signed the paper original, not the day it was recorded. A NULL impact
    -- still downgrades to a proposal (R110).
    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(
            COALESCE(p_paper_signed_on, v_signature.signed_at::date), 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        p_disclosed_impact,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw_total bigint;
  v_allocation_total bigint;
  v_allocation_count integer;
  v_section_count integer;
  v_draw_count integer;
  v_gate_count integer;
  v_gate_sort integer;
  v_max_sort integer;
  v_first_gates boolean;
  v_percentage_count integer;
  v_percentage_total numeric;
  -- 00578
  v_pricing_basis jsonb;
  v_draws jsonb;
  v_allowances jsonb;
  v_contract_sum bigint;
  v_message text;
  v_disclosure text;
  v_draw_gross bigint;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' THEN
    -- 00876: do not send a stale snapshot of an externally fulfilled line.
    PERFORM item.id FROM public.project_ffe_items AS item
    WHERE EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items AS source
      JOIN public.project_commercial_documents AS document
        ON document.id = source.commercial_document_id
      WHERE document.proposal_id = p_proposal_id
        AND source.source_ffe_item_id = item.id
    ) ORDER BY item.id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items AS source
      JOIN public.project_commercial_documents AS document
        ON document.id = source.commercial_document_id
      JOIN public.project_ffe_items AS item ON item.id = source.source_ffe_item_id
      WHERE document.proposal_id = p_proposal_id
        AND item.external_fulfilment_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'external_presence_authorization_refused'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Validate the signed C2 input at the last mutable door, independently of save.
  PERFORM public._normalize_scope_package_parts(p_proposal_id, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
    FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  PERFORM public._validate_scope_retained_parts(p_proposal_id, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
    FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'PT409';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: role rates are required only when the agreement bills time — a
  -- document with no parts (every pre-00575 and every flag-off document)
  -- still owes them, and so does one carrying a rate_card part. A composed
  -- flat-fee or retainer-only agreement owes none.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR (public._agreement_requires_rate_card(p_proposal_id)
        AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms, and role rates whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: R4's floor is asked at the door too, not only where the parts were
  -- written. A composition can reach 'draft' by more than one road —
  -- materialize_standard_parts seeds from a terms row a co-member may have
  -- edited — so the last gate before the client sees the document asks again.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_floor_unmet(p_proposal_id) THEN
    RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
      USING ERRCODE = 'check_violation';
  END IF;
  -- R22: and the fee half of the same floor, in the room's own sentence.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_fee_unnamed(p_proposal_id) THEN
    RAISE EXCEPTION 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00423: the trade arm. A scope is only a document when it says WHO does the
  -- work, WHAT the work is, WHAT it costs, and WHEN the client pays — and when
  -- the last two agree to the cent.
  IF v_proposal.document_kind = 'trade_scope' THEN
    SELECT * INTO v_terms FROM public.trade_scope_terms
    WHERE proposal_id = p_proposal_id;
    IF v_terms.proposal_id IS NULL OR v_terms.party_id IS NULL
       OR COALESCE(v_terms.client_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'trade scope send requires a named party and a client price'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_section_count FROM public.trade_scope_sections
    WHERE proposal_id = p_proposal_id;
    IF v_section_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one scope section'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), COALESCE(sum(amount_cents), 0),
           count(*) FILTER (WHERE gates_on_acceptance),
           max(sort_order),
           max(sort_order) FILTER (WHERE gates_on_acceptance)
    INTO v_draw_count, v_draw_total, v_gate_count, v_max_sort, v_gate_sort
    FROM public.trade_scope_draws WHERE proposal_id = p_proposal_id;
    IF v_draw_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw_total IS DISTINCT FROM v_terms.client_price_cents::bigint THEN
      RAISE EXCEPTION 'trade scope draw schedule must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_count <> 1 THEN
      RAISE EXCEPTION 'trade scope draw schedule must have exactly one acceptance-gated draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_sort IS DISTINCT FROM v_max_sort THEN
      RAISE EXCEPTION 'the acceptance-gated draw must be the last draw in the schedule'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The one-gate and gate-is-last rules hold TRIVIALLY on a single-draw
    -- schedule: with one row, min sort_order = max sort_order, so a lone 100%
    -- "Final · on acceptance" draw satisfies every check above. Execution then
    -- bills the lowest-sort draw at signature — which would invoice the client
    -- the whole scope price the moment they sign, on the strength of a document
    -- that says the money is due on acceptance. The first draw is the deposit by
    -- construction, so it is the one draw that cannot gate. Same selector the
    -- execute rail uses (sort_order, id), so the two can never disagree about
    -- which draw is first.
    SELECT w.gates_on_acceptance INTO v_first_gates
    FROM public.trade_scope_draws w
    WHERE w.proposal_id = p_proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1;
    IF COALESCE(v_first_gates, false) THEN
      RAISE EXCEPTION 'the first draw is billed at signature, so it must not be the acceptance-gated one'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Percentage is display and amount_cents is the money, but a display figure
    -- that contradicts the money beside it is a second payment plan on the same
    -- page — and the client's document renders both. So when the studio states
    -- percentages at all, they must total 100 and each must describe its own
    -- amount. The tolerances are the honest ones: half a point for the total (a
    -- 33.3/33.3/33.4 schedule is a real schedule), and a dollar per line for the
    -- rounding an exact-cents split of an odd price forces.
    SELECT count(*) FILTER (WHERE w.percentage IS NOT NULL),
           COALESCE(sum(w.percentage), 0)
    INTO v_percentage_count, v_percentage_total
    FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id;
    IF v_percentage_count > 0 THEN
      IF abs(v_percentage_total - 100) > 0.5 THEN
        RAISE EXCEPTION 'trade scope draw percentages must total 100'
          USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trade_scope_draws w
        WHERE w.proposal_id = p_proposal_id AND w.percentage IS NOT NULL
          AND abs(round(v_terms.client_price_cents * w.percentage / 100.0)
                  - w.amount_cents) > 100
      ) THEN
        RAISE EXCEPTION 'each trade scope draw percentage must match the amount beside it'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Allocations are optional as a SET. Once the studio starts apportioning the
    -- price across rooms, the apportionment must be complete and exact — a
    -- half-allocated scope tells the client a room costs $X and leaves the rest
    -- of the money unaccounted for.
    SELECT count(*) FILTER (WHERE allocation_cents IS NOT NULL),
           COALESCE(sum(allocation_cents), 0)
    INTO v_allocation_count, v_allocation_total
    FROM public.trade_scope_sections WHERE proposal_id = p_proposal_id;
    IF v_allocation_count > 0
       AND (v_allocation_count <> v_section_count
            OR v_allocation_total IS DISTINCT FROM v_terms.client_price_cents::bigint) THEN
      RAISE EXCEPTION 'trade scope section allocations must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 00578: the design-build arm (P9, P10, P11, R4, R11) ────────────────
  IF v_proposal.document_kind = 'design_build' THEN
    -- R48 (W3R2-01) — the door asks the same question upsert_agreement_parts
    -- asks, because a part hidden before this refusal existed is still on the
    -- stack. _agreement_design_build_part reads the AUTHORED row, so without
    -- this the arm below validates a price the client's projection has
    -- already dropped and the homeowner signs a paper naming none.
    IF EXISTS (
      SELECT 1 FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.variant IN ('pricing_basis', 'draws')
        AND NOT ap.client_visible
    ) THEN
      RAISE EXCEPTION
        'your client signs the price and the draws, so neither can be hidden from her'
        USING ERRCODE = 'check_violation';
    END IF;

    v_pricing_basis := public._agreement_design_build_part(
      p_proposal_id, 'pricing_basis');
    IF v_pricing_basis IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a pricing basis'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_pricing_basis_payload(v_pricing_basis);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- R48 — and the fee half of R22's floor, asked of this class in its own
    -- words. _agreement_fee_unnamed reads pricing_basis through the same
    -- client_visible filter as every other fee, so this is the second reading
    -- of the same rule: whatever else is true, the paper she signs names a
    -- price she can read.
    IF public._agreement_fee_unnamed(p_proposal_id) THEN
      RAISE EXCEPTION 'this agreement names no price your client can read'
        USING ERRCODE = 'check_violation';
    END IF;

    v_draws := public._agreement_design_build_part(p_proposal_id, 'draws');
    IF v_draws IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a draw schedule'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_draws_payload(v_draws);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    v_allowances := public._agreement_design_build_part(
      p_proposal_id, 'allowances');
    IF v_allowances IS NOT NULL THEN
      v_message := public._validate_allowances_payload(
        v_allowances, v_pricing_basis);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_message := public._validate_no_double_count(
      public._agreement_parts_json(p_proposal_id));
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- One contract, one answer about how the trades are priced to the client
    -- (research 02 §9 item 5). It is authored on the sub-disclosure clause,
    -- where the composer's selector lives; the build sheet also allows it
    -- inside the pricing basis, so both are read and a DISAGREEMENT is
    -- refused rather than silently resolved.
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
    IF v_disclosure = 'conflict' THEN
      RAISE EXCEPTION 'this agreement says the trades are priced open-book in one place and closed-book in another'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_disclosure IS NULL THEN
      RAISE EXCEPTION 'say whether the trades are priced open-book or closed-book'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R43: under closed book the schedule of values is the studio's own, not
    -- derived from the cost lines — so there has to be one. Its arithmetic was
    -- already checked by _validate_pricing_basis_payload above; this is the
    -- door that asks for it at all.
    IF v_disclosure <> 'open_book'
       AND jsonb_array_length(
             public._agreement_schedule_of_values(
               v_pricing_basis, v_disclosure)) = 0 THEN
      RAISE EXCEPTION 'a closed-book agreement needs a schedule of values written for your client'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R10: the gate holds at send too, not only at template selection. An
    -- attestation can lapse between composing and sending.
    IF NOT public.studio_has_live_license_attestation(
             public._agreement_studio_id(p_proposal_id, auth.uid())) THEN
      RAISE EXCEPTION 'the design-build template needs a current licensing attestation on file'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11: a notice counsel has not enabled never reaches a client's page,
    -- however the attachment part came to name it.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      JOIN public.agreement_jurisdiction_notices notice
        ON notice.state = NULLIF(btrim(ap.payload->>'jurisdiction'), '')
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND NOT notice.enabled
    ) THEN
      RAISE EXCEPTION 'that jurisdiction notice is held for counsel review and cannot be sent'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11's other half — AN ATTESTATION OF RECEIPT NEEDS SOMETHING RECEIVED.
    -- An attachment on the homeowner's copy that asks her to tick "I received
    -- this" must carry the words she is attesting she received; the tick is
    -- recorded onto her signature row by `part_key`, and a leaf whose wording
    -- is still with counsel would put an empty document into that record.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND ap.client_visible
        AND (ap.payload->'acknowledgeRequired') = 'true'::jsonb
        AND NULLIF(btrim(COALESCE(ap.payload->>'body', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'an attachment your client must confirm she received needs its wording first'
        USING ERRCODE = 'check_violation';
    END IF;

    v_contract_sum := public._agreement_contract_sum_cents(v_pricing_basis);
    SELECT COALESCE(sum(row.gross_cents), 0) INTO v_draw_gross
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    WHERE NOT row.is_retainage_release;
    IF v_draw_gross IS DISTINCT FROM v_contract_sum THEN
      RAISE EXCEPTION 'the draw schedule must come to the contract sum, to the cent'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM 1 FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_sections
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_draws
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'PT409';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    total_amount = CASE
      WHEN v_proposal.document_kind = 'trade_scope'
        THEN COALESCE(v_terms.client_price_cents, total_amount)
      -- 00578: the turnkey prime's total IS the contract sum the pricing
      -- basis names, so the send snapshot, the dispatch row and the client's
      -- bundle all report one number.
      WHEN v_proposal.document_kind = 'design_build'
        THEN COALESCE(v_contract_sum, total_amount)
      ELSE total_amount END,
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  -- The UPDATE above writes hashed fields — total_amount for a trade scope, and
  -- valid_until / personal_message on every rail — so the fingerprint verified
  -- twice before the write is no longer the hash of the document that just left.
  -- Recompute, so what the caller is handed is what
  -- _commercial_document_fingerprint answers about this document now. (Nothing
  -- after this point touches a hashed column: proposal_send_dispatch_id, status,
  -- sent_at and updated_at are all outside _proposal_review_fingerprint.)
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  -- 00578: the draw ledger, laid out from the now-frozen payload. Machine
  -- state, so it lands AFTER the fingerprint that records the authored
  -- document and changes nothing about it (RC-8). Re-send is impossible —
  -- the send door refuses a non-draft — so a plain INSERT is enough, and the
  -- ledger guard admits it because this body is SECURITY DEFINER owned by
  -- postgres.
  IF v_proposal.document_kind = 'design_build' THEN
    INSERT INTO public.agreement_draw_invoices (
      proposal_id, draw_key, sort_order, label,
      gross_cents, retainage_cents, net_cents, is_retainage_release
    )
    SELECT p_proposal_id, row.draw_key, row.sort_order, row.label,
           row.gross_cents, row.retainage_cents, row.net_cents,
           row.is_retainage_release
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    ORDER BY row.sort_order
    ON CONFLICT (proposal_id, draw_key) DO NOTHING;
  END IF;

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_labor_line(
  p_parent_ffe_item_id uuid,
  p_request jsonb,
  p_unit_price_cents integer DEFAULT NULL
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

  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_parent_ffe_item_id;

  SELECT * INTO v_parent FROM public.project_ffe_items
   WHERE id = p_parent_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_parent.project_id);

  IF v_parent.external_fulfilment_id IS NOT NULL THEN
    RAISE EXCEPTION 'external_presence_labor_parent_refused'
      USING ERRCODE = 'check_violation';
  END IF;

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

  -- 00737 (F1): the client price, whole cents. Above 0 it prices the line.
  IF p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'add_labor_line: the price is whole cents, 0 or more'
      USING ERRCODE = 'check_violation';
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
  -- 00737 (F6): labor goes on a piece in the design, not on an alternate or a
  -- passed-over line.
  IF v_parent.design_disposition IN ('alternate', 'not_selected') THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a chosen piece, not an alternate or a passed-over line'
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
    parent_ffe_item_id, design_disposition, added_via, sort_order,
    unit_price_cents, line_total_cents
  ) VALUES (
    v_parent.project_id, v_parent.project_room_id, v_parent.assignment_scope,
    v_name, v_quantity, v_unit, v_rough, v_vendor_id, v_vendor_name,
    'labor', 'labor', v_parent.id, 'candidate', 'labor',
    COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items
               WHERE project_id = v_parent.project_id), 0),
    CASE WHEN p_unit_price_cents > 0 THEN p_unit_price_cents ELSE 0 END,
    CASE WHEN p_unit_price_cents > 0 THEN v_quantity * p_unit_price_cents ELSE 0 END
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

REVOKE ALL ON FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
