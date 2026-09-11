-- ═══════════════════════════════════════════════════════════════════════════
-- 00599 — resolve_time_rate_cents: the one answer to "what is this hour worth"
--
-- HT-1 (W1): "The server owns hourly_rate_cents on every project kind; a
-- client-supplied rate is discarded. Non-services projects lose the legacy
-- change-order leg." This is the single resolver 00601's classifier calls on
-- EVERY branch. It is a separate function on purpose — the classifier is a
-- 222-line monolith holding ceiling accrual, retainer gating and three
-- immutability raises (00578:2599-2820), and a rate chain grown inside it
-- would be a fourth thing to re-derive at every future graft.
--
-- Order (HT-1 + HT-2-as-settled by HT-1's ruled sentence):
--   1. a signed project_billing_authority_rates row covering p_at, matched on
--      the member's roster role            → ('authority')
--   2. a studio_member_rates row covering p_at (00598)
--                                          → ('studio_member')
--   3. nothing                             → (NULL, 'none')
-- `change_order_terms->>'hourly_rate_cents'` is CUT (HT-1, ruled).
-- profiles.default_hourly_rate_cents is NOT a leg; 00600 reserves
-- 'profile_default' in the CHECK so LEAH-23's tier 3 is one branch away.
--
-- p_rate_role is HT-41's role pick, already validated by the caller against the
-- member's live roster rows (00601 raises on a role the member does not hold).
-- Passed NULL, the role is derived the way 00578:2708-2718 derives it: the
-- project's own designer is 'lead_designer'; anyone else is their single live
-- roster role, or NULL when they hold more than one.
--
-- 00484 contract (§0.16): SECURITY DEFINER, pinned search_path, a caller assert
-- on the user-supplied scope, REVOKE from PUBLIC/anon and an explicit GRANT to
-- authenticated. A NULL auth.uid() (a migration or trigger running as postgres)
-- bypasses the assert, matching 00317:38-39's precedent — this function
-- REFUSES rather than GRANTS, so the bypass cannot manufacture access.
--
-- Lineage: new function — nothing is redefined.
-- Reconciles: the three 00578 branches that leave the rate client-owned are
-- fixed in 00601, not here; this file only supplies the answer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_time_rate_cents(
  p_project_id uuid,
  p_user_id    uuid,
  p_at         timestamptz,
  p_rate_role  text DEFAULT NULL
)
RETURNS TABLE (cents integer, source text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id    uuid;
  v_studio_id      uuid;
  v_role           text;
  v_normalized     text;
  v_authority_id   uuid;
  v_version        integer;
  v_match_count    integer := 0;
  v_cents          integer;
BEGIN
  SELECT project.designer_id, project.studio_id
    INTO v_designer_id, v_studio_id
  FROM public.projects AS project
  WHERE project.id = p_project_id;

  -- projects.studio_id is NULL on legacy rows (§0.13 — which is why it is never
  -- a POLICY key). The fallback is _agreement_studio_id's ladder (00576:536-556):
  -- the designer's own active, non-guest design studio.
  IF v_studio_id IS NULL AND v_designer_id IS NOT NULL THEN
    SELECT studio.id INTO v_studio_id
    FROM public.organizations AS studio
    JOIN public.organization_members AS membership
      ON membership.organization_id = studio.id
     AND membership.user_id = v_designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND membership.status = 'active'
      AND membership.role <> 'guest'
    ORDER BY (membership.role = 'owner') DESC,
             membership.joined_at NULLS LAST,
             membership.created_at,
             studio.id
    LIMIT 1;
  END IF;

  -- Caller assert: you may resolve your own rate; resolving someone else's is a
  -- studio owner/admin act.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(public.is_org_admin_or_owner(v_studio_id), false)
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: only a studio owner or admin may resolve another member''s rate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_role := NULLIF(btrim(COALESCE(p_rate_role, '')), '');
  IF v_role IS NULL THEN
    IF v_designer_id IS NOT NULL AND v_designer_id IS NOT DISTINCT FROM p_user_id THEN
      v_role := 'lead_designer';
    ELSE
      SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
        INTO v_role
      FROM public.project_team_members AS member
      WHERE member.project_id = p_project_id
        AND member.user_id    = p_user_id
        AND member.removed_at IS NULL;
    END IF;
  END IF;

  -- ── Tier 1: the signed authority rate covering p_at ──────────────────────
  SELECT authority.id INTO v_authority_id
  FROM public.project_billing_authorities AS authority
  WHERE authority.project_id = p_project_id
    AND authority.effective_at <= p_at
    AND (authority.ended_at IS NULL OR authority.ended_at > p_at)
  ORDER BY authority.effective_at DESC, authority.id DESC
  LIMIT 1;

  IF v_authority_id IS NOT NULL AND v_role IS NOT NULL THEN
    -- Same normalization 00578:2719-2722 uses, so the resolver and the
    -- classifier cannot disagree about which card a role matches.
    v_normalized := regexp_replace(
      replace(lower(btrim(v_role)), '_', ' '), '\s+', ' ', 'g'
    );

    SELECT max(rate.version) INTO v_version
    FROM public.project_billing_authority_rates AS rate
    JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority_id
      AND src.effective_at <= p_at;

    IF v_version IS NOT NULL THEN
      SELECT count(*), min(rate.hourly_rate_cents)
        INTO v_match_count, v_cents
      FROM public.project_billing_authority_rates AS rate
      JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority_id
        AND rate.version = v_version
        AND src.effective_at <= p_at
        AND regexp_replace(
              replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
            ) = v_normalized;

      IF v_match_count = 1 THEN
        RETURN QUERY SELECT v_cents, 'authority'::text, v_role;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- ── Tier 2: the studio's per-member rate (00598) ─────────────────────────
  IF v_studio_id IS NOT NULL THEN
    SELECT rate.hourly_rate_cents INTO v_cents
    FROM public.studio_member_rates AS rate
    WHERE rate.studio_id = v_studio_id
      AND rate.user_id   = p_user_id
      AND rate.effective_from <= p_at::date
      AND (rate.effective_to IS NULL OR rate.effective_to >= p_at::date)
    ORDER BY rate.effective_from DESC
    LIMIT 1;

    IF v_cents IS NOT NULL THEN
      RETURN QUERY SELECT v_cents, 'studio_member'::text, v_role;
      RETURN;
    END IF;
  END IF;

  -- ── Tier 3: nothing. "Rate pending" (HT-26), never a blank. ──────────────
  RETURN QUERY SELECT NULL::integer, 'none'::text, v_role;
END;
$$;

COMMENT ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text) IS
  'HT-1: the ONE rate chain — signed authority rate → studio_member_rates → '
  'none. Returns (cents, source, role); source is one of authority / '
  'studio_member / none. The legacy change-order leg is cut and '
  'profiles.default_hourly_rate_cents is not a leg.';

REVOKE EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  TO authenticated;

DO $postcondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_time_rate_cents'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION '00599: resolve_time_rate_cents must exist and be SECURITY DEFINER';
  END IF;

  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       ~ 'change_order_terms'
  THEN
    RAISE EXCEPTION '00599: the legacy change-order rate leg is CUT by HT-1 and must not reappear';
  END IF;

  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       ~ 'default_hourly_rate_cents'
  THEN
    RAISE EXCEPTION '00599: profiles.default_hourly_rate_cents is not a resolver leg (HT-2 unruled)';
  END IF;

  IF has_function_privilege('anon', 'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '00599: anon must not hold EXECUTE on resolve_time_rate_cents';
  END IF;
END
$postcondition$;
