-- ═══════════════════════════════════════════════════════════════════════════
-- 00906 — Round 8: jobs executed before C2 stay off scope editions (K23)
-- Ruling: K23 (Kody, 2026-10-31; docs/design/designer-portal-round8/DECISIONS.md).
--
-- With scope_editions on, _scope_after_execution (00886) minted for every
-- executed document, and _mint_scope_edition refuses a non-origin document on
-- a job with no active edition (`scope_edition_stale`, PT409). A job executed
-- while C2 was off has no edition at all, so countersigning an addendum there
-- would roll back once C2 is switched on.
--
-- Now the enabled branch mints only for an origin document, or on a job that
-- already has an edition in any status. An addendum on a job with no edition
-- executes as before (its execution order row is still written) and mints
-- nothing. A job whose latest edition is stale still reaches the mint and
-- still refuses `scope_edition_stale` (C2 §2.8). The disabled branch and the
-- leading _record_scope_execution call are unchanged.
--
-- Changes nothing while scope_editions is off (the shipped state): only the
-- enabled branch moved.
--
-- Lineage: _scope_after_execution 00869 -> 00886 -> 00906.
-- Reconciles: none; the body is 00886's verbatim plus the one condition.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._scope_after_execution(p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE doc public.project_commercial_documents%ROWTYPE; edition uuid; seq bigint;
  previous_marker text := current_setting('app.scope_edition_id',true);
BEGIN
  seq := public._record_scope_execution(p_document_id);
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id=p_document_id;
  SELECT id INTO edition FROM public.project_scope_editions WHERE project_id=doc.project_id AND status='active' FOR UPDATE;
  IF COALESCE((SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),false) THEN
    -- K23 (00906): a job executed before C2 has no edition and stays off editions.
    IF doc.is_origin OR EXISTS (SELECT 1 FROM public.project_scope_editions WHERE project_id=doc.project_id) THEN
      PERFORM public._mint_scope_edition(doc.id);
    END IF;
  ELSIF NOT doc.is_origin AND edition IS NOT NULL THEN
    PERFORM set_config('app.scope_edition_id',edition::text,true);
    UPDATE public.project_scope_editions SET status='stale',stale_at=clock_timestamp(),stale_reason='amended_while_inactive',
      stale_commercial_document_id=doc.id,stale_execution_seq=seq WHERE id=edition;
    -- C4 (00886): a stale edition supersedes its open acceptance requests.
    PERFORM public._supersede_service_acceptance_requests(edition,'scope_edition_stale');
    PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true); RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._scope_after_execution(uuid) FROM PUBLIC, anon, authenticated;
