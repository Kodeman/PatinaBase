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
-- THIS IS THE ONLY CHANGE IN THIS MIGRATION (risk 5 of plan-v2 §12): it reverts
-- without touching the ledger view, the rollup or the lens.
--
-- Lineage: policies, plus ONE new function (section 4 — NEW name, nothing
-- redefined; `set_project_studio_id` is NOT touched). No column.
-- P-4: no row is touched by this migration. The new function writes
-- `projects.studio_id` only when a caller asks it to, one project at a time, and
-- only where that column is still NULL — it is a repair act, not a backfill.
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
-- WHO MAY CALL IT, and why it is not simply "an owner/admin of the named studio"
-- (the narrower shape is deliberate, and the wider one was MEASURED before it was
-- rejected): "an owner/admin of p_studio_id, where the project's designer holds a
-- seat in p_studio_id" is the SAME self-grantable predicate round 1's B1 fix
-- deleted from the three policies. `Org owners can insert members` lets anyone who
-- owns any organization seat a victim project's designer in it with one
-- consent-free INSERT (WITH CHECK is_org_admin_or_owner(organization_id) AND
-- role <> 'owner'; status DEFAULT 'active'). With that shape an attacker seats the
-- designer of a project priced by her real employer, which makes the employer tier
-- AMBIGUOUS and the pricing studio NULL, and then stamps the project with her own
-- org — permanently taking the hours, the money and the audit trail from the
-- studio that did the work. Measured on this program's stack; asserted closed as
-- case (f) of supabase/tests/rls/time_entry_studio_stamp_test.sql. So the two arms
-- are both NON-manufacturable — and ROUND 3 MEASURED that the first draft of both
-- was (W2-R3-01 BLOCKER, W2-R3-02 MAJOR; each reproduced end to end through RLS on
-- this program's stack before the fix and refused after it, pinned as cases (k) and
-- (l) of supabase/tests/rls/time_entry_studio_stamp_test.sql):
--   · ARM 1 — the project's own DESIGNER names a studio whose rate card she does
--     NOT write, in the same tier HT-3-b itself would have considered for her.
--     The first draft read "a studio she actively, non-guestly belongs to", and
--     that let the member being priced move her own resolved rate to a number she
--     set (W2-R3-02, measured: 'none' → 99900 / studio_member on the next hour).
--     A designer seated a plain `member` in TWO employer studios has an ambiguous
--     employer tier, so her legacy project prices 'none'; she wrote herself 99900
--     in the one-person workspace 00295 provisions at every designer grant — she
--     is its OWNER, so studio_member_rates_admin_insert permits it — stamped THAT
--     workspace, and neither employer could see the project, the hour or the rate
--     afterwards (so HT-3-c arm (a)'s stated mitigation, "the composer and the
--     studio settings page are where a suspicious studio_member_rates row is
--     seen", does not reach it). The bound is therefore HT-3-b's own tier
--     structure, read against the studio she names:
--       — while she holds ANY employer seat (active, non-guest, role <> 'owner'),
--         the studio she names must be one where her seat is NEITHER `owner` NOR
--         `admin` — a studio whose studio_member_rates she cannot write
--         (studio_member_rates_admin_insert asks only is_org_admin_or_owner);
--       — only where she holds NO employer seat anywhere may she name a studio she
--         OWNS. That is HT-3-c arm (a)'s ruled sole proprietor, and the principal
--         with two owned candidates and no employer whom HT-3-b records as priced
--         by neither (cases (n)/(w) of time_rate_resolution_test.sql) — for whom
--         this is the only repair that exists. W2-R3-02's literal narrowing
--         (`role NOT IN ('owner','admin')` alone) would have taken that shape with
--         it, which is why the TIER is read and not the role alone.
--     What both halves serve is HT-3-b's operative sentence: a member can only
--     push the outcome toward 'none', never toward a number she set.
--   · ARM 2 — an owner/admin of p_studio_id, WHERE p_studio_id already holds
--     another project led by this project's designer AND CREATED BY HER. The first
--     draft omitted the second half, on the justification that "nobody can create
--     a project led by somebody else" — FALSE, and with it round 1's B1 came back
--     in its worst form, permanent (W2-R3-01, measured). Nobody has to CREATE such
--     a project: `reassign_project_lead` (00399:301) is SECURITY DEFINER, GRANTed
--     to `authenticated` (00399:510), and admits the current lead of her OWN
--     project with any `is_designer` target who holds an active, non-guest seat in
--     that project's studio — a seat the attacker writes herself, consent-free,
--     through `Org owners can insert members`. Three authenticated statements
--     therefore moved an unstamped project's pricing studio into an outsider's org
--     for ever: seat the victim project's designer (which also makes her employer
--     tier ambiguous, so bound (c) passes), reassign her own project's lead to
--     that designer (her org now holds "another project led by her"), stamp. After
--     it the attacker read the row, the notes and the 25000, got the project total
--     and could UPDATE and DELETE the hour, while the studio that did the work
--     read 0 rows, was refused 42501 on the total, and could not re-stamp.
--     `projects.created_by` is the one column in that shape she cannot author:
--     00563 RAISES on any UPDATE that changes it, its authenticated-INSERT arm
--     admits only `NEW.created_by = auth.uid()` on a project the actor leads
--     herself, `reassign_project_lead` never touches it, and every real creation
--     path writes the DESIGNER's own id into it (`_activate_proposal_as_project_impl`
--     and `activate_project_v2`/`create_project_v2` — verified, not assumed). So a
--     sibling created by the designer is both the realistic shape of the repair —
--     a studio whose designer's later projects 00563 has been stamping all along,
--     holding one legacy project from before it — and exactly what a manufactured
--     sibling is not.
-- Either way the project must still be unstamped AND unpriced: where
-- project_pricing_studio_id already answers, the owner HAS her read and this
-- function would only be a way to move the money. A stamped project stays final
-- (HT-3-c, and 00603's case (z)).
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
  v_designer_has_employer_seat boolean := false;
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

  -- (a) standing: the project's designer, or an owner/admin of a studio that
  --     already holds a project she LEADS AND CREATED. Nothing an attacker can
  --     author: `created_by` is what `reassign_project_lead` cannot move
  --     (W2-R3-01).
  IF NOT (
    v_designer_id = v_actor
    OR (
      public.is_org_admin_or_owner(p_studio_id)
      AND EXISTS (
        SELECT 1
        FROM public.projects AS sibling
        WHERE sibling.studio_id = p_studio_id
          AND sibling.designer_id = v_designer_id
          AND sibling.created_by = v_designer_id
          AND sibling.id <> p_project_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: only this project''s designer, '
                    'or an owner/admin of a studio that already holds a project '
                    'she leads and created, may name its studio'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (b) a stamped project is final (HT-3-c arm (a); 00603 case (z)). Naming the
  --     studio it already names is a no-op rather than an error, so a retry is
  --     safe.
  IF v_existing IS NOT NULL THEN
    IF v_existing = p_studio_id THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'stamp_project_pricing_studio: this project already names a studio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (c) only where the derivation is silent. Where HT-3-b answers, the owner
  --     already reads these hours and this function must not re-price them.
  IF public.project_pricing_studio_id(p_project_id) IS NOT NULL THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: a studio already prices this '
                    'project''s hours — there is nothing to repair'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (d) 00563's own bound on this column, replicated rather than trusted: the
  --     project's DESIGNER holds an active, non-guest seat in an active design
  --     studio. The trigger checks it again as the write goes through.
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS designer_seat
    JOIN public.organizations AS studio
      ON studio.id = designer_seat.organization_id
    WHERE designer_seat.organization_id = p_studio_id
      AND designer_seat.user_id = v_designer_id
      AND designer_seat.status = 'active'
      AND designer_seat.role <> 'guest'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
  ) THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: this project''s designer holds '
                    'no active, non-guest seat in that studio'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (e) W2-R3-02: where the caller IS the member being priced, the studio she
  --     names must be one HT-3-b's own tiers would have considered for her — an
  --     EMPLOYER seat while she holds any (and not one where that seat is `owner`
  --     or `admin`, because studio_member_rates_admin_insert would let her write
  --     her own rate there), and a studio she OWNS only where she holds no
  --     employer seat at all (HT-3-c arm (a)'s sole proprietor). The tiers are
  --     00604's, verbatim: employer = active, non-guest, role <> 'owner'.
  IF v_designer_id = v_actor THEN
    v_designer_has_employer_seat := EXISTS (
      SELECT 1
      FROM public.organization_members AS employer_seat
      JOIN public.organizations AS studio
        ON studio.id = employer_seat.organization_id
      WHERE employer_seat.user_id = v_designer_id
        AND employer_seat.status = 'active'
        AND employer_seat.role <> 'guest'
        AND employer_seat.role <> 'owner'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS designer_seat
      JOIN public.organizations AS studio
        ON studio.id = designer_seat.organization_id
      WHERE designer_seat.organization_id = p_studio_id
        AND designer_seat.user_id = v_designer_id
        AND designer_seat.status = 'active'
        AND designer_seat.role <> 'guest'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND CASE
              WHEN v_designer_has_employer_seat
                THEN designer_seat.role NOT IN ('owner', 'admin')
              ELSE designer_seat.role = 'owner'
            END
    ) THEN
      RAISE EXCEPTION 'stamp_project_pricing_studio: a designer may name one of '
                      'the studios that EMPLOY her, not one whose rate card she '
                      'writes — a studio she owns or administers only where she '
                      'holds no employer seat at all'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.projects
     SET studio_id = p_studio_id
   WHERE id = p_project_id
     AND studio_id IS NULL;

  RETURN p_studio_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_project_pricing_studio(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.stamp_project_pricing_studio(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.stamp_project_pricing_studio(uuid, uuid) IS
  'HT-3-a''s ruled remedy, as an act: name the studio that prices an unstamped, '
  'unpriced project, so the owner/admin read 00606 grants becomes reachable on a '
  'legacy NULL-studio or ambiguous-tier project (W2 review round 2, finding '
  'W2-R2-02 — before this function no authenticated caller could write '
  'projects.studio_id at all, because set_project_studio_id''s authenticated arm '
  'raises unless TG_OP = ''INSERT''). Callable by the project''s DESIGNER, for a '
  'studio that EMPLOYS her (an active non-guest seat that is neither owner nor '
  'admin) while she holds any employer seat, and for a studio she owns only where '
  'she holds none — HT-3-b''s own tiers, so that the member being priced cannot '
  'move her rate to a number she set (W2-R3-02). Also callable by an owner/admin '
  'of a studio that ALREADY holds another project that designer both LEADS and '
  'CREATED — created_by, because reassign_project_lead (SECURITY DEFINER, GRANTed '
  'to authenticated) otherwise lets an outsider put a victim designer in the lead '
  'of her own project and manufacture that standing (W2-R3-01). Deliberately NOT '
  'callable by an owner/admin on the strength of the designer''s seat alone: that '
  'set is self-grantable with one consent-free organization_members INSERT, and '
  'with it an attacker takes a studio''s hours permanently. Refuses a stamped '
  'project, and refuses one whose '
  'hours a studio already prices. SECURITY DEFINER so the write does not meet '
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

  -- The standing test is the one an attacker cannot author. A body that admits
  -- an owner/admin on the strength of the designer's seat alone re-opens B1 in
  -- its worst form (the pricing studio moves permanently), so the two legs are
  -- pinned by source.
  ASSERT (
    SELECT prosrc LIKE '%v_designer_id = v_actor%'
       AND prosrc LIKE '%sibling.designer_id = v_designer_id%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: the stamp''s standing must be the project''s DESIGNER, or an '
     'owner/admin of a studio that already holds one of her projects — never an '
     'owner/admin on the strength of a seat anyone can write (W2-R2-02''s fix, '
     'and round 1''s B1)';
  ASSERT (
    SELECT prosrc LIKE '%sibling.created_by = v_designer_id%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: ARM 2''s sibling must have been CREATED BY the designer (W2-R3-01, '
     'measured): reassign_project_lead is SECURITY DEFINER and GRANTed to '
     'authenticated, so an outsider who seats a victim project''s designer in her '
     'own org can put that designer in the lead of her OWN project and manufacture '
     '"a project led by that designer" in three authenticated statements. '
     'created_by is the half she cannot forge — 00563 raises on any UPDATE that '
     'moves it and reassign_project_lead never touches it';
  ASSERT (
    SELECT prosrc LIKE '%v_designer_has_employer_seat%'
       AND prosrc LIKE '%designer_seat.role NOT IN (''owner'', ''admin'')%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: where the caller IS the member being priced, the studio she names '
     'must sit in the tier HT-3-b would have considered for her — an employer seat '
     'that is neither owner nor admin while she holds any employer seat, a studio '
     'she owns only where she holds none (W2-R3-02, measured: without it she wrote '
     'herself 99900 in the workspace 00295 provisions, stamped it, and her next '
     'hour came back 99900 / studio_member with no employer able to see the '
     'project at all)';
  ASSERT (
    SELECT prosrc LIKE '%project_pricing_studio_id(p_project_id) IS NOT NULL%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')
  ), '00606: the stamp must refuse a project a studio already prices — it '
     'repairs ''none'', it does not move money';

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
