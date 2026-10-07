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
-- Migration 00725 (SQ-468, R1 F10) extends the matrix:
--   H. vendor_quote_requests, purchase_order_changes, install_windows and
--      damage_claims read the same way on PB, PN and PS (before 00725, M read
--      PB's rows in all four, and U and N did not read PS's). A quote request
--      with no project keeps the co-member read on its requester: U, M and N
--      read U's, X does not. C, PB's client, reads none of the four, before
--      and after (none of them has a client policy). M cannot write a PB
--      quote request; N cannot re-attribute one to X.
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
  ('69717000-0000-4000-8000-0000000000a4', 'ssr-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- X
  ('69717000-0000-4000-8000-0000000000a6', 'ssr-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- C (00725: PB's client)

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69717000-0000-4000-8000-0000000000a1', 'ssr-owner@test.invalid',    'SSR Owner',    NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a2', 'ssr-member-a@test.invalid', 'SSR Member A', NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a3', 'ssr-member-b@test.invalid', 'SSR Member B', NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a4', 'ssr-outsider@test.invalid', 'SSR Outsider', NOW(), NOW()),
  ('69717000-0000-4000-8000-0000000000a6', 'ssr-client@test.invalid',   'SSR Client',   NOW(), NOW())
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
INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES
  ('69717000-0000-4000-8000-000000000001', 'SSR Project B',    '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000a6', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000f2'),
  ('69717000-0000-4000-8000-000000000002', 'SSR Project None', '69717000-0000-4000-8000-0000000000a1', NULL,                                   '69717000-0000-4000-8000-0000000000a1', NULL);

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

-- ─── H (00725): procurement tables read through the project's studio ───────
-- Fixtures land here, after A–G have counted, so the damage-claim notice
-- trigger cannot touch an earlier count. Suffix 1 = PB, 2 = PN, 3 = PS.

INSERT INTO designer_clients (id, designer_id, client_id, status)
VALUES ('69717000-0000-4000-8000-0000000000d1', '69717000-0000-4000-8000-0000000000a1', '69717000-0000-4000-8000-0000000000a6', 'active');

INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES ('69717000-0000-4000-8000-000000000103', '69717000-0000-4000-8000-0000000000a5', '69717000-0000-4000-8000-000000000003', '69717000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', false);

INSERT INTO receiving_inspections (id, purchase_order_id, inspected_by, outcome)
VALUES ('69717000-0000-4000-8000-000000000603', '69717000-0000-4000-8000-000000000103', '69717000-0000-4000-8000-0000000000a5', 'clean');

INSERT INTO damage_claims (id, receiving_inspection_id, description)
VALUES
  ('69717000-0000-4000-8000-000000000931', '69717000-0000-4000-8000-000000000601', 'SSR claim B'),
  ('69717000-0000-4000-8000-000000000932', '69717000-0000-4000-8000-000000000602', 'SSR claim None'),
  ('69717000-0000-4000-8000-000000000933', '69717000-0000-4000-8000-000000000603', 'SSR claim Studio');

INSERT INTO purchase_order_changes (id, project_id, purchase_order_id, change_kind, reason, prior_snapshot, created_by)
VALUES
  ('69717000-0000-4000-8000-000000000941', '69717000-0000-4000-8000-000000000001', '69717000-0000-4000-8000-000000000101', 'vendor_change', 'SSR change B', '{}'::jsonb, '69717000-0000-4000-8000-0000000000a1'),
  ('69717000-0000-4000-8000-000000000942', '69717000-0000-4000-8000-000000000002', '69717000-0000-4000-8000-000000000102', 'vendor_change', 'SSR change None', '{}'::jsonb, '69717000-0000-4000-8000-0000000000a1'),
  ('69717000-0000-4000-8000-000000000943', '69717000-0000-4000-8000-000000000003', '69717000-0000-4000-8000-000000000103', 'vendor_change', 'SSR change Studio', '{}'::jsonb, '69717000-0000-4000-8000-0000000000a5');

INSERT INTO install_windows (id, project_id, starts_on, ends_on)
VALUES
  ('69717000-0000-4000-8000-000000000951', '69717000-0000-4000-8000-000000000001', CURRENT_DATE + 30, CURRENT_DATE + 31),
  ('69717000-0000-4000-8000-000000000952', '69717000-0000-4000-8000-000000000002', CURRENT_DATE + 30, CURRENT_DATE + 31),
  ('69717000-0000-4000-8000-000000000953', '69717000-0000-4000-8000-000000000003', CURRENT_DATE + 30, CURRENT_DATE + 31);

-- U's request with no project: the co-member read on its requester decides.
INSERT INTO vendor_quote_requests (id, vendor_id, designer_id, project_id, status)
VALUES ('69717000-0000-4000-8000-000000000804', '69717000-0000-4000-8000-000000000011', '69717000-0000-4000-8000-0000000000a1', NULL, 'sent');

-- C reads nothing of any project in these four tables; projectless 0.
CREATE TEMP TABLE ssr_proc_expect (who text, uid uuid, pb int, pn int, ps int, pq int) ON COMMIT DROP;
INSERT INTO ssr_proc_expect
SELECT who, uid, pb, pn, pb, pn FROM ssr_expect
UNION ALL
SELECT 'C (PB''s client)', '69717000-0000-4000-8000-0000000000a6', 0, 0, 0, 0;
GRANT SELECT ON ssr_proc_expect TO authenticated;

CREATE TEMP TABLE ssr_proc_seen (who text, tbl text, pb int, pn int, ps int, pq int) ON COMMIT DROP;
GRANT INSERT, SELECT ON ssr_proc_seen TO authenticated;

DO $$
DECLARE e record;
BEGIN
  FOR e IN SELECT who, uid FROM ssr_proc_expect ORDER BY who LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', e.uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO ssr_proc_seen
    SELECT e.who, t.tbl, t.pb, t.pn, t.ps, t.pq FROM (
      SELECT 'vendor_quote_requests' AS tbl,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000801')::int AS pb,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000802')::int AS pn,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000803')::int AS ps,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000804')::int AS pq
      FROM vendor_quote_requests
      UNION ALL
      SELECT 'purchase_order_changes',
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000941')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000942')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000943')::int,
             NULL
      FROM purchase_order_changes
      UNION ALL
      SELECT 'install_windows',
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000951')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000952')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000953')::int,
             NULL
      FROM install_windows
      UNION ALL
      SELECT 'damage_claims',
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000931')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000932')::int,
             count(*) FILTER (WHERE id = '69717000-0000-4000-8000-000000000933')::int,
             NULL
      FROM damage_claims
    ) t;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

