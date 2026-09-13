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
-- migration must hand her own studio, and leg (e) of
-- supabase/tests/billing/legacy_project_studio_stamp_test.sql measures exactly that
-- shape through the same body this file calls — `FAIL e1` on the tier answer and
-- `FAIL g5` on the stamped column. (W2-R13-04: this sentence cited a case "(am)"
-- through round 12. That file's case letters are a1 b1 c1 d1 e1 f1 g0…g12a h1…h13 and
-- it has no (am); (am) lives in supabase/tests/rls/time_entry_studio_stamp_test.sql
-- and measures W2-R11-01 form G. The banner is what the next hand reads to find the
-- measurement, so the citation is the whole of its value.)
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
--     studio's book — by its AUTHOR's standing (W2-R12-01, above) or by its own
--     ROSTER (W2-R13-01, the round-13 section below). Those rows are left NULL too,
--     and the NOTICE counts each key separately so the ship can see how many there
--     were and which key left them.
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
-- ── ROUND 13 — HT-3-g AMENDED part (a): THE ROSTER KEY ──────────────────────
-- (AMENDED BY THE ORCHESTRATOR 2026-09-12, resolving W2-R13-01. Flagged to Kody.)
--
--   *"(a) ROSTER KEY on 00620's OWNED tier: a NULL-studio legacy project is stamped
--   to the designer's owned studio only if no other user on its
--   project_team_members roster holds an active non-guest seat in a studio the
--   designer does NOT own (a roster carrying another studio's people is ambiguous →
--   left NULL). The employer tier stays unkeyed by roster. Report the counts per
--   tier and per key in the NOTICE."*
--
-- WHY A SECOND KEY. W2-R13-01 measured the author key above to be a question about a
-- PERSON, and so as movable as that person: it is ALREADY false on four of the five
-- author standings a legacy row can have (a seatless author, a guest seat, a seat in a
-- suspended studio, a seat in a non-design_studio org), and where the author is a
-- colleague she administers she can make it false herself in one statement
-- (`Org admins can update members` setting his row status = 'removed', or role =
-- 'guest', or deleting it). The key narrowed W2-R12-01's population; it did not close
-- it. The roster key is the round-13 review's PREFERRED closure, and its virtue is
-- that it asks about the PROJECT'S OWN BOOK rather than about anybody's standing: who
-- else is on this project, and do they answer to a studio this designer does not own.
-- On the realistic legacy row — a studio's client work, with that studio's people on
-- the roster — it is the fact neither she nor the author can move without touching
-- somebody else's seat.
--
-- BOTH KEYS STAND, and the owned tier must pass BOTH. The author key is a ruling in
-- force (HT-3-g AMENDED, round 12) and it reaches a row the roster key does not: a
-- project with an EMPTY roster whose AUTHOR books elsewhere — which is case (h)'s own
-- fixture. Dropping it to "replace" it would re-open exactly the shape round 12
-- closed. They are reported separately in the NOTICE for the same reason.
--
-- WHAT IT STILL DOES NOT REACH, measured and recorded rather than claimed closed —
-- HT-3-g AMENDED part (c) grades each of these a NOTE — RESIDUAL because each needs an
-- account to leave or remove a SEAT:
--   · FORM S (W2-R13-01): a legacy project whose roster carries nobody but her and
--     whose author holds no live seat anywhere (an ex-contractor, a platform hand, an
--     assistant whose seat somebody closed long ago). She leaves her own employer seat
--     in ONE statement (`Members can leave`) and both keys are silent, so the row is
--     stamped to the workspace she owns.
--   · FORM H (W2-R13-01): where the author IS a colleague she administers, she sets
--     HIS seat status = 'removed' and then her own. Both keys read his seat, so both
--     go silent together — the roster key cannot help here by construction.
-- THE REMEDY, which is why these are residuals rather than takings without end:
-- HT-3-g AMENDED part (b) gives 00606's stamp a REMEDY ARM — the project's CURRENT
-- designer, where she is the OWNER of the studio she names, may stamp AND OVERWRITE —
-- so an employer recovers by reassign_project_lead to its own owner followed by one
-- stamp. MEASURED, and it is a partial remedy: the stamp half recovers the money
-- completely (the column moves, an audit row records both studios, and the designer's
-- next hour prices from the employer's card again), but the REASSIGN half is refused
-- to the employer acting alone — reassign_project_lead (00399) is pinned to the
-- project's CURRENT studio_id and needs both the outgoing and the incoming lead seated
-- THERE, which after a taking is the taker's own workspace. Cases (k) and (l) of
-- supabase/tests/billing/legacy_project_studio_stamp_test.sql measure the whole chain.
--
-- Lineage: nothing is redefined. This file adds TWO objects — the W2-R12-01 author
-- predicate and the W2-R13-01 roster predicate below, each REVOKEd from every role so
-- only the migration role that defines them can reach them — no policy and no column,
-- plus one bounded UPDATE and its proofs.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- W2-R13-01 — THE OWNED TIER'S SECOND KEY: DOES THIS PROJECT'S ROSTER ANSWER TO
-- A STUDIO SHE DOES NOT OWN?
--
-- HT-3-g AMENDED (a) (orchestrator 2026-09-12). True where some user on the
-- project's live `project_team_members` roster OTHER THAN the designer holds an
-- active, non-guest seat in an active design_studio that the designer does NOT own
-- — i.e. where the project's own working party answers to somebody else's book, so
-- an OWNED-tier answer must not be written onto it.
--
-- Asked of the PROJECT rather than of a person, which is the whole point: the
-- author key above is false on four of the five author standings and can be made
-- false by one statement where the author is a colleague she administers, whereas a
-- roster carrying another studio's people cannot go quiet without touching those
-- people's seats one at a time.
--
-- `removed_at IS NULL` is the roster, not every row ever written to it: a member
-- taken off the project is not on it, and `is_project_team_member` (00484) reads the
-- same leg. `IS DISTINCT FROM p_designer_id` because the designer's own seats are
-- what the tier rule already answered. "A studio the designer does NOT own" is asked
-- as an owner-seat EXISTS rather than as `<> p_studio_id`, because that is what the
-- ruling says and because it is what keeps the Leah shape: a sole proprietor whose
-- own assistant is on the roster and seated in HER studio is stamped, and would be
-- left NULL by a cruder spelling the moment the assistant held a second seat in
-- another studio of hers.
--
-- SECURITY DEFINER, STABLE, EXECUTE held by no role — for the author key's reasons
-- exactly: an INVOKER read of project_team_members or organization_members returns a
-- PARTIAL set, and a partial read here fails OPEN (it answers false, and false is
-- the answer that stamps the row this predicate exists to leave alone).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.project_roster_books_elsewhere(
  p_project_id  uuid,
  p_designer_id uuid,
  p_studio_id   uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_team_members AS roster
    JOIN public.organization_members AS roster_seat
      ON roster_seat.user_id = roster.user_id
    JOIN public.organizations AS other_studio
      ON other_studio.id = roster_seat.organization_id
    WHERE roster.project_id = p_project_id
      AND roster.removed_at IS NULL
      AND roster.user_id IS DISTINCT FROM p_designer_id
      AND roster_seat.status = 'active'
      AND roster_seat.role  <> 'guest'
      AND other_studio.type   = 'design_studio'
      AND other_studio.status = 'active'
      AND other_studio.id IS DISTINCT FROM p_studio_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS designer_owner_seat
        WHERE designer_owner_seat.organization_id = other_studio.id
          AND designer_owner_seat.user_id        = p_designer_id
          AND designer_owner_seat.status         = 'active'
          AND designer_owner_seat.role           = 'owner'
      )
  );
