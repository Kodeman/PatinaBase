-- 00872 — Preserve proposal-chain aliases after revision activation (SQ-2006).
-- Lineage: 00792. Exact document_open graft; only the R6 fallback changes.
-- Read-only, SECURITY INVOKER. The activated target must itself be a readable
-- document in the same recorded studio. No proposal backlinks are written.
-- Existing signature, properties, comments and ACLs are retained by REPLACE.
-- No transaction wrapper: the migration runner/isolated oracle owns it.

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
  SELECT coalesce(pr.project_id, (
    -- clone_proposal records every revision against the same chain root;
    -- duplicate-mode proposals may share a relationship but are NOT aliases.
    SELECT revision.project_id
    FROM public.proposals AS revision
    JOIN public.projects AS project ON project.id = revision.project_id
    JOIN public.document_state AS target ON target.project_id = project.id
    WHERE coalesce(revision.parent_proposal_id, revision.id)
            = coalesce(pr.parent_proposal_id, pr.id)
      AND revision.designer_id = pr.designer_id
      AND revision.designer_client_id IS NOT DISTINCT FROM pr.designer_client_id
      AND revision.studio_id IS NOT DISTINCT FROM pr.studio_id
      AND project.studio_id IS NOT DISTINCT FROM pr.studio_id
      AND revision.status = 'accepted'
      AND revision.project_id IS NOT NULL
    ORDER BY revision.accepted_at DESC NULLS LAST,
             revision.version DESC NULLS LAST,
             revision.created_at DESC, revision.id DESC
    LIMIT 1
  )) INTO v_target
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
