-- ============================================================================
-- 00160: Fold allowance midpoints into proposal_items.line_total_cents
--
-- Allowance line items (item_type='allowance') carry a budget RANGE
-- (budget_min_cents..budget_max_cents) and no unit price, so they were stored
-- with line_total_cents = 0 and therefore excluded from:
--   * proposals.total_amount        (set to Σ line_total_cents by the app)
--   * the project FF&E budget        (projects.budget_cents = Σ line_total_cents
--                                     in activate_proposal_as_project)
-- even though the Scope Builder's on-screen "Estimated Total" already counted
-- them at their midpoint — so the two figures disagreed.
--
-- Product decision (2026-05-29): allowances DO count toward the proposal value
-- and the project budget, at the MIDPOINT of their range. New allowances now
-- store that midpoint in line_total_cents (see useAddProposalItem). This
-- migration backfills existing allowance rows and recomputes the affected
-- proposals' total_amount, mirroring the app's updateProposalTotal().
--
-- No schema change; data only. Idempotent.
-- ============================================================================

-- 1. Backfill allowance line_total_cents := round((min + max) / 2).
UPDATE proposal_items
   SET line_total_cents = GREATEST(0, round((budget_min_cents + budget_max_cents) / 2.0))::int
 WHERE item_type = 'allowance'
   AND budget_min_cents IS NOT NULL
   AND budget_max_cents IS NOT NULL
   AND line_total_cents IS DISTINCT FROM GREATEST(0, round((budget_min_cents + budget_max_cents) / 2.0))::int;

-- 2. Recompute total_amount = Σ line_total_cents for every proposal that has at
--    least one allowance item (the only rows whose total changed). This matches
--    the invariant the app maintains via updateProposalTotal().
UPDATE proposals p
   SET total_amount = COALESCE((
         SELECT SUM(pi.line_total_cents)
           FROM proposal_items pi
          WHERE pi.proposal_id = p.id
       ), 0)
 WHERE EXISTS (
         SELECT 1
           FROM proposal_items pi2
          WHERE pi2.proposal_id = p.id
            AND pi2.item_type = 'allowance'
       );
