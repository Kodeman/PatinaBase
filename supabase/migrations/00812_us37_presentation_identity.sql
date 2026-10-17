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
--   email         organizations.email (the firm's public email), else the
--                 lead's profiles.email
--   phone         the lead's profiles.phone, else organizations.phone
-- Nothing else from profiles or organizations. `{}` when nothing resolves.
-- profiles.email is the lead's sign-in address (00013 copies it from
-- auth.users), not one she chose to show, so a firm's public email always
-- wins over it (R178). Her phone is typed for clients on her account page,
-- so hers wins over the firm's.
--
-- WHOSE. The lead is projects.designer_id (contract: Lead = designer_id),
-- or the paper's designer_id when the paper has no project. A lead who has
-- since left the studio is still the lead: her name and phone stay (R178).
-- The firm is projects.studio_id. With no studio_id (a NULL-studio project,
-- or a paper with no project) the firm is the lead's studio only when she
-- holds exactly one: an active non-guest seat in an active design_studio,
-- the 00563 candidate rule. With two or more nothing is guessed: firmName,
-- logoUrl, website and the firm's email/phone fallbacks are all left out.
--
-- WHO MAY READ.
--   * The project's own client, or the paper's own client (never through an
--     unsent paper: the bundle's own draft rule, 00755:705, repeated here).
--   * With a studio_id on the project (or the paper's project): the FFE team
--     predicate, can_buy_for_project (00702; the 00721 FFE studio policies)
--     — the lead herself or an active non-guest member of THAT studio. A
--     member of some other studio the lead also holds is refused, and so is
--     a departed lead's new studio; the studio's remaining members are not.
--   * With no studio_id: the lead herself, or an active member of the one
--     studio resolved above. When no single studio resolves, only the lead.
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
  v_actor        uuid := auth.uid();
  v_project      public.projects%ROWTYPE;
  v_proposal     public.proposals%ROWTYPE;
  v_is_client    boolean;
  v_lead         uuid;
  v_studio       uuid;
  v_studio_count integer := 0;
  v_org          public.organizations%ROWTYPE;
  v_profile      public.profiles%ROWTYPE;
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
    IF NOT FOUND THEN
      RAISE EXCEPTION 'presentation not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal.project_id IS NOT NULL THEN
      SELECT * INTO v_project FROM public.projects WHERE id = v_proposal.project_id;
    END IF;
    v_is_client := v_proposal.client_id IS NOT DISTINCT FROM v_actor;
    v_lead := CASE WHEN v_project.id IS NOT NULL THEN v_project.designer_id
                   ELSE v_proposal.designer_id END;
  ELSE
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'presentation not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_is_client := v_project.client_id IS NOT DISTINCT FROM v_actor;
    v_lead := v_project.designer_id;
  END IF;

  -- The firm: the project's studio, else the lead's one studio, else none.
  v_studio := v_project.studio_id;
  IF v_studio IS NULL AND v_lead IS NOT NULL THEN
    SELECT count(DISTINCT membership.organization_id),
           (array_agg(DISTINCT membership.organization_id
                      ORDER BY membership.organization_id))[1]
      INTO v_studio_count, v_studio
      FROM public.organization_members AS membership
      JOIN public.organizations AS studio ON studio.id = membership.organization_id
     WHERE membership.user_id = v_lead
       AND membership.status = 'active'
       AND membership.role <> 'guest'
       AND studio.type = 'design_studio'
       AND studio.status = 'active';
    IF v_studio_count <> 1 THEN
      v_studio := NULL;
    END IF;
  END IF;

  IF NOT (
    v_is_client
    OR CASE
         WHEN v_project.studio_id IS NOT NULL
           THEN public.can_buy_for_project(v_project.id)
         ELSE v_actor IS NOT DISTINCT FROM v_lead
              OR (v_studio IS NOT NULL AND public.is_active_org_member(v_studio))
       END
  ) THEN
    RAISE EXCEPTION 'presentation not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_proposal_id IS NOT NULL THEN
    -- The bundle's rule (00755:705): a client never sees an unsent paper.
    IF v_is_client
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
  END IF;

  IF v_studio IS NOT NULL THEN
    SELECT * INTO v_org FROM public.organizations WHERE id = v_studio;
  END IF;
  IF v_lead IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_lead;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    -- An ambiguous lead's business_name could be either studio's: left out too.
    'firmName',     CASE WHEN v_studio_count > 1 THEN NULL
                         ELSE COALESCE(NULLIF(btrim(v_org.name), ''),
                                       NULLIF(btrim(v_profile.business_name), ''))
                    END,
    'logoUrl',      NULLIF(btrim(v_org.logo_url), ''),
    'website',      NULLIF(btrim(v_org.website), ''),
    'designerName', COALESCE(NULLIF(btrim(v_profile.full_name), ''),
                             NULLIF(btrim(v_profile.display_name), '')),
    'email',        COALESCE(NULLIF(btrim(v_org.email), ''),
                             NULLIF(btrim(v_profile.email), '')),
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
  'key omitted when blank. The lead (projects.designer_id, or the paper''s designer when it has no '
  'project) answers name and phone; the firm''s public email wins over the lead''s sign-in email '
  '(R178). The firm is projects.studio_id, else the lead''s studio only when she holds exactly one '
  '(several: no firm fields). Nothing else from profiles or organizations. Readable by the '
  'project''s or paper''s own client (never an unsent paper); with a studio_id, by '
  'can_buy_for_project (the lead or an active member of that studio); without one, by the lead or '
  'an active member of her one studio.';

COMMIT;