$$;

COMMENT ON FUNCTION public.project_roster_books_elsewhere(uuid, uuid, uuid) IS
  'HT-3-g AMENDED (a) (orchestrator 2026-09-12, resolving W2-R13-01): the SECOND key '
  'on 00620''s OWNED tier, and the one that asks about the PROJECT rather than about a '
  'person. True where some user on the project''s live project_team_members roster '
  'other than the designer holds an active, non-guest seat in an active design_studio '
  'the designer does NOT own — where the project''s own working party answers to '
  'another studio''s book. 00620 writes an OWNED-tier answer only where this is FALSE '
  'and the author key is false too; the EMPLOYER tier is keyed on neither, a single '
  'employer seat being the book the project belongs to whoever opened it and whoever '
  'works on it. WHY IT WAS NEEDED: the author key alone is already false on four of '
  'the five standings a legacy project''s author can hold, and where the author is a '
  'colleague the designer administers she can make it false in ONE statement '
  '(W2-R13-01 forms S and H). WHAT IT STILL DOES NOT REACH, recorded as residuals '
  'under HT-3-g AMENDED (c): a project whose roster carries nobody but her and whose '
  'author holds no live seat (form S), and the same where she removes the author''s own '
  'seat first (form H) — both keys read that seat. The remedy is the stamp''s REMEDY '
  'ARM (HT-3-g AMENDED (b)). Used by migration 00620 and by nothing that prices an '
  'hour (HT-3-g(1)); EXECUTE held by no role.';

