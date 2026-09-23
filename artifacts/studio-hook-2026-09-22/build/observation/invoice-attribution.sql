-- invoice-attribution.sql
--
-- Read-only, run through the Management API `read_only:true` lane (or
-- `psql` against a read replica / read-only role locally). NO WRITES. NO
-- TEMP TABLES.
--
-- Union across Middle West Studio's three members' invoices, one row per
-- invoice, so Kody can ask "who prepared this?" per row. `designer_id` is
-- the only attribution-shaped column invoices carries (per P1's checkable
-- premises: create_draft_invoice stamps the project's designer,
-- create_draft_studio_invoice can stamp another member's roster ownership
-- — neither makes designer_id reliable preparer attribution). This query
-- surfaces that column per row precisely because it is not reliable on its
-- own; the sit-down answers "who actually prepared this" out loud.
--
-- MUST include studio_id IS NULL rows that belong to the studio's members
-- (00318/00513 — a NULL studio_id predates the studio_id column/backfill
-- and does not mean the invoice is not the studio's).
--
-- Usage:
--   psql "$CONN" -v studio_id="'7ba72774-fcdb-48cd-9135-b02a5d432628'" \
--                -f invoice-attribution.sql
--
-- studio_id defaults to Middle West Studio if not overridden by -v.

\set ON_ERROR_STOP on
\if :{?studio_id}
\else
  \set studio_id '''7ba72774-fcdb-48cd-9135-b02a5d432628'''
\endif

BEGIN TRANSACTION READ ONLY;

WITH studio_members AS (
  SELECT om.user_id, om.role
  FROM organization_members om
  WHERE om.organization_id = :studio_id::uuid
)

SELECT
  i.id                                     AS invoice_id,
  i.invoice_number,
  i.issue_date,
  i.due_date,
  i.sent_at,
  i.paid_at,
  i.voided_at,
  i.status,
  i.project_id,                            -- null when the invoice has no project
  i.designer_id                            AS attribution_designer_id,
  sm.role                                  AS attribution_member_role,
  i.studio_id,                             -- null included per 00318/00513
  i.currency,
  i.total_cents,
  i.amount_paid_cents
FROM invoices i
JOIN studio_members sm ON sm.user_id = i.designer_id
WHERE i.studio_id = :studio_id::uuid
   OR i.studio_id IS NULL
ORDER BY COALESCE(i.issue_date, i.created_at::date), i.invoice_number NULLS LAST, i.id;

COMMIT;
