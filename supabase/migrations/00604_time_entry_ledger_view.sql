-- ═══════════════════════════════════════════════════════════════════════════
-- 00604 — time_entry_ledger: the fact view the four scopes read, and one
--         callable answer to "which studio prices this project's hours"
--
-- W2 (plan-v2 §3). The Hours sheet's four scopes — mine · a member · this
-- project · the studio — read ROWS from this view and AGGREGATES from 00607's
-- studio_hours_rollup. Both are SECURITY INVOKER, so RLS on
-- project_time_entries is the whole authorization story (00606 narrows it).
--
-- ── (1) public.project_pricing_studio_id(uuid) ──────────────────────────────
-- HT-3-a (RULED 2026-09-12): the studio that prices an hour is derived FROM THE
-- PROJECT ONLY — (1) projects.studio_id when not NULL, (2) else HT-3-b's two
-- tiers over the project DESIGNER's own seats, (3) else nothing. HT-3-b (RULED
-- 2026-09-12): the EMPLOYER tier first (active, non-guest seats with
-- role <> 'owner'; EXACTLY ONE prices), and only where she holds no employer
-- seat at all the OWNED tier (role = 'owner'; EXACTLY ONE prices). Any tier
-- with more than one candidate is NOTHING — the count is the answer, there is no
-- ordering key, and nothing about the MEMBER being priced enters.
--
-- WHY THIS FUNCTION EXISTS, and the duplication it does NOT remove (flagged, not
-- hidden): W2's brief requires the ledger's studio_id to resolve by HT-3-a/b and
-- forbids a second copy of the rule. The rule already has two bodies, both W1's
-- and both uncallable for a studio answer — `resolve_time_rate_cents`
-- (00599:327-363) computes it inline on its way to a rate, and
-- `set_project_studio_id_owned` (00603:190-262) computes it inline on its way to
-- a stamp. Neither can be asked "which studio prices project X". This file adds
-- the one CALLABLE form and does NOT redefine either of them: both carry
-- postconditions that read their own prosrc, and re-deriving the W1 resolver from
-- W2 would re-open twelve review rounds of the program's most contended
-- function for a refactor nobody asked for. The anti-drift device is therefore
-- an ASSERTED EQUIVALENCE rather than a single body:
--   · the structural postconditions at the foot of this file pin the same four
--     properties 00599's own postconditions pin (employer before owned,
--     role <> 'owner', exactly two organization_members reads, no ORDER BY);
--   · supabase/tests/billing/time_entry_ledger_test.sql case (b) asserts, on
--     four project shapes, that this function returns exactly the studio whose
--     studio_member_rates row the resolver priced the hour from.
-- If the orchestrator wants one body instead of three, that is a deliberate
-- redefinition of 00599 + 00603 from a later number, with W1's whole rate suite
-- as its gate.
--
-- SECURITY DEFINER for the reason 00603 states: organization_members' SELECT
-- policies are own-row / org-admin only, so an INVOKER read would see a PARTIAL
-- candidate set, and under HT-3-b a partial set is worse than none — it turns an
-- ambiguous tier into a confident wrong answer. It escalates nothing: it takes a
-- project id and returns an organization id, which is the value
-- projects.studio_id already carries for any project the caller can read.
--
-- NO CALLER ASSERT, deliberately, against §0.16's default: this function is
-- called per row inside a SECURITY INVOKER view, and a RAISE inside a view
-- predicate aborts the whole query rather than dropping one row — an assert here
-- would break the ledger read for exactly the owner/admin HT-10 just widened.
-- It reveals no rate, no member and no confidential column; the `p_project_id`
-- it takes is not a scope the caller can widen by guessing.
--
-- ── (2) public.time_entry_ledger ────────────────────────────────────────────
-- `WITH (security_invoker = true)` and LEFT JOINs to BOTH public.profiles and
-- public.projects. The 00555:3024-3026 hazard 00596 removed from
-- project_unbilled_time is the reason: under security_invoker the caller's OWN
-- RLS applies to every join, so an INNER JOIN silently DROPS a row whose author
-- (or whose project) the caller cannot read. 00596 deleted its profiles join
-- outright and recorded that the author's display name would be "bought once,
-- deliberately, by W2's time_entry_ledger view" — this is that purchase, as an
-- OUTER join, and the viewdef postcondition below refuses an inner one.
--
-- `notes` is NOT a column of this view. HT-36 freezes the ROLLUP's shape, and
-- the ledger is the rollup's own source; free text belongs to an explicit detail
-- act that reads public.project_time_entries directly. A postcondition asserts
-- its absence so a later hand cannot add it as a convenience.
--
-- Buckets are UTC (`AT TIME ZONE 'UTC'`), matching 00599's own date basis
-- (`(p_at AT TIME ZONE 'UTC')::date` against studio_member_rates.effective_*).
-- One timezone in the program, named here rather than discovered in a report.
--
-- Lineage: NEW view, NEW function. Nothing is redefined.
-- P-4: no row is touched; a view and a function read.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.project_pricing_studio_id(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id      uuid;
  v_studio_id        uuid;
  -- HT-3-b's tiers are collected as arrays, never ordered and LIMIT 1'd: the
  -- rule is "exactly one candidate prices; more than one is nothing", so the
  -- COUNT is the answer and there is no ranking key to choose with.
  v_employer_studios uuid[];
  v_owned_studios    uuid[];
BEGIN
  IF p_project_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Step 1 (HT-3-a): the project's own column. 00603's flag trigger keeps a
  -- studio the caller NAMED (HT-3-c arm (a)) and lets the employer tier override
  -- one 00563 merely DERIVED, so by the time a row exists this column is the
  -- ruled answer wherever it is not NULL.
  SELECT project.designer_id, project.studio_id
    INTO v_designer_id, v_studio_id
  FROM public.projects AS project
  WHERE project.id = p_project_id;

  IF v_studio_id IS NOT NULL OR v_designer_id IS NULL THEN
    RETURN v_studio_id;
  END IF;

  -- Step 2 (HT-3-b), EMPLOYER tier: the project DESIGNER's active non-guest
  -- seats that are not owner seats.
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
    RETURN v_employer_studios[1];
  END IF;

  IF COALESCE(array_length(v_employer_studios, 1), 0) > 1 THEN
    -- An ambiguous employer tier is nothing, not a contest (HT-3-b).
    RETURN NULL;
  END IF;

  -- OWNED tier, reached only where she holds no employer seat anywhere.
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
    RETURN v_owned_studios[1];
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.project_pricing_studio_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.project_pricing_studio_id(uuid) TO authenticated;

COMMENT ON FUNCTION public.project_pricing_studio_id(uuid) IS
  'HT-3-a + HT-3-b, as a callable answer: the studio that prices this '
  'project''s hours — projects.studio_id when not NULL, else the project '
  'DESIGNER''s one EMPLOYER studio (active non-guest seat, role <> ''owner''), '
  'else — only where she holds no employer seat at all — her one OWNED studio, '
  'else NULL. Exactly one candidate in a tier prices; more than one is NULL. No '
  'date, rate-existence, seat-date, org-age or member-count key, and nothing '
  'about the member being priced. The rule''s other two bodies are '
  'resolve_time_rate_cents (00599) and set_project_studio_id_owned (00603); they '
  'are pinned to this one by this file''s postconditions and by '
  'supabase/tests/billing/time_entry_ledger_test.sql case (b). Never an RLS '
  'policy key (plan-v2 §0.13).';

-- ── the fact view ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.time_entry_ledger;
CREATE VIEW public.time_entry_ledger
WITH (security_invoker = true) AS
SELECT
  te.id,
  te.project_id,
  p.name                                        AS project_name,
  public.project_pricing_studio_id(te.project_id) AS studio_id,
  te.user_id,
  author.full_name                              AS member_name,
  te.phase_key,
  te.task_id,
  te.started_at,
  (te.started_at AT TIME ZONE 'UTC')::date      AS day,
  to_char(te.started_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS iso_week,
  to_char(te.started_at AT TIME ZONE 'UTC', 'YYYY-MM')    AS month,
  te.duration_minutes,
  (te.duration_minutes IS NULL)                 AS is_running,
  te.billable,
  te.activity,
  te.source,
  te.billing_state,
  te.rate_source,
  te.rate_role,
  -- One rate source, 00596's rule: the classifier-owned snapshot on the row, and
  -- the amount that the same snapshot produces. The rate printed is the rate
  -- that priced the line.
  COALESCE(te.hourly_rate_cents, 0)             AS resolved_rate_cents,
  COALESCE(
    te.rated_amount_cents,
    round(COALESCE(te.duration_minutes, 0) / 60.0 * COALESCE(te.hourly_rate_cents, 0))::int
  )                                             AS amount_cents,
  te.invoice_id,
  te.billing_authority_id,
  te.authority_rate_id,
  te.created_at,
  te.updated_at
FROM public.project_time_entries te
-- BOTH joins are LEFT, and that is load-bearing under security_invoker: an
-- INNER join applies the CALLER's projects / profiles RLS and drops the whole
-- row when they cannot read the joined side (00555:3024-3026, the defect 00596
-- repaired in project_unbilled_time). A missing name is a NULL column here, not
-- a missing hour.
LEFT JOIN public.projects p      ON p.id = te.project_id
LEFT JOIN public.profiles author ON author.id = te.user_id;

-- The local stack still carries pre-flip default privileges that hand `anon`
-- everything on a freshly created relation (visible on project_unbilled_time and
-- v_project_roster). The hours ledger is authenticated-only, so the grant is
-- narrowed explicitly here rather than left to RLS to refuse — and this REVOKE is
-- what supabase/seed/00-legacy-grants.sql replays on a fresh stack.
REVOKE ALL ON public.time_entry_ledger FROM anon;
GRANT SELECT ON public.time_entry_ledger TO authenticated;

COMMENT ON VIEW public.time_entry_ledger IS
  'W2 fact view for the Hours sheet''s four scopes (plan-v2 §3). '
  'security_invoker — RLS on project_time_entries is the whole authorization '
  'story (00606). studio_id resolves by HT-3-a/b through '
  'project_pricing_studio_id and is NEVER an RLS policy key (§0.13). '
  'Deliberately carries NO notes column: aggregate by default (HT-36), free '
  'text only behind an explicit detail act against the table. Day / iso_week / '
  'month buckets are UTC, matching 00599''s date basis.';

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_def        text;
  v_flat       text;
  v_invoker    text;
  v_prosrc     text;
  v_src        text;
  v_org_reads  integer;
BEGIN
  SELECT pg_get_viewdef('public.time_entry_ledger'::regclass, true) INTO v_def;
  v_flat := lower(regexp_replace(v_def, '\s+', ' ', 'g'));

  ASSERT v_flat LIKE '%left join profiles%' OR v_flat LIKE '%left join public.profiles%',
    '00604: the profiles join must be an OUTER join — an inner one drops an hour '
    'whose author the caller cannot read (00555:3024-3026)';
  ASSERT v_flat NOT LIKE '% join profiles%' OR v_flat LIKE '%left join profiles%',
    '00604: profiles is joined exactly once, as a LEFT join';
  ASSERT v_flat LIKE '%left join projects%' OR v_flat LIKE '%left join public.projects%',
    '00604: the projects join must be an OUTER join for the same reason, and so '
    'that W4''s project-less internal time survives this view';

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'time_entry_ledger'
      AND column_name = 'notes'
  ), '00604: time_entry_ledger must carry no notes column (HT-36) — free text '
     'belongs to an explicit detail act against project_time_entries';

  SELECT array_to_string(relation.reloptions, ',') INTO v_invoker
  FROM pg_class AS relation WHERE relation.oid = 'public.time_entry_ledger'::regclass;
  ASSERT COALESCE(v_invoker, '') LIKE '%security_invoker=true%',
    '00604: the ledger view must be security_invoker (HT-38''s reason applies to '
    'the view too: the rows are RLS-scoped, and a DEFINER view would hand every '
    'caller the studio); reloptions = ' || COALESCE(v_invoker, 'NULL');

  -- Structural pins on the pricing rule, mirroring 00599's own postconditions.
  -- The rule has three bodies (see the banner); these four asserts plus
  -- time_entry_ledger_test.sql case (b) are what keep them one rule.
  SELECT prosrc INTO v_prosrc
  FROM pg_proc WHERE oid = to_regprocedure('public.project_pricing_studio_id(uuid)');
  v_src := lower(regexp_replace(v_prosrc, '\s+', ' ', 'g'));

  ASSERT v_src LIKE '%designer_seat.role <> ''owner''%',
    '00604: the employer tier is defined by role <> ''owner'' (HT-3-b) and the '
    'body no longer says so';
  ASSERT position('v_employer_studios' in v_src) < position('v_owned_studios' in v_src),
    '00604: the EMPLOYER tier must be read before the OWNED tier (HT-3-b) — '
    'reading owned first restores W1-R8-01';
  ASSERT v_src NOT LIKE '%order by%',
    '00604: HT-3-b is a count, not a contest — no ordering key may appear in the '
    'pricing studio choice (every such key was rated blocker-grade in W1 rounds 4-7)';
  ASSERT v_src NOT LIKE '%studio_member_rates%',
    '00604: no rate-existence key (W1-R11-01) — whether a studio already holds a '
    'rate for the member must never decide which studio prices her';
  SELECT count(*) INTO v_org_reads
  FROM regexp_matches(v_src, 'organization_members', 'g') AS hits;
  ASSERT v_org_reads = 2,
    '00604: exactly two organization_members reads — one per HT-3-b tier; got '
    || v_org_reads;

  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.project_pricing_studio_id(uuid)')),
    '00604: project_pricing_studio_id must be SECURITY DEFINER — an INVOKER read '
    'of organization_members returns a PARTIAL candidate set, which under HT-3-b '
    'turns an ambiguous tier into a confident wrong answer (00603''s reason)';

  ASSERT NOT has_function_privilege('anon',
    'public.project_pricing_studio_id(uuid)', 'EXECUTE'),
    '00604: anon must not execute project_pricing_studio_id';
  ASSERT has_function_privilege('authenticated',
    'public.project_pricing_studio_id(uuid)', 'EXECUTE'),
    '00604: authenticated must execute project_pricing_studio_id — the ledger '
    'view is security_invoker and calls it per row';
  ASSERT has_table_privilege('authenticated', 'public.time_entry_ledger', 'SELECT'),
    '00604: authenticated must hold SELECT on time_entry_ledger (post-flip '
    'grants are explicit)';
  ASSERT NOT has_table_privilege('anon', 'public.time_entry_ledger', 'SELECT'),
    '00604: anon must not read the ledger';

  RAISE NOTICE '00604 postconditions passed.';
END
$postcondition$;

COMMIT;
