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
-- REVIEW ROUND 2 — ONE REPAIR THAT SURVIVES THE ROUND-8 LADDER REWRITE:
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
--    always runs at pg_trigger_depth() >= 1 — so it is gated on depth. The gate is
--    KEPT in round 8 even though EXECUTE is now revoked from authenticated
--    (W1-R7-04 below): a later wave that re-GRANTs the function must not reopen
--    this door by accident.
--
-- REVIEW ROUND 5 — HT-41's OWN LEVER (the one round-5 repair that is not a ladder
-- key, so the round-8 rewrite leaves it standing):
--
--  · W1-R5-03 — HT-41's role pick must not reach the project's own DESIGNER.
--    `Lead designers manage team members` (00177) is an ALL policy qualified on
--    projects.designer_id = auth.uid() with no with_check of its own, so she writes
--    her own roster rows: she seats herself as 'vendor', names it, and the signed
--    Vendor card prices her hour in place of her own Lead designer card —
--    rate_source still reading 'authority', so the row prints as a signed,
--    client-agreed rate and claim_time_entries invoice-locks it. Measured on cards
--    of 10000 / 40000: 40000 with the pick, 10000 with the pick omitted (negative
--    control). 00578:2708-2710 hard-coded her role BEFORE any roster read, so this
--    was W1's own regression; the designer branch regains precedence here and in
--    00601's ladder. Her pick is DISCARDED, not refused (§0.7's idiom) — ASSERT 3
--    still raises on a role she does not hold at all.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HT-3-a + HT-3-b + HT-3-c — WHICH STUDIO PRICES THE HOUR (all three RULED)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- HT-3-a (RULED by Kody, 2026-09-12): **the studio that prices an hour is derived
-- FROM THE PROJECT ONLY, and never from the MEMBER BEING PRICED.**
--
--   1. `projects.studio_id` when it is not NULL.
--   2. otherwise HT-3-b's two tiers over the PROJECT'S DESIGNER's own seats.
--   3. otherwise `rate_source = 'none'` — "rate pending" (HT-26).
--
-- 00602 stamps `projects.studio_id` at project INSERT by the same step-2 rule, so
-- (1) is the normal path.
--
-- HT-3-b (RULED 2026-09-12, review round 11): step 2's candidates are the studios
-- where the project's DESIGNER (`projects.designer_id`) holds an ACTIVE, NON-GUEST
-- `organization_members` row, taken in two tiers:
--   · the EMPLOYER tier — her seats with `role <> 'owner'`. EXACTLY ONE → it prices.
--   · only if there is no employer at all — the OWNED tier, `role = 'owner'`.
--     EXACTLY ONE → it prices.
--   · any tier with more than one candidate → NULL → step 3's 'none'.
-- There is NO rate-existence, seat-date, org-age, member-count or `created_by` key
-- anywhere and NO `ORDER BY` at all: the choice is independent of the member being
-- priced, so a member can only push the outcome toward 'none' — never toward a
-- number she set. The owner repairs a 'none' by NAMING the studio on the project.
--
-- HT-3-c (RULED by the orchestrator 2026-09-12, arm (a) — flagged to Kody): a
-- project whose designer NAMED its `studio_id` at creation prices from that studio
-- EVEN WHEN SHE OWNS IT. That is a sole proprietor billing her own studio's client,
-- not a member gaming her employer's books; step 1 stands as written. W2's composer
-- and the studio settings page are where a suspicious `studio_member_rates` row is
-- seen.
--
-- RETRACTED HERE RATHER THAN EDITED (W1-R10-01, measured 1/1 with two controls in
-- review round 10): three sentences of this banner and of 00602's claimed that
-- 00317's anti-aiming guard "is what makes the column trustworthy as a pricing
-- key". What the guard (00317:31-47, head 00563) does is BOUND the column to the
-- studios the project's lead designer actively belongs to — it says nothing about
-- WHICH member of that set she names, and its authenticated-INSERT arm requires only
-- `membership.role <> 'guest'`. As a visibility guard that is enough; as a pricing
-- key the choice is the designer's, which is what HT-3-c rules on. The pin is case
-- (ac) of supabase/tests/billing/time_rate_resolution_test.sql, which performs the
-- INSERT through RLS as a plain-member designer naming the workspace she owns.
-- (§0.13 still forbids this column as an RLS POLICY key: a legacy NULL must not move
-- visibility. Pricing is not visibility.)
--
-- WHAT STEP 2 NO LONGER CONTAINS, and why none of it can come back:
--   · the member-employment key (round 5), the arm's-length `created_by` key
--     (round 4), the multi-member count key (round 3), the member's own `joined_at`
--     / `created_at` (round 6) and `organizations.created_at` (round 7). Every one
--     asked a question about a studio the MEMBER stands in, and each was
--     manufacturable in turn: she can be seated in a studio, a second account can
--     seat her, a second account can author her rate, and a seat's dates are
--     written by whoever seats her.
--   · the rate-existence preference (`ORDER BY EXISTS (… studio_member_rates …)`)
--     and the `owner_seat.created_at` tiebreak, both DELETED in round 11 because
--     HT-3-b replaces "choose between candidates" with "more than one is 'none'".
--     The rate-existence key was also date-blind — W1-R10-02, measured 2/2 across
--     four review rounds: a studio holding only a `CURRENT_DATE + 30` scheduled
--     raise outranked the studio that can price today, and the hour came out
--     NULL / 'none' / $0 into project_unbilled_time. **W1-R10-02 dissolves with the
--     key's removal**: there is no preference left to give a date span to.
-- Their postconditions are deleted with them. What is pinned below instead is the
-- new derivation: the employer tier keyed on `role <> 'owner'`, read BEFORE the
-- owned tier; EXACTLY TWO `organization_members` reads, both of the project
-- designer's own seats; and no `effective_from` / `created_at` / `joined_at` term in
-- the choice at all (`effective_from` survives in tier 2's rate span, where
-- W1-R1-11's UTC anchor lives, and nowhere else).
--
-- WHAT THE RULING ACCEPTS, stated so nobody re-derives it as a defect:
--   · a designer with NO employer seat who owns exactly one studio prices her hours
--     from it, including from a rate she set about herself — a sole practitioner
--     pricing her own work (cases (p4-style) legs, (ac) LEG2);
--   · a designer who owns a workspace AND has one employer is priced by the
--     EMPLOYER, on her own projects too, unless the project NAMES a studio (HT-3-c);
--   · an ambiguous tier (two employers, or two owned studios and no employer) is
--     priced by nobody until someone names the studio on the project. The commonest
--     shape that reaches it is the principal who also owns the workspace 00295
--     provisioned at her `is_designer` flip — pinned in cases (n) and (w) with the
--     repair asserted beside it.
--
-- WHAT IT BUYS, measured in round 8 and closed here (W1-R8-01): a studio whose lead
-- designer is an `admin` or `member` — the shape of a studio the moment it adds its
-- first designer, this program's own customer — can now price every hour on that
-- designer's projects. Arm A (her self-set 99900 reaching her employer's client as
-- an authorized $1,998.00) and arm B (a teammate's hour resolving 'none' at $0) are
-- both gone: case (aa)'s asserts move from the defect to the employing studio's own
-- rates, which is exactly what the ruling's text said would happen.
--
-- THE RESIDUE HT-3-b ACCEPTS, and the only thing that closes it: seating somebody in
-- an organization still needs NO consent from them (`Org owners can insert members`
-- carries `role <> 'owner'` and nothing about the invitee). For a designer who
-- already has an employer, a second consent-free seat makes her tier ambiguous — a
-- $0 denial-of-service (the pre-existing W1-R8-12), never somebody else's number.
-- For a designer who has NO employer, a consent-free seat in a workspace a second
-- account owns makes that workspace her sole employer tier and its owner's rates
-- price her studio's hours. HT-3-b(c)'s consent door (seats land
-- `status = 'invited'`; only the named user activates her own seat) is the closure,
-- it is product-wide, and it stays OWED — recorded in
-- artifacts/hour-tracking-2026-09-11/rulings.md.
--
--  · W1-R7-03 (applied, 00598): `effective_from` / `effective_to` are frozen on
--    the open row, so a rate-setter cannot hand-close a colleague's only open row
--    and leave every later hour at 'none'.
--  · W1-R7-04 (applied here): EXECUTE is REVOKED from `authenticated`. The
--    resolver has no caller anywhere in the repo outside the classifier trigger
--    (grep over apps/ packages/ services/ supabase/functions: one doc comment and
--    the generated types), lane B reads `studio_member_rates` directly, and five
--    rounds of asserts existed only because the door was open. ASSERT 1 and
--    ASSERT 3 stay as the defense should a later wave re-GRANT it; the tests that
--    called it directly are re-homed onto the trigger path.
--  · W1-R7-05 (dissolved): ASSERT 2's owner/admin leg asked about "the ladder's
--    winner", which could be a studio the legitimate employing studio's owner has
--    no standing in. Under HT-3-a `v_studio_id` IS the project's studio, so the leg
--    now asks about the studio that owns the work — the question it was always
--    meant to ask — and the finding has nothing left to name.
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
  -- HT-3-b's two tiers are collected as arrays, not ordered and LIMIT 1'd: the rule
  -- is "exactly one candidate prices; more than one is 'none'", so the COUNT is the
  -- answer and there is no ordering key to choose with.
  v_employer_studios uuid[];
  v_owned_studios    uuid[];
BEGIN
  SELECT project.designer_id, project.studio_id
    INTO v_designer_id, v_studio_id
  FROM public.projects AS project
  WHERE project.id = p_project_id;

  -- ── HT-3-a / HT-3-b / HT-3-c (all RULED 2026-09-12) ─────────────────────────
  -- Step 1 is projects.studio_id, read above. 00317's anti-aiming guard
  -- (00317:31-47, head 00563) BOUNDS that column to the studios the project's lead
  -- designer actively belongs to; it does NOT choose among them, and its
  -- authenticated-INSERT arm asks only for `membership.role <> 'guest'`. The claim
  -- this comment used to carry — that the guard "is what makes the column
  -- trustworthy as a pricing key" — is retracted (W1-R10-01, measured). HT-3-c arm
  -- (a) rules what is left: a project whose designer NAMED its studio_id at creation
  -- prices from that studio even when she owns it, because that is a sole proprietor
  -- billing her own studio's client rather than a member gaming her employer's
  -- books. W2's composer and the studio settings page are where a suspicious
  -- studio_member_rates row is seen. (§0.13 still forbids this column as an RLS
  -- POLICY key: a legacy NULL must not move visibility. Pricing is not visibility.)
  --
  -- Step 2, here, is HT-3-b: the candidates are the studios where the PROJECT'S
  -- DESIGNER holds an ACTIVE, NON-GUEST organization_members row, in two tiers —
  -- the EMPLOYER tier (`role <> 'owner'`) first, and only if she has no employer at
  -- all the OWNED tier (`role = 'owner'`). EXACTLY ONE candidate in a tier prices;
  -- more than one is NULL, which step 3 reports as 'none' for the owner to repair by
  -- naming the studio on the project. Nothing about the MEMBER BEING PRICED enters —
  -- not her memberships, not her seat dates, not a rate's authorship, not an org's
  -- created_at, not whether a studio holds a rate for her — so the worst a member
  -- can do to the answer is push it to 'none'. Seven review rounds each deleted one
  -- key that was a question about a studio SHE stands in (she can be seated; a
  -- second account can seat her, author her rate, or hold a workspace she is a plain
  -- member of; a seat's dates are written by whoever seats her), and round 11
  -- deleted the last two — the rate-existence preference and the owner-seat date
  -- tiebreak — by making ambiguity an answer instead of a contest (W1-R10-02
  -- dissolves with them: there is no preference left to give a date span to).
  --
  -- Step 3 is the absence of both tiers: 'none', "rate pending" (HT-26), and the
  -- composer — not the resolver — is where such a row is kept off an invoice.
  IF v_studio_id IS NULL AND v_designer_id IS NOT NULL THEN
    -- EMPLOYER tier: the designer's active non-guest seats that are NOT owner seats.
    SELECT array_agg(DISTINCT studio.id)
      INTO v_employer_studios
    FROM public.organizations AS studio
    JOIN public.organization_members AS designer_seat
      ON designer_seat.organization_id = studio.id
     AND designer_seat.user_id = v_designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND designer_seat.status = 'active'
      AND designer_seat.role <> 'guest'
      AND designer_seat.role <> 'owner';

    IF COALESCE(array_length(v_employer_studios, 1), 0) = 1 THEN
      v_studio_id := v_employer_studios[1];
    ELSIF COALESCE(array_length(v_employer_studios, 1), 0) = 0 THEN
      -- OWNED tier, reached ONLY when she has no employer seat anywhere. An employer
      -- tier of two or more falls through to NULL on purpose: choosing between them
      -- is what every deleted key did.
      SELECT array_agg(DISTINCT studio.id)
        INTO v_owned_studios
      FROM public.organizations AS studio
      JOIN public.organization_members AS designer_seat
        ON designer_seat.organization_id = studio.id
       AND designer_seat.user_id = v_designer_id
      WHERE studio.type = 'design_studio'
        AND studio.status = 'active'
        AND designer_seat.status = 'active'
        AND designer_seat.role = 'owner';

      IF COALESCE(array_length(v_owned_studios, 1), 0) = 1 THEN
        v_studio_id := v_owned_studios[1];
      END IF;
    END IF;
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
  -- Resolving someone ELSE's is the act of an owner/admin OF THE STUDIO THAT OWNS
  -- THE WORK — under HT-3-a v_studio_id is the project's studio, not a ladder
  -- winner — or, INSIDE THE CLASSIFIER ONLY, of the project's own designer, whose
  -- `Designers manage their project time entries` policy (00177:136-137, no user_id
  -- leg) lets her correct a teammate's entry and which an ungated assert would
  -- revoke in silence (W1-R1-05). W1-R7-05 named the old shape — "the assert asks
  -- about whichever studio the ladder picked, so a legitimate employing studio's
  -- owner is refused" — and the ruled derivation dissolves it: there is no longer a
  -- studio here that the project does not name.
  --
  -- W1-R2-03: the designer leg stays gated on pg_trigger_depth() > 0. Ungated it was
  -- a confidential-pay leak — a plain studio member who happens to be a project
  -- designer could read any colleague's studio rate by calling this with his user
  -- id, a number RLS gives her nothing of. W1-R7-04's REVOKE below means no
  -- authenticated caller can reach depth 0 today; the gate is kept so that a later
  -- wave re-GRANTing the function cannot reopen the leak by accident.
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

  -- ── W1-R5-03: the project's own designer is lead_designer, ABOVE her pick ──
  -- 00578:2708-2710 hard-coded 'lead_designer' for the project's own designer
  -- BEFORE any roster read, so her roster rows were never consulted for her.
  -- Taking p_rate_role first handed the one actor whose role the server used to fix
  -- a lever over her own client-billed rate: `Lead designers manage team members`
  -- is an ALL policy qualified on projects.designer_id = auth.uid() with no
  -- with_check of its own, so she seats HERSELF as 'vendor' through RLS, names it,
  -- and the signed Vendor card prices her hour in place of her own Lead designer
  -- card — rate_source still reading 'authority', so the row prints as a signed,
  -- client-agreed rate and claim_time_entries invoice-locks it. Measured on cards
  -- of 10000 (Lead designer) / 40000 (Vendor): 40000 with the pick, 10000 without.
  -- The pick is DISCARDED, not refused (§0.7's idiom) — ASSERT 3 above still
  -- refuses a role she does not hold at all. No capability is lost relative to the
  -- shipped 00578 baseline, which never consulted her roster.
  IF v_designer_id IS NOT NULL AND v_designer_id IS NOT DISTINCT FROM p_user_id THEN
    v_role := 'lead_designer';
  ELSIF v_role IS NULL THEN
    SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
      INTO v_role
    FROM public.project_team_members AS member
    WHERE member.project_id = p_project_id
      AND member.user_id    = p_user_id
      AND member.removed_at IS NULL;
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

-- W1-R7-04: EXECUTE is revoked from `authenticated` too. This function is
-- TRIGGER-PATH ONLY — 00601's classifier calls it, and a trigger function needs no
-- EXECUTE privilege on the functions it calls (the check is made at CREATE TRIGGER
-- time). Five review rounds of RPC-boundary asserts existed only because the door
-- was GRANTed open with no caller behind it: grep over apps/ packages/ services/
-- supabase/functions finds one doc comment and the generated types, nothing else,
-- and lane B's rate surfaces read `studio_member_rates` directly through its own
-- RLS. ASSERT 1 and ASSERT 3 stay in the body as the defense should a later wave
-- re-GRANT it, and plan-v2 §2's signature block is what must change if it does.
REVOKE EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;

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

  -- W1-R7-04: and neither may `authenticated`. The resolver is trigger-path only;
  -- a GRANT here is a door with no caller behind it, and five rounds of
  -- RPC-boundary asserts existed solely to hold it shut. A later wave that wants
  -- the RPC must say so in plan-v2 §2 and move this postcondition with it.
  IF has_function_privilege('authenticated', 'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '00599: authenticated must not hold EXECUTE on resolve_time_rate_cents — it is trigger-path only (W1-R7-04)';
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

  -- ══ HT-3-a + HT-3-b + HT-3-c, all RULED 2026-09-12 ═══════════════════════
  -- The studio that prices an hour is derived FROM THE PROJECT ONLY. Rounds 2-7
  -- each pinned the order of a ladder of keys about studios the MEMBER stands in;
  -- every one of those keys was manufacturable, and all of them are deleted. Round
  -- 11 deleted the last two — the rate-existence preference and the owner-seat date
  -- tiebreak — when HT-3-b replaced "choose between candidates" with "more than one
  -- is 'none'". What is pinned now is the derivation itself.

  -- Step 1: the project's own column is read.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'project\.studio_id'
  THEN
    RAISE EXCEPTION '00599: projects.studio_id is step 1 of HT-3-a and must be read before any fallback';
  END IF;

  -- Step 2 (HT-3-b): the candidates are the PROJECT DESIGNER's own active non-guest
  -- seats, employer tier first. Nothing about the member being priced may appear.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'designer_seat\.user_id = v_designer_id'
  THEN
    RAISE EXCEPTION '00599: the studio fallback must key on the PROJECT DESIGNER''s seat (v_designer_id), never on the member''s (HT-3-a)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'designer_seat\.role <> ''owner'''
  THEN
    RAISE EXCEPTION '00599: step 2''s FIRST tier is the EMPLOYER tier — the designer''s active non-guest seats with role <> ''owner'' (HT-3-b, RULED 2026-09-12)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'designer_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00599: step 2''s SECOND tier is the OWNED tier — role = ''owner'', reached only when the designer has no employer seat (HT-3-b)';
  END IF;
  -- And in that order: employer before owned. Reversed, a member who owns her
  -- auto-provisioned workspace outranks the studio that employs her, which is
  -- exactly the W1-R8-01 defect HT-3-b was ruled to close.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'designer_seat\.role <> ''owner''[\s\S]*designer_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00599: the EMPLOYER tier must be consulted BEFORE the OWNED tier (HT-3-b) — reversed, the hire''s own workspace prices her employer''s client again (W1-R8-01)';
  END IF;
  -- Non-guest, active, and a design_studio: the three things a candidate seat must
  -- be, in both tiers.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) !~ 'designer_seat\.role <> ''guest''' THEN
    RAISE EXCEPTION '00599: a guest seat is not a candidate studio (HT-3-b: ACTIVE, NON-GUEST membership)';
  END IF;
  -- EXACTLY TWO organization_members reads — the two tiers, both of the project
  -- designer's own seats. A third is a membership question about somebody else,
  -- which is what HT-3-a removed.
  IF (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure), 'public\.organization_members', 'g')) <> 2
  THEN
    RAISE EXCEPTION '00599: the resolver reads organization_members EXACTLY twice — the employer tier and the owned tier, both of the PROJECT DESIGNER''s seats. A third read is a membership question about somebody else (HT-3-a / HT-3-b)';
  END IF;

  -- ── round 11: the choice carries NO ordering key of any kind ────────────────
  -- HT-3-b is a count, not a contest: exactly one candidate prices and two or more
  -- are 'none'. So the candidate queries must carry no date term, no rate-existence
  -- term and no ORDER BY at all. Exactly TWO ORDER BY clauses survive in the whole
  -- body — tier 1's signed-authority pick and tier 2's rate span — and neither may
  -- mention a seat date or a membership.
  IF (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure), 'ORDER BY', 'g')) <> 2
  THEN
    RAISE EXCEPTION '00599: exactly two ORDER BY clauses belong in this body (tier 1''s authority pick, tier 2''s rate span). A third orders step 2''s candidates, and under HT-3-b ambiguity is ''none'' rather than a contest';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'ORDER BY[^;]*created_at'
     OR pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'ORDER BY[^;]*joined_at'
  THEN
    RAISE EXCEPTION '00599: no seat or organization date may order anything here — joined_at (W1-R6-01), the membership row''s created_at (W1-R6-01) and organizations.created_at (W1-R7-01) are each written by whoever seats the member or administers the org';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'ORDER BY[^;]*EXISTS'
     OR pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'priced\.'
  THEN
    RAISE EXCEPTION '00599: the rate-existence preference key (ORDER BY EXISTS over studio_member_rates) is DELETED by HT-3-b — it chose between candidates, and it was date-blind, so a studio holding only a future scheduled raise outranked the studio that could price today (W1-R10-02)';
  END IF;
  -- studio_member_rates is read in ONE place: tier 2.
  IF (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure), 'public\.studio_member_rates', 'g')) <> 1
  THEN
    RAISE EXCEPTION '00599: public.studio_member_rates is read EXACTLY once, in tier 2. A second read is the preference key HT-3-b deleted (W1-R10-02)';
  END IF;
  -- And no qualified created_at column anywhere in the body.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ '[A-Za-z_]+\.created_at' THEN
    RAISE EXCEPTION '00599: no created_at column is a pricing key — not a seat''s (W1-R6-01), not an organization''s (W1-R7-01), and not the owner-seat tiebreak HT-3-b deleted';
  END IF;

  -- And the deleted keys, each refused by name so no future graft can restore one
  -- from an older body.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'employer\.' THEN
    RAISE EXCEPTION '00599: the round-5 member-employment key is deleted by HT-3-a — the member''s own memberships never price an hour';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'arms_length' THEN
    RAISE EXCEPTION '00599: the round-4 arm''s-length key is deleted by HT-3-a — a rate''s authorship is not a pricing key (she can buy it with one signup, W1-R5-02)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'peer\.organization_id' THEN
    RAISE EXCEPTION '00599: the round-3 multi-member count key is deleted by HT-3-a — she can seat a collaborator in her own workspace (W1-R4-01)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'joined_at' THEN
    RAISE EXCEPTION '00599: a seat''s joined_at is written by whoever seats the member and must never be a pricing key (W1-R6-01)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) ~ 'studio\.created_at' THEN
    RAISE EXCEPTION '00599: organizations.created_at is NOT server-set — `Org admins can update organization` has no column guard on it, and one UPDATE backdated a puppet workspace (W1-R7-01). It must never be a pricing key';
  END IF;

  -- Step 3 still exists: the absence of a studio is 'none', never a silent blank.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure) !~ '''none''::text' THEN
    RAISE EXCEPTION '00599: the third tier must return ''none'' (HT-26 — "rate pending", not a blank)';
  END IF;

  -- W1-R5-03: HT-41's pick must not reach the project's own designer, whose role
  -- the server fixes. Pinned as the designer branch standing ABOVE the argument in
  -- the role ladder: the IF tests the designer and the ELSIF tests v_role IS NULL.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'IF v_designer_id IS NOT NULL AND v_designer_id IS NOT DISTINCT FROM p_user_id THEN\s+v_role := ''lead_designer'';\s+ELSIF v_role IS NULL THEN'
  THEN
    RAISE EXCEPTION '00599: the project designer''s lead_designer role must be fixed ABOVE p_rate_role, or she bills the client at the best-paying signed card (W1-R5-03)';
  END IF;

  -- W1-R2-03: the designer-on-behalf leg is for the classifier, not for callers.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'pg_trigger_depth\(\) > 0'
  THEN
    RAISE EXCEPTION '00599: the designer-on-behalf leg must be gated on trigger depth, or any project designer can enumerate colleagues'' pay (W1-R2-03)';
  END IF;
END
$postcondition$;
