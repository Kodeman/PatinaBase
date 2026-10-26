-- 00870 — Staged C2 reconciliation; no C4/C5 schema or activation.
-- Builds on 00868 composition and 00869 native execution/invalidation. Replay
-- uses the ordinary mint, never timestamps or a latest-document-only shortcut.
-- Lock order amended by US-52: project -> proposals (id order) -> documents -> edition.
CREATE TABLE IF NOT EXISTS public.project_scope_reconciliations (
  project_id uuid NOT NULL REFERENCES public.projects(id),
  client_request_id uuid NOT NULL,
  commercial_document_id uuid NOT NULL REFERENCES public.project_commercial_documents(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  document_ids uuid[] NOT NULL CHECK (cardinality(document_ids) > 0),
  source_proposal_ids uuid[] NOT NULL CHECK (cardinality(source_proposal_ids)=cardinality(document_ids)),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (project_id, client_request_id)
);
ALTER TABLE public.project_scope_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_scope_reconciliations FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS scope_reconciliation_immutable ON public.project_scope_reconciliations;
CREATE TRIGGER scope_reconciliation_immutable BEFORE UPDATE OR DELETE ON public.project_scope_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public._guard_scope_immutable();

-- Include both the append-only order and executed native documents: a missed
-- execution writer must not disappear just because it omitted its order row.
CREATE OR REPLACE FUNCTION public._scope_reconciliation_snapshot(p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT jsonb_build_object(
  'order', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.execution_seq)
    FROM public.project_commercial_execution_order o WHERE o.project_id=p_project_id),'[]'::jsonb),
  'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',d.id,'projectId',d.project_id,'proposalId',d.proposal_id,
    'kind',d.document_kind,'origin',d.is_origin,'executedAt',d.executed_at,
    'proposalProjectId',p.project_id,'studioId',p.studio_id,
    'proposalKind',p.document_kind,'commercialState',p.commercial_state) ORDER BY d.id)
   FROM public.project_commercial_documents d LEFT JOIN public.proposals p ON p.id=d.proposal_id
   WHERE (d.project_id=p_project_id AND d.executed_at IS NOT NULL AND p.commercial_state='executed'
     AND d.document_kind IN ('design_services','design_build','service_addendum'))
     OR EXISTS (SELECT 1 FROM public.project_commercial_execution_order o
       WHERE o.project_id=p_project_id AND o.commercial_document_id=d.id)),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public._scope_reconciliation_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- Called only after the source proposals and documents are locked. Both new
