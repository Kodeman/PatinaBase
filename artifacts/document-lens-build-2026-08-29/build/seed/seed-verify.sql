-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY: the-document-lens-seed.sql — "the long paper" (project …d5)
--
-- One query, one PASS/FAIL row per check. Run after the seed:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres < artifacts/document-lens-build-2026-08-29/build/seed/seed-verify.sql
--
-- The margin-items checks SELECT from the `margin_items` VIEW itself (00194 /
-- 00282) rather than re-deriving the 3/4 split from source tables, per the
-- ARCHITECT's A-02 finding — this is the same read the Margin column/sheet
-- uses.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
  p AS (SELECT 'b0000000-0000-0000-0000-0000000000d5'::uuid AS id),
  rooms AS (
    SELECT count(*) AS n FROM public.project_rooms, p WHERE project_id = p.id
  ),
  lines AS (
    SELECT count(*) AS n FROM public.project_ffe_items, p WHERE project_id = p.id
  ),
  lines_product AS (
    SELECT count(*) AS n FROM public.project_ffe_items, p
     WHERE project_id = p.id AND product_id IS NOT NULL
  ),
  unspecified AS (
    -- "unspecified" = nothing chosen yet AND no decision pending on it (the
    -- COM-blocked reading-chair line is also product_id IS NULL/$0, but it is
    -- a distinct concept — blocked_by_decision_id ties it to the COM decision
    -- rather than the plain "hasn't been specced yet" state).
    SELECT count(*) AS n FROM public.project_ffe_items, p
     WHERE project_id = p.id AND status = 'specified' AND product_id IS NULL
       AND (unit_price_cents IS NULL OR unit_price_cents = 0)
       AND blocked_by_decision_id IS NULL
  ),
  damaged AS (
    SELECT count(*) AS n FROM public.project_ffe_items, p
     WHERE project_id = p.id AND blocked = true AND status = 'delivered'
  ),
  damage_claims_open AS (
    -- The check above reads project_ffe_items only, which is a FALSE POSITIVE
    -- for the stamp: deriveLineStamp returns 'damaged' from the item's
    -- `item_claims` embed (damage_claims!ffe_item_id) in state drafted /
    -- vendor_notified, never from `blocked`. This is the check that binds.
    SELECT count(*) AS n
      FROM public.damage_claims dc
      JOIN public.project_ffe_items i ON i.id = dc.ffe_item_id, p
     WHERE i.project_id = p.id
       AND dc.state IN ('drafted', 'vendor_notified')
  ),
  blocked_lines AS (
    -- Two: the damaged console and the COM line. A blocked_by_decision_id
    -- without blocked = true never reaches the 'decision_due' stamp.
    SELECT count(*) AS n FROM public.project_ffe_items, p
     WHERE project_id = p.id AND blocked = true
  ),
  install_milestone AS (
    SELECT max(m.anchor_date) AS d
      FROM public.schedule_milestones m
      JOIN public.project_phases ph ON ph.id = m.phase_id, p
     WHERE ph.project_id = p.id AND m.name = 'Install day'
  ),
  overdue_approvals AS (
    SELECT count(*) AS n FROM public.client_decisions, p
     WHERE project_id = p.id AND status = 'pending'
       AND due_date IS NOT NULL AND due_date < now()
  ),
  pos_total AS (
    SELECT count(*) AS n FROM public.purchase_orders, p WHERE project_id = p.id
  ),
  po_unacked_14d AS (
    SELECT count(*) AS n FROM public.purchase_orders, p
     WHERE project_id = p.id AND status <> 'cancelled'
       AND acknowledged_at IS NULL
       AND created_at <= now() - interval '14 days'
  ),
  po_clean_delivered AS (
    SELECT count(*) AS n FROM public.purchase_orders, p
     WHERE project_id = p.id AND status = 'delivered'
  ),
  receiving_non_clean AS (
    SELECT count(*) AS n FROM public.receiving_inspections ri
    JOIN public.purchase_orders po ON po.id = ri.purchase_order_id, p
    WHERE po.project_id = p.id AND ri.outcome <> 'clean'
  ),
  margin AS (
    SELECT
      count(*) FILTER (WHERE anchor_kind = 'line')                        AS beside_pieces,
      count(*) FILTER (WHERE anchor_kind IN ('letterhead', 'section'))    AS whole_job,
      count(*)                                                            AS total
    FROM public.margin_items, p
    -- `kind <> 'time'` because the PRODUCT counts it that way:
    -- `use-margin-sheet.ts` filters time out before it counts, so the sheet's
    -- head reads `Margin · 7` while the raw view can read more. Without the
    -- filter this check fails on any local stack where the studio timer has
    -- ever run — a `project_time_entries` row the seed never wrote and the
    -- margin never prints. The seed deliberately creates none.
    WHERE project_id = p.id AND kind <> 'time'
  ),
  oneline AS (
    -- D-B48: the ONE-LINE-name paper. `…d5`'s name wraps to two lines at 390;
    -- the 390 gates are chosen by measured line count, so the spec needs the
    -- other arm. `Aspen Loft` is 10 characters — inside the ~11 a 32px
    -- Playfair spends on a 327px measure.
    SELECT count(*) AS n FROM public.projects
     WHERE id = 'b0000000-0000-0000-0000-0000000000d7'::uuid
       AND name = 'Aspen Loft' AND length(name) <= 11
  ),
  oneline_phases AS (
    -- W5F-07: the letterhead's vitals read the project's PHASES, so the
    -- one-line paper carries the same five-phase main lane `…d5` does — else
    -- its letterhead is a different shape from the one the 390 gate compares
    -- against.
    SELECT count(*) AS n FROM public.project_phases
     WHERE project_id = 'b0000000-0000-0000-0000-0000000000d7'::uuid
  ),
  prework AS (
    SELECT count(*) AS n FROM public.proposals
     WHERE id = 'b0000000-0000-0000-0000-0000000000d6'::uuid
       AND status = 'sent' AND viewed_at IS NULL
  )
