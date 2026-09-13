-- ═══════════════════════════════════════════════════════════════════════════
-- 00607 — the studio's own aggregate (SECURITY INVOKER), and the one project
--         total a narrowed member may still have
--
-- HT-37 (RULED 2026-09-11): *"Delete useStudioTimeReport; build a server-side
-- rollup RPC."* FS-5's objection — that the shipped client hook is correct and
-- RLS-clean — is recorded and overruled; the per-member group-by is implemented
-- here instead, and the hook is deleted in the same commit.
--
-- HT-38 (panel default accepted): the rollup is **SECURITY INVOKER**. RLS does
-- the scoping, through 00604's security_invoker view: after 00606 a plain member
-- calling it with a colleague's `p_user_id` gets nothing of his, and an
-- owner/admin gets the studio. No DEFINER rollup is written in this program.
--
-- HT-36 (RULED 2026-09-11): the return shape is frozen at buckets, minutes and
-- money. **`notes` is not a column of the signature** — a type-level guarantee,
-- not a filter, asserted per role in
-- supabase/tests/rls/studio_hours_rollup_test.sql and again by this file's
-- postcondition.
--
-- HT-10-a (RULED 2026-09-11, amended 2026-09-12): 00606 narrows the rostered
-- read to OWN rows, which is a real loss of capability for a plain member — she
-- could read every row of a project she is rostered to, notes included, and now
-- reads her own. `public.project_hours_total(p_project_id)` is what gives her the
-- project's TOTAL back: one small SECURITY DEFINER function, standing asserted
-- first, returning minutes / billable_minutes / amount_cents and nothing else.
-- Lane B's project lens for a plain member reads this function, not the ledger.
--
-- W2 review round 2 (finding W2-R2-01), amended here: the standing assert's third
-- leg now keys on the studio that PRICES the work, not on "any studio the
-- project's designer belongs to". The long note sits on the assert itself; the
-- short form is that the deleted predicate is self-grantable with one
-- consent-free `organization_members` INSERT, so as a DEFINER aggregate it handed
-- a stranger a project's whole minutes and billable money — measured, and closed
-- by the same key round 1's B1 fix gave the three policies.
--
-- HT-30 / §0.23 are a UI contract, not a SQL one, and are satisfied by the
-- caller: a total is permitted as the front matter of the rows that produced it.
-- Both functions here return totals; the rows come from 00604's view in the same
-- sheet.
--
-- Lineage: NEW functions. Nothing is redefined.
-- P-4: no row is touched.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.studio_hours_rollup(
  p_studio_id  uuid,
  p_from       date,
  p_to         date,
  p_group_by   text DEFAULT 'member',   -- 'member' | 'project' | 'day' | 'iso_week' | 'activity'
  p_user_id    uuid DEFAULT NULL,       -- the member scope
  p_project_id uuid DEFAULT NULL        -- the project scope
)
RETURNS TABLE (
  bucket_key       text,
  bucket_label     text,
  member_id        uuid,
  member_name      text,
  entry_count      integer,
  total_minutes    integer,
  billable_minutes integer,
  billable_cents   bigint,
  internal_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER                        -- HT-38. RLS is the scope.
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Validated against the five literals, and raises otherwise. plpgsql rather
  -- than LANGUAGE sql for exactly this reason (plan-v2 §3 asks for both, and a
  -- SQL body cannot raise): there is still NO dynamic SQL below — the bucket is a
  -- CASE over a constant, not an interpolated identifier.
  IF p_group_by IS NULL
     OR p_group_by NOT IN ('member', 'project', 'day', 'iso_week', 'activity') THEN
    RAISE EXCEPTION 'studio_hours_rollup: p_group_by must be one of member, project, day, iso_week, activity (got %)', COALESCE(p_group_by, 'NULL')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    -- A NULL p_studio_id matches nothing (studio_id = NULL is never true), so a
    -- caller who has not chosen a studio gets an empty answer rather than an
    -- error. A NULL date bound is unbounded on that side.
    SELECT ledger.*
    FROM public.time_entry_ledger AS ledger
    WHERE ledger.studio_id = p_studio_id
      AND (p_from IS NULL OR ledger.day >= p_from)
      AND (p_to   IS NULL OR ledger.day <= p_to)
      -- A running timer has no duration yet: a total never counts an hour that
      -- has not finished. The running row is the desk's business (HT-7), and the
      -- sheet shows it as a row, never as money.
      AND NOT ledger.is_running
      AND (p_user_id    IS NULL OR ledger.user_id    = p_user_id)
      AND (p_project_id IS NULL OR ledger.project_id = p_project_id)
  ),
  keyed AS (
    SELECT
      CASE p_group_by
        WHEN 'member'   THEN scoped.user_id::text
        WHEN 'project'  THEN COALESCE(scoped.project_id::text, 'internal')
        WHEN 'day'      THEN to_char(scoped.day, 'YYYY-MM-DD')
        WHEN 'iso_week' THEN scoped.iso_week
        WHEN 'activity' THEN COALESCE(scoped.activity, 'unset')
      END AS bucket_key,
      CASE p_group_by
        WHEN 'member'   THEN COALESCE(scoped.member_name, 'Unnamed member')
        WHEN 'project'  THEN COALESCE(scoped.project_name, 'Internal')
        WHEN 'day'      THEN to_char(scoped.day, 'YYYY-MM-DD')
        WHEN 'iso_week' THEN scoped.iso_week
        -- HT-24: print "activity not set" honestly; never a blank.
        WHEN 'activity' THEN COALESCE(scoped.activity, 'activity not set')
      END AS bucket_label,
      CASE WHEN p_group_by = 'member' THEN scoped.user_id END AS member_id,
      CASE WHEN p_group_by = 'member'
           THEN COALESCE(scoped.member_name, 'Unnamed member') END AS member_name,
      scoped.duration_minutes,
      scoped.billable,
      scoped.amount_cents,
      scoped.source,
      scoped.project_id
    FROM scoped
  )
  SELECT
    keyed.bucket_key,
    keyed.bucket_label,
    keyed.member_id,
    keyed.member_name,
    count(*)::integer,
    COALESCE(sum(keyed.duration_minutes), 0)::integer,
    COALESCE(sum(keyed.duration_minutes) FILTER (WHERE keyed.billable), 0)::integer,
    COALESCE(sum(keyed.amount_cents) FILTER (WHERE keyed.billable), 0)::bigint,
    -- Internal time as the schema can express it today: W0's `source = 'internal'`
    -- value (00595). The `project_id IS NULL` leg is a FAIL-SAFE, not a feature —
    -- corrected in review round 4 (W2-R4-09), where the comment here claimed that
    -- "W4 needs no edit to this function" and that claim was false: the `scoped`
    -- CTE filters `ledger.studio_id = p_studio_id`, and time_entry_ledger's
    -- studio_id is project_pricing_studio_id(te.project_id), which is NULL for a
    -- NULL project_id (00604) — so a project-less row cannot enter this rollup at
    -- all, whatever this FILTER says. W4 MUST edit this function (and the `scoped`
    -- CTE, with an OR leg on the row's own studio_id column) when
    -- project_time_entries.studio_id lands (W4 00611); the leg is kept only so
    -- that the arithmetic is right on the day it does.
    --
    -- W2-R4-12, stated so lane B does not derive the internal group by
    -- subtraction: billable_minutes/billable_cents and internal_minutes can count
    -- the SAME row (nothing forbids `source = 'internal'` with `billable = true`),
    -- while total_minutes counts it once. A bucket may therefore read
    -- total 60 / billable 60 / internal 60.
    COALESCE(sum(keyed.duration_minutes)
      FILTER (WHERE keyed.source = 'internal' OR keyed.project_id IS NULL), 0)::integer
  FROM keyed
  GROUP BY keyed.bucket_key, keyed.bucket_label, keyed.member_id, keyed.member_name
  ORDER BY 6 DESC, 2 ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.studio_hours_rollup(uuid, date, date, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.studio_hours_rollup(uuid, date, date, text, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.studio_hours_rollup(uuid, date, date, text, uuid, uuid) IS
  'HT-37 + HT-38: the studio scope''s aggregate, SECURITY INVOKER — RLS on '
  'project_time_entries (as narrowed by 00606) is the scope, so a plain member '
  'passing a colleague''s p_user_id gets nothing of his. Return shape frozen at '
  'buckets, minutes and money: NO notes column, ever (HT-36). Running timers are '
  'excluded — a total never counts an unfinished hour. p_group_by is validated '
  'against five literals and raises otherwise; no dynamic SQL.';

-- ── HT-10-a: the project total a narrowed member may still have ─────────────
CREATE OR REPLACE FUNCTION public.project_hours_total(p_project_id uuid)
RETURNS TABLE (
  minutes          integer,
  billable_minutes integer,
  amount_cents     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The standing assert, first, per HT-10-a. `is_project_team_member` is the
  -- ruled leg; the project's own designer (00177:136-137) and an owner/admin of
  -- the studio that PRICES the work (00606's time_entries_owner_admin_read) are
  -- added because each of them can already sum these rows with a plain SELECT —
  -- admitting them escalates nothing and keeps one total function instead of
  -- three. Everyone else is refused.
  --
  -- THE THIRD LEG IS THE PRICING STUDIO, NOT THE DESIGNER'S MEMBERSHIP SET
  -- (amended in W2 review round 2, finding W2-R2-01 — measured, not argued).
  -- As first written this leg read "an owner/admin of ANY studio the project's
  -- designer actively belongs to", which is verbatim the SELF-GRANTABLE
  -- predicate round 1's B1 fix deleted from 00605/00606's three policies:
  -- `Org owners can insert members` (00484-registered, WITH CHECK
  -- is_org_admin_or_owner(organization_id) AND role <> 'owner', no consent gate,
  -- status DEFAULT 'active') lets anyone who owns any organization seat a victim
  -- project's designer in it with ONE INSERT. Its justification — "each of them
  -- can already sum these rows with a plain SELECT" — was TRUE before that fix
  -- and FALSE after it: the read policy now keys on the pricing studio, so this
  -- leg admitted a strictly WIDER, attacker-authored set than any SELECT policy
  -- grants. Measured on this program's stack before the amendment: an attacker
  -- owning only her own org reads 0 rows of the project and is refused the
  -- total; after one consent-free organization_members INSERT she still reads 0
  -- rows and project_pricing_studio_id is unmoved, but the total came back
  -- 120 / 120 / 50000. That contradicts HT-10-a ("asserting
  -- is_project_team_member") and HT-10 ("aggregates on rostered projects"), so
  -- the leg now uses the same key the three policies use. Pinned by case (i) of
  -- supabase/tests/rls/project_hours_total_test.sql and by postcondition (g).
  IF NOT (
    public.is_project_team_member(p_project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = p_project_id
        AND project.designer_id = auth.uid()
    )
    OR public.is_org_admin_or_owner(public.project_pricing_studio_id(p_project_id))
  ) THEN
    RAISE EXCEPTION 'project_hours_total: the caller is not on this project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Read the TABLE, not 00604's view: the view is security_invoker, and relying
  -- on a DEFINER function to neutralise that is the kind of subtlety that breaks
  -- quietly. The money expression is 00596's and 00604's — the classifier-owned
  -- snapshot on the row, one rate source.
  RETURN QUERY
  SELECT
    COALESCE(sum(entry.duration_minutes), 0)::integer,
    COALESCE(sum(entry.duration_minutes) FILTER (WHERE entry.billable), 0)::integer,
    COALESCE(sum(
      COALESCE(
        entry.rated_amount_cents,
        round(COALESCE(entry.duration_minutes, 0) / 60.0
              * COALESCE(entry.hourly_rate_cents, 0))::int
      )
    ) FILTER (WHERE entry.billable), 0)::bigint
  FROM public.project_time_entries AS entry
  WHERE entry.project_id = p_project_id
    AND entry.duration_minutes IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.project_hours_total(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.project_hours_total(uuid) TO authenticated;

COMMENT ON FUNCTION public.project_hours_total(uuid) IS
  'HT-10-a: the project total a member keeps after 00606 narrowed her per-row '
  'read to own rows. SECURITY DEFINER with the standing assert FIRST '
  '(is_project_team_member, or the project''s designer, or an owner/admin of the '
  'studio that PRICES the work — each of whom can already sum these rows '
  'directly). Never an owner/admin of ANY studio the designer belongs to: that '
  'set is authored by its own attacker through one consent-free '
  'organization_members INSERT (W2 review round 2, finding W2-R2-01). Returns '
  'minutes / billable_minutes / amount_cents and nothing else: no member names, '
  'no notes, no per-person rate. Running timers excluded.';

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_args text;
BEGIN
  -- (a) HT-36 as a type-level guarantee, on BOTH functions.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL unnest(COALESCE(routine.proargnames, ARRAY[]::text[])) AS arg(arg_name)
    WHERE routine.oid IN (
        to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)'),
        to_regprocedure('public.project_hours_total(uuid)')
      )
      AND lower(arg.arg_name) LIKE '%note%'
  ), '00607: neither rollup may carry a notes column in its return shape (HT-36)';

  -- (b) HT-38: INVOKER for the studio rollup, DEFINER for the project total.
  ASSERT NOT (SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)')),
    '00607: studio_hours_rollup MUST be SECURITY INVOKER (HT-38) — a DEFINER '
    'rollup hands every caller the studio and its assert cannot be written';
  ASSERT (SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.project_hours_total(uuid)')),
    '00607: project_hours_total MUST be SECURITY DEFINER (HT-10-a) — that is the '
    'whole point: it gives a member a total of rows 00606 stops her reading';

  -- (c) the DEFINER function asserts standing BEFORE it reads the hours.
  ASSERT (
    SELECT position('is_project_team_member' in prosrc)
         < position('project_time_entries' in prosrc)
    FROM pg_proc WHERE oid = to_regprocedure('public.project_hours_total(uuid)')
  ), '00607: project_hours_total must assert is_project_team_member BEFORE it '
     'reads project_time_entries (HT-10-a: "asserts … first")';
  ASSERT (
    SELECT prosrc NOT LIKE '%notes%' AND prosrc NOT LIKE '%full_name%'
    FROM pg_proc WHERE oid = to_regprocedure('public.project_hours_total(uuid)')
  ), '00607: the project total returns money and minutes — no notes, no names';

  -- (d) the five literals, named in the body rather than inferred.
  ASSERT (
    SELECT prosrc LIKE '%''member'', ''project'', ''day'', ''iso_week'', ''activity''%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)')
  ), '00607: p_group_by must be validated against exactly the five ruled literals';
  ASSERT (
    SELECT prosrc NOT LIKE '%EXECUTE format%' AND prosrc NOT LIKE '%EXECUTE ''%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)')
  ), '00607: no dynamic SQL in the rollup';

  -- (e) grants, both directions (post-flip rule).
  ASSERT NOT has_function_privilege('anon',
    'public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)', 'EXECUTE'),
    '00607: anon must not execute studio_hours_rollup';
  ASSERT has_function_privilege('authenticated',
    'public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)', 'EXECUTE'),
    '00607: authenticated must execute studio_hours_rollup';
  ASSERT NOT has_function_privilege('anon',
    'public.project_hours_total(uuid)', 'EXECUTE'),
    '00607: anon must not execute project_hours_total';
  ASSERT has_function_privilege('authenticated',
    'public.project_hours_total(uuid)', 'EXECUTE'),
    '00607: authenticated must execute project_hours_total';

  -- (f) the signature is the plan's, argument for argument.
  SELECT pg_get_function_identity_arguments(
    to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)')
  ) INTO v_args;
  ASSERT v_args = 'p_studio_id uuid, p_from date, p_to date, p_group_by text, '
                  'p_user_id uuid, p_project_id uuid',
    '00607: studio_hours_rollup''s signature drifted from plan-v2 §3; got ' || v_args;

  -- (g) W2-R2-01: the standing assert's third leg is the PRICING studio, and it
  --     reads organization_members through nothing but that one call. A leg that
  --     joins organization_members itself is the self-grantable predicate the
  --     round-1 B1 fix deleted from the three policies, and it hands a stranger
  --     the project's minutes and money for one consent-free INSERT.
  ASSERT (
    SELECT prosrc LIKE '%is_org_admin_or_owner(public.project_pricing_studio_id(p_project_id))%'
    FROM pg_proc WHERE oid = to_regprocedure('public.project_hours_total(uuid)')
  ), '00607: project_hours_total''s third standing leg must be '
     'is_org_admin_or_owner(project_pricing_studio_id(p_project_id)) — the same '
     'key 00605/00606''s three policies use (W2-R2-01)';
  ASSERT (
    SELECT prosrc NOT LIKE '%FROM public.organization_members%'
       AND prosrc NOT LIKE '%JOIN public.organization_members%'
    FROM pg_proc WHERE oid = to_regprocedure('public.project_hours_total(uuid)')
  ), '00607: project_hours_total must not read organization_members directly — '
     '"an owner/admin of ANY studio the designer belongs to" is a set the '
     'attacker authors herself (`Org owners can insert members`, no consent '
     'gate), and as a DEFINER aggregate it leaks the whole project''s minutes '
     'and billable money (W2 review round 2, finding W2-R2-01)';

  RAISE NOTICE '00607 postconditions passed.';
END
$postcondition$;

COMMIT;
