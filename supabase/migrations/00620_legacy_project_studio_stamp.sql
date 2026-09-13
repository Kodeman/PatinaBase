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
-- W2-R12-01 (MAJOR, measured 1/1 through RLS in two statement forms with a negative
-- control in an identical fixture): THE OWNED TIER OF THIS ONE STATEMENT IS KEYED ON
-- THE PROJECT AUTHOR'S OWN STUDIO STANDING. HT-3-g(1) removed the read-time
-- RECOMPUTATION; by itself it did not remove the LEVER, it CONCENTRATED it here. This
-- statement reads the designer's LIVE seats at ONE instant, so one ordinary statement
-- of hers before the ship decides where she is standing when it runs: she leaves her
-- employer (the shipped `Members can leave` DELETE on her own organization_members
-- row, W2-R9-01 probe C), or as an `admin` sets that same row status = 'removed'
-- (probe D2). Her employer tier is then EMPTY, the OWNED tier answers her own 00295
-- workspace, and with no key here this statement would stamp that workspace onto
-- EVERY legacy project of hers — including her former employer's client work, opened
-- by that employer's own assistant. 00606's bound (b) makes each column final and
-- HT-3-g(3) gives the employer no arm to repair it, and 00606 (which creates the
-- stamp) and this file land in the SAME push, so no studio has a window in which to
-- stamp its own book first. In its ordinary clothes this is not an exploit but
-- ATTRITION — a designer who has left, with no attacker anywhere, whose former
-- employer's legacy book is handed to her workspace, irreversibly.
--
-- THE KEY, and it is the AUTHOR's standing, never the designer's and never the
-- actor's: an OWNED-tier answer is written only where `projects.created_by` does NOT
-- hold an active, non-guest seat in an active design_studio OTHER than the studio
-- being written — only, that is, where the project does not VISIBLY belong to another
-- studio's book. `public.project_author_books_elsewhere(created_by, studio_id)` below
-- is that one predicate. The EMPLOYER tier is untouched by it: a single employer seat
-- IS the book the project belongs to, whoever opened it.
--
-- WHY THIS KEY AND NOT HT-3-f(2)'s. HT-3-f(2) asked `created_by = designer_id`, and
-- that question refuses the honest principal whose own assistant opened her project.
-- This one asks whether the AUTHOR stands in somebody ELSE's studio, and so keeps
-- BOTH honest shapes this file exists for: the sole proprietor (created_by = her,
-- seated only in her own studio) and the HT-3-f(2) COST NOTE's principal (created_by =
-- her own studio's admin, seated only there). It is not manufacturable by the designer
-- either — 00563 RAISES on any UPDATE that moves created_by, and its
-- authenticated-INSERT arm admits only NEW.created_by = auth.uid(). `created_by` is
-- NOT NULL on public.projects (checked on this program's stack), so there is no
-- unknown-author branch; the predicate answers false for a NULL author in any case,
-- which is the permissive direction and the one shape to re-check if that column were
-- ever nullable on Strata.
--
-- WHAT IT COSTS, stated rather than discovered — the FIFTH HT-3-g cost note: a legacy
-- project opened by a contractor, an ex-colleague or an assistant who has SINCE taken
-- a seat in another studio is left NULL even where its designer's owned tier answers,
-- and by HT-3-g cost note (ii) nobody may then stamp it, because she holds no employer
-- seat anywhere. Such a project prices 'none' (HT-26's "rate pending") until a studio
-- seats her. That is the safe direction HT-3-g names for itself, and it is the trade
-- this key makes: 'none' where a human must act, rather than a taking that no party
-- can undo.
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
--   · it does NOT hand an OWNED studio a project that visibly belongs to another
--     studio's book (W2-R12-01, above). Those rows are left NULL too, and the NOTICE
--     counts them separately so the ship can see how many there were.
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
-- Lineage: nothing is redefined. This file adds ONE object — the W2-R12-01 author
-- predicate below, REVOKEd from every role so only the migration role that defines it
-- can reach it — no policy and no column, plus one bounded UPDATE and its proofs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- W2-R12-01 — THE OWNED TIER'S ONE KEY: DOES THE PROJECT'S AUTHOR STAND IN
-- SOMEBODY ELSE'S STUDIO?
--
-- True where `p_created_by` holds an ACTIVE, NON-GUEST seat in an ACTIVE
-- design_studio OTHER than `p_studio_id` — i.e. where the project visibly belongs
-- to another studio's book and an OWNED-tier answer must not be written onto it.
-- Asked of the AUTHOR and of nobody else: not the designer (her seats are what the
-- tier rule already read, and emptying them is the very statement W2-R9-01 probes C
-- and D2 make), not the actor (this migration has none).
--
-- `role <> 'guest'` and nothing narrower: an owner seat in another studio counts
-- too, because a project opened by the principal of a DIFFERENT studio belongs to
-- that studio's book exactly as an employee-opened one does.
--
-- SECURITY DEFINER for the same reason the tier body is: an INVOKER read of
-- organization_members returns a PARTIAL candidate set, and a partial read HERE
-- fails OPEN — it answers false, and false is the answer that stamps the row this
-- predicate exists to leave alone. No role holds EXECUTE; the migration session
-- that defines it reaches it as the owner, and REVOKE below keeps it out of every
-- read-time path for good (a postcondition asserts no hour-pricing body names it).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.project_author_books_elsewhere(
  p_created_by uuid,
  p_studio_id  uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS author_seat
    JOIN public.organizations AS other_studio
      ON other_studio.id = author_seat.organization_id
    WHERE author_seat.user_id = p_created_by
      AND author_seat.status  = 'active'
      AND author_seat.role   <> 'guest'
      AND other_studio.type   = 'design_studio'
      AND other_studio.status = 'active'
      AND other_studio.id IS DISTINCT FROM p_studio_id
  );
$$;

COMMENT ON FUNCTION public.project_author_books_elsewhere(uuid, uuid) IS
  'W2-R12-01: the ONE key on 00620''s OWNED tier. True where the project''s AUTHOR '
  '(projects.created_by) holds an active, non-guest seat in an active design_studio '
  'OTHER than the studio being written — where the project visibly belongs to '
  'another studio''s book. 00620 writes an OWNED-tier answer only where this is '
  'false, so a designer who has LEFT her employer (W2-R9-01 probe C / D2) before '
  'the ship is not handed that employer''s legacy client work, which 00606''s bound '
  '(b) would then make final with no arm for the employer to repair (HT-3-g(3)). '
  'The EMPLOYER tier is not keyed on it: a single employer seat IS the book the '
  'project belongs to, whoever opened it. NOT HT-3-f(2), which asked '
  'created_by = designer_id and refused the honest principal whose own assistant '
  'opened her project; this asks whether the AUTHOR stands elsewhere, and keeps both '
  'honest shapes. Used by migration 00620 and by nothing that prices an hour '
  '(HT-3-g(1)).';

-- Nobody calls this but the migration that defines it.
REVOKE ALL ON FUNCTION public.project_author_books_elsewhere(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $legacystamp$
DECLARE
  v_null_before integer := 0;
  v_stamped     integer := 0;
  v_null_after  integer := 0;
  v_left_author integer := 0;
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
  --
  -- The last predicate is W2-R12-01's key, and it BINDS WHICH TIER ANSWERED: an
  -- 'employer' answer is written unconditionally, an 'owned' answer only where the
  -- project's AUTHOR does not stand in another studio. Without it, a designer who
  -- left her employer before this migration ran would be handed that employer's
  -- whole legacy book, finally and with no arm of the employer's to undo it.
  WITH tiered AS (
    SELECT project.id         AS project_id,
           project.created_by AS author_id,
           answer.studio_id,
           answer.tier
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
     AND project.studio_id IS NULL
     AND (
       tiered.tier = 'employer'
       OR NOT public.project_author_books_elsewhere(tiered.author_id, tiered.studio_id)
     );
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  -- How many rows the key itself left behind, counted AFTER the statement (they are
  -- still NULL), so the ship sees the cost as a number rather than as a sentence.
  SELECT count(*) INTO v_left_author
  FROM public.projects AS project
  CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
  WHERE project.studio_id IS NULL
    AND project.designer_id IS NOT NULL
    AND answer.tier = 'owned'
    AND public.project_author_books_elsewhere(project.created_by, answer.studio_id);

  SELECT count(*) INTO v_null_after
  FROM public.projects
  WHERE studio_id IS NULL;

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_after, v_rate_sum_after
  FROM public.project_time_entries;

  RAISE NOTICE '00620 HT-3-g(2) one-off legacy stamp: % projects carried studio_id '
               'NULL; % stamped from HT-3-b''s tier rule; % left NULL (an ambiguous '
               'or empty tier — they price ''none'' until an owner/admin of a studio '
               'that EMPLOYS the designer stamps them, HT-3-g(3)). Of those, % were '
               'left by W2-R12-01''s key: the designer''s OWNED tier answered, but '
               'the project''s AUTHOR stands in another studio, so the row belongs to '
               'a book this migration will not reassign (fifth HT-3-g cost note).',
               v_null_before, v_stamped, v_null_after, v_left_author;

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
  --     the statement twice: after this migration there is no project this file was
  --     willing to stamp whose column is still NULL, so a replay matches no row.
  --     The predicate is the UPDATE's own, W2-R12-01's key included — a row the key
  --     deliberately left is not a row the statement failed to reach, and asserting
  --     the unkeyed form here would fail the ship over the cost the key buys.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
      AND answer.studio_id IS NOT NULL
      AND (
        answer.tier = 'employer'
        OR NOT public.project_author_books_elsewhere(project.created_by, answer.studio_id)
      )
  ), '00620: every NULL-studio project whose designer''s tier ANSWERS and whose '
     'AUTHOR stands in no other studio must have been stamped — one left behind '
     'means the UPDATE''s predicate and this assertion disagree, and it would price '
     '''none'' for ever with no act available to its own studio (HT-3-g(3) refuses '
     'an owned-tier stamp to everybody)';

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

  -- (b2) W2-R12-01: the owned tier's key EXISTS, is a DEFINER read (an INVOKER read
  --      of organization_members fails OPEN here — it answers false, and false is
  --      what stamps the row), and is reachable by NO role, so it cannot become a
  --      read-time key in a later hand.
  ASSERT to_regprocedure('public.project_author_books_elsewhere(uuid,uuid)') IS NOT NULL,
    '00620: W2-R12-01''s key must exist. Without it this one statement hands a '
    'designer who LEFT her employer before the ship that employer''s whole legacy '
    'book — finally (00606 bound (b)) and with no arm of the employer''s to repair '
    'it (HT-3-g(3)). Measured 1/1 in both of W2-R9-01''s statement forms, with a '
    'negative control in an identical fixture';
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.project_author_books_elsewhere(uuid,uuid)')),
    '00620: and it must be SECURITY DEFINER — an INVOKER read of '
    'organization_members returns a partial seat set, which here answers false and '
    'stamps the row the key exists to leave alone';
  ASSERT NOT (
    COALESCE(has_function_privilege('authenticated',
      'public.project_author_books_elsewhere(uuid,uuid)', 'EXECUTE'), false)
    OR COALESCE(has_function_privilege('anon',
      'public.project_author_books_elsewhere(uuid,uuid)', 'EXECUTE'), false)
    OR COALESCE(has_function_privilege('service_role',
      'public.project_author_books_elsewhere(uuid,uuid)', 'EXECUTE'), false)
  ), '00620: and no role may hold EXECUTE on it — it is a migration-time key, and a '
     'reachable one is a derivation waiting to be wired into a read path (HT-3-g(1))';

  -- (c2) HT-3-g(1) again, of the NEW key: no body that prices an hour may name it.
  ASSERT (
    SELECT lower(pg_get_functiondef(
             'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure))
             NOT LIKE '%project_author_books_elsewhere%'
  ) AND (
    SELECT lower(pg_get_functiondef(
             'public.project_pricing_studio_id(uuid)'::regprocedure))
             NOT LIKE '%project_author_books_elsewhere%'
  ), '00620: W2-R12-01''s key is for a stamp that runs ONCE, never for an answer '
     'recomputed when an hour is priced — created_by is immutable, but the AUTHOR''s '
     'seats are not, and a read-time call would hand the lever to whoever can seat '
     'or unseat him';

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
