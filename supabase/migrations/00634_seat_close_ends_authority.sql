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
-- ── AND ONLY THE HAND-CLOSE ACT (r21 MAJOR-2 / R-BS) ──────────────────────
-- `off_job_at` has TWO writers in the room, not one. Beside "Close this seat"
-- (useCloseProjectPartySeat), the Bidding band's "They withdrew" stamps
-- `off_job_at = today` on the transition into `withdrawn`
-- (use-coordination.ts) — which is this trigger's own WHEN clause. So the
-- first draft made the Bidding band a second, undocumented door into this
-- file, and measured (build/probe-r21-a, C2/C3/C4) it did two wrong things:
--
--   (a) a plain member RECORDING what a bidder did was refused
--       `seat_close_money_authority_forbidden` — recording a withdrawal is not
--       a money act, and PR-n says nothing about it; and
--   (b) when a principal took it and then corrected it back, R-BR cleared
--       `off_job_at` and `off_job_reason` while this file deliberately does
--       NOT re-open the grant, so the seat came back to the job, banded live,
--       with its money delegation closed and NO act anywhere in the room able
--       to restore it — the Add sheet opens grants on new seats only, and
--       add_household_member() is client / client_rep only (R-BQ).
--
-- R-BS rules the clamp: this trigger is the HAND-CLOSE act's, and a statement
-- that records a withdrawal is not that act. The WHEN clause below excludes
-- exactly the statement that moves `bid_outcome` INTO 'withdrawn'; every other
-- path that dates a seat — the room's own Close this seat, a migration, a job,
-- service_role — still fires it, so the invariant this file exists for holds
-- on every close act.
--
-- WHAT THE CLAMP LEAVES STANDING, said plainly: a seat dated by a recorded
-- withdrawal keeps its open grants until the principal closes the seat. A
-- withdrawal is the BIDDER's act on the record, not the principal's act on a
-- delegation, and PR-n reserves the second to an owner or an admin. The one
-- reader that would otherwise print a present-tense figure over it —
-- `useProjectAuthority` — already drops a grant whose `effective_to` was
-- stamped by its seat leaving the job and deliberately keeps a grant still
-- OPEN on a closed seat, "because that is a state the room should show rather
-- than hide" (use-project-authority.ts:60-76).
--
-- LINEAGE: 00624 (project_party_authority, effective_to, CS5-24, and the
-- tenant + PR-n legs on its UPDATE policy — w1b r5 MAJOR-3 / r8 BLOCKING-1) →
-- 00629 (merge_seat_collision, r18 MAJOR-1) → 00632:713-716
-- (set_household_threshold ending a closed seat's grant, r15 MAJOR-1) → 00634
-- → 00634 amended in place (r20 BLOCKING-1: the gate stated in the body)
-- → 00634 amended in place (r21 MAJOR-2 / R-BS: clamped to the hand-close act).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the rule ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER because the act that fires it is an ordinary studio
-- member's "Close this seat" and the grant rows it ends sit behind
-- project_party_authority's own RLS (00624). `search_path` pinned, every
-- relation schema-qualified.
--
-- ── AND THE GATE IS STATED IN THE BODY (r20 BLOCKING-1) ───────────────────
-- SECURITY DEFINER bypasses the RLS of the table it writes, so the gate is
-- stated here or it is not stated at all — the posture every other definer in
-- this wave takes (add_household_member 00632:410-416, set_household_threshold
-- 00632:655-666, archive_studio_contact 00629:3300-3307).
--
-- The first draft of this file stated none, and the table that FIRES it is not
-- gated like the table it WRITES:
--
--   project_parties_studio_update (00584:895-903)
--     is_studio_comember(project.designer_id) — no tenant leg, no PR-n leg
--   project_party_authority_studio_update (00624:1017-1041)
--     is_active_studio_member(project_party_recorded_studio(engagement_id))
--     AND is_studio_comember(project_party_designer(engagement_id))
--     AND (scope NOT IN ('money','draw_certify')
--          OR is_org_admin_or_owner(project_party_recorded_studio(...)))
--
-- That second predicate is w1b r5 MAJOR-3 and r8 BLOCKING-1 in policy text:
-- the tenant leg exists because is_studio_comember(designer) is true for a
-- SECOND studio the same designer works for. Measured twice on a freshly reset
-- database, rolled back, with room acts only (build/probe-r20-a-… and
-- build/probe-r20-b-…): a plain `member` who cannot UPDATE a money grant ended
-- it by closing the seat, and so did a plain `member` of the designer's other
-- studio who could not even SELECT the row — a cross-tenant write to another
-- studio's money record.
--
-- THE SHAPE TAKEN IS REFUSAL, not silence. The two alternatives the review
-- left open both break the sentence this file exists to make true: leaving a
-- money grant standing while the seat closes is exactly r19 MAJOR-1's state,
-- and narrowing 00584's own seat policy is far wider than W3. So a caller who
-- may not end what the seat carries may not close the seat either, and hears
-- why. The invariant holds absolutely in every path: NO closed seat carries an
-- open grant.
--
--   * no open grant on the seat            -> nothing to gate, the close lands
--   * auth.uid() IS NULL                   -> a migration, a job, service_role;
--                                             00632:235's own internal-caller
--                                             carve-out, never RLS-gated here
--   * not a member of the recorded studio, or not a co-member of the designer
--                                          -> seat_close_authority_forbidden
--   * an open money / draw_certify grant and the caller is not an owner or an
--     admin of the recorded studio         -> seat_close_money_authority_forbidden
--                                             (PR-n: the principal's to set,
--                                             and the principal's to take away)
CREATE OR REPLACE FUNCTION public.end_party_authority_at_seat_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open      integer;
  v_principal integer;
  v_recorded  uuid;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE scope IN ('money', 'draw_certify'))
    INTO v_open, v_principal
    FROM public.project_party_authority
   WHERE engagement_id = NEW.id
     AND effective_to IS NULL;

  -- A seat carrying no open delegation ends nothing, so it gates nothing.
  IF v_open = 0 THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_recorded := public.project_party_recorded_studio(NEW.id);

    IF NOT (public.is_active_studio_member(v_recorded)
            AND public.is_studio_comember(public.project_party_designer(NEW.id))) THEN
      RAISE EXCEPTION 'seat_close_authority_forbidden'
        USING HINT = 'This seat carries a standing grant recorded in another '
                     'studio''s book. Ask that studio to close the seat.';
    END IF;

    IF v_principal > 0 AND NOT public.is_org_admin_or_owner(v_recorded) THEN
      RAISE EXCEPTION 'seat_close_money_authority_forbidden'
        USING HINT = 'This seat signs for money, and ending that is the '
                     'principal''s to do (PR-n). Ask an owner or an admin of '
                     'the studio to close the seat.';
    END IF;
  END IF;

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
  'AFTER UPDATE OF off_job_at on project_parties, on the HAND-CLOSE act only '
  '(off_job_at NULL -> a date, and not the statement that moves bid_outcome '
  'into ''withdrawn'' — r21 MAJOR-2 / R-BS: recording a withdrawal is the '
  'bidder''s act on the record, not the principal''s act on a delegation, and '
  'a seat dated that way keeps its open grants until the principal closes the '
  'seat): every open grant the seat carried — every scope, not money alone — '
  'ends on the day the seat did, effective_to = GREATEST(effective_from, '
  'off_job_at) — 00632:713-716''s own shape, CS5-24. Makes 00629''s '
  'OPEN-SEATS-ONLY carve-out true: a closed seat really does state no second '
  'live money fact, so the repair merge_seat_collision''s HINT names can no '
  'longer leave one human holding two open money grants on one job (r19 '
  'MAJOR-1). The gate is stated in the body because SECURITY DEFINER bypasses '
  'project_party_authority''s RLS (r20 BLOCKING-1): a signed-in caller must be '
  'an active member of project_party_recorded_studio() and a co-member of the '
  'designer, and an owner or admin of that studio where the seat carries an '
  'open money or draw_certify grant; otherwise the CLOSE ITSELF is refused '
  '(seat_close_authority_forbidden / seat_close_money_authority_forbidden) so '
  'no closed seat can ever carry an open grant.';

-- The WHEN clause is the whole of the clamp (r21 MAJOR-2 / R-BS): the close,
-- and never the statement that records a withdrawal. Both legs are written
-- COALESCE-first because a NULL `bid_outcome` in a bare `=` would make the
-- whole predicate NULL, and a NULL WHEN does not fire — which would take the
-- trigger off every seat that carries no bid at all.
DROP TRIGGER IF EXISTS end_party_authority_at_seat_close_trg ON public.project_parties;
CREATE TRIGGER end_party_authority_at_seat_close_trg
  AFTER UPDATE OF off_job_at
  ON public.project_parties
  FOR EACH ROW
  WHEN (OLD.off_job_at IS NULL
        AND NEW.off_job_at IS NOT NULL
        AND NOT (COALESCE(NEW.bid_outcome, '') = 'withdrawn'
                 AND COALESCE(OLD.bid_outcome, '') <> 'withdrawn'))
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
