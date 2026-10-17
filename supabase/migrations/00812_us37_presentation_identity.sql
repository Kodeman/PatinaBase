-- ═══════════════════════════════════════════════════════════════════════════
-- 00812 — US-37 #6: who presents the approval to the client (D8)
--
-- Number reserved in the US-37 execution contract (00812: branding). One new
-- function; no table, column, policy or trigger changes.
--
-- WHY A NEW READER. The client's approval presentation (the Threshold, where
-- she approves pieces and signs papers, and the paper read in full) has to
-- carry the studio's mark and the lead designer's contact. A homeowner holds
-- no grant on organizations, and the existing brand resolver
-- (resolve_studio_identity, 00320/00571) is anon-granted and brand-only by
-- design: it must not grow contact columns. Nor may this ride inside
-- get_client_project_selections or any other curated client reader that
-- US-37's 00807/00811 redefine, where a later CREATE OR REPLACE would drop
-- it. So it is its own curated SECURITY DEFINER read.
--
-- WHAT IT RETURNS. An allowlisted jsonb with at most these six keys, each
-- omitted when it has no value (blank strings count as no value):
--   firmName      organizations.name, else the lead's profiles.business_name
--   logoUrl       organizations.logo_url
--   website       organizations.website
--   designerName  the lead's profiles.full_name, else display_name
--   email         the lead's profiles.email, else organizations.email
--   phone         the lead's profiles.phone, else organizations.phone
-- Nothing else from profiles or organizations. `{}` when nothing resolves.
--
-- WHOSE. The lead is projects.designer_id (contract: Lead = designer_id).
-- The firm is projects.studio_id, else the lead's primary studio — the same
-- precedence resolve_studio_identity applies, so the presentation and the
-- letterhead never name two different studios. A paper with no project
-- (an origin agreement) resolves through its own designer_id.
--
-- WHO MAY READ. The project's (or paper's) own client, or a studio co-member
-- of its designer previewing the client view — the same gate
-- get_client_project_selections and get_client_commercial_document_bundle
-- apply. A client never reads another studio's identity through a project or
-- paper that is not hers, and never through an unsent paper (the bundle's
-- own draft rule, repeated here).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.get_client_presentation_identity(
  p_project_id  uuid DEFAULT NULL,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_project  public.projects%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_lead     uuid;
  v_studio   uuid;
  v_org      public.organizations%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (p_project_id IS NULL) = (p_proposal_id IS NULL) THEN
    RAISE EXCEPTION 'pass exactly one of p_project_id, p_proposal_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_proposal_id IS NOT NULL THEN
    SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
    IF NOT FOUND OR NOT (
      v_proposal.client_id IS NOT DISTINCT FROM v_actor
      OR public.is_studio_comember(v_proposal.designer_id)
    ) THEN
      RAISE EXCEPTION 'presentation not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The bundle's rule (00755:705): a client never sees an unsent paper.
    IF v_proposal.client_id IS NOT DISTINCT FROM v_actor
       AND (
         (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
         OR (v_proposal.document_kind <> 'legacy'
             AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
         OR (v_proposal.document_kind <> 'legacy'
             AND COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined')
             AND v_proposal.sent_at IS NULL)
       ) THEN
      RAISE EXCEPTION 'presentation not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_proposal.project_id IS NOT NULL THEN
      SELECT * INTO v_project FROM public.projects WHERE id = v_proposal.project_id;
    END IF;
    IF v_project.id IS NOT NULL THEN
      v_lead   := v_project.designer_id;
      v_studio := v_project.studio_id;
    ELSE
      v_lead := v_proposal.designer_id;
    END IF;
  ELSE
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    IF NOT FOUND OR NOT (
      v_project.client_id IS NOT DISTINCT FROM v_actor
      OR public.is_studio_comember(v_project.designer_id)
    ) THEN
      RAISE EXCEPTION 'presentation not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_lead   := v_project.designer_id;
    v_studio := v_project.studio_id;
  END IF;

  IF v_studio IS NULL AND v_lead IS NOT NULL THEN
    v_studio := public._primary_studio_for(v_lead);
  END IF;
  IF v_studio IS NOT NULL THEN
    SELECT * INTO v_org FROM public.organizations WHERE id = v_studio;
  END IF;
  IF v_lead IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_lead;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'firmName',     COALESCE(NULLIF(btrim(v_org.name), ''),
                             NULLIF(btrim(v_profile.business_name), '')),
    'logoUrl',      NULLIF(btrim(v_org.logo_url), ''),
    'website',      NULLIF(btrim(v_org.website), ''),
    'designerName', COALESCE(NULLIF(btrim(v_profile.full_name), ''),
                             NULLIF(btrim(v_profile.display_name), '')),
    'email',        COALESCE(NULLIF(btrim(v_profile.email), ''),
                             NULLIF(btrim(v_org.email), '')),
    'phone',        COALESCE(NULLIF(btrim(v_profile.phone), ''),
                             NULLIF(btrim(v_org.phone), ''))
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_presentation_identity(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_presentation_identity(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_presentation_identity(uuid, uuid) IS
  'US-37 #6 (00812, D8): who presents an approval to the client. Pass exactly one of a project or a '
  'paper (proposal). Returns at most {firmName, logoUrl, website, designerName, email, phone}, each '
  'key omitted when blank: the lead (projects.designer_id, or the paper''s designer when it has no '
  'project) answers name/email/phone first, the firm (projects.studio_id, else the lead''s primary '
  'studio) answers email/phone when the lead''s are blank. Nothing else from profiles or '
  'organizations. Readable by the project''s or paper''s own client (never an unsent paper) and by '
  'studio co-members of its designer.';

COMMIT;