-- Nobody calls this but the migration that defines it.
REVOKE ALL ON FUNCTION public.project_roster_books_elsewhere(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $legacystamp$
DECLARE
  v_null_before integer := 0;
  v_stamped     integer := 0;
  v_null_after  integer := 0;
  -- W2-R13-02: the ship sees the stamp PER TIER and the rows left PER KEY, not one
  -- total. HT-3-g AMENDED (a) names four of these; v_left_author is the fifth and is
  -- round 12's own cost-note (v) number, which the ruling in force requires counted
  -- separately.
  v_stamped_employer integer := 0;
  v_stamped_owned    integer := 0;
  v_left_ambiguous   integer := 0;
  v_left_roster      integer := 0;
  v_left_author      integer := 0;
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
  -- The last predicate is the TWO KEYS, and they BIND WHICH TIER ANSWERED: an
  -- 'employer' answer is written unconditionally, an 'owned' answer only where the
  -- project's AUTHOR does not stand in another studio (W2-R12-01) AND its ROSTER does
  -- not answer to a studio she does not own (W2-R13-01, HT-3-g AMENDED (a)). Without
  -- the first, a designer who left her employer before this migration ran would be
  -- handed that employer's whole legacy book, finally; without the second, the same
  -- holds for every such row whose author simply happens to hold no live seat, which
  -- on a legacy book is the common case rather than the exotic one.
  -- PER TIER (W2-R13-02): the statement RETURNS the tier that wrote each row, so the
  -- split is a fact about the rows actually written rather than a second query that
  -- re-asks the rule afterwards and could answer differently.
  WITH tiered AS (
    SELECT project.id          AS project_id,
           project.created_by  AS author_id,
           project.designer_id AS designer_id,
           answer.studio_id,
           answer.tier
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
  ),
  stamped AS (
    UPDATE public.projects AS project
       SET studio_id = tiered.studio_id
      FROM tiered
     WHERE project.id = tiered.project_id
       AND tiered.studio_id IS NOT NULL
       AND project.studio_id IS NULL
       AND (
         tiered.tier = 'employer'
         OR (
           NOT public.project_author_books_elsewhere(tiered.author_id, tiered.studio_id)
           AND NOT public.project_roster_books_elsewhere(
                     tiered.project_id, tiered.designer_id, tiered.studio_id)
         )
       )
    RETURNING project.id AS project_id, tiered.tier AS tier
  )
  SELECT count(*),
         count(*) FILTER (WHERE stamped.tier = 'employer'),
         count(*) FILTER (WHERE stamped.tier = 'owned')
    INTO v_stamped, v_stamped_employer, v_stamped_owned
  FROM stamped;

  -- PER KEY: the rows still NULL, split by the reason, counted AFTER the statement so
  -- each number is a fact about the end state rather than about the plan. Mutually
  -- exclusive by construction, in this order: the tier answered nothing at all; the
  -- ROSTER key left it; the AUTHOR key left it (the roster key having passed).
  SELECT count(*) INTO v_left_ambiguous
  FROM public.projects AS project
  CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
  WHERE project.studio_id IS NULL
    AND project.designer_id IS NOT NULL
    AND answer.studio_id IS NULL;

  SELECT count(*) INTO v_left_roster
  FROM public.projects AS project
  CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
  WHERE project.studio_id IS NULL
    AND project.designer_id IS NOT NULL
    AND answer.tier = 'owned'
    AND public.project_roster_books_elsewhere(
          project.id, project.designer_id, answer.studio_id);

  SELECT count(*) INTO v_left_author
  FROM public.projects AS project
  CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
  WHERE project.studio_id IS NULL
    AND project.designer_id IS NOT NULL
    AND answer.tier = 'owned'
    AND NOT public.project_roster_books_elsewhere(
              project.id, project.designer_id, answer.studio_id)
    AND public.project_author_books_elsewhere(project.created_by, answer.studio_id);

  SELECT count(*) INTO v_null_after
  FROM public.projects
  WHERE studio_id IS NULL;

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_after, v_rate_sum_after
  FROM public.project_time_entries;

  RAISE NOTICE '00620 HT-3-g(2) one-off legacy stamp: % projects carried studio_id '
               'NULL; % stamped; % left NULL. PER TIER: % stamped from HT-3-b''s '
               'EMPLOYER tier, % from its OWNED tier. PER KEY, of the rows left: % an '
               'ambiguous or empty tier (no studio answered at all — they price '
               '''none'' until an owner/admin of a studio that EMPLOYS the designer '
               'stamps them, HT-3-g(3)); % left by W2-R13-01''s ROSTER key (the OWNED '
               'tier answered, but another studio''s people are on the project''s '
               'roster, HT-3-g AMENDED (a)); % left by W2-R12-01''s AUTHOR key (the '
               'OWNED tier answered and the roster was clear, but the project''s '
               'AUTHOR stands in another studio — the fifth HT-3-g cost note). Any '
               'remainder is a row with no lead designer, which this migration never '
               'considers.',
               v_null_before, v_stamped, v_null_after,
               v_stamped_employer, v_stamped_owned,
               v_left_ambiguous, v_left_roster, v_left_author;

  ASSERT v_stamped = v_stamped_employer + v_stamped_owned,
    '00620: every stamped row was written by one of HT-3-b''s two tiers and the '
    'NOTICE must account for all of them — ' || v_stamped || ' stamped against '
    || v_stamped_employer || ' employer + ' || v_stamped_owned || ' owned';
  ASSERT v_null_after >= v_left_ambiguous + v_left_roster + v_left_author,
    '00620: the per-key counts partition a SUBSET of the rows left NULL (the '
    'remainder being rows with no lead designer), so their sum can never exceed it — '
    || v_null_after || ' left against ' || v_left_ambiguous || ' + ' || v_left_roster
    || ' + ' || v_left_author;
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
  --     The predicate is the UPDATE's own, BOTH keys included — a row a key
  --     deliberately left is not a row the statement failed to reach, and asserting
  --     the unkeyed form here would fail the ship over the cost the keys buy.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
      AND answer.studio_id IS NOT NULL
      AND (
        answer.tier = 'employer'
        OR (
          NOT public.project_author_books_elsewhere(project.created_by, answer.studio_id)
          AND NOT public.project_roster_books_elsewhere(
                    project.id, project.designer_id, answer.studio_id)
        )
      )
  ), '00620: every NULL-studio project whose designer''s tier ANSWERS, whose AUTHOR '
     'stands in no other studio and whose ROSTER answers to no other studio must have '
     'been stamped — one left behind means the UPDATE''s predicate and this assertion '
     'disagree, and it would price ''none'' for ever with no act available to its own '
     'studio (HT-3-g(3) refuses an owned-tier stamp to everybody; HT-3-g AMENDED (b)''s '
     'remedy arm needs a LEAD who owns the studio, which is not the shape here)';

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

  -- (b3) HT-3-g AMENDED (a), W2-R13-01: the ROSTER key exists, is DEFINER for the
  --      same fail-open reason, and is reachable by no role either. BOTH keys stand:
  --      the owned tier passes only where both are false, and dropping the author key
  --      to "replace" it with this one would re-open case (h)'s own shape (an empty
  --      roster whose AUTHOR books elsewhere).
  ASSERT to_regprocedure('public.project_roster_books_elsewhere(uuid,uuid,uuid)') IS NOT NULL,
    '00620: HT-3-g AMENDED (a)''s roster key must exist. Without it the author key is '
    'the only thing standing between a designer who leaves her own seat and every '
    'legacy project of a studio she worked for whose author happens to hold no live '
    'seat — which on a legacy book is the common case (W2-R13-01 form S, ONE statement '
    'by one account)';
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.project_roster_books_elsewhere(uuid,uuid,uuid)')),
    '00620: and it must be SECURITY DEFINER — an INVOKER read of project_team_members '
    'or organization_members returns a partial set, which here answers false and '
    'stamps the row the key exists to leave alone';
  ASSERT (SELECT prosrc LIKE '%roster.removed_at IS NULL%'
             AND prosrc LIKE '%roster.user_id IS DISTINCT FROM p_designer_id%'
             AND prosrc LIKE '%designer_owner_seat.role           = ''owner''%'
          FROM pg_proc
          WHERE oid = to_regprocedure('public.project_roster_books_elsewhere(uuid,uuid,uuid)')),
    '00620: and the roster key asks HT-3-g AMENDED (a)''s question exactly — the LIVE '
    'roster (removed_at IS NULL, the same leg is_project_team_member reads), users '
    'OTHER than the designer (her own seats are what the tier rule already answered), '
    'and studios the designer does NOT OWN (asked as an owner-seat EXISTS, which is '
    'what keeps the sole proprietor whose own assistant is on the roster)';
  ASSERT NOT (
    COALESCE(has_function_privilege('authenticated',
      'public.project_roster_books_elsewhere(uuid,uuid,uuid)', 'EXECUTE'), false)
    OR COALESCE(has_function_privilege('anon',
      'public.project_roster_books_elsewhere(uuid,uuid,uuid)', 'EXECUTE'), false)
    OR COALESCE(has_function_privilege('service_role',
      'public.project_roster_books_elsewhere(uuid,uuid,uuid)', 'EXECUTE'), false)
  ), '00620: and no role may hold EXECUTE on the roster key either — a reachable one '
     'is a read-time derivation, and a roster is edited far more often than a seat';

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
  ASSERT (
    SELECT lower(pg_get_functiondef(
             'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure))
             NOT LIKE '%project_roster_books_elsewhere%'
  ) AND (
    SELECT lower(pg_get_functiondef(
             'public.project_pricing_studio_id(uuid)'::regprocedure))
             NOT LIKE '%project_roster_books_elsewhere%'
  ), '00620: and the ROSTER key is for the same one-off stamp and nothing else. A '
     'roster is edited by a lead designer on an ordinary afternoon (00177''s `Lead '
     'designers manage team members` policy), so read at pricing time it would be the '
     'most movable lever in the program';

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
