-- ═══════════════════════════════════════════════════════════════════════════
-- 00631 — People room CRM · W3/P2 (4 of 6): the Bidding band's own facts
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) §3.4 (the Call
-- Sheet's Bidding band: "Rivera Finishes · paint · asked 28 Sep 2026 · due
-- 5 Oct 2026 · No response"), §7 (P2 row "project_parties bid fields"), §8
-- (P2: "bid fields and the Bidding band's dates and outcomes"), R-R (a roster
-- row with a bid history prints "Quoted 2 October 2026. Selected 9 October
-- 2026." at both widths) and SPEC §5.4 #9.
--
-- 00624 gave the seat a STAGE — prospect, invited, bidding, declined,
-- no_response, awarded … — which says where a firm is in the ladder. It says
-- nothing about the bid itself: when the studio asked, when the quote is due,
-- when it came back, what it came in at, who at the firm quoted it, how long
-- the number holds, and the day the studio chose. Those eight facts are this
-- file.
--
-- LINEAGE: 00281 (project_parties) → 00461/00462 (trade_rfq_requests,
-- trade_scope_bids — the proposal-side RFQ rail this backfill reads) → 00624
-- (stage, window, the seat's card pointers) → 00629 (the merged-card guard on
-- the same table) → 00631.
--
-- ── WHY DATE AND NOT TIMESTAMPTZ ──────────────────────────────────────────
-- Every dated fact already on this seat is a `date`: on_site_from, on_site_to,
-- off_job_at, warranty_until (00624). A bid is due on a day and holds until a
-- day; the Call Sheet prints "Due 5 October 2026" and never a clock. All five
-- new dated columns therefore take `date`, keeping one type for the seat's
-- calendar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── THE THREE DATED EVENTS, AND WHY THEY ARE COLUMNS ──────────────────────
-- migrations review r1 M-6. `bid_outcome` is a single CURRENT word: it says
-- where the bid stands today and can carry no dated event at all, let alone
-- two on one row. But the acceptance strings this file exists to satisfy are
-- dated events, plural, and they outlive each other:
--
--   SPEC §5.4 #9  "Rivera Finishes · paint · Asked 28 September 2026.
--                  Due 5 October 2026."          (outcome: No response)
--   R-R           "Quoted 2 October 2026. Selected 9 October 2026."
--
-- A row that was asked, then quoted, then selected prints all three, and
-- `bid_outcome` = 'selected' can only ever say the last one. Direction §8's P2
-- row is "bid fields and the Bidding band's DATES and outcomes", plural. So
-- the three moments each take their own `date`, beside `bid_due_at` (when the
-- answer was OWED, which is not when it came) and `bid_valid_until`.
--
-- NO CROSS-DATE CHECK between them, deliberately, where bid_valid_until >=
-- bid_due_at has one: those two are a WINDOW the studio states in advance, and
-- an inverted window is a typo. These three are a RECORD of what happened, and
-- a studio entering them weeks later, out of order, from a paper file is
-- ordinary. A constraint here would refuse an honest correction, and there is
-- no wrong fact on a face behind it.
ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS bid_due_at             date,
  ADD COLUMN IF NOT EXISTS bid_outcome            text,
  ADD COLUMN IF NOT EXISTS bid_valid_until        date,
  ADD COLUMN IF NOT EXISTS bid_quoted_by_person_id uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bid_amount_cents       integer,
  ADD COLUMN IF NOT EXISTS bid_asked_at           date,
  ADD COLUMN IF NOT EXISTS bid_quoted_at          date,
  ADD COLUMN IF NOT EXISTS bid_selected_at        date;

-- Vocabulary as a named constraint so a rerun really does widen it (the
-- 00592/00593/00623 idiom). A CHECK and not an enum: 00624 took the same
-- decision for `stage` and for the same reason.
ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_bid_outcome_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_bid_outcome_check CHECK (
    bid_outcome IS NULL OR bid_outcome IN (
      'asked', 'quoted', 'selected', 'declined', 'no_response', 'withdrawn'
    )
  );

-- Money is integer cents, everywhere in this program.
ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_bid_amount_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_bid_amount_check CHECK (
    bid_amount_cents IS NULL OR bid_amount_cents >= 0
  );

-- A quote cannot expire before it was due.
ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_bid_window_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_bid_window_check CHECK (
    bid_valid_until IS NULL OR bid_due_at IS NULL OR bid_valid_until >= bid_due_at
  );

COMMENT ON COLUMN public.project_parties.bid_outcome IS
  'asked | quoted | selected | declined | no_response | withdrawn — where the '
  'BID stands, distinct from stage, which is where the FIRM stands (00624). '
  'The Bidding band prints it as a state word (direction §3.4, SPEC §5.4 #9) '
  'and R-R prints its dates on a roster row at both widths.';
COMMENT ON COLUMN public.project_parties.bid_due_at IS
  'The day the quote is due. `date`, like every other dated fact on this seat '
  '— the Call Sheet prints "Due 5 October 2026" and never a clock.';
COMMENT ON COLUMN public.project_parties.bid_valid_until IS
  'The day the quoted number stops holding. A bid that has expired is not a '
  'price the studio may still put in a proposal.';
COMMENT ON COLUMN public.project_parties.bid_quoted_by_person_id IS
  'The PERSON card who quoted it — the estimator at the firm, not the firm. '
  'Held to a person card in the project''s own studio rolodex, and to a card '
  'that was not merged away, by assert_party_bid_quoted_by() (the 00624 R-AP '
  'shape).';
COMMENT ON COLUMN public.project_parties.bid_amount_cents IS
  'Integer cents. NULL while the firm has been asked and has not answered.';
COMMENT ON COLUMN public.project_parties.bid_asked_at IS
  'The day the studio ASKED for a price — SPEC §5.4 #9''s "Asked 28 September '
  '2026", which bid_outcome cannot carry because it holds one CURRENT word. '
  'Backfilled from trade_rfq_requests.sent_at.';
COMMENT ON COLUMN public.project_parties.bid_quoted_at IS
  'The day the number CAME BACK — R-R''s "Quoted 2 October 2026". Distinct '
  'from bid_due_at, which is the day it was owed. Backfilled from '
  'trade_rfq_requests.responded_at, else the noted_at of the firm''s own '
  'quoted bid row.';
COMMENT ON COLUMN public.project_parties.bid_selected_at IS
  'The day the studio CHOSE this firm — R-R''s "Selected 9 October 2026". '
  'TYPED BY THE STUDIO, never backfilled: select_trade_scope_bid() '
  '(00423:1450-1510) promotes an EXISTING trade_scope_bids row in place and '
  'never touches its noted_at, and the table carries no updated_at — so the '
  'only date the rail holds for a `selected` row is the day the NUMBER was '
  'written down, not the day the studio chose. Backfilling it printed '
  '"Quoted 2 October 2026. Selected 2 October 2026." on the roster row, the '
  'two dates always identical and the second one a fact nobody recorded '
  '(migrations review r2 B2-3). NULL is the honest answer, the one '
  'bid_due_at already takes.';

-- The Bidding band's read: the seats on one job that carry a bid at all.
CREATE INDEX IF NOT EXISTS idx_project_parties_bid
  ON public.project_parties(project_id, bid_outcome)
  WHERE bid_outcome IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The quoting person must be a person card in this job's own rolodex
-- ═══════════════════════════════════════════════════════════════════════════
-- 00624's R-AP shape, for the one pointer this file adds. A plain FK into
-- studio_contacts permits a COMPANY card where a human is meant, another
-- tenant's card, and a card that 00629 merged away. Written as its own trigger
-- rather than a graft of assert_project_party_cards(): that function is 176
-- lines of tenancy reasoning about three OTHER columns, and two triggers on
-- one event fire in name order with no interaction.
CREATE OR REPLACE FUNCTION public.assert_party_bid_quoted_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org      uuid;
  v_recorded uuid;
  v_kind     text;
  v_gone     uuid;
BEGIN
  IF NEW.bid_quoted_by_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org      := public.project_tenant_org(NEW.project_id);
  v_recorded := public.project_recorded_studio(NEW.project_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'party_bid_quoted_by_project_has_no_studio'
      USING HINT = 'This project resolves to no studio, so a rolodex card on '
                   'its seats cannot be checked against one.';
  END IF;

  -- THE RECORD, NOT THE WRITER (00624:645-655, grafted here in migrations
  -- review r3 W3-R3-2). project_tenant_org() is caller-relative wherever the
  -- project records no studio — R-BD/R-BI's legacy population, five of the
  -- eight seeded projects — so checking the card against it alone checks the
  -- card against the WRITER's own rolodex: a member of a second design studio
  -- the designer of record also belongs to wrote their OWN card onto the
  -- working studio's seat, and this guard accepted it while
  -- assert_project_party_cards() refused the identical write on
  -- studio_contact_id. Who priced the work is a fact about the job's own book,
  -- so it is checked against the studio the project RECORDS, and refused
  -- outright while the project records none.
  IF v_recorded IS NULL THEN
    RAISE EXCEPTION 'party_bid_quoted_by_project_has_no_studio'
      USING HINT = 'This project records no studio, so the estimator who '
                   'priced the work cannot be checked against the job''s own '
                   'rolodex — checked against the writer''s studio instead it '
                   'would let a member of another studio name the seat''s '
                   'estimator. Give the project a studio first.';
  END IF;

  SELECT sc.entity_kind, sc.merged_into INTO v_kind, v_gone
    FROM public.studio_contacts sc
   WHERE sc.id = NEW.bid_quoted_by_person_id
     AND sc.organization_id = v_org
     AND sc.organization_id = v_recorded;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'party_bid_quoted_by_other_studio'
      USING HINT = 'bid_quoted_by_person_id must name a card in the '
                   'project''s own studio rolodex.';
  END IF;
  IF v_kind IS DISTINCT FROM 'person' THEN
    RAISE EXCEPTION 'party_bid_quoted_by_not_a_person'
      USING HINT = 'bid_quoted_by_person_id must name a PERSON card. A firm '
                   'does not price the work; its estimator does.';
  END IF;
  IF v_gone IS NOT NULL THEN
    RAISE EXCEPTION 'party_bid_quoted_by_merged_away'
      USING HINT = 'That rolodex card was merged into ' || v_gone::text || '.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_party_bid_quoted_by()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_party_bid_quoted_by() IS
  'BEFORE INSERT/UPDATE on project_parties: holds bid_quoted_by_person_id to '
  'a live PERSON card in the job''s own studio — project_tenant_org() AND '
  'project_recorded_studio(), the second because the first is caller-relative '
  'where the project records no studio and a member of another studio was '
  'able to write their own card onto the seat (00624''s "THE RECORD, NOT THE '
  'WRITER", grafted in r3 W3-R3-2). Refuses '
  'party_bid_quoted_by_project_has_no_studio while the project records none. '
  'The 00624 R-AP shape, plus 00629''s merged-away leg (00631).';

DROP TRIGGER IF EXISTS assert_party_bid_quoted_by_trg ON public.project_parties;
CREATE TRIGGER assert_party_bid_quoted_by_trg
  BEFORE INSERT OR UPDATE OF bid_quoted_by_person_id
  ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.assert_party_bid_quoted_by();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The backfill — only where the mapping is OBVIOUS
-- ═══════════════════════════════════════════════════════════════════════════
-- The only existing record of a bid in Patina is the proposal-side RFQ rail:
-- trade_rfq_requests (one row per party per proposal: draft | sent |
-- responded | closed, with sent_at / responded_at / closed_at) and
-- trade_scope_bids (amount_cents, status quoted | selected | withdrawn, one
-- row per recorded or returned number). Both name `party_id`, which is a
-- project_parties id, so the join is exact.
--
-- WHAT IS BACKFILLED, AND FROM WHERE
--
--   bid_outcome   trade_scope_bids.status wins where a bid row exists:
--                   selected  -> 'selected'
--                   quoted    -> 'quoted'
--                   withdrawn -> 'withdrawn'
--                 strongest first, then the most recently noted, so a firm
--                 that quoted and was then selected reads 'selected'.
--                 With no bid row, trade_rfq_requests.status answers:
--                   sent      -> 'asked'       (asked, nothing back)
--                   responded -> 'quoted'      (an answer arrived; the number
--                                               is not on the table)
--                 the most recent request per party.
--
--   bid_amount_cents   trade_scope_bids.amount_cents of the row that decided
--                      the outcome. NULL on an 'asked' row by construction.
--
--   bid_asked_at       trade_rfq_requests.sent_at of the most recent request
--                      per party, cast to a date. The day the RFQ went out IS
--                      the day the studio asked; no inference (r1 M-6).
--   bid_quoted_at      trade_rfq_requests.responded_at where the request came
--                      back, else the noted_at of that party's earliest
--                      trade_scope_bids row with status 'quoted' — status
--                      'quoted' and nothing else (r2 B2-3: the CTE used to
--                      read IN ('quoted','selected'), which is how the same
--                      noted_at answered two different columns). Both are
--                      records of a number arriving.
--
-- WHAT IS DELIBERATELY NOT BACKFILLED, AND WHY
--
--   bid_selected_at         no source, however much it looks like one.
--                           select_trade_scope_bid() (00423:1500-1503)
--                           promotes an existing bid row IN PLACE — `UPDATE
--                           trade_scope_bids SET status = 'selected' WHERE id
--                           = p_bid_id` — and never writes noted_at; the table
--                           has no updated_at either. So noted_at on a
--                           `selected` row is the day the NUMBER arrived, and
--                           writing it here made the Call Sheet print "Quoted
--                           2 October 2026. Selected 2 October 2026." — the
--                           two dates identical by construction and the second
--                           one never recorded (r2 B2-3, reproduced by running
--                           these CTEs over one bid row in the shipped shape).
--                           The studio types it; the room prints nothing until
--                           it does.
--
--   bid_due_at              no source. trade_rfq_requests carries `timeline`,
--                           a free-text sentence ("4 weeks from award"), and
--                           no due date anywhere. Parsing prose into a date
--                           the Call Sheet then prints as fact is exactly the
--                           guess this file refuses.
--   bid_valid_until         no source. Nothing in the RFQ rail records how
--                           long a number holds.
--   bid_quoted_by_person_id no source. trade_scope_bids names a PARTY, and a
--                           party is a seat, not the estimator at the firm.
--
--   trade_rfq_requests.status = 'draft'   never sent; there is no bid.
--   trade_rfq_requests.status = 'closed'  AMBIGUOUS, and left NULL. A closed
--                           request may have been declined, gone unanswered,
--                           been withdrawn, or simply been tidied away after
--                           the award. The column has four different words for
--                           those and the record carries none of them.
--
-- GUARDED: `WHERE pp.bid_outcome IS NULL`, so a rerun cannot overwrite an
-- outcome a studio moved by hand — 00624's own posture on the stage backfill.

-- ── project_parties.updated_at MUST NOT MOVE HERE (r12 MAJOR-1) ───────────
-- 00624:800-806 states the obligation this statement owes: "Any future
-- migration that rewrites a project_parties column in bulk owes the same two
-- lines." This is that migration, and it rewrites four columns on every seat
-- the RFQ rail names.
--
-- set_updated_at_project_parties is a BEFORE UPDATE FOR EACH ROW trigger whose
-- body (update_updated_at_column) sets NEW.updated_at := now() unconditionally,
-- so without the brackets every backfilled seat takes updated_at = the deploy
-- instant. updated_at is not bookkeeping on this table: it is the tie-break
-- people_directory's PARTY branch ranks one identity's seats by (00629's
-- DISTINCT ON … pp.updated_at DESC, pp.id), the value that branch emits as
-- last_touch_at, and the same order people_directory_seats' first_value(pp.id)
-- window uses to name person_id (00626 §4). Stamped here, an old bid seat wins
-- the DISTINCT ON outright over the live job's seat: measured on a fresh reset
-- (rolled back) with one uncarded identity holding two seats, the Directory row
-- moved from the live job to the 400-day-old bid job, person_id moved with it,
-- and last_touch_at read the write instant.
--
-- `SET … , updated_at = pp.updated_at` does NOT work — update_updated_at_column()
-- overwrites NEW after the SET list is evaluated (00624's own note).
--
-- Local resets cannot see it: `supabase db reset` runs every migration before
-- any seed, so trade_rfq_requests and trade_scope_bids are empty here and the
-- statement touches 0 rows. Its only real execution is the deploy — which is
-- why the NOTICE below prints the seat count, and why the pin lives in the SQL
-- suite (w3 block 12, w1b block 21's shape) on seats it stages itself.
ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;

WITH strongest_bid AS (
  SELECT DISTINCT ON (b.party_id)
    b.party_id,
    b.status,
    b.amount_cents
  FROM public.trade_scope_bids b
  ORDER BY b.party_id,
           CASE b.status WHEN 'selected' THEN 0
                         WHEN 'quoted'   THEN 1
                         ELSE 2 END,
           b.noted_at DESC,
           b.id
),
-- The day a number first came back, where the RFQ rail did not record a
-- responded_at of its own. EARLIEST, not latest: a second quote is a revision,
-- and "Quoted" names the first answer. Status 'quoted' ONLY — a `selected`
-- row's noted_at is the day its number was written down too, but reading it
-- here is what let one date answer both bid_quoted_at and bid_selected_at, and
-- the comment above already said 'quoted' while the code said otherwise
-- (r2 B2-3 / m2-3).
quoted_bid AS (
  SELECT DISTINCT ON (b.party_id)
    b.party_id,
    b.noted_at
  FROM public.trade_scope_bids b
  WHERE b.status = 'quoted'
  ORDER BY b.party_id, b.noted_at, b.id
),
latest_rfq AS (
  SELECT DISTINCT ON (r.party_id)
    r.party_id,
    r.status,
    r.sent_at,
    r.responded_at
  FROM public.trade_rfq_requests r
  ORDER BY r.party_id, r.created_at DESC, r.id
),
mapped AS (
  SELECT
    COALESCE(sb.party_id, lr.party_id) AS party_id,
    CASE
      WHEN sb.status = 'selected'  THEN 'selected'
      WHEN sb.status = 'quoted'    THEN 'quoted'
      WHEN sb.status = 'withdrawn' THEN 'withdrawn'
      WHEN lr.status = 'sent'      THEN 'asked'
      WHEN lr.status = 'responded' THEN 'quoted'
      ELSE NULL
    END                              AS outcome,
    sb.amount_cents                  AS amount_cents,
    lr.sent_at::date                 AS asked_at,
    COALESCE(lr.responded_at, qb.noted_at)::date AS quoted_at
  FROM strongest_bid sb
  FULL OUTER JOIN latest_rfq lr ON lr.party_id = sb.party_id
  LEFT JOIN quoted_bid   qb ON qb.party_id = COALESCE(sb.party_id, lr.party_id)
)
UPDATE public.project_parties pp
   SET bid_outcome      = m.outcome,
       bid_amount_cents = COALESCE(pp.bid_amount_cents, m.amount_cents),
       -- COALESCE on each, so a studio that already typed one keeps it. The
       -- outcome guard below already means only untouched seats are reached.
       bid_asked_at     = COALESCE(pp.bid_asked_at,    m.asked_at),
       bid_quoted_at    = COALESCE(pp.bid_quoted_at,   m.quoted_at)
  FROM mapped m
 WHERE pp.id = m.party_id
   AND m.outcome IS NOT NULL
   AND pp.bid_outcome IS NULL;

ALTER TABLE public.project_parties ENABLE TRIGGER set_updated_at_project_parties;

DO $$
DECLARE
  v_total integer;
  v_by    text;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.project_parties WHERE bid_outcome IS NOT NULL;
  SELECT string_agg(x.bid_outcome || '=' || x.n, ', ' ORDER BY x.bid_outcome)
    INTO v_by
    FROM (SELECT bid_outcome, count(*) AS n
            FROM public.project_parties
           WHERE bid_outcome IS NOT NULL
           GROUP BY 1) x;
  -- The four bid columns are added by THIS file, so every seat carrying a
  -- bid_outcome now is a seat this backfill wrote: v_total is the affected-seat
  -- count the deploy record wants beside 00628's numbers (r12 MAJOR-1).
  RAISE NOTICE '00631 bid backfill: % seat(s) written by this statement (%) — '
               'updated_at deliberately NOT moved on any of them',
    v_total, COALESCE(v_by, 'none');
END $$;