DO $$
DECLARE r record; v_rows int;
BEGIN
  SELECT count(*) INTO v_rows FROM ssr_proc_seen;
  ASSERT v_rows = 20, 'FAIL: expected 20 procurement observations (5 callers x 4 tables), got ' || v_rows;
  FOR r IN
    SELECT s.who, s.tbl, s.pb, s.pn, s.ps, s.pq,
           e.pb AS want_pb, e.pn AS want_pn, e.ps AS want_ps, e.pq AS want_pq
    FROM ssr_proc_seen s JOIN ssr_proc_expect e USING (who)
    ORDER BY s.who, s.tbl
  LOOP
    ASSERT r.pb = r.want_pb,
      format('FAIL: %s sees %s row(s) of project B in %s, want %s', r.who, r.pb, r.tbl, r.want_pb);
    ASSERT r.pn = r.want_pn,
      format('FAIL: %s sees %s row(s) of the no-studio project in %s, want %s', r.who, r.pn, r.tbl, r.want_pn);
    ASSERT r.ps = r.want_ps,
      format('FAIL: %s sees %s row(s) of the lone owner''s studio-B project in %s, want %s',
             r.who, r.ps, r.tbl, r.want_ps);
    ASSERT r.pq IS NULL OR r.pq = r.want_pq,
      format('FAIL: %s sees %s projectless quote request(s), want %s', r.who, r.pq, r.want_pq);
  END LOOP;
END $$;

-- H (writes): M, U's co-member through A, cannot write PB's quote request; N,
-- B's member, can, but cannot hand it to X (who would then read it through
-- the owner policy). An RLS refusal on UPDATE is a silent 0-row match under
-- USING, and insufficient_privilege under WITH CHECK.
DO $$
DECLARE v_rows int; v_refused boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub": "69717000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;
  UPDATE vendor_quote_requests SET message = 'SSR M write'
  WHERE id = '69717000-0000-4000-8000-000000000801';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rows = 0, 'FAIL: M updated PB''s quote request (' || v_rows || ' row)';

  PERFORM set_config('request.jwt.claims',
    '{"sub": "69717000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;
  UPDATE vendor_quote_requests SET message = 'SSR N write'
  WHERE id = '69717000-0000-4000-8000-000000000801';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  BEGIN
    UPDATE vendor_quote_requests SET designer_id = '69717000-0000-4000-8000-0000000000a4'
    WHERE id = '69717000-0000-4000-8000-000000000801';
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_rows = 1, 'FAIL: N (B''s member) could not update PB''s quote request';
  ASSERT v_refused, 'FAIL: N re-attributed PB''s quote request to the outsider X';
  ASSERT (SELECT message FROM vendor_quote_requests WHERE id = '69717000-0000-4000-8000-000000000801') = 'SSR N write',
    'FAIL: N''s update did not land';
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
