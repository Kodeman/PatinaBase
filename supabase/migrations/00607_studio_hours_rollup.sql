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
-- ── P2-B1 / P2-n1 (integration round 2): THE WINDOW IS AN INSTANT RANGE ────
-- `p_from` / `p_to` were `date`, and the CTE below filtered 00604's
-- `ledger.day` — which is `(started_at AT TIME ZONE 'UTC')::date`. The Hours
-- sheet's week, its `mine` read and its CSV window are the viewer's LOCAL
-- Monday-to-Monday (weekRange() / isoDate() in hours-ledger.tsx), so the sheet
-- asked two different questions under one caption. Measured on this program's
-- stack from a CDT machine (UTC-5): two 90-minute entries filed by the timer at
-- 21:34 and 22:34 on Sunday 13 Sep 2026 read `TODAY 3H 00M / WEEK 3H 00M` under
-- `mine`, while studio_hours_rollup(studio,'2026-09-07','2026-09-13','member')
-- returned 0 rows and the same call over '2026-09-13'..'2026-09-19' returned
-- 180 min / 36000 cents. For any zone west of UTC there is a nightly band in
-- which the UTC day is tomorrow's: on the last day of the week the hour leaves
-- the week entirely, and the week's CSV and statement omit it.
--
-- HT-13-a closes this for DATE-ONLY entries (filed at noon UTC by
-- startedAtFromDateValue) and declined a studio timezone; the TIMER stores the
-- real instant and is the program's flagship capture door. So the smallest fix
-- that keeps the timer's real time of day is taken here: the window is the same
-- INSTANT range `mine` already uses. `p_from` and `p_to` are `timestamptz`,
-- `p_from` INCLUSIVE and `p_to` EXCLUSIVE — `started_at >= p_from AND
-- started_at < p_to` — which is exactly `.gte('started_at', weekStart).lt(
-- 'started_at', weekEnd)` in the portal. A NULL bound is still unbounded.
--
-- ── HT-13-b (RULED 2026-09-14, integration round 3): THE LABELS TAKE A ZONE ─
-- Round 2 left the `day` and `iso_week` BUCKET LABELS on 00604's UTC
-- derivation and recorded it as P2-n1's residual. Measured in the browser at
-- round 3 (R3-M2): inside a now-correct window, one hour filed Sun 13 Sep
-- 21:34 CDT read `13 SEPTEMBER` under `mine` and `2026-09-14` under
-- `the studio`, `BY DAY` listed a day the displayed week does not contain, and
-- the CSV's Date column carried the UTC date. Two lenses of one sheet printed
-- two dates for one hour.
--
-- HT-13-b resolves it WITHOUT reopening HT-13-a: the label takes the CALLER's
-- zone as an ARGUMENT (an IANA name), never a stored studio column. `p_timezone
-- text DEFAULT 'UTC'` is appended to the signature — last, and defaulted, so
-- every existing positional caller is unchanged — and the `day` / `iso_week`
-- buckets are cut on `(started_at AT TIME ZONE p_timezone)`, not on 00604's UTC
-- columns. The portal passes `Intl.DateTimeFormat().resolvedOptions().timeZone`.
-- The WINDOW is untouched: it was already the row's own instant (P2-B1), and an
-- instant range needs no zone.
--
-- `time_entry_ledger.day` stays UTC (HT-13-a's basis, and 00599's): the view is
-- a fact table, and the portal derives every DISPLAYED date from `started_at`
-- in the browser's zone instead. The CSV Date column and the client folio's
-- dated sub-table follow the same rule.
--
-- Lineage: NEW functions. Nothing is redefined. (The DROP below is not a
-- redefinition either: it removes the `(uuid, date, date, text, uuid, uuid)`
-- overload this same file created before round 2, so a stack that already
-- applied it does not keep two rollups.)
-- P-4: no row is touched.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- P2-B1: the `date` window is gone. Dropped rather than left as an overload —
-- two rollups differing only in bound type is the exact ambiguity a caller
-- passing a bare '2026-09-07' string would resolve by accident.
DROP FUNCTION IF EXISTS public.studio_hours_rollup(uuid, date, date, text, uuid, uuid);
-- HT-13-b: and the six-argument instant form this same file created before
-- round 3. `p_timezone` is DEFAULTed, so leaving the old one standing would
-- make every six-argument call ambiguous rather than resolving it to the new
-- body. Dropped for the same reason the `date` overload above was.
DROP FUNCTION IF EXISTS public.studio_hours_rollup(uuid, timestamptz, timestamptz, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.studio_hours_rollup(
  p_studio_id  uuid,
  p_from       timestamptz,          -- INCLUSIVE instant (P2-B1)
  p_to         timestamptz,          -- EXCLUSIVE instant (P2-B1)
  p_group_by   text DEFAULT 'member',   -- 'member' | 'project' | 'day' | 'iso_week' | 'activity'
  p_user_id    uuid DEFAULT NULL,       -- the member scope
  p_project_id uuid DEFAULT NULL,       -- the project scope
  p_timezone   text DEFAULT 'UTC'       -- HT-13-b: the CALLER's IANA zone, for
                                        -- the day / iso_week LABELS only
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
DECLARE
  v_zone text := COALESCE(NULLIF(btrim(p_timezone), ''), 'UTC');
BEGIN
  -- HT-13-b. An unreadable zone name is a caller bug, and it is said here — in
  -- this function's own voice, once — rather than surfacing from inside the
  -- query as a bare `time zone "X" not recognized`. The probe is a cast rather
  -- than a scan of pg_timezone_names, which rebuilds the whole tz database per
  -- call.
  BEGIN
    PERFORM now() AT TIME ZONE v_zone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'studio_hours_rollup: p_timezone must be an IANA time zone name (got %)', v_zone
      USING ERRCODE = 'invalid_parameter_value';
  END;

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
    -- error. A NULL bound is unbounded on that side.
    --
    -- P2-B1: the window is the ROW'S OWN INSTANT, never 00604's UTC `day`
    -- bucket — `p_from` inclusive, `p_to` exclusive, which is the range the
    -- sheet's `mine` read already uses. Filtering `ledger.day` here asked a UTC
    -- question of a local week and dropped every evening hour west of UTC on the
    -- week's last day.
    SELECT ledger.*
    FROM public.time_entry_ledger AS ledger
    WHERE ledger.studio_id = p_studio_id
      AND (p_from IS NULL OR ledger.started_at >= p_from)
      AND (p_to   IS NULL OR ledger.started_at <  p_to)
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
        -- HT-13-b: the LABEL is cut in the caller's zone, never on 00604's
        -- UTC `day` / `iso_week` columns. Those stay the fact view's basis;
        -- this is what a person reads.
        WHEN 'day'      THEN to_char((scoped.started_at AT TIME ZONE v_zone)::date, 'YYYY-MM-DD')
        WHEN 'iso_week' THEN to_char(scoped.started_at AT TIME ZONE v_zone, 'IYYY-"W"IW')
        WHEN 'activity' THEN COALESCE(scoped.activity, 'unset')
      END AS bucket_key,
      CASE p_group_by
        WHEN 'member'   THEN COALESCE(scoped.member_name, 'Unnamed member')
        WHEN 'project'  THEN COALESCE(scoped.project_name, 'Internal')
        WHEN 'day'      THEN to_char((scoped.started_at AT TIME ZONE v_zone)::date, 'YYYY-MM-DD')
        WHEN 'iso_week' THEN to_char(scoped.started_at AT TIME ZONE v_zone, 'IYYY-"W"IW')
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

REVOKE EXECUTE ON FUNCTION public.studio_hours_rollup(uuid, timestamptz, timestamptz, text, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.studio_hours_rollup(uuid, timestamptz, timestamptz, text, uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.studio_hours_rollup(uuid, timestamptz, timestamptz, text, uuid, uuid, text) IS
  'HT-37 + HT-38: the studio scope''s aggregate, SECURITY INVOKER — RLS on '
  'project_time_entries (as narrowed by 00606) is the scope, so a plain member '
  'passing a colleague''s p_user_id gets nothing of his. Return shape frozen at '
  'buckets, minutes and money: NO notes column, ever (HT-36). Running timers are '
  'excluded — a total never counts an unfinished hour. p_group_by is validated '
  'against five literals and raises otherwise; no dynamic SQL. p_timezone '
  '(HT-13-b) is the CALLER''s IANA zone and cuts the day / iso_week LABELS '
  'only — the window is an instant range and needs none, and no studio '
  'timezone column exists (HT-13-a stands).';

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
        to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)'),
        to_regprocedure('public.project_hours_total(uuid)')
      )
      AND lower(arg.arg_name) LIKE '%note%'
  ), '00607: neither rollup may carry a notes column in its return shape (HT-36)';

  -- (b) HT-38: INVOKER for the studio rollup, DEFINER for the project total.
  ASSERT NOT (SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')),
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
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ), '00607: p_group_by must be validated against exactly the five ruled literals';
  ASSERT (
    SELECT prosrc NOT LIKE '%EXECUTE format%' AND prosrc NOT LIKE '%EXECUTE ''%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ), '00607: no dynamic SQL in the rollup';

  -- (e) grants, both directions (post-flip rule).
  ASSERT NOT has_function_privilege('anon',
    'public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)', 'EXECUTE'),
    '00607: anon must not execute studio_hours_rollup';
  ASSERT has_function_privilege('authenticated',
    'public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)', 'EXECUTE'),
    '00607: authenticated must execute studio_hours_rollup';
  ASSERT NOT has_function_privilege('anon',
    'public.project_hours_total(uuid)', 'EXECUTE'),
    '00607: anon must not execute project_hours_total';
  ASSERT has_function_privilege('authenticated',
    'public.project_hours_total(uuid)', 'EXECUTE'),
    '00607: authenticated must execute project_hours_total';

  -- (f) the signature is the plan's, argument for argument.
  SELECT pg_get_function_identity_arguments(
    to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ) INTO v_args;
  ASSERT v_args = 'p_studio_id uuid, p_from timestamp with time zone, '
                  'p_to timestamp with time zone, p_group_by text, '
                  'p_user_id uuid, p_project_id uuid, p_timezone text',
    '00607: studio_hours_rollup''s signature drifted from plan-v2 §3 as amended '
    'by P2-B1 (the window is an instant range, not a date range) and HT-13-b '
    '(the labels take the caller''s zone); got ' || v_args;

  -- (h) P2-B1: the window is the row's own instant. A `ledger.day` comparison
  --     here is the defect itself — a UTC question asked of the viewer's local
  --     week, which drops every evening hour west of UTC on the week's last day
  --     and omits it from the week's CSV and statement.
  ASSERT (
    SELECT prosrc LIKE '%ledger.started_at >= p_from%'
       AND prosrc LIKE '%ledger.started_at <  p_to%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ), '00607: the rollup window must compare ledger.started_at against the '
     'instant bounds (P2-B1), p_from inclusive and p_to exclusive — the same '
     'range the Hours sheet''s `mine` read uses';
  ASSERT (
    SELECT prosrc NOT LIKE '%ledger.day >=%' AND prosrc NOT LIKE '%ledger.day <=%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ), '00607: ledger.day is a UTC BUCKET LABEL, never the window (P2-B1)';

  -- (i) P2-B1: and no `date` overload survives beside it.
  ASSERT to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)') IS NULL,
    '00607: the (uuid, date, date, text, uuid, uuid) rollup must not exist '
    'alongside the instant one — two bounds types is an ambiguity a caller '
    'passing a bare date string resolves by accident (P2-B1)';
  ASSERT to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid)') IS NULL,
    '00607: the six-argument instant rollup must not exist alongside the '
    'seven-argument one — p_timezone is DEFAULTed, so a surviving six-argument '
    'form makes every six-argument call ambiguous (HT-13-b)';

  -- (j) HT-13-b: the day / iso_week LABELS are cut in the caller's zone, and
  --     never on 00604's UTC columns. A `scoped.day` or `scoped.iso_week` in
  --     the CASE is the defect R3-M2 measured: two lenses of one sheet printing
  --     two dates for one hour, and a seven-day week listing an eighth day.
  ASSERT (
    SELECT prosrc LIKE '%(scoped.started_at AT TIME ZONE v_zone)::date%'
       AND prosrc LIKE '%to_char(scoped.started_at AT TIME ZONE v_zone,%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ), '00607: the day and iso_week buckets must be cut on '
     '(started_at AT TIME ZONE p_timezone) (HT-13-b)';
  ASSERT (
    SELECT prosrc NOT LIKE '%THEN to_char(scoped.day,%'
       AND prosrc NOT LIKE '%THEN scoped.iso_week%'
    FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)')
  ), '00607: 00604''s UTC day / iso_week columns are the fact view''s basis, '
     'never a printed label (HT-13-b)';

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
