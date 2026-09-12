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
-- p_rate_role is HT-41's role pick. Passed NULL, the role is derived the way
-- 00578:2708-2718 derives it: the project's own designer is 'lead_designer';
-- anyone else is their single live roster role, or NULL when they hold more than
-- one.
--
-- 00484 contract (§0.16): SECURITY DEFINER, pinned search_path, a caller assert
-- on the user-supplied scope, REVOKE from PUBLIC/anon and an explicit GRANT to
-- authenticated. A NULL auth.uid() (a migration or trigger running as postgres)
-- bypasses the asserts, matching 00317:38-39's precedent — this function
-- REFUSES rather than GRANTS, so the bypass cannot manufacture access.
--
-- REVIEW ROUND 1 — THREE AUTHORIZATION REPAIRS AND TWO CORRECTNESS ONES:
--
--  · W1-R1-01 (the hole). The first revision asserted only
--    `p_user_id = auth.uid()` and never any relationship to p_project_id, while
--    it is GRANTed to authenticated. Measured: a brand-new authenticated user who
--    can read ZERO rows of project_billing_authority_rates pulled the signed
--    cards for an arbitrary project id out of this function
--    (p_rate_role='lead_designer' → 25000 'authority'; 'vendor' → 9000) — a table
--    otherwise gated to studio co-members and the client. ASSERT 1 below closes
--    it: the caller must be rostered on the project, be its designer, be a studio
--    co-member of its designer, or be an owner/admin of the resolved studio —
--    exactly the set of actors the shipped project_time_entries write policies
--    already admit, so the trigger path is unaffected.
--
--  · W1-R1-01, second half. p_rate_role was taken verbatim. A direct caller can
--    therefore aim the role at whichever signed card pays best. ASSERT 3 below
--    validates it against p_user_id's LIVE project_team_members rows, the same
--    EXISTS 00601 uses — but ONLY at the RPC boundary (pg_trigger_depth() = 0).
--    Inside the classifier trigger, 00601 delta 1 owns validation and validates
--    only a NEW pick, because re-validating a role already recorded on a row
--    freezes that row for ever once the owner removes the roster seat the role
--    came from (W1-R1-03). Re-validating here would reintroduce exactly that
--    freeze through the back door.
--
--  · W1-R1-05 (an undeclared narrowing). `Designers manage their project time
--    entries` (00177:136-137) is an ALL policy qualified only on
--    projects.designer_id = auth.uid() with NO user_id leg, so before W1 a
--    project designer could correct a TEAMMATE's entry. 00601 calls this resolver
--    on every classifier fire with p_user_id = NEW.user_id, so the
--    "resolving someone else's rate is an owner/admin act" assert silently
--    revoked that capability for a designer who is a plain org member (measured:
--    the duration edit raised and the duration stayed 60). The project designer
--    leg is ADMITTED in ASSERT 2 rather than narrowed: W1 was not ruled to take a
--    capability away, and a silent narrowing is the defect.
--
--  · W1-R1-07 (the banner used to lie). Tier 1 required a ROLE-NAME match, while
--    the classifier falls back to the authority's single card when no role name
--    matches (00601:278-293). They therefore disagreed for every hour bound that
--    way, and the GRANTed RPC reported 'studio_member' for an hour the classifier
--    priced at the card rate. Tier 1 now carries the same single-card fallback,
--    so the claim that the two cannot disagree about which card a role matches is
--    true as written.
--
--  · W1-R1-11 (a day boundary). `p_at::date` casts in the SESSION time zone
--    inside a DEFINER function, so the same instant resolved to different days
--    for a member in another zone. The anchor is now explicitly UTC —
--    `(p_at AT TIME ZONE 'UTC')::date` — matching studio_member_rates.effective_*
--    being plain dates with no zone of their own.
--
-- REVIEW ROUND 2 — TWO REPAIRS:
--
--  · W1-R2-02 (the studio coin-flip). For a project with studio_id NULL — 5 of 6
--    projects rows on a freshly seeded stack — the studio that PRICES the hour was
--    chosen arbitrarily. fc_provision_studio_on_designer auto-provisions a personal
--    design studio and seats the designer as owner in the same transaction she
--    joins a real one, so every key above `studio.id` ties (owner on both,
--    joined_at and created_at both that transaction's now()) and the tiebreak was a
--    random uuid: the ladder run 8× over one fixture picked the auto-provisioned
--    studio 6 times. When the wrong studio won, tier 2 missed, the hour stored
--    NULL / 'none', printed "rate pending" and invoiced at $0 — the silent money
--    HT-1/HT-26 were ruled to end. On Strata it ties the WRONG way deterministically
--    (the personal studio is provisioned at signup, BEFORE she joins a studio, so
--    joined_at favours the one studio that never carries studio_member_rates rows).
--    The first key is now MEANINGFUL: the studio that actually holds a rate row for
--    p_user_id. Below it, `organizations.created_at` is inserted before `studio.id`
--    so no tiebreak is ever a uuid. NOTE on the earlier banner text: this ladder
--    does NOT "mirror _agreement_studio_id" and never could call it —
--    `public._agreement_studio_id(p_proposal_id uuid, p_actor uuid)`
--    (00576:504-576) takes a PROPOSAL id, not a project id, and asserts the ACTOR's
--    standing rather than the subject's. Its shape (a meaningful EXISTS first, a
--    total order below) is what is borrowed, and that is all the claim now is.
--
--  · W1-R2-03 (a pay-rate leak). ASSERT 2's designer leg was unconditional, so any
--    user who is the designer of ANY project could resolve ANY p_user_id's rate —
--    including a colleague with no relationship to that project — while RLS
--    (studio_member_rates_read_self_or_admin) gives her nothing. Measured as a
--    plain studio `member` who is a project designer: she reads 0 rows of
--    studio_member_rates for the colleague, yet this function returned
--    cents=47500 source=studio_member for him. User ids are on the roster and in
--    the People room, so every colleague's pay was enumerable. The leg's only
--    purpose (W1-R1-05) is the classifier's designer-on-behalf UPDATE, which
--    always runs at pg_trigger_depth() >= 1 — so it is gated on depth. At the RPC
--    boundary a project designer who is not a studio owner/admin may resolve only
--    her OWN rate.
--
-- REVIEW ROUND 3 — ONE REPAIR AND ONE RECORDED COUPLING:
--
--  · W1-R3-01 (a member could price her own hour). The fallback ladder's first key
--    was "this studio holds a rate row for p_user_id", which TIES the moment the
--    member holds a rate in two studios — and she can always create the second
--    one: 00295's fc_provision_studio_on_designer seats every is_designer profile
--    as OWNER of a personal one-person workspace, and
--    studio_member_rates_admin_insert (00598:213-226) asks only for
--    is_org_admin_or_owner(studio_id) plus subject membership, both of which she
--    satisfies about herself there. With the key tied, `(membership.role =
--    'owner') DESC` handed the pricing to the personal studio. Measured end to end
--    through RLS: a plain member of a multi-member studio priced at 15000 self-set
--    99900 in her own workspace and her next 120-minute entry stored
--    hourly_rate_cents=99900 rated_amount_cents=199800 rate_source=studio_member
--    billing_state=authorized — $1,998.00 authorized into project_unbilled_time,
--    the studio balance and the invoice composer, defeating HT-3 (owner/admin
--    only) and HT-1 (the server owns the rate). It needs no malice either: a
--    designer carrying a solo rate from before she joined a studio had that old
--    number beat her studio's. The live path is the fallback because
--    activate_proposal_as_project never sets projects.studio_id (probed: 5 of 6
--    seeded projects carry NULL). The repair is one key ABOVE the rate-existence
--    one — a studio with more than one active non-guest member outranks a
--    one-person workspace — so a solo designer's only studio still wins by being
--    the only candidate. Tightening the INSERT policy instead (refuse
--    user_id = auth.uid() unless a second owner/admin exists) would forbid a solo
--    owner setting her own rate at all, and populating projects.studio_id is
--    backfill-adjacent and outside W1 (§0.6, §0.13).
--
--  · W1-R3-06 (recorded, no separate change). ASSERT 2's pay-rate gate used to hold
--    INCIDENTALLY: a plain member of a multi-member studio who is the designer of a
--    studio_id-NULL project was refused a colleague's rate at depth 0 only because
--    the colleague HAD a rate row in the multi-member studio, which is what made
--    the rate-existence key pick a studio she is not an admin of. With no rate row
--    anywhere for the subject, the key tied, the owner tiebreak resolved v_studio_id
--    to HER personal studio and ASSERT 2 passed at depth 0 (no pay leaked, because
--    tier 2 then found nothing and tier 1 only returns a signed card rate a
--    co-member may already read). W1-R3-01's multi-member key removes the coupling:
--    the studio that employs her now wins regardless of where rate rows sit, so the
--    assert is a rule about the caller again and not a property of the ordering.
--    Recorded here so a future ladder edit cannot silently reopen the depth-0 door.
--
-- REVIEW ROUND 4 — THE SAME HOLE, ONE KEY DEEPER:
--
--  · W1-R4-01 + W1-R4-02 (one repair). Round 3's fix was a PROXY, and the member
--    controls the proxy. organization_members' only INSERT policy is
--    `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`, and 00295
--    makes her the OWNER of her personal workspace — so she can seat a second,
--    non-owner member there from the browser through RLS. Her workspace is then
--    "multi-member", the count key ties, the rate-existence key ties (both studios
--    hold a rate) and `(membership.role = 'owner') DESC` hands the pricing back to
--    her own number: measured end to end as the actor named, a self-set 99900
--    priced a 120-minute hour at $1,998.00 authorized — the identical figure round
--    3 reported as closed. Case (p) passed throughout, because its fixture leaves
--    the personal workspace at one member.
--
--    The count key also ASKED THE WRONG QUESTION. It asks "is this a real studio",
--    never "is this the studio that holds her rate", so it can pick a studio with
--    no rate row for her at all: a designer priced at 18000 in her own one-person
--    studio who is also a plain member of a three-person studio that has never
--    priced her resolved to 'none' — $0 into the unbilled view, the studio balance,
--    the composer and claim_time_entries' invoice lock (W1-R4-02, a regression
--    round 3 introduced; measured against round 2's ordering as a negative
--    control).
--
--    Both are one repair: rank first on an ARM'S-LENGTH rate — a rate this studio
--    holds for her whose created_by is not her. That is the only key the member
--    cannot manufacture (the INSERT policy's `created_by = auth.uid()` leg stamps
--    her own id on her own writes, and the UPDATE policy is owner/admin-only), and
--    an arm's-length rate is the only kind HT-3 contemplates. The bare
--    rate-existence key stays second and is what carries the solo designer; the
--    multi-member count survives as a third-level tiebreak. A naive strengthening
--    — `OR (member count) = 1` on the first key — was measured and FAILS case (p).
--    Case (r) pins the shape, with the collaborator seat written through RLS.
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
  -- a POLICY key). The fallback is the designer's own active, non-guest design
  -- studio, chosen in _agreement_studio_id's SHAPE (00576:504-576): one meaningful
  -- EXISTS first, then a total order with no uuid tiebreak.
  --
  -- W1-R2-02: the first key is the studio that actually holds a rate row for this
  -- member. Every key below it ties for the ordinary two-studio designer — she is
  -- owner of both, and 00295's fc_provision_studio_on_designer seats her in the
  -- personal one in the same transaction, so joined_at and created_at are the same
  -- now() — which made `studio.id` the real tiebreak: a coin flip locally, and on
  -- Strata a deterministic win for the personal studio that can never carry a rate.
  -- organizations.created_at sits above studio.id so the last resort is a fact
  -- about the studio, not its uuid.
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
    -- W1-R3-01 / W1-R4-01: the first key is "this studio holds a rate for her
    -- that she did NOT write herself". An ARM'S-LENGTH rate is the only kind
    -- HT-3 contemplates, and it is the one key the member cannot manufacture.
    --
    -- Round 3 ranked first on "is this a REAL studio" (more than one active
    -- non-guest member). That was a PROXY, and the member controls the proxy:
    -- organization_members' only INSERT policy is
    -- `is_org_admin_or_owner(organization_id) AND role <> 'owner'`, and 00295's
    -- fc_provision_studio_on_designer makes her the OWNER of a personal
    -- workspace — so she can seat a second, non-owner member there through RLS
    -- from the browser, her workspace becomes "multi-member", the count key ties,
    -- the rate-existence key ties (both studios hold a rate) and
    -- `(membership.role = 'owner') DESC` hands the pricing back to her own
    -- number. Measured through RLS as the actor named: a self-set 99900 priced a
    -- 120-minute hour at $1,998.00 authorized, defeating HT-3 (owner/admin only)
    -- and HT-1 (the server owns the rate) — the identical figure round 3
    -- reported as closed (W1-R4-01).
    --
    -- The member cannot write an arm's-length row about herself: the INSERT
    -- policy's `created_by = auth.uid()` leg means her own writes always stamp
    -- her own id, and studio_member_rates_admin_update is owner/admin-only, so
    -- she cannot relabel a row in a studio she is a plain member of either.
    -- created_by is nullable with ON DELETE SET NULL, so a row whose author's
    -- profile is gone reads as arm's-length — the safe direction.
    --
    -- The second key (a rate exists here at ALL) is what carries the solo
    -- designer whose only studio is her own workspace: her self-set rate is not
    -- arm's-length, so key 1 ties at false across her one candidate and key 2
    -- takes it. Adding an `OR (member count) = 1` escape to key 1 instead was
    -- measured and FAILS case (p) — it re-admits the one-person workspace above
    -- the studio that employs her. The multi-member count survives as a
    -- third-level tiebreak only, where it can no longer outrank a real rate.
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS arms_length
               WHERE arms_length.studio_id = studio.id
                 AND arms_length.user_id   = p_user_id
                 AND arms_length.created_by IS DISTINCT FROM p_user_id
             ) DESC,
             EXISTS (
               SELECT 1 FROM public.studio_member_rates AS priced
               WHERE priced.studio_id = studio.id
                 AND priced.user_id   = p_user_id
             ) DESC,
             ((
               SELECT count(*) FROM public.organization_members AS peer
               WHERE peer.organization_id = studio.id
                 AND peer.status = 'active'
                 AND peer.role <> 'guest'
             ) > 1) DESC,
             (membership.role = 'owner') DESC,
             membership.joined_at NULLS LAST,
             membership.created_at,
             studio.created_at,
             studio.id
    LIMIT 1;
  END IF;

  -- ── ASSERT 1 (W1-R1-01): a relationship to THIS project ──────────────────
  -- Without it, a GRANTed DEFINER function hands any authenticated stranger the
  -- signed rate cards of any project id they can guess. The four legs are the
  -- actors the shipped project_time_entries write policies already admit
  -- (00484:1712-1760's team quartet, 00177:136-137's designer ALL policy,
  -- 00316:242-246's studio co-member insert), so no legitimate write path loses.
  -- p_project_id IS NULL resolves to nothing and leaks nothing, so it is not
  -- asserted against.
  IF auth.uid() IS NOT NULL AND p_project_id IS NOT NULL
     AND NOT (
       COALESCE(public.is_project_team_member(p_project_id), false)
       OR v_designer_id IS NOT DISTINCT FROM auth.uid()
       OR COALESCE(public.is_studio_comember(v_designer_id), false)
       OR COALESCE(public.is_org_admin_or_owner(v_studio_id), false)
     )
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: no relationship to project %', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── ASSERT 2: you may resolve your own rate ──────────────────────────────
  -- Resolving someone ELSE's is the act of a studio owner/admin, or — INSIDE THE
  -- CLASSIFIER ONLY — of the project's own designer, whose `Designers manage their
  -- project time entries` policy lets her correct a teammate's entry and which an
  -- ungated assert would revoke in silence (W1-R1-05).
  --
  -- W1-R2-03: the designer leg is gated on pg_trigger_depth() > 0. Ungated it was a
  -- confidential-pay leak out of a GRANTed DEFINER function — a plain studio member
  -- who happens to be a project designer could read any colleague's studio rate by
  -- calling this with his user id, a number RLS gives her nothing of. Its only
  -- purpose is the classifier's designer-on-behalf UPDATE, which always runs at
  -- depth >= 1, so the gate costs that path nothing.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT (v_designer_id IS NOT DISTINCT FROM auth.uid()
              AND pg_catalog.pg_trigger_depth() > 0)
     AND NOT COALESCE(public.is_org_admin_or_owner(v_studio_id), false)
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: only a studio owner or admin may resolve another member''s rate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_role := NULLIF(btrim(COALESCE(p_rate_role, '')), '');

  -- ── ASSERT 3 (W1-R1-01): the role pick is validated AT THE RPC BOUNDARY ───
  -- Inside the classifier trigger (pg_trigger_depth() > 0) 00601 delta 1 owns
  -- this, and validates only a NEW pick on purpose: re-validating a role already
  -- recorded on a row freezes that row for ever the moment the owner removes the
  -- seat the role came from (W1-R1-03). A direct caller has no classifier in
  -- front of it, so the same EXISTS is applied here instead of trusting the
  -- argument.
  IF auth.uid() IS NOT NULL
     AND v_role IS NOT NULL
     AND pg_catalog.pg_trigger_depth() = 0
     AND NOT (
       (v_role = 'lead_designer' AND v_designer_id IS NOT DISTINCT FROM p_user_id)
       OR EXISTS (
         SELECT 1 FROM public.project_team_members AS member
         WHERE member.project_id = p_project_id
           AND member.user_id    = p_user_id
           AND member.removed_at IS NULL
           AND member.role       = v_role
       )
     )
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: rate_role % is not a role this member holds on the project', v_role
      USING ERRCODE = 'check_violation';
  END IF;

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

  IF v_authority_id IS NOT NULL THEN
    -- Same normalization 00578:2719-2722 uses, so the resolver and the
    -- classifier cannot disagree about which card a role matches.
    v_normalized := regexp_replace(
      replace(lower(btrim(COALESCE(v_role, ''))), '_', ' '), '\s+', ' ', 'g'
    );

    SELECT max(rate.version) INTO v_version
    FROM public.project_billing_authority_rates AS rate
    JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority_id
      AND src.effective_at <= p_at;

    IF v_version IS NOT NULL AND v_normalized <> '' THEN
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

    -- W1-R1-07: the classifier's own single-card fallback (00601:278-293) — when
    -- no role name matches (or no role is known) and the authority carries
    -- exactly ONE current card, that card prices the hour. Mirrored here, or the
    -- resolver reports 'studio_member' for an hour the classifier binds at the
    -- card rate and this file's own claim above is false.
    IF v_version IS NOT NULL THEN
      SELECT count(*), min(rate.hourly_rate_cents)
        INTO v_match_count, v_cents
      FROM public.project_billing_authority_rates AS rate
      JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority_id
        AND rate.version = v_version
        AND src.effective_at <= p_at;

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
      -- W1-R1-11: the anchor is UTC, explicitly. `p_at::date` cast in the session
      -- time zone inside a DEFINER function, so an hour logged near midnight
      -- landed on a different day for a member in another zone.
      -- studio_member_rates.effective_from/_to are plain dates with no zone of
      -- their own, so UTC is the one anchor that does not move with the caller.
      AND rate.effective_from <= (p_at AT TIME ZONE 'UTC')::date
      AND (rate.effective_to IS NULL
           OR rate.effective_to >= (p_at AT TIME ZONE 'UTC')::date)
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

  -- ── review round 1: the three asserts a future graft must not drop ────────
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'no relationship to project'
  THEN
    RAISE EXCEPTION '00599: the project-relationship assert is what keeps a GRANTed DEFINER from leaking signed rate cards (W1-R1-01)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'pg_trigger_depth'
  THEN
    RAISE EXCEPTION '00599: the RPC-boundary role validation was lost (W1-R1-01)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'AT TIME ZONE ''UTC'''
  THEN
    RAISE EXCEPTION '00599: the rate-boundary date anchor must be explicitly UTC (W1-R1-11)';
  END IF;

  -- ── review round 2: the two repairs a future graft must not drop ───────────
  -- W1-R2-02: the studio ladder must not terminate on studio.id alone — every key
  -- above it ties for the ordinary two-studio designer, so without a MEANINGFUL
  -- first key the studio that prices the hour is a uuid coin flip.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'priced\.studio_id = studio\.id'
  THEN
    RAISE EXCEPTION '00599: the studio fallback must order first on "this studio holds a rate for this member" — a uuid tiebreak is a coin flip (W1-R2-02)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'studio\.created_at'
  THEN
    RAISE EXCEPTION '00599: organizations.created_at must sit above studio.id so no tiebreak is ever a uuid (W1-R2-02)';
  END IF;
  -- ── review round 3 ────────────────────────────────────────────────────────
  -- W1-R3-01: the one-person-workspace key must sit ABOVE the rate-existence key,
  -- or a member prices her own hour out of the personal studio 00295 makes her the
  -- owner of.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'peer\.organization_id = studio\.id'
  THEN
    RAISE EXCEPTION '00599: the studio fallback must rank a multi-member studio above a one-person workspace (W1-R3-01)';
  END IF;
  -- ── review round 4 ──────────────────────────────────────────────
  -- W1-R4-01: the FIRST key must be the ARM'S-LENGTH rate — a rate this studio
  -- holds for her that she did not write herself. Round 3's multi-member count is
  -- a proxy the member controls (organization_members' INSERT policy lets the
  -- owner of her auto-provisioned personal workspace seat a second member there
  -- through RLS), so ranking on it first handed the pricing back to her own
  -- self-set number.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'arms_length\.created_by IS DISTINCT FROM p_user_id'
  THEN
    RAISE EXCEPTION '00599: the studio fallback must rank first on an ARM''S-LENGTH rate (created_by IS DISTINCT FROM the subject) — a member-count proxy is one the member controls (W1-R4-01)';
  END IF;
  -- And the ORDER of the three keys, pinned as text: arm's-length rate, then a
  -- bare rate, then the multi-member count. Below the bare rate-existence key the
  -- member's self-set rate wins the tie (W1-R3-01); above it, a studio that has
  -- never priced her wins and the hour resolves to $0 (W1-R4-02).
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'arms_length\.studio_id = studio\.id[\s\S]*priced\.studio_id = studio\.id[\s\S]*peer\.organization_id = studio\.id'
  THEN
    RAISE EXCEPTION '00599: the studio fallback keys must be ordered arm''s-length rate → any rate → multi-member count (W1-R4-01, W1-R4-02)';
  END IF;

  -- W1-R2-03: the designer-on-behalf leg is for the classifier, not for callers.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'pg_trigger_depth\(\) > 0'
  THEN
    RAISE EXCEPTION '00599: the designer-on-behalf leg must be gated on trigger depth, or any project designer can enumerate colleagues'' pay (W1-R2-03)';
  END IF;
END
$postcondition$;
