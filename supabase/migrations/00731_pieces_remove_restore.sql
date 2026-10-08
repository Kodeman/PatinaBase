-- ═══════════════════════════════════════════════════════════════════════════
-- 00731 — Remove without ceremony before publication, and restore
--         (US-21 slice 1, W2, D8; T-11, SQ-617)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 00731 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md); §1.1 row 6 and §1.2 D8.
--
-- CREATE OR REPLACE base: archive_project_selection, 00435:521-545 (the only
-- definer). Full copy of the base plus the changes below.
--
-- ── archive_project_selection(p_ffe_item_id uuid, p_reason text DEFAULT NULL)
-- 1. The reason is required (≥ 5 characters) only when the line appears in a
--    published review edition: a project_review_items row whose
--    source_ffe_item_id is this line, in an edition whose status is not
--    'draft' (00434:294-327). Otherwise it is optional and defaults to
--    'removed while building'. p_reason gains DEFAULT NULL so a caller can
--    omit it; the signature (uuid,text) is unchanged.
-- 2. It records removed_disposition := design_disposition (column from
--    00729) before setting 'not_selected', so a restore returns the line to
--    where it was.
-- 3. The refusal for an authorized or ordered line (same condition as the
--    base) now reads "Released lines change through Record a change."
-- 4. Removing a line that is already removed returns without writing, so a
--    retry never overwrites removed_disposition with 'not_selected'.
-- 5. A Trade Scope presence line (trade_scope_document_id set) is refused
--    with "Trade Scope lines change in their scope." The base had no guard
--    for it (W1 review, T-8 F5).
--
-- ── restore_project_selection(p_ffe_item_id uuid) RETURNS jsonb  (new)
-- Clears removed_at, removed_by, removal_reason and removed_disposition, and
-- sets design_disposition := COALESCE(removed_disposition, 'candidate')
-- (NULL for lines removed before this file). Returns
-- {selectionId, restored:true}. It refuses:
--   - a line that is not removed;
--   - a line whose thread now has another active primary: the thread's
--     primary_ffe_item_id (kept on the first non-removed line by
--     set_project_ffe_thread_primary, 00447:453) is another line whose
--     disposition is not 'superseded' or 'not_selected'. A superseded or
--     passed-over primary is history, not a competing line, so restoring
--     its successor is allowed.
--
-- Both are SECURITY DEFINER, gated by _ffe_require_studio_project
-- (00717:75), and set app.ffe_mutation_rpc before writing project_ffe_items.
--
-- Adds GRANT/REVOKE → regenerate 00-legacy-grants (wave reset owner, T-17).
-- Idempotent: CREATE OR REPLACE only; grants re-issued.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.archive_project_selection(p_ffe_item_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_item public.project_ffe_items%ROWTYPE; v_reason text := NULLIF(btrim(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RETURN jsonb_build_object('selectionId',v_item.id,'archived',true);
  END IF;
  IF v_item.trade_scope_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'Trade Scope lines change in their scope.' USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_item.id AND proposal.commercial_state IN ('draft','sent','executed')
  ) OR v_item.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Released lines change through Record a change.'
      USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.project_review_items review_item
    JOIN public.project_review_editions edition ON edition.id=review_item.edition_id
    WHERE review_item.source_ffe_item_id=v_item.id AND edition.status<>'draft'
  ) THEN
    IF char_length(COALESCE(v_reason,''))<5 THEN
      RAISE EXCEPTION 'archive reason must be at least 5 characters' USING ERRCODE='check_violation';
    END IF;
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_at=now(),removed_by=auth.uid(),
    removal_reason=COALESCE(v_reason,'removed while building'),
    removed_disposition=design_disposition,
    design_disposition='not_selected',updated_at=now() WHERE id=v_item.id;
  RETURN jsonb_build_object('selectionId',v_item.id,'archived',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_project_selection(p_ffe_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_item public.project_ffe_items%ROWTYPE; v_primary uuid;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NULL THEN
    RAISE EXCEPTION 'This line is not removed.' USING ERRCODE='check_violation';
  END IF;
  SELECT primary_ffe_item_id INTO v_primary FROM public.project_ffe_selection_threads
  WHERE id=v_item.selection_thread_id FOR UPDATE;
  IF v_primary IS NOT NULL AND v_primary<>v_item.id AND EXISTS(
    SELECT 1 FROM public.project_ffe_items other
    WHERE other.id=v_primary AND other.removed_at IS NULL
      AND other.design_disposition NOT IN ('superseded','not_selected')
  ) THEN
    RAISE EXCEPTION 'Another line now fills this need, so this one cannot be restored.'
      USING ERRCODE='check_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_at=NULL,removed_by=NULL,removal_reason=NULL,
    design_disposition=COALESCE(removed_disposition,'candidate'),removed_disposition=NULL,
    updated_at=now() WHERE id=v_item.id;
  RETURN jsonb_build_object('selectionId',v_item.id,'restored',true);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_project_selection(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restore_project_selection(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.archive_project_selection(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project_selection(uuid) TO authenticated;
