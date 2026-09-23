-- founder-seat-snapshot.sql
--
-- Read-only, run through the Management API `read_only:true` lane (or `psql`
-- against a read replica / read-only role locally). NO WRITES. NO TEMP TABLES.
-- Every business row Middle West Studio's members touched in a window, so
-- Kody can list every creation or change attributable to his own seat
-- (Founder-seat rule, program-final.html) at session start, repeat start,
-- and readout, and diff two runs cleanly.
--
-- Usage:
--   psql "$CONN" -v studio_id="'7ba72774-fcdb-48cd-9135-b02a5d432628'" \
--                -v window_start="'2026-09-22 00:00:00+00'" \
--                -v window_end="'2026-09-29 00:00:00+00'" \
--                -f founder-seat-snapshot.sql
--
-- studio_id defaults to Middle West Studio if not overridden by -v; window
-- bounds have no default and must be supplied every run so the same file
-- produces a stable, diffable shape across session start / repeat start /
-- readout.
--
-- Output shape is stable across runs: one row per (table, id), same column
-- order, ORDER BY table_name, created_at. Diff two runs' output to see what
-- changed inside the window.

\set ON_ERROR_STOP on
\if :{?studio_id}
\else
  \set studio_id '''7ba72774-fcdb-48cd-9135-b02a5d432628'''
\endif

BEGIN TRANSACTION READ ONLY;

-- Every active member of the studio, by user id — resolved from the roster
-- itself so this file never needs to hardcode member uuids.
WITH studio_members AS (
  SELECT om.user_id
  FROM organization_members om
  WHERE om.organization_id = :studio_id::uuid
),

rows AS (
  -- Projects: studio_id is the tenant column; designer_id/created_by are
  -- the ownership/attribution columns available.
  SELECT
    'projects'::text            AS table_name,
    p.id,
    p.created_at,
    p.updated_at,
    p.designer_id               AS attributed_to,
    p.created_by                AS created_by,
    p.studio_id                 AS studio_id
  FROM projects p
  WHERE p.studio_id = :studio_id::uuid
     OR p.designer_id IN (SELECT user_id FROM studio_members)
     OR p.created_by IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Households ("client_households"): organization_id is the tenant
  -- column; designer_id/created_by are the attribution columns.
  SELECT
    'client_households',
    h.id,
    h.created_at,
    h.updated_at,
    h.designer_id,
    h.created_by,
    h.organization_id
  FROM client_households h
  WHERE h.organization_id = :studio_id::uuid
     OR h.designer_id IN (SELECT user_id FROM studio_members)
     OR h.created_by IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Clients (designer_clients has no studio_id column; attribute via
  -- designer_id being a studio member).
  SELECT
    'designer_clients',
    c.id,
    c.created_at,
    c.updated_at,
    c.designer_id,
    NULL::uuid,
    NULL::uuid
  FROM designer_clients c
  WHERE c.designer_id IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Invoices: MUST include studio_id IS NULL rows that belong to the
  -- studio's members via designer_id (00318/00513 — a NULL studio_id does
  -- not mean the invoice is not the studio's).
  SELECT
    'invoices',
    i.id,
    i.created_at,
    i.updated_at,
    i.designer_id,
    NULL::uuid,
    i.studio_id
  FROM invoices i
  WHERE i.studio_id = :studio_id::uuid
     OR (i.studio_id IS NULL AND i.designer_id IN (SELECT user_id FROM studio_members))

  UNION ALL

  -- Invoice lines: no direct ownership column — attribute via the parent
  -- invoice's designer_id/studio_id (same 00318/00513 NULL-studio rule).
  SELECT
    'invoice_line_items',
    li.id,
    li.created_at,
    NULL::timestamptz,
    i.designer_id,
    NULL::uuid,
    i.studio_id
  FROM invoice_line_items li
  JOIN invoices i ON i.id = li.invoice_id
  WHERE i.studio_id = :studio_id::uuid
     OR (i.studio_id IS NULL AND i.designer_id IN (SELECT user_id FROM studio_members))

  UNION ALL

  -- Payments: no direct ownership column on invoice_payments beyond
  -- recorded_by; attribute via the parent invoice as well.
  SELECT
    'invoice_payments',
    pay.id,
    pay.created_at,
    pay.updated_at,
    COALESCE(pay.recorded_by, i.designer_id),
    pay.recorded_by,
    i.studio_id
  FROM invoice_payments pay
  JOIN invoices i ON i.id = pay.invoice_id
  WHERE i.studio_id = :studio_id::uuid
     OR (i.studio_id IS NULL AND i.designer_id IN (SELECT user_id FROM studio_members))

  UNION ALL

  -- Proposals: no studio_id column at all — attribute via designer_id
  -- membership only.
  SELECT
    'proposals',
    pr.id,
    pr.created_at,
    pr.updated_at,
    pr.designer_id,
    NULL::uuid,
    NULL::uuid
  FROM proposals pr
  WHERE pr.designer_id IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Products: studio_id + owner_user_id / captured_by are the ownership
  -- columns.
  SELECT
    'products',
    prod.id,
    prod.created_at,
    prod.updated_at,
    COALESCE(prod.owner_user_id, prod.captured_by),
    prod.captured_by,
    prod.studio_id
  FROM products prod
  WHERE prod.studio_id = :studio_id::uuid
     OR prod.owner_user_id IN (SELECT user_id FROM studio_members)
     OR prod.captured_by IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Contacts (studio_contacts): organization_id is the tenant column;
  -- created_by is the attribution column.
  SELECT
    'studio_contacts',
    sc.id,
    sc.created_at,
    sc.updated_at,
    sc.created_by,
    sc.created_by,
    sc.organization_id
  FROM studio_contacts sc
  WHERE sc.organization_id = :studio_id::uuid
     OR sc.created_by IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Field captures: organization_id is the tenant column; designer_id is
  -- the attribution column.
  SELECT
    'field_captures',
    fc.id,
    fc.created_at,
    fc.updated_at,
    fc.designer_id,
    NULL::uuid,
    fc.organization_id
  FROM field_captures fc
  WHERE fc.organization_id = :studio_id::uuid
     OR fc.designer_id IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Proposal captures: no studio_id column — attribute via designer_id
  -- membership only.
  SELECT
    'proposal_captures',
    pc.id,
    pc.captured_at,
    NULL::timestamptz,
    pc.designer_id,
    NULL::uuid,
    NULL::uuid
  FROM proposal_captures pc
  WHERE pc.designer_id IN (SELECT user_id FROM studio_members)

  UNION ALL

  -- Sequence enrollments: user-scoped only (no studio column) — attribute
  -- via user_id membership.
  SELECT
    'sequence_enrollments',
    se.id,
    se.created_at,
    se.updated_at,
    se.user_id,
    NULL::uuid,
    NULL::uuid
  FROM sequence_enrollments se
  WHERE se.user_id IN (SELECT user_id FROM studio_members)
)

SELECT
  table_name,
  id,
  created_at,
  updated_at,
  attributed_to,
  created_by,
  studio_id
FROM rows
WHERE COALESCE(created_at, updated_at) >= :window_start::timestamptz
  AND COALESCE(created_at, updated_at) <  :window_end::timestamptz
ORDER BY table_name, created_at NULLS LAST, id;

COMMIT;
