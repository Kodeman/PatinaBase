-- ═══════════════════════════════════════════════════════════════════════════
-- 00615 — HT-3-e(2): the number she wrote for herself prices her hour only
--         where she OWNS the studio that wrote it
--
-- Lineage (resolve_time_rate_cents): 00599 → 00615. The body below is 00599's
-- verbatim, with ONE delta grafted into tier 2 and nothing else touched — the
-- three asserts, the role ladder, the UTC anchor, the signed-authority tier and
-- HT-3-b's two-tier derivation are byte-identical to the body 00599 installs.
-- `classify_project_time_entry_authority` (00601) is NOT redefined and needs no
-- redefinition: it reads a rate in exactly one place, `resolve_time_rate_cents`
-- called once up front (00601:251, pinned by 00601's own postcondition at :530),
-- and the grep that proves it is `studio_member_rates` appearing nowhere in
-- 00601's code. Nothing else in the program prices an hour from a rate card:
-- 00604's ledger view carries a postcondition forbidding the table by name, and
-- 00602/00603 carry one forbidding the stamp from reading it.
--
-- WHY THIS NUMBER IS A NEW MIGRATION AND NOT AN EDIT OF 00599. 00599 and 00601
-- are already merged to `hour-tracking/integration`; W2's own band 00604–00607 is
-- fully used. So the rule lands at 00615 — the number W5 had reserved and has not
-- spent — and that reservation is recorded in this program's rulings.md and in
-- artifacts/hour-tracking-2026-09-11/build/W2-fix-r7.md. W5 mints from 00616.
--
-- THE RULING (HT-3-e(2), ruled by the orchestrator 2026-09-12, flagged to Kody):
--   *"In the W1 resolver, a `studio_member_rates` row whose `created_by` =
--   `user_id` prices an hour ONLY where that person is the named studio's OWNER
--   (`organization_members.role = 'owner'`). Elsewhere such a row is ignored and
--   the next qualifying row (authored by someone else) prices; if none, 'none'."*
--
-- WHAT IT CLOSES, and why nothing at the stamp could. W2 review rounds 5, 6 and 7
-- each measured the same taking end to end: a designer with ONE cooperating
-- account moves her resolved rate to a number she set, permanently, on a project
-- an honest employer was pricing correctly. Round 7 measured the one-account form
-- too (probe P8): an `admin` of an HONEST employer satisfies
-- `studio_member_rates_admin_insert` (`is_org_admin_or_owner(studio_id) AND
-- created_by = auth.uid()`), so she writes her own 99900 into that employer's
-- card, names that employer with the act HT-3-d admits her to (00606 case (s)),
-- and her hour came back `99900 / studio_member / 199800` where the employer's
-- owner had written 26000. Three candidate bounds at the stamp were measured and
-- all three fail: a rate-authorship test AT THE STAMP is vacuous (the stamp
-- succeeds with zero rate rows and the number is written afterwards); the tier's
-- only temporal witness is `organization_members.updated_at`, which any
-- People-room edit moves; and the same taking works in an organization she has
-- never owned (an accomplice seats her `admin` in his, she writes her own number
-- there). The rule has to be read when the hour is PRICED, which is here.
--
-- WHAT IT DOES NOT TOUCH:
--   · HT-3-a arm (a) and HT-3-c's SOLE PROPRIETOR. She owns her studio, so her
--     own row is exactly the `role = 'owner'` exemption and prices as before
--     (00606 case (o); `time_rate_resolution_test.sql` keeps every owner case).
--   · The studio that prices an hour. HT-3-b's derivation is untouched: this rule
--     never chooses between candidate studios, it only refuses to read ONE ROW.
--   · Tier 1. A signed `project_billing_authority_rates` card is the client's
--     agreed number and is ranked above this tier; nothing here reaches it.
--
-- WHAT IT DOES NOT CLOSE — HT-3-e(3), the ACCEPTED RESIDUAL (ruled, recorded):
-- a designer who runs a SECOND account, transfers ownership of her provisioned
-- workspace to it and has THAT ACCOUNT author her rate there can still price her
-- hours from that workspace once the account stamps a legacy project, because the
-- row is then arm's-length on `created_by` and the seat test at 00606 is satisfied
-- too. Patina makes that VISIBLE rather than impossible: the pricing studio is a
-- column of `time_entry_ledger` and the owner's project lens shows it (lane B).
-- No further bound is added for it in this program. Cases (q) and (r) of
-- `supabase/tests/rls/time_entry_studio_stamp_test.sql` measure it as passing,
-- loudly-labelled assertions.
--
-- THIS IS NOT THE ROUND-4 "ARM'S-LENGTH KEY" COMING BACK, and 00599's own
-- postcondition (`prosrc ~ 'arms_length'` ⇒ raise) is about that other thing. The
-- deleted key was a CHOICE BETWEEN STUDIOS — "prefer the candidate studio holding
-- a rate somebody else wrote" — which W1-R5-02 measured as buyable with one
-- signup and which HT-3-b replaced with a count. HT-3-e(2) ranks nothing and
-- chooses nothing: the studio is already fixed by HT-3-a/HT-3-b before tier 2 is
-- reached, and the only question asked is whether THIS ROW is the subject's own
-- number in a studio she does not own.
--
-- ONE 00599 POSTCONDITION IS DELIBERATELY SUPERSEDED, and it is named here so a
-- later hand does not "repair" this body back: 00599 asserts that
-- `public.organization_members` appears EXACTLY twice in the resolver ("a third
-- read is a membership question about somebody else"). After this migration it
-- appears THREE times — HT-3-b's two tiers, which are questions about the
-- PROJECT'S DESIGNER, plus one question about the SUBJECT BEING PRICED: does she
-- own the studio whose card names her? That third read is ruled, it is the whole
-- of HT-3-e(2), and the postcondition below pins it at three with the owner-seat
-- read named. 00599's assert is not edited (it is merged, and it passed against
-- the body 00599 installs); it is superseded, by number, here.
--
-- ── SECOND SECTION, ADDED FOR W2 REVIEW ROUND 8 (W2-R8-01) ─────────────────
-- HT-3-e(2) asks WHO AUTHORED THE ROW. Round 8 measured the other half of that
-- question: 00598 freezes a rate row's identity (studio, subject, dates) and lets
-- an actor re-stamp `created_by` only with her own id — but it does NOT freeze the
-- NUMBER, and `studio_member_rates_admin_update` (00598:347) admits any owner or
-- admin of the studio, including one who is the rate's own SUBJECT. So an
-- admin-designer of an HONEST employer rewrote the OWNER's open row from 25000 to
-- 99900 with `created_by` untouched, and the row she now controlled was
-- "arm's-length" by both of HT-3-e's tests: her 120-minute hour came back
-- 99900 / studio_member / 199800 where the owner had written 25000, measured 1/1
-- through RLS with ONE account, no ownership transfer, no confederate and no
-- consent-free seat. `authenticated` holds UPDATE on the table, so that is a
-- one-line PostgREST PATCH, not a psql-only fact. It was also a VISIBILITY
-- regression against HT-3-e(3)'s answer: her 99900 carried the OWNER's id as
-- author, so his own rate-card lens attributed her number to himself.
--
-- THE CLOSURE CHOSEN (HT-3-e(4), the guard, one statement): authorship records who
-- SET THE NUMBER THAT IS THERE. In `guard_studio_member_rate_history`, when
-- `NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents`, `created_by` is
-- stamped with the acting `auth.uid()`. HT-3-e(2) then reads a true answer and the
-- rewrite prices exactly as the INSERT form already does: 'none' until the studio
-- writes a number of its own. Of the three candidates the review put to the
-- orchestrator this is the one that costs an honest studio NOTHING — the blur-save
-- (`useSetStudioMemberRate`, use-studio-member-rates.ts:101-113) already sends
-- `created_by: userId`, i.e. exactly this value, so no shipped path changes; the
-- POLICY candidate (`AND user_id <> auth.uid()`) would additionally refuse an
-- admin-designer's in-place correction of her own row, a capability W1 shipped
-- (00598 cases a2/b2/h6) and HT-3 rules for; and the RULING-ONLY candidate would
-- leave the taking standing. It is also the candidate that repairs the visibility
-- regression, because the number and its author now move together.
--   · The `current_user = 'postgres'` early return is untouched, so the ladder
--     (close_prior_studio_member_rate, DEFINER → postgres) and every seed and
--     migration write keep their authorship.
--   · The stamp is conditional on `auth.uid()` being present: a service_role path
--     with no JWT leaves the recorded author standing rather than writing NULL
--     (NULL is the deleted-author value, case (ag5)).
--   · It is placed AFTER the W1-R5-01 actor check, deliberately: a caller who
--     forges `created_by` to a third party AND moves the number still RAISES
--     (case (j4)) rather than being silently corrected.
--   · An UPDATE that does not move the number does not move authorship — the
--     clause is `IS DISTINCT FROM`, so an unrelated touch cannot take credit for
--     somebody else's rate.
-- Lineage (guard_studio_member_rate_history): 00598 → 00615. The body below is
-- 00598:233-302's verbatim, with that ONE statement grafted in and nothing else
-- touched; the trigger (`aaa_guard_studio_member_rate_history_trg`) is NOT
-- recreated, because CREATE OR REPLACE keeps the binding and the trigger's NAME is
-- what pins its order before close_prior_studio_member_rate_trg (00598's own
-- postcondition asserts that ordering and still passes).
-- Measured by `supabase/tests/rls/studio_member_rates_test.sql` case (l) at the
-- table and `supabase/tests/billing/time_rate_resolution_test.sql` case (ah) end
-- to end — the round-8 probe A shape, in both directions.
--
-- Reconciles: nothing reverted. The body is 00599's, grafted — `patina-db-migrations`
-- step 2, with the grep (`CREATE OR REPLACE FUNCTION[^(]*resolve_time_rate_cents`
-- over supabase/migrations/*.sql | sort | tail -1) naming 00599 as the only
-- definition and therefore the source.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
  -- created_at, not whether a studio holds a rate for her. (RETRACTED W1-R11-01 /
  -- W1-R12-01, measured both times: this comment used to add "…so the worst a
  -- member can do to the answer is push it to 'none'". False — see the banner. The
  -- worst she can do HERE is push it to 'none'; a seat she writes can still make
  -- the designer's EMPTY tier exactly one, and on the live activation path an
  -- AMBIGUOUS tier is decided by 00563's bridge on dates she writes. Cases (ad-i),
  -- (ad-ii) and (af) of supabase/tests/billing/time_rate_resolution_test.sql pin
  -- all three as built.) Seven review rounds each deleted one
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
      -- ── HT-3-e(2), THE ONLY DELTA 00615 ADDS (RULED 2026-09-12) ───────────
      -- A row whose `created_by` IS its own `user_id` — the number she wrote for
      -- herself — prices an hour ONLY where that person is this studio's OWNER.
      -- Everywhere else it is IGNORED and the next qualifying row, one somebody
      -- else wrote, prices; where there is none the answer is tier 3's 'none'.
      -- This is a test of the ROW, not of the studio: it does not choose between
      -- candidate studios (the round-4 key HT-3-a deleted did that, and she could
      -- buy it with one signup), it does not care whose workspace this is (round
      -- 6 measured the same taking in an organization she has never owned), and
      -- it cannot be defeated by writing the number after the stamp (it is read
      -- when the hour is priced, not when the studio is named).
      -- `created_by` NULL is NOT self-authorship and prices: the only writer of
      -- NULL is `profiles ON DELETE SET NULL`, i.e. a deleted author, and a
      -- freeze guard (00598:290-293) already refuses any re-stamp that is not the
      -- actor's own id.
      AND (
        rate.created_by IS DISTINCT FROM rate.user_id
        OR EXISTS (
          SELECT 1
          FROM public.organization_members AS owner_seat
          WHERE owner_seat.organization_id = v_studio_id
            AND owner_seat.user_id = rate.user_id
            AND owner_seat.status = 'active'
            AND owner_seat.role = 'owner'
        )
      )
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
  'profiles.default_hourly_rate_cents is not a leg. HT-3-e(2) (RULED 2026-09-12, '
  'migration 00615): in tier 2 a studio_member_rates row whose created_by is its '
  'own user_id — the number she wrote for herself — prices an hour ONLY where '
  'that person is that studio''s OWNER; elsewhere it is ignored and the next '
  'qualifying row, one somebody else wrote, prices, and where there is none the '
  'answer is ''none''. It is a test of the ROW, not a choice between studios '
  '(HT-3-b still derives the studio, and the round-4 arm''s-length RANKING key '
  'stays deleted), it is read when the hour is priced rather than when the studio '
  'is named (so writing the number after the stamp does not defeat it), and it '
  'leaves HT-3-c''s sole proprietor untouched because she IS the owner. It does '
  'not close HT-3-e(3)''s accepted residual: a cooperating second account that '
  'AUTHORS her rate makes the row arm''s-length, and Patina answers that with '
  'visibility (the pricing studio is a column of time_entry_ledger) rather than '
  'another bound.';

-- Restated rather than inherited: CREATE OR REPLACE keeps a function's ACL, so
-- this is belt-and-braces on the one property five W1 rounds of asserts existed
-- to protect (W1-R7-04 — the resolver is TRIGGER-PATH ONLY; 00601's classifier
-- calls it, and a trigger function needs no EXECUTE privilege on what it calls).
REVOKE EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;

DO $postcondition$
DECLARE
  v_src text := pg_get_functiondef(
    'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure);
BEGIN
  -- ── HT-3-e(2), pinned by source: the clause, and what it is keyed on ──────
  ASSERT v_src ~ 'rate\.created_by IS DISTINCT FROM rate\.user_id',
    '00615: HT-3-e(2) is one clause in tier 2 — a studio_member_rates row whose '
    'created_by IS its own user_id does not price, and the comparison must be on '
    'the ROW''s own two columns (created_by vs user_id), never on auth.uid() or on '
    'p_user_id: the row is read long after it was written, by a trigger running as '
    'the member logging the hour, so a caller-time comparison would answer a '
    'different question every session';
  ASSERT v_src ~ 'owner_seat\.role = ''owner''',
    '00615: HT-3-e(2)''s exemption is OWNERSHIP of the studio the card belongs to '
    '(organization_members.role = ''owner''), which is what leaves HT-3-a arm (a) '
    'and HT-3-c''s sole proprietor pricing from her own card (00606 case (o))';
  ASSERT v_src ~ 'owner_seat\.organization_id = v_studio_id',
    '00615: the ownership question is asked about THE STUDIO THAT PRICES THIS '
    'HOUR (v_studio_id), not about any studio she happens to own — she owns the '
    '00295 workspace by construction, and asking it of the wrong studio would '
    'exempt exactly the row this ruling exists to ignore';
  ASSERT v_src ~ 'owner_seat\.status = ''active''',
    '00615: only an ACTIVE owner seat exempts a self-authored row — every other '
    'seat read in this body asks the same, and a withdrawn seat is not ownership';
  -- The clause belongs to tier 2's own SELECT: pulled out into a separate
  -- statement it would be a second read of studio_member_rates, which 00599's
  -- postcondition refuses for a different and still-live reason (the deleted
  -- rate-existence preference key, W1-R10-02).
  ASSERT (SELECT count(*) FROM regexp_matches(v_src, 'public\.studio_member_rates', 'g')) = 1,
    '00615: public.studio_member_rates is still read EXACTLY once, inside tier 2 — '
    'HT-3-e(2) is a clause in that one SELECT, not a second read (a second read is '
    'the preference key HT-3-b deleted, W1-R10-02)';
  -- And the third organization_members read is this rule and nothing else.
  ASSERT (SELECT count(*) FROM regexp_matches(v_src, 'public\.organization_members', 'g')) = 3,
    '00615: the resolver reads organization_members EXACTLY THREE times — HT-3-b''s '
    'employer tier and owned tier, both about the PROJECT''S DESIGNER, plus '
    'HT-3-e(2)''s one question about the SUBJECT BEING PRICED (does she own the '
    'studio whose card names her). 00599''s own assert pins it at two and is '
    'SUPERSEDED by this migration, deliberately and by number; a FOURTH read is a '
    'membership question nobody ruled';

  -- ── and 00599's properties, re-asserted on the grafted body ───────────────
  -- Every one of these was a finding once. A graft that dropped one would pass
  -- 00599's postconditions (they ran against 00599's body, three migrations ago)
  -- and reach prod silently.
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)')),
    '00615: resolve_time_rate_cents must stay SECURITY DEFINER';
  ASSERT (SELECT proconfig::text LIKE '%search_path%' FROM pg_proc
           WHERE oid = to_regprocedure('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)')),
    '00615: and must keep its pinned search_path (§0.16)';
  ASSERT NOT has_function_privilege('anon',
    'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE'),
    '00615: anon must not hold EXECUTE on the resolver';
  ASSERT NOT has_function_privilege('authenticated',
    'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE'),
    '00615: authenticated must not hold EXECUTE either — the resolver is '
    'trigger-path only (W1-R7-04), and a GRANT here reopens the confidential-pay '
    'door five rounds of asserts were written to hold shut';
  ASSERT v_src !~ 'change_order_terms',
    '00615: the legacy change-order rate leg stays CUT (HT-1)';
  ASSERT v_src !~ 'default_hourly_rate_cents',
    '00615: profiles.default_hourly_rate_cents is still not a leg (HT-2 unruled)';
  ASSERT v_src ~ 'no relationship to project',
    '00615: the project-relationship assert survives the graft (W1-R1-01)';
  ASSERT v_src ~ 'pg_trigger_depth\(\) > 0',
    '00615: the designer-on-behalf leg stays gated on trigger depth (W1-R2-03)';
  ASSERT v_src ~ 'AT TIME ZONE ''UTC''',
    '00615: the rate-boundary date anchor stays explicitly UTC (W1-R1-11)';
  ASSERT v_src ~ 'project\.studio_id',
    '00615: HT-3-a step 1 — the project''s own column is still read first';
  ASSERT v_src ~ 'designer_seat\.user_id = v_designer_id',
    '00615: HT-3-b''s candidates are still the PROJECT DESIGNER''s seats';
  ASSERT v_src ~ 'designer_seat\.role <> ''owner''[\s\S]*designer_seat\.role = ''owner''',
    '00615: the EMPLOYER tier is still consulted BEFORE the OWNED tier (HT-3-b) — '
    'reversed, the hire''s own workspace prices her employer''s client again '
    '(W1-R8-01)';
  ASSERT (SELECT count(*) FROM regexp_matches(v_src, 'ORDER BY', 'g')) = 2,
    '00615: still exactly two ORDER BY clauses — tier 1''s authority pick and tier '
    '2''s rate span. HT-3-e(2) adds a WHERE clause, not an ordering: "the next '
    'qualifying row prices" is tier 2''s existing effective_from DESC, applied to '
    'the rows that survive the filter';
  ASSERT v_src !~ 'ORDER BY[^;]*joined_at' AND v_src !~ '[A-Za-z_]+\.created_at',
    '00615: no seat or organization DATE is a pricing key (W1-R6-01, W1-R7-01) — '
    'HT-3-e(2) keys on authorship, which is a column the freeze guard at '
    '00598:290-293 only lets an actor stamp with her own id';
  ASSERT v_src ~ '''none''::text',
    '00615: tier 3 still answers ''none'' (HT-26, "rate pending", never a blank) — '
    'and it is now also the answer where every qualifying row is her own and she '
    'owns nothing here';

  RAISE NOTICE '00615 postconditions passed.';
END
$postcondition$;

-- ═══════════════════════════════════════════════════════════════════════════
-- W2-R8-01 / HT-3-e(4) — authorship records who set the number that is there.
-- Lineage: 00598 → 00615. 00598's body verbatim; ONE statement grafted.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_studio_member_rate_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS NOT DISTINCT FROM 'postgres' THEN RETURN NEW; END IF;

  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'a closed studio member rate row is history and cannot be edited — write a new row'
      USING ERRCODE = 'check_violation';
  END IF;

  -- W1-R2-04: created_by is NOT frozen on the open row. The settings page's
  -- blur-save upserts ON CONFLICT (studio_id, user_id, effective_from) and
  -- PostgREST assigns EVERY payload column from `excluded`, created_by included —
  -- so freezing it meant a studio's SECOND owner/admin could not correct a rate the
  -- first set the same day: the UPDATE raised and her number was silently lost
  -- (measured through the real policies — admin B's 15500 dropped, the row stayed
  -- at admin A's 14000). created_by therefore records the LAST author of the open
  -- row; the closed rows below it keep theirs, frozen outright by the raise above.
  -- W1-R7-03: the open row's DATES are frozen too. They were named nowhere, so a
  -- studio owner or admin could hand-close a colleague's only open row
  -- (`UPDATE … SET effective_to = CURRENT_DATE - 1`) and leave ZERO open rows —
  -- every later hour then resolves 'none' and invoices at $0 — or leave two rows
  -- covering one day, which this file's own non-overlap invariant (case g6) exists
  -- to forbid. effective_to is the ladder's column on INSERT
  -- (guard_studio_member_rate_insert above) and it is the ladder's column on UPDATE
  -- too: only close_prior_studio_member_rate writes it, and that function is
  -- SECURITY DEFINER, so its UPDATE arrives here as current_user = 'postgres' and
  -- takes the early return at the top. The settings page's blur-save is untouched —
  -- PostgREST's upsert assigns only payload columns, effective_from is the conflict
  -- key, and effective_to is never sent.
  IF NEW.studio_id      IS DISTINCT FROM OLD.studio_id
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.created_at     IS DISTINCT FROM OLD.created_at
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.effective_to   IS DISTINCT FROM OLD.effective_to
  THEN
    RAISE EXCEPTION 'studio member rate identity is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- W1-R5-01: created_by stays un-frozen (the blur-save above needs it) but it is
  -- AUTHORSHIP, not a free column — it may only ever be re-stamped with the acting
  -- admin's own id. 00599's studio ladder ranks on "a rate this studio holds for her
  -- that she did NOT write", so an un-checked UPDATE made the authorization key
  -- caller-writable: she is the OWNER of the personal workspace 00295's
  -- fc_provision_studio_on_designer provisions for every is_designer profile, so
  -- studio_member_rates_admin_update admits her there, and re-stamping a third
  -- party's id relabelled her own self-set 99900 as arm's-length — measured at
  -- $1,998.00 authorized on a 120-minute entry, with the negative controls
  -- (seat-no-forge, forge-no-seat) both returning 15000/30000. It also let a studio
  -- admin re-stamp a COLLEAGUE's row as self-authored, disarming the employing
  -- studio's own rate. The blur-save is untouched: PostgREST's upsert always
  -- assigns the acting admin's own id, which is exactly what this permits.
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NEW.created_by IS DISTINCT FROM (select auth.uid())
  THEN
    RAISE EXCEPTION 'studio member rate authorship records the actor — created_by may only be re-stamped with your own id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── W2-R8-01 / HT-3-e(4), THE ONLY DELTA 00615 ADDS TO THIS BODY ──────────
  -- HT-3-e(2) prices on WHO AUTHORED THE ROW, so authorship has to be the author
  -- of the NUMBER THAT IS THERE — not of the row's first version. The number is
  -- the one column this guard deliberately leaves writable (00598 cases a2, b2, h6:
  -- the settings page saves on blur and an honest studio corrects a rate in place),
  -- and studio_member_rates_admin_update admits any owner/admin of the studio,
  -- the rate's own SUBJECT included. Measured before this statement, 1/1 through
  -- RLS as her, ONE account: an admin-designer rewrote her employer OWNER's open
  -- row 25000 → 99900 with created_by untouched, the row read as arm's-length to
  -- both of HT-3-e's tests, and her 120-minute hour came back
  -- 99900 / studio_member / 199800. After it, the rewrite is her own number by the
  -- record as well as in fact, HT-3-e(2) ignores it, and the hour prices 'none'
  -- until the studio writes a row of its own — identical to the INSERT form the
  -- ruling already covered. It also repairs a visibility regression HT-3-e(3)'s
  -- answer depends on: the owner's rate-card lens no longer shows HER number under
  -- HIS name.
  -- `auth.uid()` IS NOT NULL is required, not assumed: every authenticated caller
  -- has one, and a service_role path without a JWT must leave the recorded author
  -- standing rather than write NULL, which is the DELETED-AUTHOR value tier 2
  -- treats as arm's-length (case (ag5)). postgres already returned at the top.
  IF NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
     AND (select auth.uid()) IS NOT NULL
  THEN
    NEW.created_by := (select auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_studio_member_rate_history() IS
  'HT-3 append-only history: a CLOSED rate row cannot be edited at all, and on the '
  'OPEN row studio_id, user_id, created_at, effective_from and effective_to are '
  'frozen (W1-R1-08, W1-R7-03). created_by stays writable for the blur-save but '
  'only with the actor''s own id (W1-R5-01), and W2-R8-01 / HT-3-e(4) (RULED '
  '2026-09-12, migration 00615) stamps it with the actor whenever '
  'hourly_rate_cents moves: HT-3-e(2) prices on who authored the row, so the '
  'record has to name whoever set the number that is there. Without it the rate''s '
  'own subject rewrote her studio owner''s number in place and it still read as '
  'arm''s-length. Writes arriving as postgres (close_prior_studio_member_rate, '
  'seeds, migrations) take the early return untouched.';

-- Restated rather than inherited (CREATE OR REPLACE keeps a function's ACL): a
-- trigger function needs no EXECUTE privilege on any role, and this one is
-- SECURITY INVOKER, so nobody holds it.
REVOKE ALL ON FUNCTION public.guard_studio_member_rate_history()
  FROM PUBLIC, anon, authenticated, service_role;

DO $guardpostcondition$
DECLARE
  v_src text := pg_get_functiondef(
    'public.guard_studio_member_rate_history()'::regprocedure);
BEGIN
  -- SPELLING HEURISTIC, not a proof of behaviour (W2-R7-04 / W2-R8-06): these
  -- asserts read the function's SOURCE TEXT, comments included. Case (l) of
  -- studio_member_rates_test.sql and case (ah) of time_rate_resolution_test.sql
  -- are what measure the behaviour.
  ASSERT v_src ~ 'NEW\.hourly_rate_cents IS DISTINCT FROM OLD\.hourly_rate_cents',
    '00615: HT-3-e(4) keys on the NUMBER MOVING — an UPDATE that leaves '
    'hourly_rate_cents alone must not move authorship, or an unrelated touch takes '
    'credit for somebody else''s rate';
  ASSERT v_src ~ 'NEW\.created_by := \(select auth\.uid\(\)\)',
    '00615: and the stamp is the ACTING uid — a rewrite of the number is authored '
    'by whoever typed it, which is the question HT-3-e(2) asks when it prices';
  ASSERT v_src ~ 'current_user IS NOT DISTINCT FROM ''postgres'' THEN RETURN NEW',
    '00615: the postgres early return survives the graft — close_prior_studio_'
    'member_rate is SECURITY DEFINER and its own UPDATE of effective_to must not '
    'be re-authored, nor refused';
  ASSERT v_src ~ 'studio member rate identity is immutable',
    '00615: W1-R1-08/W1-R7-03''s identity-and-dates freeze survives the graft';
  ASSERT v_src ~ 'created_by may only be re-stamped with your own id',
    '00615: W1-R5-01''s actor check survives the graft, and the new stamp sits '
    'AFTER it so a forge combined with a rate change still RAISES (case j4)';
  ASSERT v_src ~ 'a closed studio member rate row is history',
    '00615: a closed row is still history — the raise above every other test';
  ASSERT (SELECT NOT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.guard_studio_member_rate_history()')),
    '00615: the guard stays SECURITY INVOKER — current_user is how it tells the '
    'ladder''s own writes from a caller''s (00598)';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'studio_member_rates'
      AND t.tgname = 'aaa_guard_studio_member_rate_history_trg'
      AND NOT t.tgisinternal),
    '00615: the 00598 trigger binding survives CREATE OR REPLACE — the NAME is '
    'what orders this guard before close_prior_studio_member_rate_trg';
  RAISE NOTICE '00615 guard postconditions passed.';
END
$guardpostcondition$;

COMMIT;