SELECT check_name, actual, expected,
       CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT 'rooms >= 4'                          AS check_name, n::text AS actual, '>= 4'   AS expected, n >= 4    AS pass FROM rooms
  UNION ALL
  SELECT 'lines >= 60',                             n::text,          '>= 60',  n >= 60   FROM lines
  UNION ALL
  SELECT 'lines with product >= 40',                n::text,          '>= 40',  n >= 40   FROM lines_product
  UNION ALL
  SELECT 'unspecified = 2',                         n::text,          '= 2',    n = 2     FROM unspecified
  UNION ALL
  SELECT 'damaged = 1',                             n::text,          '= 1',    n = 1     FROM damaged
  UNION ALL
  SELECT 'open damage_claims on a line of this project = 1', n::text,  '= 1',    n = 1     FROM damage_claims_open
  UNION ALL
  SELECT 'blocked lines = 2 (console + COM)',        n::text,          '= 2',    n = 2     FROM blocked_lines
  UNION ALL
  SELECT 'install milestone = current_date + 21',    coalesce(d::text, '(none)'),
                                                     (CURRENT_DATE + 21)::text,
                                                     d = CURRENT_DATE + 21           FROM install_milestone
  UNION ALL
  SELECT 'overdue approvals = 2',                   n::text,          '= 2',    n = 2     FROM overdue_approvals
  UNION ALL
  SELECT 'purchase orders >= 3',                    n::text,          '>= 3',   n >= 3    FROM pos_total
  UNION ALL
  SELECT 'PO unacknowledged >= 14d = 1',             n::text,         '= 1',    n = 1     FROM po_unacked_14d
  UNION ALL
  SELECT 'a separate PO reaches clean-delivered >= 1', n::text,       '>= 1',   n >= 1    FROM po_clean_delivered
  UNION ALL
  SELECT 'a non-clean receiving_inspections row exists', n::text,     '>= 1',   n >= 1    FROM receiving_non_clean
  UNION ALL
  SELECT 'margin_items beside Pieces (anchor=line) = 3', beside_pieces::text, '= 3', beside_pieces = 3 FROM margin
  UNION ALL
  SELECT 'margin_items whole job (anchor=letterhead/section) = 4', whole_job::text, '= 4', whole_job = 4 FROM margin
  UNION ALL
  SELECT 'margin_items total = 7',                 total::text,       '= 7',    total = 7 FROM margin
  UNION ALL
  SELECT 'pre-work doc d6 exists (sent, unopened)', n::text,          '= 1',    n = 1     FROM prework
  UNION ALL
  SELECT 'one-line-name paper d7 exists (Aspen Loft, <= 11 chars)', n::text, '= 1', n = 1 FROM oneline
  UNION ALL
  SELECT 'one-line paper d7 carries the 5-phase main lane', n::text, '= 5', n = 5 FROM oneline_phases
) checks
ORDER BY check_name;
