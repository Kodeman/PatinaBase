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
--       tier is ambiguous loses her studio read until she stamps the project,
--       which is the repair HT-3-a step 3 already asks of her.
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
-- Lineage: policies only. No function, no column, no grant.
-- P-4: no row is touched.
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

  RAISE NOTICE '00606 postconditions passed.';
END
$postcondition$;

COMMIT;
