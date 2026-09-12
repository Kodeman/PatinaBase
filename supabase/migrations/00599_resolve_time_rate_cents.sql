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
-- REVIEW ROUND 8 — HT-3-a IS RULED, AND THE LADDER IT STOOD IN FOR IS DELETED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- HT-3-a (RULED by Kody, 2026-09-12): **the studio that prices an hour is derived
-- FROM THE PROJECT ONLY, and never from the member's own memberships.**
--
--   1. `projects.studio_id` when it is not NULL. 00317's anti-aiming guard
--      (00317:31-47, head 00563) refuses a user-context write that points a
--      project at a studio its lead designer does not actively belong to, which is
--      what makes the column trustworthy as a pricing key here. (§0.13 still
--      forbids it as an RLS POLICY key — a legacy NULL must not silently widen or
--      narrow visibility. Pricing is not visibility.)
--   2. otherwise a studio the project's DESIGNER holds with
--      `organization_members.role = 'owner'` and `status = 'active'`. If she owns
--      more than one: prefer the one holding a `studio_member_rates` row for the
--      member being priced, then the OLDEST owner membership by
--      `organization_members.created_at`.
--   3. otherwise `rate_source = 'none'` — "rate pending" (HT-26).
--
-- The member's own memberships, org creation, seat dates and
-- `organizations.created_at` play NO part. 00602 additionally stamps
-- `projects.studio_id` at project INSERT by the same rule so that (1) is the
-- normal path.
--
-- WHAT THIS DELETES, and why none of it can come back:
--
--  · the member-employment key (`employer.user_id = p_user_id AND
--    membership.role NOT IN ('owner','admin')`, round 5),
--  · the arm's-length key (`arms_length.created_by IS DISTINCT FROM p_user_id`,
--    round 4),
--  · the bare rate-existence key as a CANDIDACY key (round 2) — it survives only
--    as a tiebreak BETWEEN studios the project's designer owns,
--  · the multi-member count key (round 3),
--  · `membership.joined_at` and `membership.created_at` ON THE MEMBER'S OWN SEAT
--    (round 6),
--  · `organizations.created_at` (round 7),
--
--  and with them six rounds of postconditions that pinned the order of those keys.
--  Every one of those keys asked a question about a studio the MEMBER stands in,
--  which is why each was manufacturable in turn: she can be seated in a studio, a
--  second account can seat her, a second account can author her rate, and a seat's
--  dates are written by whoever seats her. A question about the PROJECT is not
--  hers to answer: she cannot make the project's designer an owner anywhere
--  (`Org owners can insert members` carries `role <> 'owner'`, so an owner seat is
--  created only by provisioning — 00295's fc_provision_studio_on_designer — or by
--  ownership transfer), and she cannot aim `projects.studio_id` (00317/00563).
--
--  The round-7 blocker (W1-R7-01, a one-UPDATE backdate of
--  `organizations.created_at` through `Org admins can update organization`) is
--  therefore not repaired but REMOVED: that column is no longer read. Its proposed
--  `guard_organization_admin_columns` freeze is NOT shipped, and 00602 carries the
--  projects trigger instead. Three sentences of this banner, one in-body paragraph
--  and one postcondition rationale claimed that `organizations.created_at` was
--  server-set because `organizations` has no INSERT policy for `authenticated`;
--  that premise was measured FALSE (the table has an unrestricted-by-column UPDATE
--  policy for org admins) and all four texts are deleted here rather than edited.
--
--  WHAT THE RULING ACCEPTS, stated so nobody re-derives it as a defect: a designer
--  logging hours on HER OWN project, who owns the workspace 00295 provisions at
--  the is_designer flip, prices that hour from her own studio — including from a
--  rate she set about herself there. That is a solo practitioner pricing her own
--  work, and HT-3-a rules it explicitly. What it closes is the employee case: an
--  hour on a STUDIO's project (its principal is the designer) is priced by that
--  studio, and no workspace the member owns, buys or is seated in can reach it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 8, FIX PASS — THE CONSEQUENCE THE RULING'S TEXT DOES NOT
-- CONTEMPLATE: OWED RULING HT-3-b. PINNED HERE, NOT WIDENED.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- W1-R8-01 (blocker, measured 3/3 with a 2/2 negative control in review round 8,
-- re-measured from scratch in this fix pass): step 2 admits only studios the
-- project's designer OWNS, so a studio whose lead designer is NOT its owner — the
-- shape of a studio the moment it adds its first designer, this program's own
-- customer — cannot price ANY hour on that designer's projects. No attacker, no
-- manoeuvre, no extra signup:
--
--   Leah owns studio S and seats her new designer `admin`, her assistant `member`,
--   and prices both of them IN S through RLS on HT-3's own surface. The hire got
--   her designer role BEFORE Leah seated her (the self-signup order), so 00295's
--   fc_provision_studio_on_designer gave her a one-person workspace she OWNS —
--   the only candidate step 2 admits for her, hence what 00602 stamps and what
--   step 1 reads for ever. Measured on the studio's client project:
--     · her own hour  → 99900 / 'studio_member' / 199800 / 'authorized', i.e. the
--       number SHE set about HERSELF, $1,998.00 into project_unbilled_time (the
--       invoice composer's feed and claim_time_entries' invoice lock), while
--       Leah's 20000 for her is ignored;
--     · her assistant's hour on the same project → NULL / 'none', reported by the
--       view as $0, although Leah priced him at 12000 in S.
--   Control, in the SAME fixture: a second hire seated BEFORE her designer grant
--   owns no workspace, 00563's one-candidate discovery stamps S, and both hours
--   price correctly (20000/40000 and 12000/24000). The whole difference is the
--   order in which she signed up and was seated.
--
-- So HT-1 ("the server owns hourly_rate_cents") and HT-3 ("owner/admin of the
-- studio sets it") are defeated in BOTH directions for any studio with more than
-- one designer — and arm A is not a 'none' row W2's composer can filter: it is an
-- authorized 'studio_member' row indistinguishable from a legitimate one,
-- authorized by the only party being paid for it.
--
-- NOTHING IS WIDENED HERE, and the ladder above is byte-unchanged, because every
-- code-only widening re-opens rounds 4-6. Recorded so no later hand re-spends them:
--   · widening step 2 to "active non-guest membership" lets an attacker seat the
--     PROJECT'S DESIGNER in a workspace the attacker controls — `Org owners can
--     insert members` needs no consent from the invitee — so the designer's own
--     candidate set re-opens and the attacker's rate wins the preference key. That
--     INSERT is the same door rounds 4 and 6 used.
--   · "prefer a studio with >= 2 active members", "prefer a studio she does not
--     run", "prefer a rate she did not author" are each satisfiable with one extra
--     signup seating the designer (rounds 5 and 6 rated all three blocker-grade).
--   · narrowing instead — refusing step 2 when the member also holds a seat in a
--     studio she does not own — keys on the member's own memberships (which
--     HT-3-a forbids) and hands any org owner a $0 denial-of-service on her hours
--     through the same consent-free INSERT (W1-R8-12).
-- The single door under all of them is that `organization_members` INSERT requires
-- no consent from the person being seated. Closing it (seats land
-- `status = 'invited'`; only the named user may flip their own seat to 'active')
-- changes how every invite in Patina works — provisioning, studio invites, the
-- admin portal's seat adds and `accept_workspace_invitation` all have to be read
-- against it — and it is the enabling condition for widening step 2 safely. That
-- is a RULING, not a patch: **HT-3-b, owed**, recorded in
-- artifacts/hour-tracking-2026-09-11/rulings.md with this measurement, its two
-- arms and the three refuted widenings.
--
-- Until it is ruled, today's behaviour is PINNED by case (aa) of
-- supabase/tests/billing/time_rate_resolution_test.sql, whose failure messages name
-- HT-3-b and state the value each assert takes when the ruling lands — so the
-- ruling moves the asserts and nothing else. The interim consequences are owed to
-- Leah's studio in words (a project led by anyone but the studio's owner prices
-- from that designer's personal workspace), and W2's composer must refuse to claim
-- `rate_source = 'none'` rows so arm B is visible instead of $0.
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
BEGIN
  SELECT project.designer_id, project.studio_id
    INTO v_designer_id, v_studio_id
  FROM public.projects AS project
  WHERE project.id = p_project_id;

  -- ── HT-3-a (RULED 2026-09-12): the PROJECT names the studio, never the member ──
  -- Step 1 is projects.studio_id, read above. It is trustworthy as a PRICING key
  -- because 00317's anti-aiming guard (00317:31-47, head 00563) refuses any
  -- user-context write that points a project at a studio its lead designer does not
  -- actively belong to, and 00602 stamps it at INSERT by the same rule as step 2
  -- below, so on every new project step 1 is the path actually taken. (§0.13 still
  -- forbids this column as an RLS POLICY key: a legacy NULL must not move
  -- visibility. Pricing is not visibility.)
  --
  -- Step 2, here: a studio the project's DESIGNER OWNS. Ties are broken by whether
  -- that studio holds a rate for the member being priced, then by the oldest owner
  -- membership — exactly as ruled. Nothing about the MEMBER's own standing enters:
  -- not her memberships, not her seat dates, not a rate's authorship, not an org's
  -- created_at. Six review rounds each deleted one such key and shipped the next,
  -- because every question about a studio the member stands in is a question she
  -- can answer (she can be seated; a second account can seat her, author her rate,
  -- or hold a workspace she is a plain member of; a seat's dates are written by
  -- whoever seats her). She cannot make the project's designer an OWNER anywhere:
  -- `Org owners can insert members` carries `role <> 'owner'`, so an owner seat
  -- exists only by 00295's provisioning at the designer's own signup or by an
  -- ownership transfer.
  --
  -- Step 3 is the absence of both: 'none', "rate pending" (HT-26), and the
  -- composer — not the resolver — is where such a row is kept off an invoice.
  -- W1-R8-01, OWED RULING HT-3-b: because the candidate set is OWNERSHIP, a studio
  -- whose lead designer is not its owner prices nothing here, and her own
  -- auto-provisioned workspace prices her client-billed hours instead. Measured,
  -- pinned in case (aa), and deliberately NOT widened — see the banner: every
  -- widening is manufacturable while seating somebody in an organization needs no
  -- consent from them.
  --
  -- `studio.id` last is a determinism backstop, not a ruled key: it is reached only
  -- when the designer holds two owner seats created at the same microsecond, with
  -- the rate-row preference tied as well. Without it LIMIT 1 over a tie is
  -- arbitrary, which is the defect W1-R2-02 opened this whole sequence with.
  IF v_studio_id IS NULL AND v_designer_id IS NOT NULL THEN
    SELECT studio.id INTO v_studio_id
    FROM public.organizations AS studio
    JOIN public.organization_members AS owner_seat
      ON owner_seat.organization_id = studio.id
     AND owner_seat.user_id = v_designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND owner_seat.role = 'owner'
      AND owner_seat.status = 'active'
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS priced
               WHERE priced.studio_id = studio.id
                 AND priced.user_id   = p_user_id
             ) DESC,
             owner_seat.created_at ASC NULLS LAST,
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

  -- ══ review round 8 — HT-3-a, RULED 2026-09-12 ═════════════════════════════
  -- The studio that prices an hour is derived FROM THE PROJECT ONLY. Rounds 2-7
  -- each pinned the order of a ladder of keys about studios the MEMBER stands in;
  -- every one of those keys was manufacturable, and all of them are deleted. What
  -- is pinned now is the derivation itself.

  -- Step 1: the project's own column is read.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'project\.studio_id'
  THEN
    RAISE EXCEPTION '00599: projects.studio_id is step 1 of HT-3-a and must be read before any fallback';
  END IF;

  -- Step 2: the candidate set is studios the project's DESIGNER OWNS — nothing
  -- about the member's own standing may appear.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'owner_seat\.user_id = v_designer_id'
  THEN
    RAISE EXCEPTION '00599: the studio fallback must key on the PROJECT DESIGNER''s seat (v_designer_id), never on the member''s (HT-3-a)';
  END IF;
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'owner_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00599: the studio fallback admits only an OWNER seat — an owner row cannot be inserted through RLS, which is what makes it unmanufacturable (HT-3-a)';
  END IF;
  -- ONE organization_members reference in the whole body, and the assert above says
  -- whose seat it is. Two would mean a second question about somebody's membership
  -- crept back in.
  IF (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure), 'public\.organization_members', 'g')) <> 1
  THEN
    RAISE EXCEPTION '00599: the resolver reads organization_members EXACTLY once — for the project designer''s owner seat. A second read is a membership question about somebody, which is what HT-3-a removed (HT-3-a)';
  END IF;

  -- The tiebreak between two owned studios, in the ruled order: a rate held for the
  -- member being priced, THEN the oldest owner membership.
  IF pg_get_functiondef('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure)
       !~ 'priced\.studio_id = studio\.id[\s\S]*owner_seat\.created_at'
  THEN
    RAISE EXCEPTION '00599: between two studios the designer owns, a rate held for the member outranks the oldest owner seat (HT-3-a)';
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
