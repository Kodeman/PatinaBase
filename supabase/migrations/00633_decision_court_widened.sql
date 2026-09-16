-- ═══════════════════════════════════════════════════════════════════════════
-- 00633 — People room CRM · W3/P2 (6 of 6): the decision court, widened
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) §7 (P2 row
-- `client_decisions.court`), §8 (P2: "decision court widened"), fixture §3
-- ("Architect F-10 — RFI / submittal court (court CHECK has no architect:
-- 00281:167-171)") and G-13.
--
-- F-10 Sam Rowe stamps the drawings and answers every RFI. F-26 Carol Nyström
-- releases the draw. F-27 Ray Thao passes or fails the framing inspection.
-- None of them can hold a decision today: the court vocabulary stops at
-- receiver, so a submittal waiting on the architect sits in the `designer`
-- court and the room says the studio is the one holding it up.
--
-- LINEAGE: 00212 (client_decisions) → 00281:153-175 (the field-kind widening
-- that added gc / vendor / sub / installer / receiver) → 00633.
--
-- ── WHY A WIDENING IS SAFE HERE, RESTATED FROM 00281 ──────────────────────
-- 00281's own header recorded the survey and it still holds: no court-
-- consuming read model carries a hardcoded court pivot.
-- coordination_court_summary GROUPs BY cd.court, so the new courts appear as
-- their own rows; the designer-facing counters filter on court='designer'
-- (items_in_your_court) or on status alone (open_items_count), so the new
-- courts fold into the open count untouched; margin_items and
-- task_blocked_state pass court through as a payload column. Re-grepped
-- before this file was written and unchanged.
--
-- PURELY ADDITIVE: every live row stays valid, because a widened CHECK admits
-- a strict superset. Local ledger at the time of writing: 6 rows, all
-- court='client'.
--
-- project_tasks.owner is deliberately NOT widened. 00281 moved the two
-- together because the five field kinds it added were seats that could own a
-- TASK as well as hold a DECISION. These four are not: an architect, an
-- engineer, an inspector and a lender answer, certify, pass or release — they
-- are the court a decision waits in, never the party the studio assigns a
-- task to. Direction §7's P2 row names client_decisions.court and nothing
-- else, and a vocabulary token no surface writes is the promise on a face
-- 00623's banner refuses.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_decisions
  DROP CONSTRAINT IF EXISTS client_decisions_court_check;
ALTER TABLE public.client_decisions
  ADD CONSTRAINT client_decisions_court_check
    CHECK (court IN (
      -- 00212 / 00281, unchanged
      'designer', 'client', 'gc', 'vendor', 'sub', 'installer', 'receiver',
      -- 00633, PR-f's widened vocabulary reaching the decision ladder
      'architect', 'engineer', 'inspector', 'lender'
    ));

COMMENT ON COLUMN public.client_decisions.court IS
  'Whose court the decision sits in: designer | client | gc | vendor | sub | '
  'installer | receiver (00212, 00281) plus architect | engineer | inspector '
  '| lender (00633). The last four are the fixture''s F-10 (stamps the '
  'drawings, answers RFIs), the structural engineer on a submittal, F-27 '
  '(passes or fails the inspection) and F-26 (releases the draw) — parties '
  'that ANSWER, certify, pass or release. project_tasks.owner is deliberately '
  'not widened with them: they hold a decision, they are never assigned a '
  'task by the studio.';

DO $$
DECLARE
  v_rows text;
BEGIN
  SELECT string_agg(x.court || '=' || x.n, ', ' ORDER BY x.court) INTO v_rows
    FROM (SELECT court, count(*) AS n FROM public.client_decisions GROUP BY 1) x;
  RAISE NOTICE '00633 court widened; ledger unchanged: %', COALESCE(v_rows, 'no rows');
END $$;
