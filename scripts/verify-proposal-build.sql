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
