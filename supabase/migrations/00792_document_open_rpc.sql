-- ═══════════════════════════════════════════════════════════════════════════
-- 00792 — document_open: the Document's row, ids and redirect in one read
--         (US-34 N9)
--
-- Plan row N9 (portal-responsiveness 2026-10-14, review E2-9). Before this,
-- useDocumentEngagement walked up to six sequential PostgREST reads to open a
-- Document: document_state, then proposals (R6), leads and designer_clients
-- (F1), the proposal chain (J6) and client_decisions (R21). Every one of them
-- waited on the one before. document_open answers the same resolution in one
-- request, and adds the ids the Document reads next, so its level-3 reads no
-- longer wait on a level-2 read.
--
-- RLS PARITY. SECURITY INVOKER: every select below runs under the caller's
-- RLS, exactly as the PostgREST reads did, and calls no definer. A row the
-- caller cannot read is a miss here as it was there, so an outsider resolves
-- every id to 'missing'. supabase/tests/document_open_test.sql proves each
-- branch and the outsider case.
--
-- SHAPE. One jsonb object in the client's DocumentResolution shape
-- (apps/designer-portal/src/hooks/use-document-state.ts):
--   {kind:'engagement', row, ids}  row = the document_state row, as
--                                  PostgREST returned it; ids = {project_id,
--                                  proposal_id, lead_id, designer_client_id,
--                                  studio_id, lead_user_id}
--   {kind:'redirect', projectId}   the document the id now lives at
--   {kind:'missing'}
--
-- ids. project_id, proposal_id and lead_id are the row's own. The other three
-- are the reads the Document makes next from the row:
--   designer_client_id  relationship: the row's engagement_id; proposal: the
--                       live proposal's designer_client_id; project: the
--                       designer_client_id of its proposal (projects.proposal_id);
--                       lead: null.
--   studio_id           project only: projects.studio_id (useProjectLead).
--   lead_user_id        project only: its active lead_designer team row, else
--                       projects.lead_designer_id, else projects.designer_id
--                       (useProjectLead's one lead resolver, SQ-778 N3).
--
-- Grants: authenticated only (an anon or service-role call has no Document).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.document_open(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row          jsonb;
  v_kind         text;
  v_project_id   uuid;
  v_proposal_id  uuid;
  v_dc_id        uuid;
  v_studio_id    uuid;
  v_lead_user_id uuid;
  v_target       uuid;
  v_lead_status  text;
  v_decision_project_id uuid;
  v_decision_dc_id      uuid;
BEGIN
  -- ── the engagement: any of its keys finds its document_state row (I8) ───
  SELECT to_jsonb(d) INTO v_row
  FROM public.document_state AS d
  WHERE d.engagement_id = p_id
     OR d.project_id = p_id
     OR d.proposal_id = p_id
     OR d.lead_id = p_id
  LIMIT 1;

  IF v_row IS NOT NULL THEN
    v_kind        := v_row->>'engagement_kind';
    v_project_id  := (v_row->>'project_id')::uuid;
    v_proposal_id := (v_row->>'proposal_id')::uuid;

    IF v_kind = 'relationship' THEN
      v_dc_id := (v_row->>'engagement_id')::uuid;
    ELSIF v_kind = 'proposal' THEN
      SELECT pr.designer_client_id INTO v_dc_id
      FROM public.proposals AS pr
      WHERE pr.id = v_proposal_id;
    ELSIF v_kind = 'project' THEN
      SELECT pr.designer_client_id,
             p.studio_id,
             coalesce(
               (SELECT tm.user_id
                FROM public.project_team_members AS tm
                WHERE tm.project_id = p.id
                  AND tm.role = 'lead_designer'
                  AND tm.removed_at IS NULL
                ORDER BY greatest(tm.assigned_at, tm.updated_at) DESC, tm.user_id
                LIMIT 1),
               p.lead_designer_id,
               p.designer_id)
        INTO v_dc_id, v_studio_id, v_lead_user_id
      FROM public.projects AS p
      LEFT JOIN public.proposals AS pr ON pr.id = p.proposal_id
      WHERE p.id = v_project_id;
    END IF;

    RETURN jsonb_build_object(
      'kind', 'engagement',
      'row', v_row,
      'ids', jsonb_build_object(
        'project_id',         v_project_id,
        'proposal_id',        v_proposal_id,
        'lead_id',            (v_row->>'lead_id')::uuid,
        'designer_client_id', v_dc_id,
        'studio_id',          v_studio_id,
        'lead_user_id',       v_lead_user_id));
  END IF;

  -- ── R6: the document grew across the signing moment. An activated
  --    proposal's id redirects to its project document, so pre-signing links
  --    survive the signing. ─────────────────────────────────────────────────
  SELECT pr.project_id INTO v_target
  FROM public.proposals AS pr
  WHERE pr.id = p_id;
  IF v_target IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'redirect', 'projectId', v_target);
  END IF;

  -- ── F1: the document grew across the intake moment. Accept converts the
  --    lead into a designer_clients relationship (00224), whose row is the
  --    document's new identity (shape D), so a pre-accept link redirects
  --    there. ────────────────────────────────────────────────────────────────
  SELECT l.status INTO v_lead_status
  FROM public.leads AS l
  WHERE l.id = p_id;
  IF v_lead_status = 'accepted' THEN
    SELECT dc.id INTO v_target
    FROM public.designer_clients AS dc
    WHERE dc.lead_id = p_id
    LIMIT 1;
    IF v_target IS NOT NULL THEN
      RETURN jsonb_build_object('kind', 'redirect', 'projectId', v_target);
    END IF;
  END IF;

  -- ── J6: the document grew across the Direction-start moment.
  --    begin_direction_from_discovery (00327) stamps a fresh draft proposal's
  --    designer_client_id to this relationship's own id, and shape D then
  --    excludes the relationship, so the pre-Direction URL redirects to the
  --    chain. clone_proposal carries the link onto every revision, so several
  --    rows can match. An activated project wins over any live row; among the
  --    live rows, the chain root wins, as in shape B
  --    (coalesce(parent_proposal_id, id)).
  --    NAV-1 tie-break: clone_proposal(p_mode='duplicate') keeps
  --    designer_client_id but starts a fresh root, so two unrelated chains can
  --    share one relationship. Order by created_at, then id, so the pick is
  --    deterministic and prefers the oldest chain. ───────────────────────────
  SELECT pr.project_id INTO v_target
  FROM public.proposals AS pr
  WHERE pr.designer_client_id = p_id
    AND pr.project_id IS NOT NULL
  ORDER BY pr.created_at, pr.id
  LIMIT 1;
  IF v_target IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'redirect', 'projectId', v_target);
  END IF;

  SELECT coalesce(pr.parent_proposal_id, pr.id) INTO v_target
  FROM public.proposals AS pr
  WHERE pr.designer_client_id = p_id
    AND pr.status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
  ORDER BY pr.created_at, pr.id
  LIMIT 1;
  IF v_target IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'redirect', 'projectId', v_target);
  END IF;

  -- ── R21 (the dissolve): a client_decision never had a document of its
  --    own; it is a margin item in the document it belongs to.
  --    /portal/decisions/[id]'s permanent redirect rides this leg. The project
  --    document wins when it exists; a decision recorded before a project
  --    hops to its relationship (designer_client_id is NOT NULL). Either target
  --    comes back through this function, so a stale relationship id lands on
  --    'missing' instead of a blank. ─────────────────────────────────────────
  SELECT cd.project_id, cd.designer_client_id
    INTO v_decision_project_id, v_decision_dc_id
  FROM public.client_decisions AS cd
  WHERE cd.id = p_id;
  IF coalesce(v_decision_project_id, v_decision_dc_id) IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'redirect',
      'projectId', coalesce(v_decision_project_id, v_decision_dc_id));
  END IF;

  RETURN jsonb_build_object('kind', 'missing');
END;
$$;

COMMENT ON FUNCTION public.document_open(uuid) IS
  'Opens a Document in one read (00792, US-34 N9): {kind:engagement, row, ids} when the id is '
  'any key of a document_state row, {kind:redirect, projectId} when the document has moved '
  '(R6 signing, F1 intake, J6 Direction start, R21 decision), else {kind:missing}. '
  'SECURITY INVOKER: every read is one the caller''s RLS already admits.';

REVOKE ALL ON FUNCTION public.document_open(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.document_open(uuid) TO authenticated;

COMMIT;
