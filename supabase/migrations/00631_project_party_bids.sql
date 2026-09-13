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
-- nothing about the bid itself: when the quote is due, what it came in at,
-- who at the firm quoted it, and how long the number holds. Those five facts
-- are this file.
--
-- LINEAGE: 00281 (project_parties) → 00461/00462 (trade_rfq_requests,
-- trade_scope_bids — the proposal-side RFQ rail this backfill reads) → 00624
-- (stage, window, the seat's card pointers) → 00629 (the merged-card guard on
-- the same table) → 00631.
--
-- ── WHY DATE AND NOT TIMESTAMPTZ ──────────────────────────────────────────
-- Every dated fact already on this seat is a `date`: on_site_from, on_site_to,
-- off_job_at, warranty_until (00624). A bid is due on a day and holds until a
-- day; the Call Sheet prints "Due 5 October 2026" and never a clock. The two
-- new dated columns therefore take `date`, keeping one type for the seat's
-- calendar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS bid_due_at             date,
  ADD COLUMN IF NOT EXISTS bid_outcome            text,
  ADD COLUMN IF NOT EXISTS bid_valid_until        date,
  ADD COLUMN IF NOT EXISTS bid_quoted_by_person_id uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bid_amount_cents       integer;

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
  v_org  uuid;
  v_kind text;
  v_gone uuid;
BEGIN
  IF NEW.bid_quoted_by_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org := public.project_tenant_org(NEW.project_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'party_bid_quoted_by_project_has_no_studio'
      USING HINT = 'This project resolves to no studio, so a rolodex card on '
                   'its seats cannot be checked against one.';
  END IF;

  SELECT sc.entity_kind, sc.merged_into INTO v_kind, v_gone
    FROM public.studio_contacts sc
   WHERE sc.id = NEW.bid_quoted_by_person_id
     AND sc.organization_id = v_org;

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
  'a live PERSON card in the studio project_tenant_org() resolves for the job '
  '(the 00624 R-AP shape, plus 00629''s merged-away leg) (00631).';

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
-- WHAT IS DELIBERATELY NOT BACKFILLED, AND WHY
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
latest_rfq AS (
  SELECT DISTINCT ON (r.party_id)
    r.party_id,
    r.status
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
    sb.amount_cents                  AS amount_cents
  FROM strongest_bid sb
  FULL OUTER JOIN latest_rfq lr ON lr.party_id = sb.party_id
)
UPDATE public.project_parties pp
   SET bid_outcome      = m.outcome,
       bid_amount_cents = COALESCE(pp.bid_amount_cents, m.amount_cents)
  FROM mapped m
 WHERE pp.id = m.party_id
   AND m.outcome IS NOT NULL
   AND pp.bid_outcome IS NULL;

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
  RAISE NOTICE '00631 bid backfill: % seat(s) carry a bid_outcome (%)',
    v_total, COALESCE(v_by, 'none');
END $$;
