-- ═══════════════════════════════════════════════════════════════════════════
-- Studio-scoped procurement reads (migration 00717; SQ-442, SQ-416 F3)
--
-- Owner U is seated in studios A and B. Member M is seated in A only, member
-- N in B only; X is seated nowhere. Project PB has studio_id = B; project PN
-- has studio_id NULL (the fallback). Each project has one PO carrying one
-- po_payments row, one vendor_payments row, one notice and one inspection
-- line.
--
--   A. M (U's co-member through A) sees nothing of PB in vendor_payments,
--      po_payments, procurement_notifications or receiving_inspection_lines,
--      and _ffe_require_studio_project(PB) refuses M. Before 00717, M read
--      all four.
--   B. N (B's own member) and U (the owner) still see PB's rows and pass the
--      FF&E gate, as before.
--   C. PN (no studio_id): U, M and N, U's co-members, still see its rows and
--      pass the gate, unchanged.
--   D. X sees nothing and is refused everywhere.
--
-- Migration 00721 (SQ-453) extends the matrix:
--   E. project_ffe_items, project_rooms, project_phases and
--      project_payment_milestones read the same way (before 00721, M read
--      PB's rows through the owner co-member leg).
--   F. log_po_acknowledgment (v1) admits the same callers per PO (before
--      00721, M acknowledged PB's PO).
--   G. record_vendor_quote on a request linked to the project admits the same
--      callers.
--   PS: owner O is seated nowhere; PS has studio_id = B. U and N (B's members)
--   read PS's four child tables and record a quote on O's PS request; M and X
--   do not. Before 00721, nobody but O did: neither U nor N is O's co-member.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/studio_scoped_reads_test.sql
--
-- One transaction, rolled back at the end. Reads run under SET LOCAL ROLE
-- authenticated with request.jwt.claims, the real RLS path.
-- _ffe_require_studio_project is revoked from authenticated (00435), so the
-- gate is called as postgres with the caller's claims, the way the FF&E RPCs
-- reach it.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69717000-0000-4000-8000-0000000000a1', 'ssr-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- U
  ('69717000-0000-4000-8000-0000000000a2', 'ssr-member-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('69717000-0000-4000-8000-0000000000a3', 'ssr-member-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- N
  ('69717000-0000-4000-8000-0000000000a4', 'ssr-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69717000-0000-4000-8000-0000000000a1', 'ssr-owner@test.invalid',    'SSR Owner',    NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a2', 'ssr-member-a@test.invalid', 'SSR Member A', NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a3', 'ssr-member-b@test.invalid', 'SSR Member B', NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a4', 'ssr-outsider@test.invalid', 'SSR Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('69717000-0000-4000-8000-0000000000f1', 'design_studio', 'SSR Studio A', 'ssr-studio-a-test'),
  ('69717000-0000-4000-8000-0000000000f2', 'design_studio', 'SSR Studio B', 'ssr-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69717000-0000-4000-8000-0000000000e1', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('69717000-0000-4000-8000-0000000000e2', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000f2', 'owner',  'active', NOW()),
  ('69717000-0000-4000-8000-0000000000e3', '69717000-0000-4000-8000-0000000000a2', '69717000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('69717000-0000-4000-8000-0000000000e4', '69717000-0000-4000-8000-0000000000a3', '69717000-0000-4000-8000-0000000000f2', 'member', 'active', NOW());

-- PB names studio B; PN names none (U holds no designer-domain role, so no
-- studio is derived for it).
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('69717000-0000-4000-8000-000000000001', 'SSR Project B',    '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000f2'),
  ('69717000-0000-4000-8000-000000000002', 'SSR Project None', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000a1', NULL);

DO $$
BEGIN
  ASSERT (SELECT studio_id FROM projects WHERE id = '69717000-0000-4000-8000-000000000001')
         = '69717000-0000-4000-8000-0000000000f2', 'SETUP: PB must carry studio B';
  ASSERT (SELECT studio_id FROM projects WHERE id = '69717000-0000-4000-8000-000000000002') IS NULL,
         'SETUP: PN must carry no studio';
END $$;

INSERT INTO vendors (id, name)
VALUES ('69717000-0000-4000-8000-000000000011', 'SSR Vendor');

INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES
  ('69717000-0000-4000-8000-000000000101', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-000000000001', '69717000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', false),
  ('69717000-0000-4000-8000-000000000102', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-000000000002', '69717000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', false);

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state)
VALUES
  ('69717000-0000-4000-8000-000000000201', '69717000-0000-4000-8000-000000000101', 'balance', 10000, 'pending'),
  ('69717000-0000-4000-8000-000000000202', '69717000-0000-4000-8000-000000000102', 'balance', 10000, 'pending');

INSERT INTO vendor_payments (id, purchase_order_id, paid_on, amount_cents, method)
VALUES
  ('69717000-0000-4000-8000-000000000301', '69717000-0000-4000-8000-000000000101', CURRENT_DATE, 2500, 'check'),
  ('69717000-0000-4000-8000-000000000302', '69717000-0000-4000-8000-000000000102', CURRENT_DATE, 2500, 'check');

-- Addressed to U, so M and N can reach it only through the studio policy.
INSERT INTO procurement_notifications (id, user_id, kind, subject_purchase_order_id)
VALUES
  ('69717000-0000-4000-8000-000000000401', '69717000-0000-4000-8000-0000000000a1', 'balance_due', '69717000-0000-4000-8000-000000000101'),
  ('69717000-0000-4000-8000-000000000402', '69717000-0000-4000-8000-0000000000a1', 'balance_due', '69717000-0000-4000-8000-000000000102');

INSERT INTO project_ffe_items (id, project_id, name, status, quantity, purchase_order_id, vendor_id)
VALUES
  ('69717000-0000-4000-8000-000000000501', '69717000-0000-4000-8000-000000000001', 'SSR line B',    'ordered', 1, '69717000-0000-4000-8000-000000000101', '69717000-0000-4000-8000-000000000011'),
  ('69717000-0000-4000-8000-000000000502', '69717000-0000-4000-8000-000000000002', 'SSR line None', 'ordered', 1, '69717000-0000-4000-8000-000000000102', '69717000-0000-4000-8000-000000000011');

INSERT INTO receiving_inspections (id, purchase_order_id, inspected_by, outcome)
VALUES
  ('69717000-0000-4000-8000-000000000601', '69717000-0000-4000-8000-000000000101', '69717000-0000-4000-8000-0000000000a1', 'clean'),
  ('69717000-0000-4000-8000-000000000602', '69717000-0000-4000-8000-000000000102', '69717000-0000-4000-8000-0000000000a1', 'clean');

INSERT INTO receiving_inspection_lines (inspection_id, ffe_item_id, received_quantity, condition)
VALUES
  ('69717000-0000-4000-8000-000000000601', '69717000-0000-4000-8000-000000000501', 1, 'good'),
  ('69717000-0000-4000-8000-000000000602', '69717000-0000-4000-8000-000000000502', 1, 'good');

-- 00721: O owns PS (studio B) but is seated nowhere.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('69717000-0000-4000-8000-0000000000a5', 'ssr-lone-owner@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- O

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('69717000-0000-4000-8000-0000000000a5', 'ssr-lone-owner@test.invalid', 'SSR Lone Owner', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('69717000-0000-4000-8000-000000000003', 'SSR Project Studio', '69717000-0000-4000-8000-0000000000a5', '69717000-0000-4000-8000-0000000000a5', '69717000-0000-4000-8000-0000000000f2');

INSERT INTO project_ffe_items (id, project_id, name, status, quantity, vendor_id)
VALUES ('69717000-0000-4000-8000-000000000503', '69717000-0000-4000-8000-000000000003', 'SSR line Studio', 'specified', 1, '69717000-0000-4000-8000-000000000011');

-- One row of each child table per project: suffix 1 = PB, 2 = PN, 3 = PS.
INSERT INTO project_rooms (id, project_id, name)
VALUES
  ('69717000-0000-4000-8000-000000000701', '69717000-0000-4000-8000-000000000001', 'SSR room B'),
  ('69717000-0000-4000-8000-000000000702', '69717000-0000-4000-8000-000000000002', 'SSR room None'),
  ('69717000-0000-4000-8000-000000000703', '69717000-0000-4000-8000-000000000003', 'SSR room Studio');

INSERT INTO project_phases (id, project_id, name)
VALUES
  ('69717000-0000-4000-8000-000000000711', '69717000-0000-4000-8000-000000000001', 'SSR phase B'),
  ('69717000-0000-4000-8000-000000000712', '69717000-0000-4000-8000-000000000002', 'SSR phase None'),
  ('69717000-0000-4000-8000-000000000713', '69717000-0000-4000-8000-000000000003', 'SSR phase Studio');

INSERT INTO project_payment_milestones (id, project_id, label, percentage)
VALUES
  ('69717000-0000-4000-8000-000000000721', '69717000-0000-4000-8000-000000000001', 'SSR milestone B', 50),
  ('69717000-0000-4000-8000-000000000722', '69717000-0000-4000-8000-000000000002', 'SSR milestone None', 50),
  ('69717000-0000-4000-8000-000000000723', '69717000-0000-4000-8000-000000000003', 'SSR milestone Studio', 50);

-- Quote requests on each project, by its owner.
INSERT INTO vendor_quote_requests (id, vendor_id, designer_id, project_id, status)
VALUES
  ('69717000-0000-4000-8000-000000000801', '69717000-0000-4000-8000-000000000011', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-000000000001', 'sent'),
  ('69717000-0000-4000-8000-000000000802', '69717000-0000-4000-8000-000000000011', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-000000000002', 'sent'),
  ('69717000-0000-4000-8000-000000000803', '69717000-0000-4000-8000-000000000011', '69717000-0000-4000-8000-0000000000a5', '69717000-0000-4000-8000-000000000003', 'sent');

-- ─── reads: one block per caller ───────────────────────────────────────────
-- Each block asserts the caller's count of PB rows and PN rows in every
-- table. The expected pair is (PB, PN).

CREATE TEMP TABLE ssr_expect (who text, uid uuid, pb int, pn int) ON COMMIT DROP;
INSERT INTO ssr_expect VALUES
  ('U (owner, A+B)',    '69717000-0000-4000-8000-0000000000a1', 1, 1),
  ('M (member of A)',   '69717000-0000-4000-8000-0000000000a2', 0, 1),
  ('N (member of B)',   '69717000-0000-4000-8000-0000000000a3', 1, 1),
  ('X (outsider)',      '69717000-0000-4000-8000-0000000000a4', 0, 0);
GRANT SELECT ON ssr_expect TO authenticated;

CREATE TEMP TABLE ssr_seen (who text, tbl text, pb int, pn int) ON COMMIT DROP;
GRANT INSERT, SELECT ON ssr_seen TO authenticated;

-- The policy under test applies to the caller's own SELECT, so each count is
-- taken under that caller's role and claims.
SET LOCAL "request.jwt.claims" TO '{"sub": "69717000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;
INSERT INTO ssr_seen
SELECT 'U (owner, A+B)', t.tbl, t.pb, t.pn FROM (
  SELECT 'vendor_payments' AS tbl,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int AS pb,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int AS pn
  FROM vendor_payments
  UNION ALL
  SELECT 'po_payments',
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM po_payments
  UNION ALL
  SELECT 'procurement_notifications',
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM procurement_notifications
  UNION ALL
  SELECT 'receiving_inspection_lines',
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000601')::int,
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000602')::int
  FROM receiving_inspection_lines
) t;
RESET ROLE;

SET LOCAL "request.jwt.claims" TO '{"sub": "69717000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;
INSERT INTO ssr_seen
SELECT 'M (member of A)', t.tbl, t.pb, t.pn FROM (
  SELECT 'vendor_payments' AS tbl,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int AS pb,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int AS pn
  FROM vendor_payments
  UNION ALL
  SELECT 'po_payments',
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM po_payments
  UNION ALL
  SELECT 'procurement_notifications',
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM procurement_notifications
  UNION ALL
  SELECT 'receiving_inspection_lines',
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000601')::int,
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000602')::int
  FROM receiving_inspection_lines
) t;
RESET ROLE;

SET LOCAL "request.jwt.claims" TO '{"sub": "69717000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;
INSERT INTO ssr_seen
SELECT 'N (member of B)', t.tbl, t.pb, t.pn FROM (
  SELECT 'vendor_payments' AS tbl,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int AS pb,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int AS pn
  FROM vendor_payments
  UNION ALL
  SELECT 'po_payments',
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM po_payments
  UNION ALL
  SELECT 'procurement_notifications',
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM procurement_notifications
  UNION ALL
  SELECT 'receiving_inspection_lines',
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000601')::int,
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000602')::int
  FROM receiving_inspection_lines
) t;
RESET ROLE;

SET LOCAL "request.jwt.claims" TO '{"sub": "69717000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;
INSERT INTO ssr_seen
SELECT 'X (outsider)', t.tbl, t.pb, t.pn FROM (
  SELECT 'vendor_payments' AS tbl,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int AS pb,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int AS pn
  FROM vendor_payments
  UNION ALL
  SELECT 'po_payments',
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM po_payments
  UNION ALL
  SELECT 'procurement_notifications',
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000101')::int,
         count(*) FILTER (WHERE subject_purchase_order_id = '69717000-0000-4000-8000-000000000102')::int
  FROM procurement_notifications
  UNION ALL
  SELECT 'receiving_inspection_lines',
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000601')::int,
         count(*) FILTER (WHERE inspection_id = '69717000-0000-4000-8000-000000000602')::int
  FROM receiving_inspection_lines
) t;
RESET ROLE;

-- A–D (reads): every caller, every table, both projects.
DO $$
DECLARE r record; v_rows int;
BEGIN
  SELECT count(*) INTO v_rows FROM ssr_seen;
  ASSERT v_rows = 16, 'FAIL: expected 16 observations (4 callers x 4 tables), got ' || v_rows;
  FOR r IN
    SELECT s.who, s.tbl, s.pb, s.pn, e.pb AS want_pb, e.pn AS want_pn
    FROM ssr_seen s JOIN ssr_expect e USING (who)
    ORDER BY s.who, s.tbl
  LOOP
    ASSERT r.pb = r.want_pb,
      format('FAIL: %s sees %s row(s) of project B in %s, want %s', r.who, r.pb, r.tbl, r.want_pb);
    ASSERT r.pn = r.want_pn,
      format('FAIL: %s sees %s row(s) of the no-studio project in %s, want %s', r.who, r.pn, r.tbl, r.want_pn);
  END LOOP;
END $$;

-- ─── _ffe_require_studio_project: the FF&E RPC gate ─────────────────────────

CREATE TEMP TABLE ssr_gate (who text, project text, admitted boolean) ON COMMIT DROP;

DO $$
DECLARE
  e record;
  p record;
  v_ok boolean;
BEGIN
  FOR e IN SELECT who, uid FROM ssr_expect LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', e.uid, 'role', 'authenticated')::text, true);
    FOR p IN
      SELECT * FROM (VALUES
        ('PB', '69717000-0000-4000-8000-000000000001'::uuid),
        ('PN', '69717000-0000-4000-8000-000000000002'::uuid)
      ) AS v(label, id)
    LOOP
      BEGIN
        PERFORM public._ffe_require_studio_project(p.id);
        v_ok := true;
      EXCEPTION WHEN insufficient_privilege THEN
        v_ok := false;
      END;
      INSERT INTO ssr_gate VALUES (e.who, p.label, v_ok);
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT g.who, g.project, g.admitted,
           CASE g.project WHEN 'PB' THEN e.pb = 1 ELSE e.pn = 1 END AS want
    FROM ssr_gate g JOIN ssr_expect e USING (who)
    ORDER BY g.who, g.project
  LOOP
    ASSERT r.admitted = r.want,
      format('FAIL: _ffe_require_studio_project(%s) for %s admitted=%s, want %s',
             r.project, r.who, r.admitted, r.want);
  END LOOP;
  ASSERT (SELECT count(*) FROM ssr_gate) = 8, 'FAIL: expected 8 gate checks';
END $$;

-- ─── E (00721): project child tables read through can_buy_for_project ──────
-- PS expects what PB expects: B's members read it, nobody else seated does.

CREATE TEMP TABLE ssr_child_seen (who text, tbl text, pb int, pn int, ps int) ON COMMIT DROP;
GRANT INSERT, SELECT ON ssr_child_seen TO authenticated;

DO $$
DECLARE e record;
BEGIN
  FOR e IN SELECT who, uid FROM ssr_expect ORDER BY who LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', e.uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO ssr_child_seen
    SELECT e.who, t.tbl, t.pb, t.pn, t.ps FROM (
      SELECT 'project_ffe_items' AS tbl,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000501')::int AS pb,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000502')::int AS pn,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000503')::int AS ps
      FROM project_ffe_items
      UNION ALL
      SELECT 'project_rooms',
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000701')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000702')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000703')::int
      FROM project_rooms
      UNION ALL
      SELECT 'project_phases',
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000711')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000712')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000713')::int
      FROM project_phases
      UNION ALL
      SELECT 'project_payment_milestones',
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000721')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000722')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000723')::int
      FROM project_payment_milestones
    ) t;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

DO $$
DECLARE r record; v_rows int;
BEGIN
  SELECT count(*) INTO v_rows FROM ssr_child_seen;
  ASSERT v_rows = 16, 'FAIL: expected 16 child-table observations (4 callers x 4 tables), got ' || v_rows;
  FOR r IN
    SELECT s.who, s.tbl, s.pb, s.pn, s.ps, e.pb AS want_pb, e.pn AS want_pn
    FROM ssr_child_seen s JOIN ssr_expect e USING (who)
    ORDER BY s.who, s.tbl
  LOOP
    ASSERT r.pb = r.want_pb,
      format('FAIL: %s sees %s row(s) of project B in %s, want %s', r.who, r.pb, r.tbl, r.want_pb);
    ASSERT r.pn = r.want_pn,
      format('FAIL: %s sees %s row(s) of the no-studio project in %s, want %s', r.who, r.pn, r.tbl, r.want_pn);
    ASSERT r.ps = r.want_pb,
      format('FAIL: %s sees %s row(s) of the lone owner''s studio-B project in %s, want %s',
             r.who, r.ps, r.tbl, r.want_pb);
  END LOOP;
END $$;

-- ─── F (00721): log_po_acknowledgment v1 · G: record_vendor_quote ─────────
-- Both are SECURITY DEFINER RPCs reading auth.uid(), called here with each
-- caller's claims. An admitted call is undone by raising ssr_undo, so every
-- caller meets the same fixture state.

CREATE TEMP TABLE ssr_rpc (who text, rpc text, project text, admitted boolean) ON COMMIT DROP;

DO $$
DECLARE
  e record;
  p record;
  v_ok boolean;
  v_msg text;
BEGIN
  FOR e IN SELECT who, uid FROM ssr_expect LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', e.uid, 'role', 'authenticated')::text, true);

    FOR p IN
      SELECT * FROM (VALUES
        ('PB', '69717000-0000-4000-8000-000000000101'::uuid),
        ('PN', '69717000-0000-4000-8000-000000000102'::uuid)
      ) AS v(label, id)
    LOOP
      BEGIN
        PERFORM public.log_po_acknowledgment(p.id, 'SSR-ACK', NULL);
        RAISE EXCEPTION 'ssr_undo';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg = 'ssr_undo' THEN
          v_ok := true;
        ELSIF v_msg LIKE 'log_po_acknowledgment: purchase order % not found or access denied' THEN
          v_ok := false;
        ELSE
          RAISE;
        END IF;
      END;
      INSERT INTO ssr_rpc VALUES (e.who, 'log_po_acknowledgment', p.label, v_ok);
    END LOOP;

    FOR p IN
      SELECT * FROM (VALUES
        ('PB', '69717000-0000-4000-8000-000000000801'::uuid),
        ('PN', '69717000-0000-4000-8000-000000000802'::uuid),
        ('PS', '69717000-0000-4000-8000-000000000803'::uuid)
      ) AS v(label, id)
    LOOP
      BEGIN
        PERFORM public.record_vendor_quote(jsonb_build_object('requestId', p.id));
        RAISE EXCEPTION 'ssr_undo';
      EXCEPTION
        WHEN insufficient_privilege THEN
          v_ok := false;
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
          IF v_msg = 'ssr_undo' THEN
            v_ok := true;
          ELSE
            RAISE;
          END IF;
      END;
      INSERT INTO ssr_rpc VALUES (e.who, 'record_vendor_quote', p.label, v_ok);
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

DO $$
DECLARE r record;
BEGIN
  ASSERT (SELECT count(*) FROM ssr_rpc) = 20, 'FAIL: expected 20 RPC checks (4 callers x (2 acks + 3 quotes))';
  FOR r IN
    SELECT g.who, g.rpc, g.project, g.admitted,
           CASE g.project WHEN 'PN' THEN e.pn = 1 ELSE e.pb = 1 END AS want
    FROM ssr_rpc g JOIN ssr_expect e USING (who)
    ORDER BY g.rpc, g.who, g.project
  LOOP
    ASSERT r.admitted = r.want,
      format('FAIL: %s on %s for %s admitted=%s, want %s', r.rpc, r.project, r.who, r.admitted, r.want);
  END LOOP;
  -- Nothing an admitted call wrote survived its undo.
  ASSERT NOT EXISTS (SELECT 1 FROM purchase_orders
                     WHERE id IN ('69717000-0000-4000-8000-000000000101', '69717000-0000-4000-8000-000000000102')
                       AND acknowledged_at IS NOT NULL),
    'FAIL: an acknowledgment survived its undo';
  ASSERT NOT EXISTS (SELECT 1 FROM vendor_quotes WHERE vendor_id = '69717000-0000-4000-8000-000000000011'),
    'FAIL: a vendor quote survived its undo';
END $$;

-- Errors keep their text: a refused caller still reads the 404 idiom.
DO $$
DECLARE v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub": "69717000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
  BEGIN
    PERFORM public._ffe_require_studio_project('69717000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  ASSERT v_msg = 'project not found or access denied',
    'FAIL: gate refusal text changed: ' || COALESCE(v_msg, 'no error');
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- Grants unchanged: anon still holds nothing on the gate.
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public._ffe_require_studio_project(uuid)', 'EXECUTE'),
    'FAIL: anon must not execute _ffe_require_studio_project';
  ASSERT NOT has_function_privilege('authenticated', 'public._ffe_require_studio_project(uuid)', 'EXECUTE'),
    'FAIL: authenticated must not execute _ffe_require_studio_project directly';
END $$;

SELECT 'studio_scoped_reads_test: PASS' AS result;

ROLLBACK;
