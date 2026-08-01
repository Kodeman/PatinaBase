-- ═════════════════════════════════════════════════════════════════════════
-- 00386 — Begin Discovery is one authenticated transaction
--
-- The browser previously accepted a lead and then performed a second,
-- multi-query designer_clients write. A failure between those acts left an
-- accepted Brief with no Discovery document. This RPC owns the lead lock,
-- duplicate resolution, relationship write, and accepted stamp together.
--
-- Registered-profile resolution deliberately matches 00331:
--   1. reuse this lead's lead-status engagement;
--   2. adopt a virgin lead-status row for this designer/profile pair;
--   3. insert a fresh lead engagement.
-- An existing active/proposal relationship is never downgraded. Profile-less
-- leads retain the existing email-dedupe behavior used by the portal.
-- ═════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.begin_discovery(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
  v_relationship public.designer_clients%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'begin_discovery requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_studio_comember(v_lead.designer_id) THEN
    RAISE EXCEPTION 'lead % not found or access denied', p_lead_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_lead.status NOT IN ('new', 'viewed', 'contacted', 'accepted') THEN
    RAISE EXCEPTION 'lead % cannot begin discovery from status %',
      p_lead_id, v_lead.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Preserve the visible transition order of the old browser act while making
  -- it transactional: any relationship failure below rolls this stamp (and
  -- its status-change trigger effects) back with the statement.
  UPDATE public.leads
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  IF v_lead.homeowner_id IS NOT NULL THEN
    -- 00331 duplicate policy: this engagement, then an unclaimed lead-stage
    -- engagement for the pair. Engaged non-lead rows are intentionally absent.
    SELECT * INTO v_relationship
    FROM public.designer_clients
    WHERE designer_id = v_lead.designer_id
      AND lead_id = p_lead_id
      AND status = 'lead'
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT * INTO v_relationship
      FROM public.designer_clients
      WHERE designer_id = v_lead.designer_id
        AND client_id = v_lead.homeowner_id
        AND status = 'lead'
        AND lead_id IS NULL
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.designer_clients
        SET source = 'lead',
            lead_id = p_lead_id,
            updated_at = now()
        WHERE id = v_relationship.id
        RETURNING * INTO v_relationship;
      ELSE
        INSERT INTO public.designer_clients (
          designer_id, client_id, source, lead_id, status
        )
        VALUES (
          v_lead.designer_id, v_lead.homeowner_id, 'lead', p_lead_id, 'lead'
        )
        RETURNING * INTO v_relationship;
      END IF;
    END IF;
  ELSE
    -- Profile-less semantics: exact lead first, then the partial-email-index
    -- identity (designer_id, client_email) while client_id remains NULL.
    SELECT * INTO v_relationship
    FROM public.designer_clients
    WHERE designer_id = v_lead.designer_id
      AND lead_id = p_lead_id
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND AND v_lead.contact_email IS NOT NULL THEN
      SELECT * INTO v_relationship
      FROM public.designer_clients
      WHERE designer_id = v_lead.designer_id
        AND client_email = v_lead.contact_email
        AND client_id IS NULL
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF FOUND THEN
      UPDATE public.designer_clients
      SET client_id = NULL,
          client_name = v_lead.contact_name,
          client_email = v_lead.contact_email,
          source = 'lead',
          lead_id = p_lead_id,
          status = 'lead',
          updated_at = now()
      WHERE id = v_relationship.id
      RETURNING * INTO v_relationship;
    ELSIF v_lead.contact_email IS NOT NULL THEN
      -- The conflict arm closes the two-lead/same-email race without exposing
      -- a browser retry seam; it intentionally preserves the prior email reuse.
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, source, lead_id, status
      )
      VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, v_lead.contact_email,
        'lead', p_lead_id, 'lead'
      )
      ON CONFLICT (designer_id, client_email)
        WHERE client_email IS NOT NULL AND client_id IS NULL
      DO UPDATE SET
        client_name = EXCLUDED.client_name,
        source = 'lead',
        lead_id = EXCLUDED.lead_id,
        status = 'lead',
        updated_at = now()
      RETURNING * INTO v_relationship;
    ELSE
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, source, lead_id, status
      )
      VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, NULL,
        'lead', p_lead_id, 'lead'
      )
      RETURNING * INTO v_relationship;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'designerClientId', v_relationship.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_discovery(uuid) TO authenticated;

COMMENT ON FUNCTION public.begin_discovery(uuid) IS
  'Authenticated, studio-scoped atomic Brief→Discovery transition. Locks the '
  'lead, resolves or creates its Discovery relationship under the 00331 '
  'never-downgrade policy (with profile-less email reuse), accepts the lead, '
  'and returns {lead, designerClientId} in one transaction.';
