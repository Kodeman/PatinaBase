-- ═══════════════════════════════════════════════════════════════════════════
-- 00634 — People room CRM · W3/P2 (r19 MAJOR-1): CLOSING A SEAT ENDS THE
--         MONEY IT CARRIED
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11), W3 adversarial
-- migration review round 19 §2, filed at `00629:1692`.
--
-- ── THE SENTENCE THIS FILE MAKES TRUE ─────────────────────────────────────
-- 00629's OPEN-SEATS-ONLY carve-out on `merge_seat_collision` justifies itself
-- with one clause:
--
--     "A closed seat beside a live one of the same kind states no second money
--      fact — ITS GRANT WAS ENDED AT THE CLOSE —"
--
-- Nothing made that rule. `useCloseProjectPartySeat` (the room's own "Close
-- this seat", packages/supabase/src/hooks/use-coordination.ts) writes exactly
-- three columns — `stage`, `off_job_at`, `off_job_reason` — and never touches
-- `project_party_authority`. The only closer of a grant anywhere was
-- `set_household_threshold()` (00632:713-716), which runs only when somebody
-- touches a household FIGURE and only over grants that household sourced; a
-- grant written from the agreement (R-J's "Confirm from the agreement",
-- source_clause 'agreement §4') had no closer at all.
--
-- So `merge_seat_collision`'s own HINT — "Close one of these two seats first,
-- then merge." — named a repair that produced the state the refusal exists to
-- prevent. Measured on a freshly reset database, one transaction, ROLLBACKed,
-- with room acts only (build/probe-r19-a-closed-seat-two-figures.sql): the
-- fold is refused; the room takes exactly the repair the HINT names; the
-- closed seat's money grant still reads 250000 with `effective_to` NULL; the
-- fold then goes through; and the survivor comes out holding TWO client_rep
-- seats on ONE job, one open carrying the agreement's $10,000 and one closed
-- carrying the household's $2,500, BOTH GRANTS OPEN. The Call Sheet bands both
-- into the Client side (`callSheetProjection()` short-circuits on kind before
-- the window rule) and `authorityPhrase` prints a present-tense figure per
-- seat, so the sheet prints "Signs money to $10,000." beside "Signs money to
-- $2,500." for one human on one job — r18 MAJOR-1's own harm statement
-- (00629:1668-1678) word for word, reached by following the refusal's own
-- instruction. The household band splits from the roster the same way:
-- `useProjectHousehold` picks the first OPEN seat per (card, kind), reads the
-- $10,000 and prints "…recorded outside the household, and that figure
-- stands." while a row two regions down prints $2,500.
--
-- ── THE SHAPE TAKEN, AND WHY ──────────────────────────────────────────────
-- Of the three the review left open — end the grant at the close, widen the
-- merge pre-check, or name the collision on the face after the fold — this is
-- the first: ONE RULE, not a merge-shaped exception. It is 00624's own shape
-- for ending a delegation ("Delegations end (CS5-24). A delegation during
-- travel is a row, not an edit.") and it is verbatim what
-- `set_household_threshold()` already does one file over:
--
--     effective_to = GREATEST(effective_from, <the day the seat closed>)
--
-- The row keeps its record, its figure, its source clause and its dates; only
-- its OPENNESS ends, on the day the seat did. Nothing is deleted, so R-BN's
-- "a merge never deletes a typed fact" and PR-n's "choosing which grant
-- survives is the principal's ruling" both stay intact — the studio's own act
-- of closing the seat is what ends it, not the fold.
--
-- The trigger fires on the CLOSE and only on the close (`off_job_at` moving
-- from NULL to a date), which is the transition the review names. R-BR's
-- correction — a bid outcome moved away from 'withdrawn', which clears
-- `off_job_at` — deliberately does NOT re-open a grant: a delegation ends as a
-- row, and re-opening one is its own named act with its own consequence
-- sentence, exactly as re-opening a hand-closed seat is.
--
-- LINEAGE: 00624 (project_party_authority, effective_to, CS5-24) → 00629
-- (merge_seat_collision, r18 MAJOR-1) → 00632:713-716 (set_household_threshold
-- ending a closed seat's grant, r15 MAJOR-1) → 00634.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the rule ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER because the act that fires it is an ordinary studio
-- member's "Close this seat" and the grant rows it ends sit behind
-- project_party_authority's own RLS (00624). `search_path` pinned, every
-- relation schema-qualified.
CREATE OR REPLACE FUNCTION public.end_party_authority_at_seat_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.project_party_authority
     SET effective_to = GREATEST(effective_from, NEW.off_job_at),
         updated_at   = now()
   WHERE engagement_id = NEW.id
     AND effective_to IS NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.end_party_authority_at_seat_close()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.end_party_authority_at_seat_close() IS
  'AFTER UPDATE OF off_job_at on project_parties, on the close only (NULL -> a '
  'date): every open grant the seat carried ends on the day the seat did, '
  'effective_to = GREATEST(effective_from, off_job_at) — 00632:713-716''s own '
  'shape, CS5-24. Makes 00629''s OPEN-SEATS-ONLY carve-out true: a closed seat '
  'really does state no second live money fact, so the repair '
  'merge_seat_collision''s HINT names can no longer leave one human holding '
  'two open money grants on one job (r19 MAJOR-1).';

DROP TRIGGER IF EXISTS end_party_authority_at_seat_close_trg ON public.project_parties;
CREATE TRIGGER end_party_authority_at_seat_close_trg
  AFTER UPDATE OF off_job_at
  ON public.project_parties
  FOR EACH ROW
  WHEN (OLD.off_job_at IS NULL AND NEW.off_job_at IS NOT NULL)
  EXECUTE FUNCTION public.end_party_authority_at_seat_close();

-- ── the population already standing ───────────────────────────────────────
-- Every seat closed before this file existed still carries whatever grants it
-- held, open. The same formula, run once; idempotent, because a second run
-- finds no `effective_to IS NULL` row left to end.
DO $$
DECLARE
  v_ended integer;
  v_left  integer;
BEGIN
  UPDATE public.project_party_authority pa
     SET effective_to = GREATEST(pa.effective_from, pp.off_job_at),
         updated_at   = now()
    FROM public.project_parties pp
   WHERE pp.id = pa.engagement_id
     AND pp.off_job_at IS NOT NULL
     AND pa.effective_to IS NULL;
  GET DIAGNOSTICS v_ended = ROW_COUNT;

  SELECT count(*) INTO v_left
    FROM public.project_party_authority pa
    JOIN public.project_parties pp ON pp.id = pa.engagement_id
   WHERE pp.off_job_at IS NOT NULL
     AND pa.effective_to IS NULL;

  RAISE NOTICE
    '00634 ended % grant(s) standing open on a seat that had already left the job; % remain open on a closed seat',
    v_ended, v_left;
END $$;
