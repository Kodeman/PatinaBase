-- ═══════════════════════════════════════════════════════════════════════════
-- 00612 — the seven policies a project-less hour is reachable through
--         (HT-15, plan-v2 §5; risk 2 of plan-v2 §12)
--
-- WHY THIS FILE EXISTS AT ALL. Every policy on public.project_time_entries
-- resolves through project_id, so with a NULL there EVERY ONE of them is false
-- and internal time would be written and then invisible — the highest-likelihood
-- failure of this wave (plan-v2 §12, risk 2). Measured shapes, all nine:
--   · five through `projects p WHERE p.id = project_time_entries.project_id`
--     — `Designers manage their project time entries` (00177:136-137, FOR ALL)
--       and 00316's four studio policies (00316:237, :242, :248, :257), the
--       read arm of which 00606 re-created narrowed to own rows;
--   · four through `is_project_team_member(project_id)` — the 00484-registered
--     "Team can …" quartet (00177:140, :144, :148, :152, re-created at
--     00484:786, :795, :804, :813; the SELECT arm re-created by 00606);
--   · and 00605's two owner/admin write policies plus 00606's owner/admin read
--     go through `project_pricing_studio_id(project_id)`, which returns NULL for
--     a NULL project (00604:100-102) and so is false as well.
-- The ninth shape — 00177:136's FOR ALL for the project's own designer_id — has
-- NO project-less counterpart, and deliberately so: an internal hour has no
-- project designer. Owner/admin reach over internal time is carried by the
-- is_org_admin_or_owner pair below instead.
--
-- FOUR OWN-ROW POLICIES + THREE OWNER/ADMIN STANDS (plan-v2 §5's table counts
-- the last two as one row, `internal_time_owner_admin_write`; see NAMING below).
-- The own-row four share ONE predicate, written identically on every USING and
-- every WITH CHECK:
--     project_id IS NULL AND user_id = auth.uid()
--     AND billable = false AND is_active_studio_member(studio_id)
-- `billable = false` appears on the read and delete arms too rather than only on
-- the write arms: 00610's CHECK makes a billable project-less row impossible, so
-- the leg can never hide a row from its author, and one predicate that reads the
-- same in all five of their expressions is worth more than four subtly different
-- ones.
--
-- §0.13, READ RATHER THAN RECITED. §0.13 forbids keying a policy on
-- projects.studio_id because a legacy NULL there WIDENS visibility
-- (00317:15-18). These seven key on project_time_entries.studio_id — a different
-- column, on the row itself, whose anti-aiming guard 00611 replicates
-- 00317:31-47 for, which is the exact condition §0.13 names. And the failure
-- direction is CLOSED, not open: is_active_studio_member(NULL) is FALSE by its
-- own first conjunct (00417:47) and is_org_admin_or_owner(NULL) is FALSE
-- (00484:604-623, measured in 00605's own postcondition), so a project-less row
-- with a NULL studio_id — which 00610's CHECK forbids anyway — would be readable
-- by nobody rather than by everybody.
--
-- WHAT IS NOT HERE:
--   · No INSERT policy for owner/admin. The same reason 00605 gives for the
--     project case (plan-v2 §3's closing note): a row an admin inserts FOR a
--     member is a row the member did not log. An internal hour is by definition
--     the author's own admin time, and `internal_time_own_insert` is how it is
--     written. The owner/admin pair below is UPDATE + DELETE, exactly as
--     plan-v2 §5's table has it.
--   · Nothing is dropped, renamed or re-qualified. The 00484-registered quartet
--     is immutable (§0.17); these are seven NEW names. Every policy is permissive,
--     so the table's existing reach is unchanged for every project-bearing row.
--   · No `guest` arm: is_active_studio_member requires role <> 'guest'
--     (00417:48), and is_org_admin_or_owner admits only owner/admin.
--
-- NAMING. plan-v2 §5's RLS table calls the owner/admin pair one row,
-- `internal_time_owner_admin_write` — "FOR UPDATE + a sibling FOR DELETE". A
-- single Postgres policy cannot cover both commands, so the pair ships as
-- internal_time_owner_admin_update and internal_time_owner_admin_delete, named
-- to parallel 00605's time_entries_owner_admin_update / _delete.
--
-- Lineage: NEW policies. No function, view or policy is redefined.
-- P-4: no row is touched.
-- Adds no GRANT/REVOKE (policies are not grants; the table ACL is unchanged).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── the author's own internal hours ────────────────────────────────────────
DROP POLICY IF EXISTS internal_time_own_read ON public.project_time_entries;
CREATE POLICY internal_time_own_read ON public.project_time_entries
  FOR SELECT TO authenticated
  USING (
    project_id IS NULL
    AND user_id = auth.uid()
    AND billable = false
    AND public.is_active_studio_member(studio_id)
  );

DROP POLICY IF EXISTS internal_time_own_insert ON public.project_time_entries;
CREATE POLICY internal_time_own_insert ON public.project_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    project_id IS NULL
    AND user_id = auth.uid()
    AND billable = false
    AND public.is_active_studio_member(studio_id)
  );

DROP POLICY IF EXISTS internal_time_own_update ON public.project_time_entries;
CREATE POLICY internal_time_own_update ON public.project_time_entries
  FOR UPDATE TO authenticated
  USING (
    project_id IS NULL
    AND user_id = auth.uid()
    AND billable = false
    AND public.is_active_studio_member(studio_id)
  )
  WITH CHECK (
    project_id IS NULL
    AND user_id = auth.uid()
    AND billable = false
    AND public.is_active_studio_member(studio_id)
  );

DROP POLICY IF EXISTS internal_time_own_delete ON public.project_time_entries;
CREATE POLICY internal_time_own_delete ON public.project_time_entries
  FOR DELETE TO authenticated
  USING (
    project_id IS NULL
    AND user_id = auth.uid()
    AND billable = false
    AND public.is_active_studio_member(studio_id)
  );

-- ── the studio's owner/admin over its internal hours ──────────────────────
DROP POLICY IF EXISTS internal_time_owner_admin_read ON public.project_time_entries;
CREATE POLICY internal_time_owner_admin_read ON public.project_time_entries
  FOR SELECT TO authenticated
  USING (
    project_id IS NULL
    AND public.is_org_admin_or_owner(studio_id)
  );

DROP POLICY IF EXISTS internal_time_owner_admin_update ON public.project_time_entries;
CREATE POLICY internal_time_owner_admin_update ON public.project_time_entries
  FOR UPDATE TO authenticated
  USING (
    project_id IS NULL
    AND public.is_org_admin_or_owner(studio_id)
  )
  WITH CHECK (
    project_id IS NULL
    AND public.is_org_admin_or_owner(studio_id)
  );

DROP POLICY IF EXISTS internal_time_owner_admin_delete ON public.project_time_entries;
CREATE POLICY internal_time_owner_admin_delete ON public.project_time_entries
  FOR DELETE TO authenticated
  USING (
    project_id IS NULL
    AND public.is_org_admin_or_owner(studio_id)
  );

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_name text;
  v_expr text;
BEGIN
  ASSERT 7 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname LIKE 'internal_time_%'
      AND polpermissive
      AND polroles = ARRAY[to_regrole('authenticated')::oid]
  ), '00612: all seven project-less policies must exist, permissive, TO '
     'authenticated (four own-row, plus the owner/admin read and the '
     'update/delete pair plan-v2 calls internal_time_owner_admin_write)';

  -- Every one of them is gated on project_id IS NULL, on BOTH expressions. A
  -- missing leg would widen an existing project-bearing read or write.
  FOR v_name, v_expr IN
    SELECT polname, pg_get_expr(polqual, polrelid, false)
    FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname LIKE 'internal_time_%' AND polqual IS NOT NULL
    UNION ALL
    SELECT polname, pg_get_expr(polwithcheck, polrelid, false)
    FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname LIKE 'internal_time_%' AND polwithcheck IS NOT NULL
  LOOP
    ASSERT v_expr LIKE '%project_id IS NULL%',
      '00612: ' || v_name || ' must be gated on project_id IS NULL, or it '
      'widens the reach of a project-bearing row; expr = ' || v_expr;
    ASSERT v_expr NOT LIKE '%projects%',
      '00612: ' || v_name || ' must never resolve through the projects table — '
      'an internal hour has no project, and §0.13 forbids projects.studio_id as '
      'a key; expr = ' || v_expr;
  END LOOP;

  -- The own-row four carry the author leg and the non-billable leg; the
  -- owner/admin three carry is_org_admin_or_owner (§0.14's only helper).
  ASSERT 4 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('internal_time_own_read', 'internal_time_own_insert',
                      'internal_time_own_update', 'internal_time_own_delete')
      AND COALESCE(pg_get_expr(polqual, polrelid, false), '')
          || COALESCE(pg_get_expr(polwithcheck, polrelid, false), '')
          LIKE '%auth.uid()%'
  ), '00612: the four own-row policies must key on user_id = auth.uid()';
  ASSERT 4 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname LIKE 'internal_time_own_%'
      AND COALESCE(pg_get_expr(polqual, polrelid, false), '')
          || COALESCE(pg_get_expr(polwithcheck, polrelid, false), '')
          LIKE '%billable = false%'
  ), '00612: the four own-row policies must carry the non-billable leg — HT-15''s '
     'internal time is never billed, and the same predicate is written on all '
     'four';
  ASSERT 3 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('internal_time_owner_admin_read',
                      'internal_time_owner_admin_update',
                      'internal_time_owner_admin_delete')
      AND COALESCE(pg_get_expr(polqual, polrelid, false), '')
          LIKE '%is_org_admin_or_owner%'
  ), '00612: the owner/admin stands must go through is_org_admin_or_owner '
     '(§0.14) — user_is_org_member gets no new call sites';

  -- §0.17: the 00484-registered quartet is untouched by this file.
  ASSERT 4 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('Team can delete their own time entries',
                      'Team can log their own time entries',
                      'Team can update their own time entries',
                      'Team can view their project time entries')
  ), '00612: the four 00484-registered "Team can …" policies must still exist, '
     'unreshaped (§0.17)';

  -- The fail-closed direction, measured rather than asserted-about: a real actor
  -- reaches neither helper with a NULL studio. set_config is LOCAL and reverts at
  -- this migration's COMMIT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', pg_catalog.gen_random_uuid()::text,
                      'role', 'authenticated')::text, true);
  ASSERT auth.uid() IS NOT NULL, '00612: the impersonation above did not take';
  ASSERT NOT COALESCE(public.is_active_studio_member(NULL), false),
    '00612: is_active_studio_member(NULL) must be FALSE — that is what makes a '
    'NULL studio_id fail CLOSED rather than widening the way projects.studio_id '
    'would (§0.13)';
  ASSERT NOT COALESCE(public.is_org_admin_or_owner(NULL), false),
    '00612: is_org_admin_or_owner(NULL) must be FALSE, for the same reason';
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE '00612 postconditions passed.';
END
$postcondition$;

COMMIT;
