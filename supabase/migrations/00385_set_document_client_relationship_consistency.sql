-- ═══════════════════════════════════════════════════════════════════════════
-- 00385 — set_document_client: keep proposal identity legs consistent
--
-- Function-body lineage: 00225 → 00385 (whole body reproduced/replaced).
--
-- proposals.client_id is the registered profile while
-- proposals.designer_client_id is the designer-owned relationship that names
-- the household and feeds document_state letterhead. Updating only client_id
-- can therefore send to one client while the document still names another.
-- This revision resolves one owned relationship and updates both proposal legs
-- in the same transaction. It deliberately does not touch proposal money,
-- content, send validation, or any prior client's lifecycle state.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_document_client(
  p_engagement_kind text,   -- 'project' | 'proposal'
  p_target_id        uuid,   -- project/proposal id
  p_client_id        uuid    -- profiles.id to link, or NULL to unlink
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer                    uuid := auth.uid();
  v_target_designer             uuid;
  v_current_designer_client_id  uuid;
  v_relationship                public.designer_clients%ROWTYPE;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'set_document_client requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_engagement_kind NOT IN ('project', 'proposal') THEN
    RAISE EXCEPTION 'unknown engagement kind %', p_engagement_kind
      USING ERRCODE = 'check_violation';
  END IF;

  -- Authorize and lock the document before resolving a relationship. This
  -- gives missing and foreign documents the same result and makes the final
  -- identity update stable against another attachment attempt.
  IF p_engagement_kind = 'project' THEN
    SELECT designer_id
    INTO v_target_designer
    FROM public.projects
    WHERE id = p_target_id
    FOR UPDATE;
  ELSE
    SELECT designer_id, designer_client_id
    INTO v_target_designer, v_current_designer_client_id
    FROM public.proposals
    WHERE id = p_target_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND OR v_target_designer IS DISTINCT FROM v_designer THEN
    RAISE EXCEPTION 'no % owned by you with id %', p_engagement_kind, p_target_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_client_id IS NOT NULL THEN
    -- 00331 permits multiple status='lead' engagement rows for a repeat-client
    -- pair while retaining at most one non-lead canonical relationship. For a
    -- proposal, preserve its current captured engagement if invite-and-link has
    -- just populated that row's client_id. Otherwise prefer the canonical row,
    -- then choose deterministically among lead engagements.
    SELECT dc.*
    INTO v_relationship
    FROM public.designer_clients AS dc
    WHERE dc.designer_id = v_designer
      AND dc.client_id = p_client_id
    ORDER BY
      COALESCE(dc.id = v_current_designer_client_id, false) DESC,
      (dc.status <> 'lead') DESC,
      dc.updated_at DESC,
      dc.created_at DESC,
      dc.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'client % is not one of your clients', p_client_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    v_relationship := NULL;
  END IF;

  IF p_engagement_kind = 'project' THEN
    UPDATE public.projects
    SET client_id = p_client_id,
        updated_at = now()
    WHERE id = p_target_id;
  ELSE
    UPDATE public.proposals
    SET client_id = p_client_id,
        designer_client_id = CASE
          WHEN p_client_id IS NULL THEN NULL
          ELSE v_relationship.id
        END,
        updated_at = now()
    WHERE id = p_target_id;
  END IF;

  -- Advance only the relationship selected above. Pair-wide updates are unsafe
  -- now that 00331 allows engagement-specific lead rows. When a proposal keeps
  -- its captured lead alongside an existing non-lead relationship, retain lead:
  -- promoting it would violate the canonical non-lead unique index and erase
  -- the repeat engagement's identity.
  IF p_client_id IS NOT NULL THEN
    IF p_engagement_kind = 'project'
       AND v_relationship.status IN ('lead', 'proposal')
    THEN
      UPDATE public.designer_clients
      SET status = 'active',
          updated_at = now()
      WHERE id = v_relationship.id;
    ELSIF p_engagement_kind = 'proposal'
          AND v_relationship.status = 'lead'
          AND NOT EXISTS (
            SELECT 1
            FROM public.designer_clients AS canonical
            WHERE canonical.designer_id = v_designer
              AND canonical.client_id = p_client_id
              AND canonical.id <> v_relationship.id
              AND canonical.status <> 'lead'
          )
    THEN
      UPDATE public.designer_clients
      SET status = 'proposal',
          updated_at = now()
      WHERE id = v_relationship.id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_document_client(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_document_client(text, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.set_document_client(text, uuid, uuid) IS
  'Owner-scoped atomic document attachment. Proposals update client_id and the '
  'resolved designer_client_id together (or clear both), preserving a captured '
  'same-household engagement when it matches; projects update their sole '
  'client_id leg. Advances only the selected relationship without pair-wide '
  'promotion or any proposal money/content changes.';
