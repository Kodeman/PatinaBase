-- ═══════════════════════════════════════════════════════════════════════════
-- 00606 — HT-10: a member reads her OWN hours; the owner/admin reads the
--         studio's. The per-person rate stops being studio-wide reading.
--
-- HT-10 (RULED 2026-09-11): *"Narrow to owner/admin. Members read own rows plus
-- aggregates on rostered projects."*
-- HT-10-a (RULED 2026-09-11, AMENDED 2026-09-12): the narrowing is **TWO
-- policies, not one.** project_time_entries carried two SELECT policies with no
-- `user_id` leg:
--
--   Team can view their project time entries | SELECT | is_project_team_member(project_id)
--   time_entries_studio_read                | SELECT | EXISTS(projects p WHERE p.id = … AND is_studio_comember(p.designer_id))
--
-- The first gave a rostered member every row of that project; the second gave
-- EVERY active non-guest studio co-member every row of every studio project.
-- Since W1 those rows carry a per-person studio rate (`hourly_rate_cents` +
-- `rate_source`) that studio_member_rates_read_self_or_admin (00598) keeps
-- confidential — measured in W1 review round 10 (W1-R10-03): a plain member
-- reads 0 rows of a colleague's rate row and the identical `15000 /
-- studio_member` off that colleague's hours row. W1 closed the WRITE half
-- (00601 delta 1a). This file is the READ half, and P-3 makes it a precondition
-- on the single deploy: W1 must not reach Strata ahead of this migration.
--
-- Both policies are re-created with a `user_id = auth.uid()` leg, and the
-- studio-wide read returns as ONE new name for owner/admin only:
-- `time_entries_owner_admin_read`, via `is_org_admin_or_owner` (§0.14), the same
-- predicate 00605's write widening uses.
--
-- THE PREDICATE IS THE PRICING STUDIO, NOT THE DESIGNER'S MEMBERSHIP SET
-- (amended in W2 review round 1, finding B1 — measured). plan-v2 §3 wrote this
-- read as "an owner/admin of ANY studio the project's designer actively belongs
-- to", which is SELF-GRANTABLE: `Org owners can insert members` lets anyone who
-- owns any organization seat another person in it with one INSERT (WITH CHECK
-- is_org_admin_or_owner(organization_id) AND role <> 'owner'; no consent gate;
-- status DEFAULT 'active'), so an outsider who seats a victim project's designer
-- in her own studio would read — and 00605 would let her delete — exactly the
-- notes and per-person rate (`22500 / studio_member`) that THIS FILE exists to
-- hide. The narrowing has to be un-reversible by its own attacker to be a
-- narrowing at all. So the read keys on the studio that OWNS the work:
-- `is_org_admin_or_owner(project_pricing_studio_id(project_id))`, 00604's one
-- callable form of HT-3-a/b, the same studio 00599's ASSERT 2 and 00601's refusal
-- already key on.
--   (i) §0.13 is honoured on its reasoning, not its letter: it forbids the
--       projects.studio_id COLUMN as a policy key because a legacy NULL WIDENS
--       visibility (00317:15-18). Here NULL resolves to
--       is_org_admin_or_owner(NULL) = FALSE (00484:604-623), so the same legacy
--       row fails CLOSED — the safe direction — and §0.13 already admits a key
--       whose guard replicates 00317:31-47's anti-aiming assert.
--  (ii) The trade: the owner of a legacy NULL-studio_id project whose designer's
--       tier is ambiguous loses her studio read until the project NAMES its
--       studio — the repair HT-3-a step 3 already asks of her ("the owner fixes
--       'none' by stamping projects.studio_id").
--       CORRECTED in W2 review round 2 (finding W2-R2-02 — measured): that
--       sentence used to read "until she stamps the project", and NO
--       authenticated caller could stamp it. `set_project_studio_id`'s
--       authenticated arm (00563) raises `studio_id_not_designer_studio` unless
--       TG_OP = 'INSERT', so the column was immutable after the row existed for
--       designer, owner and admin alike, and no other writer of it exists in the
--       database or in any portal. So the read HT-10 grants was permanently
--       absent on every legacy NULL-studio project and every ambiguous-tier one,
--       with no act available to anybody. Section (4) of this file is the missing
--       act: `public.stamp_project_pricing_studio(p_project_id, p_studio_id)`.
-- The residue (a sole-proprietor designer on a legacy NULL-studio project) is
-- stated in 00605's banner and belongs to W1's pricing residue, not to this read.
--
-- THE 00484 REGISTRATION CONTRACT, followed rather than voided (§0.17):
-- `Team can view their project time entries` is one of the four policies
-- 00484:1712-1760 registers and asserts, and this file RE-QUALIFIES it. That is
-- a ruling (HT-10-a), not a tidy, and it is discharged the only way the contract
-- allows:
--   · the policy KEEPS its name, its command (`r`), its role set
--     (`{authenticated}`), its permissive flag and its postgres ownership — every
--     property the contract checks except the qual it now must carry;
--   · none of the four is dropped or renamed, and the other three are untouched;
--   · the contract's LIVE-STATE home, supabase/tests/edge_api/
--     public_rpc_authorization_contract_test.sql, is re-registered in the same
--     commit with the new qual and with HT-10-a named beside it, so the
--     narrowing remains a signed expectation rather than a silent drift. 00484's
--     own DO block runs at 00484's replay point and so still passes on its own
--     terms; if 00484 is ever re-derived, the VALUES row for this policy moves
--     with it.
--
-- WHAT THIS FILE DOES NOT CLOSE, measured and stated rather than implied:
-- `Designers manage their project time entries` (00177:136-137) is an ALL policy
-- on `projects.designer_id = auth.uid()` with NO `user_id` leg, and it is
-- explicitly untouched by plan-v2 §3. So a project's OWN designer still reads
-- every row of her own project, per-person rate included — which is the exact
-- actor W1-R10-03's fixture used (a plain-member designer reading a colleague's
-- 15000 off a row on her own project). That read is also what case (ab4) of
-- supabase/tests/billing/time_rate_resolution_test.sql requires in order for a
-- designer to correct a teammate's entry at all (W1-R1-05), and it cannot be
-- narrowed by RLS without taking the correction with it — hiding one COLUMN from
-- one actor is a column privilege, not a policy. Asserted as shipped behaviour
-- in supabase/tests/rls/studio_hours_rollup_test.sql case (f) and reported to
-- the orchestrator as the residue of HT-10-a rather than left to be rediscovered.
--
-- WHAT REVERTS, AND WHAT DOES NOT (risk 5 of plan-v2 §12 — corrected in review
-- round 4, finding W2-R4-04; this sentence used to read "THIS IS THE ONLY CHANGE
-- IN THIS MIGRATION", which stopped being true the moment section (4) landed):
-- sections (1)-(3) are three policy statements and they DO revert on their own,
-- without touching the ledger view, the rollup or the lens. Section (4) is NOT
-- part of that revert — it is the repair act HT-3-a's remedy needs (W2-R2-02),
-- and dropping it would delete the only path by which a project that reached
-- 'none' can ever name a studio again. Revert the policies; keep the act.
--
-- ── ROUND 9 (HT-3-f(1) and W2-R9-02) ───────────────────────────────────────
-- Two changes landed inside section (4): bound (c) became a CONFIRM where the
-- caller named the studio the derivation ALREADY returned (HT-3-f(1)), and bound
-- (a2)'s employer leg began asking the rate row's AUTHORSHIP HISTORY rather than
-- its current author (W2-R9-02), which needs the column declared at section (3b).
-- The second survives. The first is GONE — see the round-11 section below.
--
-- ── ROUND 10 (HT-3-f(1) AMENDED — W2-R10-01) ───────────────────────────────
-- The confirm was bounded to the EMPLOYER tier, because read literally round 9's
-- confirm also handed the DESIGNER a pin: with her employer tier empty she pinned
-- the workspace 00295 provisions for her onto her own legacy project in ONE
-- statement, bound (b) made the column FINAL, and her hours there priced at her own
-- 99900 for ever — including after an honest employer hired her and priced her
-- 26000. Round 11 then measured the SAME taking on the arm the amendment did not
-- gate (W2-R11-01): with the derivation silent for a legacy project she did not
-- author (HT-3-f(2)), bound (c) never spoke at all and the plain STAMP arm wrote
-- her own workspace in — form A in one statement with no seat change of any kind,
-- form G in two on her former employer's own project.
--
-- ── ROUND 11 — HT-3-g (RULED BY KODY 2026-09-12) ────────────────────────────
-- THE ACT IS THE EMPLOYER'S, AND THERE IS NOTHING LEFT TO DERIVE.
--
--   *"(1) NO READ-TIME DERIVATION. (3) DESIGNERS NEVER STAMP.
--   stamp_project_pricing_studio admits ONLY a caller who is owner/admin of the
--   named studio AND the named studio is in the project designer's EMPLOYER tier
--   (she holds an active non-guest seat there with role <> 'owner'). No owned-tier
--   arm, no sibling leg, no confirm arm, no designer arm. Bound (b) (a stamped
--   column is final) stays."*
--
-- Three rounds of this function chased the same money shape around one structure —
-- an act bounded by a TIER that is recomputed on every hour, in a function whose
-- refusals all turned on a derivation the designer could silence. HT-3-g removes
-- both halves of that:
--   · the DERIVATION is gone (00615): project_pricing_studio_id IS
--     projects.studio_id, so bound (c) had nothing left to read. Its confirm arm and
--     its different-studio refusal are both subsumed by bound (b) — if the column is
--     set, bound (b) answers; if it is NULL, there is nothing to confirm. Bound (c)
--     is therefore DELETED, not re-bounded.
--   · the OWNED TIER is gone from the act. A studio the designer OWNS is never
--     nameable here, whoever calls: not by her (form A, W2-R11-01), not by a
--     colleague, not by a second account she hands the title to. Bound (e)'s CASE
--     and bound (d)'s seat test both collapse into ONE test — the named studio
--     EMPLOYS the designer — which is strictly stronger than either.
--   · the SIBLING LEG is gone with it (round 3's `created_by` leg was the owned
--     tier's half of bound (a2)), and so is the DESIGNER ARM: bound (a2)'s
--     `v_actor <> v_designer_id` skip — the gap form A walked through — is deleted,
--     and this file's own postcondition already forbids any refusal gated on the
--     caller BEING the designer.
-- WHAT IS LEFT, and it is the whole of the act: an owner or admin of a studio that
-- EMPLOYS this project's designer, naming that studio on a project whose column is
-- still NULL, where that studio already holds a rate row for her that somebody
-- other than she wrote. Measured consequences, stated rather than implied:
--   · a designer can still stamp — but only the studio that EMPLOYS her, and only
--     where she is its owner or admin (case (x) x7's shape, which W2-R6-01 rated a
--     MAJOR for refusing). She gains nothing by it: HT-3-e(2) ignores the number she
--     wrote for herself unless she OWNS that studio, and an employer-tier seat is
--     role <> 'owner' by definition, so her own number can never be the one that
--     prices there.
--   · forms A and G of W2-R11-01 are both REFUSED, and so is every earlier
--     owned-tier manoeuvre (W2-R4-01's confederate, W2-R5-01's demotion-then-stamp,
--     case (q)'s transfer, HT-3-f(1)'s pin in her hand).
--   · HT-3-f(4) is NOT closed and is not claimed to be: the consent-free outsider's
--     seat in HIS org IS an employer-tier seat, he authors her rate there under his
--     own id, and his stamp is admitted. Its closure is still HT-3-b arm (c)'s
--     consent door, with an owner-initiated UNPIN owed beside it — a ruling owed,
--     not built here. Case (z).
--   · THE RETAINED LEG, reported rather than assumed: HT-3-g(3) names two
--     conditions and four removals, and the arm's-length-rate leg (HT-3-e(1)) is in
--     neither list, so it is KEPT — unconditionally now, there being only one tier.
--     It narrows the act rather than widening it, and it costs an honest employer
--     only what it already had to do: a studio that has not priced her gets nothing
--     from the stamp, because her hour would price 'none' after it anyway. If the
--     orchestrator reads HT-3-g(3)'s two conditions as exhaustive, the removal is
--     one IF and case (u)'s first two legs move with it.
-- Cases (y), (z), (e), (w), (x), (al) and (am) of
-- supabase/tests/rls/time_entry_studio_stamp_test.sql measure all of it.
--
-- Lineage: policies, plus ONE new function (section 4 — NEW name, nothing
-- redefined; `set_project_studio_id` is NOT touched), plus ONE new column
-- (section 3b, W2-R9-02 — additive, nullable, written only by 00615's guard).
-- P-4: no row is touched by this migration. The new column is NOT backfilled. The
-- new function writes `projects.studio_id` only when a caller asks it to, one
-- project at a time, and only where that column is still NULL — it is a repair
-- act, not a backfill.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) the 00484-registered rostered read: OWN rows ───────────────────────
DROP POLICY IF EXISTS "Team can view their project time entries" ON public.project_time_entries;
CREATE POLICY "Team can view their project time entries" ON public.project_time_entries
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) AND public.is_project_team_member(project_id));

-- ── (2) the studio-wide read: OWN rows ─────────────────────────────────────
-- The NAME is kept (00316:237-240) so that the revert is one statement and so
-- that nothing has to learn a new name to be narrowed back.
DROP POLICY IF EXISTS time_entries_studio_read ON public.project_time_entries;
CREATE POLICY time_entries_studio_read ON public.project_time_entries
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_time_entries.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- ── (3) HT-10's replacement studio read, for owner/admin only ──────────────
DROP POLICY IF EXISTS time_entries_owner_admin_read ON public.project_time_entries;
CREATE POLICY time_entries_owner_admin_read ON public.project_time_entries
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_owner(
      public.project_pricing_studio_id(project_time_entries.project_id)
    )
  );

-- ── (3b) W2-R9-02: the column this file's arm's-length leg reads ────────────
-- studio_member_rates.original_created_by records the author HT-3-e(4) DISPLACED
-- when somebody moved an open rate row's number. It is declared HERE, beside the
-- leg that reads it, rather than in 00615 where the guard that WRITES it lives: a
-- migration's body may not read a column a LATER migration adds, and
-- `supabase migration up` stopping at this number must leave a callable function.
--   Why the column exists. The employer arm at bound (a2) below asks the named
-- studio for a studio_member_rates row for this designer "that somebody other than
-- she wrote". HT-3-e(4) re-authors a row to whoever moves its number — correctly,
-- it is what HT-3-e(2) prices on — so a studio whose card holds exactly ONE row for
-- her (a studio that has priced a hire once: the common shape) LOST that standing
-- the moment she rewrote the row in place, and the stamp was then refused to the
-- studio's OWNER as well as to her. Measured, probe A A4/A5, round 9.
-- Closed rows need nothing: they are frozen outright, which is why the leg reads
-- open and closed rows alike and why this column is only ever needed for the open
-- one. Nobody may name it — 00615's INSERT guard discards a supplied value and its
-- UPDATE guard freezes it — so it is written only from OLD, only once, and only by
-- the guard.
-- P-4: no row is touched. Existing rows get NULL, and their `created_by` is still
-- the author nobody has displaced; there is no backfill and none is possible.
ALTER TABLE public.studio_member_rates
  ADD COLUMN IF NOT EXISTS original_created_by uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.studio_member_rates.original_created_by IS
  'W2-R9-02 (migration 00606, written only by 00615''s '
  'guard_studio_member_rate_history): the author HT-3-e(4) displaced when this open '
  'row''s number was last moved, kept once (COALESCEd from OLD) so a chain of '
  'rewrites cannot walk the first author off the row. NULL means no number of this '
  'row has ever been moved, in which case created_by is still that author. It is '
  'the employer''s durable arm''s-length standing at stamp_project_pricing_studio '
  'and is frozen against every caller.';

-- ── (4) the repair path the narrowing promises (W2-R2-02) ──────────────────
-- HT-3-a's ruled remedy is one sentence: *"The owner fixes 'none' by stamping
-- projects.studio_id."* It had no implementation, and `set_project_studio_id`
-- (00317 → 00511 → 00563) makes the column immutable for every authenticated
-- session once the row exists — its authenticated arm raises unless
-- TG_OP = 'INSERT' — so a project that reached 'none' stayed there and the studio
-- read this file grants its owner was unreachable (measured in review round 2:
-- a studio owner who is also the project's designer was REFUSED P0001
-- studio_id_not_designer_studio on `UPDATE projects SET studio_id = <her own
-- studio>`, and the only other writer of the column, `reassign_project_lead`,
-- requires a non-NULL studio_id to begin with).
--
-- This function is that act, and NOTHING more: it names a studio on a project
-- whose column is still NULL and whose derivation is silent. `set_project_studio_id`
-- is not redefined; the write happens as the DEFINER, so the trigger's
-- owner-executed arm (00563's `current_user = 'postgres'` branch) re-validates the
-- same bound independently — the assert below is not the only thing standing
-- between a caller and the column.
--
-- WHO MAY CALL IT — HT-3-d (RULED by the orchestrator 2026-09-12, written after
-- review round 4 MEASURED that the previous two-arm shape was still reachable):
--
--   stamp_project_pricing_studio may name ONLY a studio inside the project
--   DESIGNER's HT-3-b tier as that tier stands at call time — the EMPLOYER tier
--   (her active, non-guest seats with role <> 'owner') while that tier is
--   non-empty, otherwise the OWNED tier (role = 'owner') — and the caller must
--   be an OWNER or ADMIN of the studio being named.
--
-- THE TIER BOUND IS A PROPERTY OF (this project's DESIGNER, p_studio_id), NOT OF
-- THE ACTOR, and it is applied to EVERY caller. That is the whole of round 4's
-- correction. Round 3 put the same bound inside `IF v_designer_id = v_actor`,
-- which refused the designer as actor and admitted anyone she can author:
-- measured end to end (W2-R4-01, MAJOR), she seated a second account she
-- controls as `admin` in the one-person workspace 00295 provisions for her
-- (consent-free: `Org owners can insert members` asks only
-- is_org_admin_or_owner(organization_id) AND role <> 'owner'), gave herself
-- 99900 there (studio_member_rates_admin_insert asks only the same), had that
-- account stamp, and her next hour on the employer's legacy project priced at
-- 99900 / studio_member with no employer able to see the project, the hour or
-- the rate. Under HT-3-d that workspace is refused to EVERY caller while she
-- holds an employer seat, because the workspace is not in her tier.
--
-- The ruling resolves three round-4 findings at once, and each is worth naming
-- so that a later hand does not "simplify" one of them away:
--   · W2-R4-01 — the confederate above. Refused by the tier, whoever calls.
--   · W2-R4-02 — the MEMBER being priced no longer chooses which of her
--     employers permanently owns the hours and the money: the caller must be an
--     owner or admin of the studio named, so a designer seated a plain `member`
--     in two employer studios cannot stamp either. HT-3-a's ruled sentence is
--     "the OWNER fixes 'none' by stamping projects.studio_id", and this is it.
--   · W2-R4-03 — the owned-tier half is now bounded by the tier rather than by
--     the actor: a studio she OWNS may price her only where she holds NO
--     employer seat at all (HT-3-c arm (a)'s sole proprietor, and the principal
--     with two owned candidates whom HT-3-b records as priced by neither —
--     cases (n)/(w) of time_rate_resolution_test.sql — for whom this stamp is
--     the only repair that exists). RESIDUE, stated rather than hidden: where
--     she holds no employer seat and owns TWO active studios, both are in the
--     tier, so she may name either — including the 00295 workspace whose rate
--     card she writes. HT-3-d permits that; it is the shape W2-R4-03 asked a
--     ruling about, pinned as case (o) below, and flagged to the orchestrator
--     rather than narrowed here on a guess.
--
-- AMENDED IN ROUND 5, AND CORRECTED IN ROUND 6 — WHAT THE TIER DOES NOT SEE, AND
-- WHAT THIS ACT CAN STILL DO. The paragraph above claimed the tier refuses her own
-- workspace "to EVERY caller while she holds an employer seat". That is FALSE, and
-- measured so (W2-R5-01, MAJOR): HT-3-d's tier is a ROLE test, and a designer can
-- WRITE her own role in a studio she controls. Two authenticated statements — a
-- consent-free `admin` seat for an account she holds, then
-- `transfer_studio_ownership`, whose last statement DEMOTES auth.uid() to 'admin'
-- (00484:524-536), both live affordances on her own studio settings page — move her
-- 00295 workspace out of the OWNED tier and INTO the EMPLOYER tier while she stays
-- is_org_admin_or_owner there. A project an honest employer was pricing CORRECTLY
-- then falls to 'none' (the demotion makes her employer tier ambiguous, satisfying
-- bound (c)), the workspace is stamped, her next hour comes back
-- 99900 / studio_member / 199800 rated, and the employer reads 0 rows with
-- project_hours_total refused 42501, for ever (bound (b)). The act did not repair
-- 'none' — it MANUFACTURED 'none' and took the work.
--
-- ROUND 5 answered that with bound (e2) ("while the project's designer holds any
-- employer seat, SHE may not name a studio she herself administers"). ROUND 6
-- REVERSED it, on three measurements and on HT-3-d's own words ("There is no other
-- arm"): it refused a caller the ruling expressly admits — a designer who is an
-- `admin` of an HONEST employer, whose other employer seat makes her tier ambiguous
-- and her project honestly 'none' — while bound (a2) refused her employer's own
-- owner for want of a sibling, so HT-3-a's ruled remedy was measurably unavailable
-- to anybody on that shape (W2-R6-01, probe P1, 1/1).
--   CORRECTED IN ROUND 7 (W2-R7-03, measured as probe P8): round 6 wrote here, and
--   in this function's COMMENT, that (e2) "bought nothing". That sentence is FALSE.
--   (e2) bought exactly one refusal, and it needed neither a confederate nor a
--   second account: an `admin` of an HONEST employer satisfies
--   `studio_member_rates_admin_insert`, so she writes her own 99900 into that
--   employer's rate card with one statement, stamps that employer (the case (s)
--   arm), and her hour came back 99900 / 199800 where the employer's owner had
--   written 26000. What is true is the narrower claim: (e2) bought nothing against
--   the manoeuvre it was WRITTEN for (the ownership transfer, which needs a second
--   account by construction and which that account then performs — case (q)), and
--   the refusal it did buy belongs at the RATE, not at the studio, because the same
--   number is reachable on NEW work with no stamp at all (00563's authenticated arm,
--   measured as P1-7). HT-3-e(2) is that rule and it lands in migration 00615: a
--   `studio_member_rates` row whose `created_by` is its own `user_id` prices an hour
--   ONLY where that person is the named studio's OWNER. Case (s)'s s8 measures P8
--   coming back 26000 instead of 99900. The full reasoning, the
-- two further round-6 measurements (a stamp with NO rate card in the studio, the
-- rate written afterwards; and the same taking in an organization she has never
-- owned), and the exact code to restore if HT-3-d is amended to ratify (e2), are
-- recorded at bound (e2)'s own site below.
--
-- AND THIS FILE DOES NOT CLAIM THE ACT CANNOT MOVE MONEY. It can, and the shapes
-- are pinned as PASSING, loudly-labelled assertions rather than left to be found:
--   · case (q) — the designer writes her own ROLE. Her own stamp (q7) and the
--     stamp by the account she handed the title to (q8) BOTH succeed; her hours
--     price at her own 99900 / 199800 rated; the honest employer reads 0 rows.
--     HT-3-d's second consequence ("a confederate she seats as admin in her
--     workspace is refused … the workspace is not in the tier") is false after the
--     demotion: the workspace genuinely IS in the tier then, and bound (e) cannot
--     tell it from an employer. The owed consent door does NOT close this one —
--     the seat exploited is her OWN 00295 seat, and she is the consenting party.
--   · case (r), W2-R5-02 — a WILLING designer authors the `created_by` sibling
--     bound (a2) asks of a confederate, so that leg bounds nobody she cooperates
--     with; his stamp succeeds, and removing the cause (he deletes her seat) does
--     not undo it. W2-R2-04's consent door is therefore IRREVERSIBLE through this
--     act, which is what round 4 ruled must not survive.
-- The closure is a ruling the program owes, and round 6 narrowed the candidates by
-- measurement rather than by argument: a temporal bound on the tier keys on
-- organization_members.updated_at, which any People-room edit moves; a
-- rate-authorship bound AT THIS CALL SITE is vacuous (measured: the stamp succeeds
-- with zero rate rows, and the number is written afterwards); and the taking needs
-- no studio of hers at all (measured: an accomplice's own org, SHE writes her own
-- 99900 there as its `admin`). What remains is a rule at the RATE: a
-- studio_member_rates row whose created_by is its own user_id prices an hour only
-- where that person is the named studio's OWNER — a W1 resolver rule, which would
-- leave HT-3-a arm (a)'s and HT-3-c's sole proprietor untouched and would still
-- leave the pair where the ACCOMPLICE writes the number (case (r), the owed HT-3-b
-- arm (c) class). None of it is guessed here.
--   THAT RULE IS NOW RULED — HT-3-e(2), 2026-09-12 — and it is implemented in
--   migration 00615, which redefines resolve_time_rate_cents only. Measured after
--   it: case (q)'s q7 and q8 are REFUSED (the workspace holds only the row she
--   wrote, so HT-3-e(1)'s employer arm has nothing arm's-length to read), her hours
--   on the manufactured 'none' file 'none' rather than 99900, and her honest
--   employer can repair the project afterwards. What remains is HT-3-e(3)'s
--   ACCEPTED RESIDUAL: the second account she hands the workspace to may AUTHOR her
--   rate there, which makes that row arm's-length by both tests — so the taking
--   still works for a designer running a cooperating account, and Patina makes it
--   VISIBLE rather than impossible (the pricing studio is a column of
--   time_entry_ledger and lane B's owner lens shows it). Cases (q) and (r) measure
--   it. The projects.studio_id IS NULL population on Strata is still the exposure,
--   and still uncounted.
--
-- ROUND 7: THE SECOND HALF OF STANDING IS NOW SPLIT BY TIER (HT-3-e(1), RULED by
-- the orchestrator 2026-09-12, flagged to Kody). Round 3's retained leg — where the
-- caller is NOT the designer herself, the studio she names must ALREADY hold a
-- project this designer both LEADS and CREATED — was measured in round 7 to refuse
-- the whole legacy population it was meant to serve (W2-R7-01, MAJOR, 24 of 24
-- calls: four actors x three of her legacy projects x both her employers, every
-- refusal naming that leg, every column still NULL). A designer whose book predates
-- the column holds no project with `studio_id = p_studio_id` at all, so the leg
-- asks an employer for something only the future can supply. HT-3-e(1) replaces it
-- IN THE EMPLOYER TIER with an ARM'S-LENGTH RATE: the studio named must already
-- hold a `studio_member_rates` row for this designer written by somebody other than
-- her (`created_by <> user_id`). An honest employer has that the moment it has
-- priced her, and without it the stamp would buy it nothing (her hour would price
-- 'none' anyway); the one-account designer cannot produce it, because every row in
-- the workspace she controls carries her own id. The sibling leg STAYS for the
-- OWNED tier, where HT-3-c's sole proprietor is the caller and there is no second
-- party to author anything. What follows is round 3's reasoning, which is why
-- `created_by` — not the seat, and not the lead — is the column both legs key on:
--
-- (round 3, for the owned tier) the studio she names must ALREADY hold a project
-- this designer both LEADS and CREATED. HT-3-d's tier bound does not reach this
-- manoeuvre, because the tier is keyed on organization_members and an outsider
-- can put her OWN org inside the designer's employer tier with one consent-free
-- INSERT. Measured before the fix (W2-R3-01, a BLOCKER): seat the victim
-- project's designer in the attacker's org (which also makes the employer tier
-- ambiguous, so the unpriced bound passes), put that designer in the lead of the
-- attacker's own project through `reassign_project_lead` (SECURITY DEFINER,
-- GRANTed to authenticated, 00399:301/:510), stamp — three authenticated
-- statements moved an unstamped project's pricing studio into an outsider's org
-- for ever: she read the row, the confidential note and the per-person rate, got
-- the project total, could UPDATE and DELETE the hour, while the studio that did
-- the work read 0 rows and could not re-stamp. `projects.created_by` is the one
-- column in that shape she cannot author: 00563 RAISES on any UPDATE that moves
-- it, its authenticated-INSERT arm admits only `NEW.created_by = auth.uid()` on a
-- project the actor leads herself, `reassign_project_lead` never touches it, and
-- every real creation path writes the DESIGNER's own id into it
-- (`_activate_proposal_as_project_impl`, `activate_project_v2` /
-- `create_project_v2` — verified, not assumed). So the realistic repair — a
-- studio whose designer's later projects 00563 has been stamping all along,
-- holding one legacy project from before it — still works, and a manufactured
-- sibling does not. Cases (d) and (k) of
-- supabase/tests/rls/time_entry_studio_stamp_test.sql measure both.
--   CORRECTED IN ROUND 5 (W2-R5-02 — measured): this leg is safe against an
--   UNWILLING victim ONLY. It bounds what an attacker can forge about a designer
--   who is not helping him; it bounds nothing about a designer who IS, because she
--   authors the sibling herself with one INSERT naming his studio (00563's
--   authenticated arm admits any studio she belongs to, and his consent-free seat
--   made her belong). Case (r) measures that end to end. So `created_by` does not
--   close the consent-door class — it narrows it to attackers acting alone.
--
-- WHAT THE SHIPPED BODY ACTUALLY IS, after HT-3-g(3) — read this and not the
-- archaeology above, which is kept because each paragraph records a measurement
-- that is still true of the shape it describes: FOUR tests, in this order. (a) the
-- caller is an owner or admin of the studio named. (a1)/(c) that studio EMPLOYS
-- this project's designer — the ONE tier, which replaced bound (d)'s seat test and
-- bound (e)'s CASE and is strictly stronger than both. (b) the project's column is
-- still NULL, a stamped project being final (HT-3-c; and under HT-3-g this is also
-- the whole of round 9's bound (c), there being no derivation left to confirm).
-- (d) HT-3-e(1)'s arm's-length rate, now unconditional. Round 3's sibling leg,
-- round 9's confirm arm, bound (e)'s owned branch and bound (a2)'s designer skip
-- are all DELETED. The act still writes ONE audit_logs row (W2-R4-05) and returns
-- the studio the UPDATE actually wrote (W2-R4-06).
CREATE OR REPLACE FUNCTION public.stamp_project_pricing_studio(
  p_project_id uuid,
  p_studio_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
  v_existing    uuid;
  v_actor       uuid := auth.uid();
  -- HT-3-g(3): the ONE fact this act turns on besides the caller's standing — does
  -- the studio being named EMPLOY this project's designer?
  v_named_is_employer_seat boolean := false;
  v_written     uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: no actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_project_id IS NULL OR p_studio_id IS NULL THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: both the project and the studio are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT project.designer_id, project.studio_id
    INTO v_designer_id, v_existing
  FROM public.projects AS project
  WHERE project.id = p_project_id;

  IF v_designer_id IS NULL THEN
    -- No such project, or a project with no lead. Both are refusals, and both
    -- answer identically so that a caller cannot enumerate project ids.
    RAISE EXCEPTION 'stamp_project_pricing_studio: this project cannot be stamped'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (a) standing, HT-3-d and HT-3-g(3): an OWNER or ADMIN of the studio being
  --     named. Being the project's designer is NOT standing in itself (W2-R4-02) —
  --     where she is a plain member of the studio that should take her hours, the
  --     repair is that studio's to perform, which is HT-3-a's ruled sentence
  --     exactly.
  IF NOT public.is_org_admin_or_owner(p_studio_id) THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: only an owner or admin of the '
                    'studio being named may name it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (a1) HT-3-g(3)'s other half, as a fact: the project's DESIGNER holds an
  --      ACTIVE, NON-GUEST seat in the studio named with role <> 'owner', in an
  --      active design_studio. This is the EMPLOYER tier of HT-3-b, asked of ONE
  --      studio — a property of (this project's DESIGNER, p_studio_id) and never of
  --      the actor.
  v_named_is_employer_seat := EXISTS (
    SELECT 1
    FROM public.organization_members AS named_seat
    JOIN public.organizations AS studio
      ON studio.id = named_seat.organization_id
    WHERE named_seat.organization_id = p_studio_id
      AND named_seat.user_id = v_designer_id
      AND named_seat.status = 'active'
      AND named_seat.role <> 'guest'
      AND named_seat.role <> 'owner'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
  );

  -- (b) a stamped project is final (HT-3-c arm (a); 00603 case (z)). Naming the
  --     studio it already names is a no-op rather than an error, so a retry is
  --     safe. Under HT-3-g this bound is also the WHOLE of what round 9's bound (c)
  --     used to do: the callable form every reader keys on IS this very column now,
  --     so "another studio already prices this project's hours" and "this project
  --     already names a studio" are the same sentence, and there is no derivation
  --     left to CONFIRM. (That function's NAME is not written in this body on
  --     purpose — a postcondition below reads this source and forbids it, because a
  --     body that consults the derivation at all is a body that can be re-given a
  --     confirm arm.)
  IF v_existing IS NOT NULL THEN
    IF v_existing = p_studio_id THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'stamp_project_pricing_studio: this project already names a studio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (c) HT-3-g(3) (RULED BY KODY 2026-09-12), the ONE tier: the studio named must
  --     EMPLOY this project's designer. THERE IS NO OWNED-TIER ARM. A studio she
  --     OWNS is not nameable here by anybody — not by her, not by a colleague, not
  --     by an account she hands the title to.
  --     This single test REPLACES three that stood here through round 10, and it is
  --     strictly stronger than two of them: bound (d) (00563's own "active,
  --     non-guest seat in that studio") and bound (e) (HT-3-d's CASE, employer while
  --     she held any employer seat, else owned) are both implied by an employer
  --     seat, and bound (c)'s derivation read is gone with the derivation itself.
  --     WHAT IT CLOSES, measured, each in ONE statement before it existed:
  --       · W2-R11-01 form A — she owns workspace W, holds no employer seat, and
  --         names W on a legacy project her assistant opened. Bound (b) made the
  --         column final and her hours there priced at her own 99900 for ever,
  --         against a control twin an honest later employer priced 26000 / 52000.
  --       · form G — she deletes her own employer seat (`Members can leave`) and
  --         names W on her FORMER employer's own legacy project. Two statements.
  --       · W2-R4-01's confederate seated `admin` in W, W2-R5-01's
  --         demotion-then-stamp, case (q)'s ownership transfer, and HT-3-f(1)'s pin
  --         in her own hand (W2-R10-01) — all of them name a studio she owns or
  --         controls, and all of them are refused here now.
  --     WHAT IT COSTS, stated rather than discovered: HT-3-a's ruled remedy is no
  --     longer available to a sole proprietor or a principal on a legacy project of
  --     her own — her project prices 'none' until she has an employer, which is a
  --     human cost where a human must act, not a taking. 00620 stamps the legacy
  --     population ONCE at ship under HT-3-b's tier rule, which hands her own studio
  --     to exactly that project; what she cannot do is re-point it afterwards.
  --     WHAT IT DOES NOT CLOSE, and is not claimed to (HT-3-f(4), W2-R10-02): the
  --     consent-free outsider's seat in HIS OWN org IS an employer-tier seat, so he
  --     seats her (`Org owners can insert members`, no consent gate), authors her
  --     rate there under his own id, names his org, and her later removal of the
  --     bogus seat undoes nothing. Its closure stays HT-3-b arm (c)'s consent door,
  --     and this program records that an owner-initiated UNPIN / re-derivation act is
  --     owed WITH that door. Case (z) measures it as a PASSING, loudly-labelled
  --     assertion.
  IF NOT v_named_is_employer_seat THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: a studio prices this project''s '
                    'hours only from inside the tier that EMPLOYS its designer — an '
                    'active, non-guest seat with role <> ''owner''. A studio she '
                    'OWNS is nobody''s to name here (HT-3-g)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (d) THE SECOND HALF OF STANDING — HT-3-e(1)'s ARM'S-LENGTH RATE, now
  --     unconditional, there being only one tier. The studio named must already
  --     hold a `studio_member_rates` row for this designer that somebody OTHER than
  --     she wrote. Round 3's `created_by` SIBLING leg, which was the OWNED tier's
  --     half of this bound, is DELETED with the owned tier (HT-3-g(3)), and so is
  --     the inequality skip that made this leg silent in the designer's own hand —
  --     the gap W2-R11-01 form A walked through. (That comparison is described and
  --     not spelled, because a postcondition below forbids its text in EITHER
  --     direction.)
  --     It costs an honest employer nothing it would not already have done: a studio
  --     with no rate for her prices her hour 'none' after the stamp too, so the
  --     stamp would buy it nothing. It is the fact a one-account designer cannot
  --     manufacture, every row in a workspace she controls carrying her own id.
  --     Round 7 measured what the SIBLING leg cost in its place — 24 refusals out of
  --     24, every column left NULL, HT-3-a's remedy reaching nobody on the ordinary
  --     hire (W2-R7-01), because a book that predates the column holds no project
  --     naming the studio at all.
  --     W2-R9-02: the leg asks the row's AUTHORSHIP HISTORY, not its current author,
  --     over OPEN AND CLOSED rows alike. HT-3-e(4) re-authors a row to whoever moves
  --     its number, so the current-author spelling let the rate's own SUBJECT destroy
  --     her employer's standing with one in-place rewrite and refuse the stamp to the
  --     studio's OWNER (probe A, A4/A5). A closed row's authorship she cannot touch
  --     at all; the OPEN row's displaced author is kept in original_created_by,
  --     written only by that guard and only from OLD.
  --     REPORTED, NOT ASSUMED: this leg does not bound the W2-R3-01 / HT-3-f(4)
  --     outsider, who writes her rate in his own org under his own id and so is
  --     arm's-length BY THIS TEST, which asks about the SUBJECT's authorship. Case
  --     (t) / case (z).
  IF NOT EXISTS (
       SELECT 1
       FROM public.studio_member_rates AS other_author
       WHERE other_author.studio_id = p_studio_id
         AND other_author.user_id   = v_designer_id
         AND (
           (other_author.created_by IS NOT NULL
            AND other_author.created_by <> v_designer_id)
           OR (other_author.original_created_by IS NOT NULL
               AND other_author.original_created_by <> v_designer_id)
         )
     ) THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: this studio holds no rate '
                    'for this project''s designer that somebody other than she '
                    'wrote, so naming it is not yours to do (HT-3-e)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (e) WAS HERE AND IS RETIRED BY HT-3-g(3). It was HT-3-d's tier CASE — employer
  --     while she held any employer seat, else a studio she OWNS — and the owned
  --     branch of it is the door rounds 4, 5, 9, 10 and 11 each measured a taking
  --     through. Bound (c) above is the whole of the tier now, and it is a property
  --     of (the designer, p_studio_id) applied to EVERY caller. Round 5's (e2) (a
  --     refusal gated on the ACTOR being the designer) stays reversed: HT-3-g(3)
  --     admits an admin-designer of an HONEST employer expressly, W2-R6-01 measured
  --     1/1 what refusing her cost, and a postcondition below forbids the shape.

  -- (f) the write. The row count is READ rather than assumed (W2-R4-06): under a
  --     concurrent stamp the bounds above can pass and the column be filled
  --     before this statement, and returning p_studio_id would then report a
  --     studio the project does not name.
  UPDATE public.projects
     SET studio_id = p_studio_id
   WHERE id = p_project_id
     AND studio_id IS NULL
  RETURNING studio_id INTO v_written;

  IF v_written IS NULL THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: this project named a studio '
                    'while this call was deciding — nothing was written'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (g) the trace (W2-R4-05). This is the most consequential and the only
  --     irreversible act the wave adds: afterwards the project's whole ledger,
  --     its project_unbilled_time, its invoice composer and the organization_id
  --     of every future time-entry audit row follow the studio written here, and
  --     bound (b) makes it final. audit_logs has RLS with no INSERT policy
  --     (00021:261), and this function is already DEFINER, so the row lands the
  --     same way 00605's trigger's does (§0.18).
  INSERT INTO public.audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    old_values, new_values
  ) VALUES (
    v_actor,
    v_written,
    'project.pricing_studio_stamped',
    'project',
    p_project_id,
    jsonb_build_object('studio_id', NULL::uuid),
    jsonb_build_object('studio_id', v_written)
  );

  RETURN v_written;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_project_pricing_studio(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.stamp_project_pricing_studio(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.stamp_project_pricing_studio(uuid, uuid) IS
  'HT-3-a''s ruled remedy, as an act: name the studio that prices an unstamped '
  'project, so the owner/admin read 00606 grants becomes reachable on a legacy '
  'NULL-studio project (W2 review round 2, finding W2-R2-02 — before this function '
  'no authenticated caller could write projects.studio_id at all, because '
  'set_project_studio_id''s authenticated arm raises unless TG_OP = ''INSERT''). '
  'HT-3-g(3) (RULED BY KODY 2026-09-12) IS ITS WHOLE STANDING, AND IT IS ONE ARM: '
  'the caller must be an OWNER or ADMIN of the studio named, AND that studio must '
  'EMPLOY this project''s designer — she holds an active, non-guest '
  'organization_members row there with role <> ''owner'', in an active '
  'design_studio. THERE IS NO OWNED-TIER ARM, NO SIBLING LEG, NO CONFIRM ARM AND NO '
  'DESIGNER ARM. A studio the designer OWNS is nameable here by nobody — not by '
  'her, not by a colleague, not by an account she hands the title to. Both '
  'conditions are properties of (this project''s DESIGNER, p_studio_id) and of the '
  'caller''s standing, never of the actor''s identity, and they apply to EVERY '
  'caller. WHAT THAT CLOSES, each measured 1/1 through RLS before it: W2-R11-01 '
  'form A (she owns a workspace, holds no employer seat, and named it on a legacy '
  'project her assistant opened — ONE statement, no seat change of any kind, after '
  'which bound (b) made the column final and her hours priced at her own 99900 for '
  'ever against a control twin an honest later employer priced 26000 / 52000); form '
  'G (the same, on her FORMER employer''s own legacy project, in two statements, '
  'after the shipped `Members can leave` DELETE); W2-R4-01''s confederate seated '
  '`admin` in the workspace 00295 provisions for her; W2-R5-01''s '
  'demotion-then-stamp; case (q)''s ownership transfer; and HT-3-f(1)''s pin in her '
  'own hand (W2-R10-01). WHAT IT COSTS, stated not discovered: a sole proprietor or '
  'a principal cannot name her own studio on a legacy project of her own — that '
  'project prices ''none'' (HT-26''s "rate pending") until she has an employer. '
  'Migration 00620 stamps the legacy population ONCE at ship under HT-3-b''s tier '
  'rule, which hands her own studio to exactly that project; what she may not do is '
  're-point it afterwards. THE SECOND HALF OF STANDING is HT-3-e(1)''s ARM''S-LENGTH '
  'RATE, now unconditional: the studio named must already hold a studio_member_rates '
  'row for this designer written by somebody OTHER than her. Round 3''s "a project '
  'she leads and created" sibling leg refused the entire legacy population instead, '
  'measured 24 calls of 24 with every column left NULL (W2-R7-01), and it is deleted '
  'with the owned tier it belonged to. The leg asks the row''s AUTHORSHIP HISTORY, '
  'not its current author (W2-R9-02): created_by OR the author HT-3-e(4) displaced '
  'into original_created_by, over open and closed rows alike — keyed on the current '
  'author alone, the rate''s own SUBJECT destroyed her employer''s standing with one '
  'in-place rewrite and the stamp was then refused to the studio''s OWNER too '
  '(probe A, A4/A5). Refuses a stamped project outright (bound (b); HT-3-c''s "a '
  'stamp is final"), which under HT-3-g is also the whole of what round 9''s bound '
  '(c) did: project_pricing_studio_id IS projects.studio_id now, so there is no '
  'derivation left to CONFIRM and no second studio to refuse. RECORDED RESIDUAL '
  'HT-3-f(4) (W2-R10-02), NOT CLOSED AND NOT CLAIMED TO BE: the consent-free '
  'outsider''s seat in HIS OWN org IS an employer-tier seat, so he seats the victim '
  'designer (`Org owners can insert members`, no consent gate), authors her rate '
  'there under his own id — arm''s-length BY THIS TEST, which asks about the '
  'SUBJECT''s authorship — names his org, and her later removal of the bogus seat '
  'undoes nothing. Its closure is HT-3-b arm (c)''s consent door, and an '
  'owner-initiated UNPIN / re-derivation act is owed WITH it (a ruling owed, not '
  'built here). Case (z) of time_entry_studio_stamp_test.sql measures it as a '
  'PASSING, loudly-labelled assertion; HT-3-e(3)''s second-account residual is the '
  'other one, and transfer_studio_ownership''s demotion is what puts that workspace '
  'inside her own employer tier. Writes one audit_logs row '
  '(project.pricing_studio_stamped, W2-R4-05) and returns the studio the UPDATE '
  'actually wrote (W2-R4-06). SECURITY DEFINER so the write does not meet '
  'set_project_studio_id''s authenticated arm; that trigger''s owner-executed arm '
  'still re-validates the bound.';

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_qual text;
BEGIN
  -- (a) both narrowed reads carry the own-row leg.
  FOR v_qual IN
    SELECT replace(regexp_replace(lower(pg_get_expr(polqual, polrelid, false)), '\s+', '', 'g'), 'public.', '')
    FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('Team can view their project time entries', 'time_entries_studio_read')
  LOOP
    ASSERT v_qual LIKE '%user_id=auth.uid()%',
      '00606: HT-10-a narrows BOTH reads to own rows — a policy without the '
      'user_id leg leaves the per-person studio rate readable studio-wide '
      '(W1-R10-03); qual = ' || v_qual;
  END LOOP;

  ASSERT 2 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('Team can view their project time entries', 'time_entries_studio_read')
  ), '00606: both narrowed read policies must exist';

  -- (b) the 00484 contract's other properties survive on all four names.
  ASSERT 4 = (
    SELECT count(*) FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_roles AS owner ON owner.oid = relation.relowner
    WHERE policy.polrelid = 'public.project_time_entries'::regclass
      AND policy.polname IN (
        'Team can delete their own time entries',
        'Team can log their own time entries',
        'Team can update their own time entries',
        'Team can view their project time entries'
      )
      AND policy.polpermissive
      AND policy.polroles = ARRAY[to_regrole('authenticated')::oid]
      AND owner.rolname = 'postgres'
  ), '00606: the 00484-registered quartet must keep all four names, permissive, '
     'TO authenticated, on a postgres-owned table (§0.17) — only the SELECT '
     'policy''s qual moves, and only because HT-10-a rules it';

  ASSERT 'r' = (
    SELECT polcmd::text FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname = 'Team can view their project time entries'
  ), '00606: the rostered read must stay a SELECT policy';

  -- (c) the three write policies of the quartet are byte-identical to 00484's
  --     registered expectation — this file touches no write.
  ASSERT 3 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND (
        (polname = 'Team can delete their own time entries'
          AND replace(regexp_replace(lower(pg_get_expr(polqual, polrelid, false)), '\s+', '', 'g'), 'public.', '')
              = '((user_id=auth.uid())andis_project_team_member(project_id))')
        OR (polname = 'Team can update their own time entries'
          AND replace(regexp_replace(lower(pg_get_expr(polqual, polrelid, false)), '\s+', '', 'g'), 'public.', '')
              = '((user_id=auth.uid())andis_project_team_member(project_id))')
        OR (polname = 'Team can log their own time entries'
          AND replace(regexp_replace(lower(pg_get_expr(polwithcheck, polrelid, false)), '\s+', '', 'g'), 'public.', '')
              = '((user_id=auth.uid())andis_project_team_member(project_id))')
      )
  ), '00606: the quartet''s three write policies must be unchanged (§0.17)';

  -- (d) the replacement studio read exists, goes through is_org_admin_or_owner,
  --     and keys on no studio_id column (§0.13).
  SELECT pg_get_expr(polqual, polrelid, false) INTO v_qual
  FROM pg_policy
  WHERE polrelid = 'public.project_time_entries'::regclass
    AND polname = 'time_entries_owner_admin_read';
  ASSERT v_qual IS NOT NULL,
    '00606: time_entries_owner_admin_read is missing — narrowing both reads '
    'without it leaves an owner unable to see her own studio''s hours';
  ASSERT v_qual LIKE '%is_org_admin_or_owner%',
    '00606: the replacement read must go through is_org_admin_or_owner (§0.14)';
  ASSERT v_qual LIKE '%project_pricing_studio_id%',
    '00606: the replacement read keys on the studio that PRICES the work '
    '(HT-3-a, through 00604''s callable form), never on the designer''s '
    'membership set — keyed the other way one organization_members INSERT undoes '
    'this whole file (review round 1, finding B1); qual = ' || v_qual;
  ASSERT regexp_replace(v_qual, 'project_pricing_studio_id', '', 'g')
           NOT LIKE '%studio_id%',
    '00606: never key an RLS policy on the projects.studio_id COLUMN (§0.13, '
    '00317:15-18) — a legacy NULL there WIDENS visibility, whereas '
    'is_org_admin_or_owner(project_pricing_studio_id(...)) = false on NULL and so '
    'fails closed; qual = ' || v_qual;

  -- (e) the own-row studio write policies and the designer policy are untouched.
  ASSERT 4 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN (
        'time_entries_studio_insert_own',
        'time_entries_studio_update_own',
        'time_entries_studio_delete_own',
        'Designers manage their project time entries'
      )
  ), '00606: 00316''s own-row write policies and 00177''s designer policy must '
     'all still exist — this file narrows reads only';

  -- (f) the repair path exists, is a DEFINER, pins search_path, and is granted
  --     in both directions (§0.16). Without it (ii) above is a promise the
  --     product cannot keep (W2-R2-02).
  ASSERT to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)') IS NOT NULL,
    '00606: stamp_project_pricing_studio is missing — the studio read narrowed '
    'here is then permanently absent on every unstamped project, because '
    'set_project_studio_id''s authenticated arm refuses to write the column '
    'after INSERT (W2-R2-02)';
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')),
    '00606: stamp_project_pricing_studio must be SECURITY DEFINER — as INVOKER '
    'it meets set_project_studio_id''s authenticated arm and always raises';
  ASSERT (SELECT proconfig::text LIKE '%search_path%' FROM pg_proc
           WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')),
    '00606: stamp_project_pricing_studio must pin search_path (§0.16)';
  ASSERT NOT has_function_privilege('anon',
    'public.stamp_project_pricing_studio(uuid,uuid)', 'EXECUTE'),
    '00606: anon must not execute stamp_project_pricing_studio';
  ASSERT has_function_privilege('authenticated',
    'public.stamp_project_pricing_studio(uuid,uuid)', 'EXECUTE'),
    '00606: authenticated must execute stamp_project_pricing_studio';

  -- ── HT-3-g(3), pinned by source. Three rounds measured a money shape through
  --    the OWNED tier of this act; the ruling removes the tier, the confirm arm, the
  --    sibling leg and the designer arm, and these asserts are what keeps a later
  --    hand from "restoring" any of the four as a widening.
  ASSERT (
    SELECT prosrc LIKE '%is_org_admin_or_owner(p_studio_id)%'
       AND prosrc LIKE '%IF NOT v_named_is_employer_seat THEN%'
       AND prosrc LIKE '%named_seat.role <> ''owner''%'
       AND prosrc LIKE '%other_author.created_by <> v_designer_id%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: HT-3-g(3) — the stamp''s standing is an OWNER or ADMIN of the studio '
     'being named AND that studio EMPLOYING this project''s designer (an active, '
     'non-guest seat with role <> ''owner''), plus HT-3-e(1)''s arm''s-length rate '
     '(created_by <> user_id, or the author HT-3-e(4) displaced). Both conditions '
     'are properties of (the designer, p_studio_id), not of the actor';
  ASSERT (
    SELECT prosrc NOT LIKE '%designer_seat.role = ''owner''%'
       AND prosrc NOT LIKE '%v_designer_has_employer_seat%'
       AND prosrc NOT LIKE '%sibling%'
       AND prosrc NOT LIKE '%project_pricing_studio_id%'
       AND prosrc NOT LIKE '%v_derived%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: HT-3-g(3)''s four removals, each measured reachable before it. (1) NO '
     'OWNED-TIER ARM — `designer_seat.role = ''owner''` was bound (e)''s ELSE branch, '
     'and it is the door W2-R4-01''s confederate, W2-R5-01''s demotion, case (q)''s '
     'transfer, W2-R10-01''s pin and W2-R11-01''s forms A and G all walked through. '
     '(2) NO TIER BRANCH — v_designer_has_employer_seat decided WHICH tier applied; '
     'there is one tier now. (3) NO SIBLING LEG — round 3''s `created_by` sibling was '
     'the owned tier''s half of standing and went with it (it also refused the whole '
     'legacy population it was meant to serve, 24 of 24, W2-R7-01). (4) NO CONFIRM '
     'ARM and no derivation read — project_pricing_studio_id IS projects.studio_id '
     'under HT-3-g(1), so bound (b) is the whole of it';
  ASSERT (
    SELECT position('this project already names a studio' in prosrc)
             < position('IF NOT v_named_is_employer_seat THEN' in prosrc)
       AND position('IF NOT v_named_is_employer_seat THEN' in prosrc)
             < position('RETURNING studio_id INTO v_written' in prosrc)
       AND position('IF NOT v_named_is_employer_seat THEN' in prosrc)
             < position('other_author.created_by <> v_designer_id' in prosrc)
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: and the employer-tier gate''s POSITION, so it cannot be satisfied '
     'vacuously or reached after the fact: AFTER bound (b) (an already-stamped '
     'project answers 22023 "this project already names a studio" whatever the tier '
     'says), BEFORE the arm''s-length-rate leg (a caller naming a studio that does '
     'not employ the designer must read the TIER refusal, not a refusal about a rate '
     'card that was never relevant), and BEFORE the write';
  ASSERT (
    SELECT prosrc NOT LIKE '%v_actor = v_designer_id%'
       AND prosrc NOT LIKE '%v_designer_id = v_actor%'
       AND prosrc NOT LIKE '%v_actor <> v_designer_id%'
       AND prosrc NOT LIKE '%v_designer_id <> v_actor%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: NO DESIGNER ARM (HT-3-g(3)). No bound here may compare the actor with '
     'the project''s designer in EITHER direction. Gated on equality it is round '
     '5''s (e2), which W2-R6-01 measured refusing an admin-designer of an HONEST '
     'employer whom HT-3-g(3) admits expressly, while the employer''s own owner was '
     'refused for want of a sibling — HT-3-a''s remedy reaching nobody. Gated on '
     'INEQUALITY it is round 3''s skip, which made bound (a2) silent in the '
     'designer''s own hand and is the gap W2-R11-01 form A walked through in ONE '
     'statement';
  ASSERT (
    SELECT prosrc LIKE '%RETURNING studio_id INTO v_written%'
       AND prosrc LIKE '%RETURN v_written;%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: the stamp must return the studio the UPDATE actually wrote '
     '(W2-R4-06) — reporting p_studio_id without reading the row count tells a '
     'caller the repair succeeded when a concurrent stamp wrote another studio';
  ASSERT (
    SELECT prosrc LIKE '%project.pricing_studio_stamped%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: the stamp must write its own audit_logs row (W2-R4-05) — it is the '
     'one irreversible, money-moving act in a wave that audits every time-entry '
     'UPDATE and DELETE, and after it the ledger, the composer and every future '
     'audit row''s organization_id follow the studio it wrote';
  ASSERT (
    SELECT prosrc LIKE '%other_author.original_created_by <> v_designer_id%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: W2-R9-02 — the employer arm asks the rate row''s AUTHORSHIP HISTORY '
     '(created_by OR the author HT-3-e(4) displaced into original_created_by), over '
     'open and closed rows alike. Keyed on the current author alone, the rate''s own '
     'SUBJECT destroys her employer''s standing with one in-place rewrite and the '
     'stamp is then refused to the studio''s OWNER too (probe A, A4/A5)';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studio_member_rates'
      AND column_name = 'original_created_by'
  ), '00606: studio_member_rates.original_created_by must exist — it is declared in '
     'this file because this file''s body reads it, and 00615''s guard is what '
     'writes it';
  ASSERT (
    SELECT count(*) FROM regexp_matches(
      (SELECT prosrc FROM pg_proc
        WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')),
      'public\.organization_members', 'g')
  ) = 1,
    '00606: the stamp reads public.organization_members EXACTLY ONCE — HT-3-g(3)''s '
    'single employer-seat question about the project''s designer. A second read is '
    'either the tier branch this ruling deleted or a membership question nobody '
    'ruled';

  -- set_project_studio_id is NOT redefined by this file (§0.4 / 00603's own rule).
  ASSERT (
    SELECT prosrc LIKE '%studio_id_not_designer_studio%'
    FROM pg_proc WHERE oid = to_regprocedure('public.set_project_studio_id()')
  ), '00606: set_project_studio_id must still be the 00563 body — this file adds '
     'a DEFINER act beside it and redefines nothing';

  RAISE NOTICE '00606 postconditions passed.';
END
$postcondition$;

COMMIT;