-- effects and receipt replays must pass the original proposals' CURRENT access.
CREATE OR REPLACE FUNCTION public._assert_scope_reconciliation_authority(p_project_id uuid, p_documents uuid[], p_proposals uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF cardinality(p_documents) IS DISTINCT FROM cardinality(p_proposals) OR EXISTS (
   SELECT 1 FROM unnest(p_documents,p_proposals) ids(id,proposal_id)
   LEFT JOIN public.project_commercial_documents d ON d.id=ids.id
   LEFT JOIN public.proposals p ON p.id=d.proposal_id
   JOIN public.projects j ON j.id=p_project_id
   WHERE d.id IS NULL OR d.project_id IS DISTINCT FROM p_project_id
     OR d.proposal_id IS DISTINCT FROM ids.proposal_id
     -- Native addenda bind through the document; a non-NULL proposal bind may not contradict it.
     OR (p.project_id IS NOT NULL AND p.project_id IS DISTINCT FROM p_project_id)
     OR (p.studio_id IS NOT NULL AND p.studio_id IS DISTINCT FROM j.studio_id)
     OR NOT public.can_author_scope_proposal(p.id)) THEN
  RAISE EXCEPTION 'scope_reconcile_tenant_mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_scope_reconciliation_authority(uuid,uuid[],uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_scope_edition(
 p_project_id uuid, p_commercial_document_id uuid, p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 before_lock jsonb; receipt public.project_scope_reconciliations%ROWTYPE;
 stale public.project_scope_editions%ROWTYPE; latest public.project_commercial_execution_order%ROWTYPE;
 row public.project_commercial_execution_order%ROWTYPE;
 documents uuid[]; proposals uuid[]; minted uuid[] := ARRAY[]::uuid[]; previous_document uuid;
 previous_edition uuid; expected_seq bigint; response jsonb;
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 IF NOT public.can_compose_project_plan(p_project_id) THEN
  RAISE EXCEPTION 'scope_project_access_denied' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_client_request_id IS NULL OR p_commercial_document_id IS NULL THEN
  RAISE EXCEPTION 'scope_reconcile_request_required' USING ERRCODE='check_violation';
 END IF;
 before_lock := public._scope_reconciliation_snapshot(p_project_id);
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT public.can_compose_project_plan(p_project_id) THEN
  RAISE EXCEPTION 'scope_project_access_denied' USING ERRCODE='insufficient_privilege';
 END IF;
 SELECT * INTO receipt FROM public.project_scope_reconciliations
 WHERE project_id=p_project_id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  IF receipt.created_by IS DISTINCT FROM auth.uid()
     OR receipt.commercial_document_id IS DISTINCT FROM p_commercial_document_id THEN
   RAISE EXCEPTION 'scope_reconcile_request_conflict' USING ERRCODE='check_violation';
  END IF;
  documents := receipt.document_ids;
 ELSE
  IF before_lock IS DISTINCT FROM public._scope_reconciliation_snapshot(p_project_id) THEN
   RAISE EXCEPTION 'scope_reconcile_order_moved' USING ERRCODE='serialization_failure';
  END IF;
  SELECT array_agg((d->>'id')::uuid ORDER BY d->>'id') INTO documents
  FROM jsonb_array_elements(before_lock->'documents') d;
 END IF;
 PERFORM 1 FROM public.proposals p WHERE p.id IN (
   SELECT d.proposal_id FROM public.project_commercial_documents d WHERE d.id=ANY(documents))
   ORDER BY p.id FOR UPDATE;
 PERFORM 1 FROM public.project_commercial_documents d WHERE d.id=ANY(documents) ORDER BY d.id FOR UPDATE;
 IF receipt.client_request_id IS NOT NULL THEN
  PERFORM public._assert_scope_reconciliation_authority(p_project_id,documents,receipt.source_proposal_ids);
  RETURN receipt.response;
 END IF;
 IF before_lock IS DISTINCT FROM public._scope_reconciliation_snapshot(p_project_id) THEN
  RAISE EXCEPTION 'scope_reconcile_order_moved' USING ERRCODE='serialization_failure';
 END IF;
 SELECT * INTO latest FROM public.project_commercial_execution_order
 WHERE project_id=p_project_id ORDER BY execution_seq DESC LIMIT 1;
 IF latest.commercial_document_id IS DISTINCT FROM p_commercial_document_id OR NOT EXISTS (
   SELECT 1 FROM public.project_commercial_documents d WHERE d.id=latest.commercial_document_id
     AND d.project_id=p_project_id AND NOT d.is_origin
     AND d.document_kind IN ('design_services','design_build','service_addendum')) THEN
  RAISE EXCEPTION 'scope_reconcile_not_latest' USING ERRCODE='check_violation';
 END IF;
 SELECT * INTO stale FROM public.project_scope_editions WHERE project_id=p_project_id
 ORDER BY edition_number DESC LIMIT 1 FOR UPDATE;
 IF stale.id IS NULL OR stale.status <> 'stale' THEN
  RAISE EXCEPTION 'scope_reconcile_not_stale' USING ERRCODE='check_violation';
 END IF;
 IF stale.stale_execution_seq IS NULL OR stale.stale_execution_seq>latest.execution_seq
   OR NOT EXISTS (SELECT 1 FROM public.project_commercial_execution_order o
     WHERE o.project_id=p_project_id AND o.execution_seq=stale.stale_execution_seq
       AND o.commercial_document_id=stale.stale_commercial_document_id)
   OR EXISTS (SELECT 1 FROM public.project_commercial_documents d JOIN public.proposals p ON p.id=d.proposal_id
     WHERE d.project_id=p_project_id AND d.executed_at IS NOT NULL AND p.commercial_state='executed'
       AND d.document_kind IN ('design_services','design_build','service_addendum')
       AND NOT EXISTS (SELECT 1 FROM public.project_commercial_execution_order o
         WHERE o.project_id=p_project_id AND o.commercial_document_id=d.id)) THEN
  RAISE EXCEPTION 'scope_reconcile_order_broken' USING ERRCODE='check_violation';
 END IF;
 SELECT array_agg(o.commercial_document_id ORDER BY o.execution_seq) INTO documents
 FROM public.project_commercial_execution_order o WHERE o.project_id=p_project_id
   AND o.execution_seq BETWEEN stale.stale_execution_seq AND latest.execution_seq;
 SELECT array_agg((d->>'proposalId')::uuid ORDER BY ord) INTO proposals
 FROM unnest(documents) WITH ORDINALITY ids(id,ord)
 JOIN LATERAL jsonb_array_elements(before_lock->'documents') d ON (d->>'id')::uuid=ids.id;
 PERFORM public._assert_scope_reconciliation_authority(p_project_id,documents,proposals);
 previous_document := stale.commercial_document_id;
 previous_edition := stale.id;
 expected_seq := stale.stale_execution_seq;
 FOR row IN SELECT * FROM public.project_commercial_execution_order WHERE project_id=p_project_id
   AND execution_seq BETWEEN stale.stale_execution_seq AND latest.execution_seq ORDER BY execution_seq LOOP
  IF row.legacy_order OR row.execution_seq<>expected_seq
     OR row.predecessor_document_id IS DISTINCT FROM previous_document
     OR NOT EXISTS (SELECT 1 FROM public.project_commercial_documents d JOIN public.proposals p ON p.id=d.proposal_id
       WHERE d.id=row.commercial_document_id AND NOT d.is_origin AND d.executed_at IS NOT NULL
         AND p.commercial_state='executed' AND p.document_kind=d.document_kind
         AND d.document_kind IN ('design_services','design_build','service_addendum')) THEN
   RAISE EXCEPTION 'scope_reconcile_order_broken' USING ERRCODE='check_violation';
  END IF;
  previous_edition := public._mint_scope_edition(row.commercial_document_id,previous_edition,true);
  minted := array_append(minted,previous_edition);
  previous_document := row.commercial_document_id;
  expected_seq := expected_seq+1;
 END LOOP;
 IF expected_seq<>latest.execution_seq+1 THEN
  RAISE EXCEPTION 'scope_reconcile_order_broken' USING ERRCODE='check_violation';
 END IF;
 response := jsonb_build_object('projectId',p_project_id,'commercialDocumentId',p_commercial_document_id,
   'editionIds',to_jsonb(minted),'activeEditionId',previous_edition);
 INSERT INTO public.project_scope_reconciliations(project_id,client_request_id,commercial_document_id,created_by,document_ids,source_proposal_ids,response)
 VALUES(p_project_id,p_client_request_id,p_commercial_document_id,auth.uid(),documents,proposals,response);
 RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_scope_edition(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
