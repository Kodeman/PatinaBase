-- 00876 — C5 external presence safety and item concurrency authority.
-- Builds on 00875 external fulfilments and the native FF&E pricing writers.
-- Ruling #198: spec versions are optional overlays, not item edit authority.
-- This checkpoint adds assignment, immutable conversion receipts (ruling #206),
-- native pricing preservation, cancellation and verified-install safety.
-- Commercial writer grafts and the full native census remain required before
-- submission; no mutation RPC is activated here. Native graft lineage: pricing
-- lock 00809; record/verify external events 00875. Other native bytes stay intact.
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
