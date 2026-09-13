-- ═══════════════════════════════════════════════════════════════════════════
-- 00620 — HT-3-g(2): the legacy stamp, ONCE.
--
-- HT-3-g (RULED BY KODY 2026-09-12), part (2):
--
--   *"ONE-OFF STAMP AT SHIP: a new migration 00620_legacy_project_studio_stamp.sql
--   applies the HT-3-b tier rule ONCE to every projects row with studio_id IS NULL
--   — unambiguous rows get their studio, ambiguous rows stay NULL; idempotent;
--   RAISE NOTICE the counts (stamped / left NULL); runs as the migration role, so
--   the 00563 guard's service arm admits it."*
--
-- WHY IT IS NEEDED. HT-3-g(1) deletes every read-time derivation: from this
-- migration's predecessors onward the studio that prices an hour IS
-- projects.studio_id, and a NULL there answers 'none' (HT-26's "rate pending") for
-- everyone. Without this file every project that predates `projects.studio_id`
-- would price 'none' for ever until a human stamped it one at a time — the whole
-- legacy book, including the book of the honest sole proprietor and of the
-- principal whose ASSISTANT opened her projects, neither of whom HT-3-g(3) lets
-- stamp anything. This migration does for the legacy population exactly what
-- 00602's trigger has been doing for every project created since: it applies
-- HT-3-b's tier rule once, at a moment when nobody is logging an hour and no
-- caller can influence the answer.
--
-- THE RULE IS THE SHARED BODY AND NOTHING ELSE —
-- `public.designer_tier_pricing_studio(p_designer_id)`, defined in 00615 and called
-- from exactly two places: 00602's INSERT stamp (set_project_studio_id_owned) and
-- this file. The rule is NOT spelled out here: two callers spelling it separately is
-- the drift the shared body exists to prevent, and a reviewer can read one body
-- instead of comparing two. Employer tier exactly one → it; else owned tier exactly
-- one → it; else NULL. No rate-existence, seat-date, org-age, member-count,
-- ordering or project-authorship key, and nothing about the member being priced.
--
-- HT-3-f(2) IS DELIBERATELY NOT APPLIED HERE, and that is a ruled choice rather
-- than an omission. HT-3-f(2) gated the owned tier on
-- `projects.created_by = projects.designer_id`; it existed only to stop the
-- read-time recomputation, which no longer happens, and HT-3-g dissolves it. Under
-- it, the HT-3-f(2) COST NOTE's honest principal — she owns her studio, holds no
-- employer seat, and her own assistant opened her legacy project (W2-R10-03,
-- measured with no attacker and no manoeuvre) — would be left at 'none' for ever,
-- because HT-3-g(3) refuses her the stamp too. She is precisely the row this
-- migration must hand her own studio, and case (am) of
-- supabase/tests/billing/legacy_project_studio_stamp_test.sql measures exactly that
-- shape through the same body this file calls.
--
-- WHAT IT DOES NOT DO:
--   · it does NOT touch a single time entry. P-4: no hour is re-rated, and the
--     postcondition below proves it by counting project_time_entries and summing
--     their hourly_rate_cents before and after. An hour already logged keeps the
--     number it was priced at; the stamp changes what the NEXT hour resolves, which
--     is the same thing HT-3-a's repair act has always done.
--   · it does NOT re-point a project that already names a studio. The UPDATE is
--     bounded `WHERE studio_id IS NULL`, which is also the whole of its
--     idempotency: a second replay matches no row.
--   · it does NOT resolve ambiguity. A designer with two employer seats, or with no
--     seat at all, or with two owned studios and no employer, leaves her project
--     NULL — which prices 'none' until an owner/admin of a studio that EMPLOYS her
--     stamps it (00606, HT-3-g(3)). That is a cost, recorded in the NOTICE's own
--     counts: 'none' is where a human must act.
--   · it writes no audit_logs row. stamp_project_pricing_studio writes one because
--     a PERSON performed an act; this is a migration with no actor, and a row
--     claiming one would be false. The migration ledger and the NOTICE are its
--     trace.
--
-- THE 00563 GUARD. `set_project_studio_id` (00317 → 00511 → 00563) is a BEFORE
-- INSERT OR UPDATE trigger on public.projects and its authenticated arm refuses any
-- UPDATE of this column. This migration runs as the migration role, so
-- `v_postgres_migration` (session_user = 'postgres' AND role IN ('none','postgres'),
-- 00563:106-107) is TRUE and the guard takes its early RETURN NEW at 00563:349
-- after the UPDATE-immutability checks — and those checks only forbid moving id,
-- created_at, created_by and designer_id, none of which this statement touches. The
-- candidate-discovery block above that return is skipped because NEW.studio_id is
-- NOT NULL by the time it runs. Verified on this program's stack at replay, not
-- assumed: if a later change to 00563 ever refuses this statement, the remedy is
-- ALTER TABLE public.projects DISABLE TRIGGER set_project_studio_id around this one
-- statement and ENABLE it again in the same transaction — never DROP it.
-- 00602/00603's own trigger (zzz_set_project_studio_id_owned_trg) is BEFORE INSERT
-- only and does not fire here.
--
-- Lineage: nothing is redefined. This file adds no object, no policy, no grant and
-- no column — one bounded UPDATE and its proofs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $legacystamp$
DECLARE
  v_null_before integer := 0;
  v_stamped     integer := 0;
  v_null_after  integer := 0;
  v_entries_before    bigint := 0;
  v_entries_after     bigint := 0;
  v_rate_sum_before   bigint := 0;
  v_rate_sum_after    bigint := 0;
BEGIN
  SELECT count(*) INTO v_null_before
  FROM public.projects
  WHERE studio_id IS NULL;

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_before, v_rate_sum_before
  FROM public.project_time_entries;

  -- The one statement. LATERAL so the shared tier body is asked exactly once per
  -- candidate row, and `tiered.studio_id IS NOT NULL` so an ambiguous or seatless
  -- designer's project is left exactly as it is.
  WITH tiered AS (
    SELECT project.id AS project_id,
           answer.studio_id
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
  )
  UPDATE public.projects AS project
     SET studio_id = tiered.studio_id
    FROM tiered
   WHERE project.id = tiered.project_id
     AND tiered.studio_id IS NOT NULL
     AND project.studio_id IS NULL;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  SELECT count(*) INTO v_null_after
  FROM public.projects
  WHERE studio_id IS NULL;

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_after, v_rate_sum_after
  FROM public.project_time_entries;

  RAISE NOTICE '00620 HT-3-g(2) one-off legacy stamp: % projects carried studio_id '
               'NULL; % stamped from HT-3-b''s tier rule; % left NULL (an ambiguous '
               'or empty tier — they price ''none'' until an owner/admin of a studio '
               'that EMPLOYS the designer stamps them, HT-3-g(3)).',
               v_null_before, v_stamped, v_null_after;

  ASSERT v_null_after = v_null_before - v_stamped,
    '00620: every project this migration stopped leaving NULL is one it stamped — '
    'a different arithmetic means something else wrote the column inside this '
    'transaction';
  ASSERT v_entries_after = v_entries_before
     AND v_rate_sum_after = v_rate_sum_before,
    '00620: P-4 — this migration writes projects.studio_id and NOTHING ELSE. No '
    'time entry is added, removed or re-rated: ' || v_entries_before || ' rows '
    'summing ' || v_rate_sum_before || ' before, ' || v_entries_after || ' summing '
    || v_rate_sum_after || ' after';
END
$legacystamp$;

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
BEGIN
  -- (a) IDEMPOTENCE, stated as a property of the end state rather than by running
  --     the statement twice: after this migration there is no project the tier rule
  --     answers for whose column is still NULL, so a replay matches no row.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
      AND answer.studio_id IS NOT NULL
  ), '00620: every NULL-studio project whose designer''s tier ANSWERS must have '
     'been stamped — one left behind means the UPDATE''s predicate and the tier '
     'rule disagree, and it would price ''none'' for ever with no act available to '
     'its own studio (HT-3-g(3) refuses an owned-tier stamp to everybody)';

  -- (b) the rule this file applied is the SHARED one, and this file is one of its
  --     exactly two callers (HT-3-g(1)).
  ASSERT to_regprocedure('public.designer_tier_pricing_studio(uuid)') IS NOT NULL,
    '00620: HT-3-b''s tier rule must exist as the shared body 00615 defines — '
    'spelled out inline here it would drift from 00602''s INSERT stamp, which is '
    'its only other caller';
  ASSERT to_regprocedure('public.owned_tier_prices_project(uuid,uuid)') IS NULL,
    '00620: HT-3-f(2) is DISSOLVED and must not be resurrected as a filter on this '
    'stamp — applied here it leaves the honest principal whose ASSISTANT opened her '
    'legacy project at ''none'' for ever (HT-3-f(2) COST NOTE, W2-R10-03, measured '
    'with no attacker and no manoeuvre), and HT-3-g(3) refuses her the repair';

  -- (c) HT-3-g(1) is still true of the bodies that PRICE an hour — this file
  --     stamped a column, it did not re-open a derivation.
  ASSERT (
    SELECT lower(pg_get_functiondef(
             'public.project_pricing_studio_id(uuid)'::regprocedure))
             NOT LIKE '%organization_members%'
  ), '00620: HT-3-g(1) — the callable form every reader keys on must still be ONE '
     'column read. This migration exists because that is true; a derivation here '
     'would make it a second answer to the same question';
  ASSERT (
    SELECT lower(pg_get_functiondef(
             'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure))
             NOT LIKE '%designer_tier_pricing_studio%'
  ), '00620: HT-3-g(1) — and the resolver must not call the tier rule. The rule is '
     'for a stamp that runs once (00602''s trigger, and this file), never for an '
     'answer recomputed on every hour';

  -- (d) 00563's guard was not dropped or weakened to let this UPDATE through.
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    WHERE c.relname = 'projects'
      AND t.tgname = 'set_project_studio_id'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
  ), '00620: set_project_studio_id must still exist and be ENABLED on '
     'public.projects. The migration role''s own arm (00563:106-107, :349) is what '
     'admits this statement; if a later change to that guard ever refuses it, the '
     'remedy is to disable this ONE trigger around this ONE statement and re-enable '
     'it in the same transaction — never to drop it';
  ASSERT (
    SELECT prosrc LIKE '%studio_id_not_designer_studio%'
    FROM pg_proc WHERE oid = to_regprocedure('public.set_project_studio_id()')
  ), '00620: and set_project_studio_id is still 00563''s body — this file redefines '
     'nothing';

  RAISE NOTICE '00620 postconditions passed.';
END
$postcondition$;

COMMIT;
