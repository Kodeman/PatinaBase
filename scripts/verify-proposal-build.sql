-- verify-proposal-build.sql
--
-- Run a complete state inspection of a single proposal across every related
-- table touched by the build flow. Run after the proposal-build E2E spec
-- (or after a manual walkthrough) to confirm every addition persisted and is
-- tracked.
--
-- Usage (via local Supabase docker):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v proposal_id="'<uuid>'" -f scripts/verify-proposal-build.sql
--
-- Or with a host psql:
--   psql "$SUPABASE_DB_URL" -v proposal_id="'<uuid>'" -f scripts/verify-proposal-build.sql

\echo '== 1. Status + timestamps =='
SELECT id, status, sent_at, viewed_at, accepted_at, signed_at, signed_by_name,
       total_amount, version, client_id IS NOT NULL AS has_client
FROM proposals
WHERE id = :proposal_id;

\echo
\echo '== 2. Counts by related table =='
SELECT 'sections'   AS rel, count(*) FROM proposal_sections           WHERE proposal_id = :proposal_id
UNION ALL SELECT 'items',         count(*) FROM proposal_items                  WHERE proposal_id = :proposal_id
UNION ALL SELECT 'rooms',         count(*) FROM proposal_scope_rooms            WHERE proposal_id = :proposal_id
UNION ALL SELECT 'phases',        count(*) FROM proposal_phases                 WHERE proposal_id = :proposal_id
UNION ALL SELECT 'exclusions',    count(*) FROM proposal_exclusions             WHERE proposal_id = :proposal_id
UNION ALL SELECT 'milestones',    count(*) FROM proposal_payment_milestones     WHERE proposal_id = :proposal_id
UNION ALL SELECT 'engagement',    count(*) FROM proposal_engagement             WHERE proposal_id = :proposal_id
ORDER BY rel;

\echo
\echo '== 3. Sections by type (body length) =='
SELECT type, title, length(coalesce(body, '')) AS body_chars
FROM proposal_sections
WHERE proposal_id = :proposal_id
ORDER BY sort_order;

\echo
\echo '== 4. Items breakdown by item_type =='
SELECT item_type, count(*) AS items, sum(line_total) AS line_total_cents
FROM proposal_items
WHERE proposal_id = :proposal_id
GROUP BY item_type
ORDER BY item_type;

\echo
\echo '== 5. Milestone percentage sum (should = 100 when scope is complete) =='
SELECT count(*) AS milestones,
       sum(percentage) AS percentage_total,
       sum(amount_cents) AS amount_total_cents
FROM proposal_payment_milestones
WHERE proposal_id = :proposal_id;

\echo
\echo '== 6. Engagement events by type =='
SELECT event_type,
       count(*) AS events,
       min(created_at) AS first_event,
       max(created_at) AS last_event
FROM proposal_engagement
WHERE proposal_id = :proposal_id
GROUP BY event_type
ORDER BY event_type;

\echo
\echo '== 7. Section view durations (engagement detail) =='
SELECT section_type,
       count(*) AS views,
       coalesce(sum(duration_seconds), 0) AS total_seconds
FROM proposal_engagement
WHERE proposal_id = :proposal_id AND event_type = 'section_viewed'
GROUP BY section_type
ORDER BY total_seconds DESC;

\echo
\echo '== 8. FF&E items by type AND source =='
-- Splits each item_type by whether it has a product_id (catalog/capture
-- vs custom) and whether it has the type-specific required columns set.
SELECT item_type,
       count(*) AS total,
       count(*) FILTER (WHERE product_id IS NOT NULL) AS with_product,
       count(*) FILTER (WHERE product_id IS NULL)     AS without_product,
       count(*) FILTER (WHERE budget_min_cents IS NOT NULL AND budget_max_cents IS NOT NULL) AS with_budget_range,
       count(*) FILTER (WHERE ffe_category IS NOT NULL) AS with_category,
       count(*) FILTER (WHERE scope_room_id IS NOT NULL) AS with_room
FROM proposal_items
WHERE proposal_id = :proposal_id
GROUP BY item_type
ORDER BY item_type;

\echo
\echo '== 9. Capture lineage (consumed → proposal_items mapping) =='
-- Every consumed capture targeting this proposal must point at a real
-- proposal_items row. Orphans indicate a broken cascade or RPC bug.
SELECT pc.id AS capture_id,
       pc.status,
       pc.consumed_at,
       pc.consumed_proposal_item_id,
       pi.id IS NOT NULL AS item_exists,
       pi.item_type,
       pi.name AS item_name,
       pi.scope_room_id IS NOT NULL AS has_room
FROM proposal_captures pc
LEFT JOIN proposal_items pi ON pi.id = pc.consumed_proposal_item_id
WHERE pc.proposal_id = :proposal_id
   OR pc.consumed_proposal_item_id IN (
        SELECT id FROM proposal_items WHERE proposal_id = :proposal_id
      )
ORDER BY pc.consumed_at DESC NULLS LAST;

\echo
\echo '== 10. Items missing a scope_room (should be 0 after build) =='
-- Items added via the inline allowance/TBD forms with the room dropdown
-- left as "Unassigned" land here. Capture-consumed items always have a
-- room (RPC requires p_scope_room_id).
SELECT count(*) AS items_without_room
FROM proposal_items
WHERE proposal_id = :proposal_id
  AND scope_room_id IS NULL;

\echo
\echo '== 11. Per-type integrity (BAD rows mean a regression) =='
-- Per-type column requirements:
--   fixed     → unit_price > 0 and product_id NOT NULL
--   allowance → budget_min_cents AND budget_max_cents NOT NULL, ffe_category NOT NULL
--   tbd       → no price, no budget; ffe_category NOT NULL
SELECT id,
       item_type,
       CASE
         WHEN item_type = 'allowance'
              AND (budget_min_cents IS NULL OR budget_max_cents IS NULL OR ffe_category IS NULL)
           THEN 'BAD: allowance missing budget or category'
         WHEN item_type = 'tbd'
              AND ((unit_price IS NOT NULL AND unit_price > 0)
                OR budget_min_cents IS NOT NULL
                OR budget_max_cents IS NOT NULL
                OR ffe_category IS NULL)
           THEN 'BAD: tbd has price/budget or missing category'
         WHEN item_type = 'fixed'
              AND (unit_price IS NULL OR unit_price = 0 OR product_id IS NULL)
           THEN 'BAD: fixed missing unit_price or product_id'
         ELSE 'OK'
       END AS integrity
FROM proposal_items
WHERE proposal_id = :proposal_id
ORDER BY position;

\echo
\echo '== 12. Position contiguity (max - min + 1 should equal count) =='
-- Position values should form a contiguous 0..N-1 range. Gaps indicate a
-- prior delete that didn't reflow positions, or two adds racing at the
-- same end of the schedule.
SELECT count(*) AS items,
       coalesce(min(position), 0) AS min_pos,
       coalesce(max(position), -1) AS max_pos,
       coalesce(max(position), -1) - coalesce(min(position), 0) + 1 AS expected_count,
       array_agg(position ORDER BY position) AS positions
FROM proposal_items
WHERE proposal_id = :proposal_id;
