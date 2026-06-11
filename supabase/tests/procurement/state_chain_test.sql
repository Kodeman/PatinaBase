-- ═══════════════════════════════════════════════════════════════════════════
-- Procurement state-chain trigger tests (migration 00184)
--
-- Exercises the DB-level state synchronization between purchase_orders,
-- po_payments, receiving_inspections, and project_ffe_items:
--   1. Linking an approved item to a draft PO → item becomes 'ordered'
--      (INSERT-linked and UPDATE-linked paths, last_status_change_at stamped).
--   2. Linking an item already at 'shipped' to a draft PO → stays 'shipped'
--      (rank ratchet no-op).
--   3. PO → 'in_production' → linked ordered items become 'production';
--      manually-advanced items untouched.
--   4. PO → 'cancelled' → ordered/production/shipped items unlinked + back to
--      'approved'; delivered item unlinked but stays 'delivered'.
--   5. Clean inspection insert → PO delivered_date stamped, PO → 'delivered',
--      items cascade to 'delivered', received_quantity = quantity.
--   6. Damaged inspection insert → delivered_date stamped but PO status and
--      items unchanged.
--   7. net_30 PO + clean inspection → balance due_date = delivered + 30d
--      (state stays 'pending').
--   8. fifty_fifty PO at 'shipped': deposit paid → balance flips to 'due'
--      (+ balance_due procurement_notifications row from the 00151 trigger).
--   9. Inverse order: deposit paid while PO 'confirmed' → balance stays
--      'pending'; then PO → 'shipped' → balance flips to 'due'.
--  10. fifty_fifty PO at 'confirmed' with deposit already paid → clean
--      inspection jumps the PO straight to 'delivered' (never 'shipped') →
--      balance still flips to 'due' (+ balance_due notification).
--  11. Re-link: item on a draft PO ('ordered') re-linked to an
--      'in_production' PO → 'production'; re-linked back to the draft PO →
--      stays 'production' (ratchet no-op on lower target).
--  12. Manual unlink: 'approved' item linked to a 'confirmed' PO
--      (→ 'ordered'), then purchase_order_id set NULL → status stays
--      'ordered' (untouched, no regression).
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/procurement/state_chain_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. It runs as superuser — the
-- focus is trigger logic, not RLS (see tests/rls/ for RLS coverage).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Designer auth user + profile (profiles may be auto-created by an
-- auth.users trigger; ON CONFLICT keeps this agnostic).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('99999999-9999-4999-8999-999999999999', 'state-chain-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('99999999-9999-4999-8999-999999999999', 'state-chain-designer@test.invalid', 'State Chain Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('eeee0000-0000-4000-8000-000000000001', 'State Chain Test Project', '99999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999999');

INSERT INTO vendors (id, name)
VALUES ('eeee0000-0000-4000-8000-000000000002', 'State Chain Test Vendor');

-- Purchase orders:
--   PO1 draft        full_upfront  — cases 1-4 (lifecycle + cancellation)
--   PO2 confirmed    full_upfront  — case 5 (clean inspection)
--   PO3 confirmed    full_upfront  — case 6 (damaged inspection)
--   PO4 shipped      net_30        — case 7 (net-30 due_date shift)
--   PO5 shipped      fifty_fifty   — case 8 (deposit paid → balance due)
--   PO6 confirmed    fifty_fifty   — case 9 (inverse order)
--   PO7 confirmed    fifty_fifty   — case 10 (confirmed → delivered jump)
--   PO8 draft        full_upfront  — case 11 (re-link source/return; PO1 is
--                                    cancelled by case 4 so it can't be reused)
--   PO9 in_production full_upfront — case 11 (re-link target)
--   PO10 confirmed   full_upfront  — case 12 (manual unlink)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status)
VALUES
  ('f0000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'full_upfront', 100000, 'draft'),
  ('f0000000-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'full_upfront', 100000, 'confirmed'),
  ('f0000000-0000-4000-8000-000000000003', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'full_upfront', 100000, 'confirmed'),
  ('f0000000-0000-4000-8000-000000000004', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'net_30',       100000, 'shipped'),
  ('f0000000-0000-4000-8000-000000000005', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'fifty_fifty',  100000, 'shipped'),
  ('f0000000-0000-4000-8000-000000000006', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'fifty_fifty',  100000, 'confirmed'),
  ('f0000000-0000-4000-8000-000000000007', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'fifty_fifty',  100000, 'confirmed'),
  ('f0000000-0000-4000-8000-000000000008', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'full_upfront', 100000, 'draft'),
  ('f0000000-0000-4000-8000-000000000009', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'full_upfront', 100000, 'in_production'),
  ('f0000000-0000-4000-8000-000000000010', '99999999-9999-4999-8999-999999999999', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000002', 'full_upfront', 100000, 'confirmed');

-- Payments:
--   bal4         — PO4 balance pending, no due_date     (case 7)
--   dep5 / bal5  — PO5 deposit + balance, both pending  (case 8)
--   dep6 / bal6  — PO6 deposit + balance, both pending  (case 9)
--   dep7 / bal7  — PO7 deposit already PAID + balance pending (case 10).
--                  dep7 is INSERTed as 'paid' (Trigger D fires on UPDATE OF
--                  state only, so nothing flips at fixture time — exactly
--                  the "deposit paid earlier" precondition case 10 needs);
--                  paid_date satisfies chk_paid_date_required_when_paid.
INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, paid_date)
VALUES
  ('f2000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004', 'balance', 100000, 'pending', NULL),
  ('f2000000-0000-4000-8000-000000000051', 'f0000000-0000-4000-8000-000000000005', 'deposit',  50000, 'pending', NULL),
  ('f2000000-0000-4000-8000-000000000052', 'f0000000-0000-4000-8000-000000000005', 'balance',  50000, 'pending', NULL),
  ('f2000000-0000-4000-8000-000000000061', 'f0000000-0000-4000-8000-000000000006', 'deposit',  50000, 'pending', NULL),
  ('f2000000-0000-4000-8000-000000000062', 'f0000000-0000-4000-8000-000000000006', 'balance',  50000, 'pending', NULL),
  ('f2000000-0000-4000-8000-000000000071', 'f0000000-0000-4000-8000-000000000007', 'deposit',  50000, 'paid',    CURRENT_DATE),
  ('f2000000-0000-4000-8000-000000000072', 'f0000000-0000-4000-8000-000000000007', 'balance',  50000, 'pending', NULL);

-- ─── case 1: linking an approved item to a draft PO → 'ordered' ─────────────

-- i1: INSERT-linked (Trigger A INSERT path stamps last_status_change_at itself).
INSERT INTO project_ffe_items (id, project_id, name, status, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000001', 'Item linked at insert', 'approved', 'f0000000-0000-4000-8000-000000000001');

-- i2: UPDATE-linked (Trigger A mutates NEW.status; the 00084 stamp trigger,
-- firing after it alphabetically, stamps last_status_change_at).
INSERT INTO project_ffe_items (id, project_id, name, status)
VALUES ('f1000000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-000000000001', 'Item linked via update', 'approved');

UPDATE project_ffe_items
   SET purchase_order_id = 'f0000000-0000-4000-8000-000000000001'
 WHERE id = 'f1000000-0000-4000-8000-000000000002';

DO $$
DECLARE
  v_status  TEXT;
  v_stamped TIMESTAMPTZ;
BEGIN
  SELECT status, last_status_change_at INTO v_status, v_stamped
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000001';
  ASSERT v_status = 'ordered',
    'FAIL 1a: INSERT-linked approved item should be ordered, got ' || v_status;
  ASSERT v_stamped IS NOT NULL,
    'FAIL 1b: INSERT-linked item should have last_status_change_at stamped';

  SELECT status, last_status_change_at INTO v_status, v_stamped
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000002';
  ASSERT v_status = 'ordered',
    'FAIL 1c: UPDATE-linked approved item should be ordered, got ' || v_status;
  ASSERT v_stamped IS NOT NULL,
    'FAIL 1d: UPDATE-linked item should have last_status_change_at stamped (00084 stamp trigger)';

  RAISE NOTICE 'Case 1 passed: linking ratchets approved → ordered.';
END
$$;

-- ─── case 2: linking an item already at 'shipped' → stays 'shipped' ─────────

INSERT INTO project_ffe_items (id, project_id, name, status)
VALUES ('f1000000-0000-4000-8000-000000000003', 'eeee0000-0000-4000-8000-000000000001', 'Item already shipped', 'shipped');

UPDATE project_ffe_items
   SET purchase_order_id = 'f0000000-0000-4000-8000-000000000001'
 WHERE id = 'f1000000-0000-4000-8000-000000000003';

DO $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000003';
  ASSERT v_status = 'shipped',
    'FAIL 2: shipped item linked to draft PO must stay shipped (ratchet no-op), got ' || v_status;

  RAISE NOTICE 'Case 2 passed: ratchet never moves an item backward.';
END
$$;

-- ─── case 3: PO → in_production cascades; manual advances untouched ─────────

-- i4: linked at INSERT but already 'delivered' (rank 6 ≥ draft target 3 → kept).
INSERT INTO project_ffe_items (id, project_id, name, status, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000004', 'eeee0000-0000-4000-8000-000000000001', 'Item manually delivered', 'delivered', 'f0000000-0000-4000-8000-000000000001');

UPDATE purchase_orders
   SET status = 'in_production'
 WHERE id = 'f0000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v1 TEXT; v2 TEXT; v3 TEXT; v4 TEXT;
BEGIN
  SELECT status INTO v1 FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000001';
  SELECT status INTO v2 FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000002';
  SELECT status INTO v3 FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000003';
  SELECT status INTO v4 FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000004';

  ASSERT v1 = 'production', 'FAIL 3a: ordered item should cascade to production, got ' || v1;
  ASSERT v2 = 'production', 'FAIL 3b: ordered item should cascade to production, got ' || v2;
  ASSERT v3 = 'shipped',    'FAIL 3c: shipped item must stay shipped (rank above production), got ' || v3;
  ASSERT v4 = 'delivered',  'FAIL 3d: manually-delivered item must be untouched, got ' || v4;

  RAISE NOTICE 'Case 3 passed: PO in_production cascades with rank ratchet.';
END
$$;

-- ─── case 4: PO → cancelled unlinks; in-flight roll back to approved ────────

UPDATE purchase_orders
   SET status = 'cancelled'
 WHERE id = 'f0000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_status TEXT;
  v_po_id  UUID;
BEGIN
  -- production items → unlinked + approved
  SELECT status, purchase_order_id INTO v_status, v_po_id
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000001';
  ASSERT v_status = 'approved', 'FAIL 4a: production item should roll back to approved, got ' || v_status;
  ASSERT v_po_id IS NULL,       'FAIL 4b: production item should be unlinked';

  SELECT status, purchase_order_id INTO v_status, v_po_id
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000002';
  ASSERT v_status = 'approved', 'FAIL 4c: production item should roll back to approved, got ' || v_status;
  ASSERT v_po_id IS NULL,       'FAIL 4d: production item should be unlinked';

  -- shipped item → unlinked + approved
  SELECT status, purchase_order_id INTO v_status, v_po_id
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000003';
  ASSERT v_status = 'approved', 'FAIL 4e: shipped item should roll back to approved, got ' || v_status;
  ASSERT v_po_id IS NULL,       'FAIL 4f: shipped item should be unlinked';

  -- delivered item → unlinked, status preserved
  SELECT status, purchase_order_id INTO v_status, v_po_id
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000004';
  ASSERT v_status = 'delivered', 'FAIL 4g: delivered item must keep its status on cancel, got ' || v_status;
  ASSERT v_po_id IS NULL,        'FAIL 4h: delivered item should still be unlinked';

  RAISE NOTICE 'Case 4 passed: cancellation unlinks; in-flight items roll back to approved.';
END
$$;

-- ─── case 5: clean inspection → delivered chain ──────────────────────────────

-- i5 linked to PO2 (confirmed) at insert → becomes 'ordered'; quantity 3.
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000005', 'eeee0000-0000-4000-8000-000000000001', 'Item awaiting delivery', 'approved', 3, 'f0000000-0000-4000-8000-000000000002');

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome)
VALUES ('f0000000-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999999999', 'clean');

DO $$
DECLARE
  v_po_status  TEXT;
  v_delivered  DATE;
  v_status     TEXT;
  v_received   INTEGER;
BEGIN
  SELECT status, delivered_date INTO v_po_status, v_delivered
    FROM purchase_orders WHERE id = 'f0000000-0000-4000-8000-000000000002';
  ASSERT v_delivered = CURRENT_DATE,
    'FAIL 5a: clean inspection should stamp delivered_date = today, got ' || COALESCE(v_delivered::text, 'NULL');
  ASSERT v_po_status = 'delivered',
    'FAIL 5b: clean inspection should advance PO to delivered, got ' || v_po_status;

  SELECT status, received_quantity INTO v_status, v_received
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000005';
  ASSERT v_status = 'delivered',
    'FAIL 5c: linked item should cascade to delivered, got ' || v_status;
  ASSERT v_received = 3,
    'FAIL 5d: received_quantity should equal quantity (3), got ' || COALESCE(v_received::text, 'NULL');

  RAISE NOTICE 'Case 5 passed: clean inspection drives the full delivered chain.';
END
$$;

-- ─── case 6: damaged inspection → delivered_date only ────────────────────────

-- i6 linked to PO3 (confirmed) at insert → becomes 'ordered'; quantity 2.
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000006', 'eeee0000-0000-4000-8000-000000000001', 'Item arriving damaged', 'approved', 2, 'f0000000-0000-4000-8000-000000000003');

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome)
VALUES ('f0000000-0000-4000-8000-000000000003', '99999999-9999-4999-8999-999999999999', 'damaged');

DO $$
DECLARE
  v_po_status  TEXT;
  v_delivered  DATE;
  v_status     TEXT;
  v_received   INTEGER;
BEGIN
  SELECT status, delivered_date INTO v_po_status, v_delivered
    FROM purchase_orders WHERE id = 'f0000000-0000-4000-8000-000000000003';
  ASSERT v_delivered = CURRENT_DATE,
    'FAIL 6a: damaged inspection should still stamp delivered_date (the truck arrived), got ' || COALESCE(v_delivered::text, 'NULL');
  ASSERT v_po_status = 'confirmed',
    'FAIL 6b: damaged inspection must NOT advance the PO, got ' || v_po_status;

  SELECT status, received_quantity INTO v_status, v_received
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000006';
  ASSERT v_status = 'ordered',
    'FAIL 6c: items must be unchanged on a damaged inspection, got ' || v_status;
  ASSERT v_received IS NULL,
    'FAIL 6d: received_quantity must stay NULL on a damaged inspection, got ' || COALESCE(v_received::text, 'NULL');

  RAISE NOTICE 'Case 6 passed: damaged inspection stamps delivered_date but advances nothing.';
END
$$;

-- ─── case 7: net_30 + clean inspection → balance due_date = delivered + 30d ─

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome)
VALUES ('f0000000-0000-4000-8000-000000000004', '99999999-9999-4999-8999-999999999999', 'clean');

DO $$
DECLARE
  v_delivered DATE;
  v_due       DATE;
  v_state     po_payment_state;
BEGIN
  SELECT delivered_date INTO v_delivered
    FROM purchase_orders WHERE id = 'f0000000-0000-4000-8000-000000000004';
  ASSERT v_delivered = CURRENT_DATE,
    'FAIL 7a: net_30 PO delivered_date should be today, got ' || COALESCE(v_delivered::text, 'NULL');

  SELECT due_date, state INTO v_due, v_state
    FROM po_payments WHERE id = 'f2000000-0000-4000-8000-000000000004';
  ASSERT v_due = v_delivered + 30,
    'FAIL 7b: net_30 balance due_date should be delivered+30d (' || (v_delivered + 30)::text || '), got ' || COALESCE(v_due::text, 'NULL');
  ASSERT v_state = 'pending',
    'FAIL 7c: net_30 due_date shift must not change state, got ' || v_state;

  RAISE NOTICE 'Case 7 passed: net-30 balance due_date shifted to delivered + 30 days.';
END
$$;

-- ─── case 8: fifty_fifty at shipped: deposit paid → balance due ──────────────

UPDATE po_payments
   SET state = 'paid', paid_date = CURRENT_DATE
 WHERE id = 'f2000000-0000-4000-8000-000000000051';

DO $$
DECLARE
  v_state      po_payment_state;
  v_due        DATE;
  v_notif_count INTEGER;
BEGIN
  SELECT state, due_date INTO v_state, v_due
    FROM po_payments WHERE id = 'f2000000-0000-4000-8000-000000000052';
  ASSERT v_state = 'due',
    'FAIL 8a: balance should flip to due when deposit is paid on a shipped PO, got ' || v_state;
  ASSERT v_due = CURRENT_DATE,
    'FAIL 8b: flipped balance should get due_date = today (was NULL), got ' || COALESCE(v_due::text, 'NULL');

  SELECT COUNT(*) INTO v_notif_count
    FROM procurement_notifications
   WHERE kind = 'balance_due'
     AND subject_payment_id = 'f2000000-0000-4000-8000-000000000052';
  ASSERT v_notif_count = 1,
    'FAIL 8c: 00151 notify trigger should have created exactly one balance_due notification, got ' || v_notif_count;

  RAISE NOTICE 'Case 8 passed: deposit paid on shipped PO flips balance to due + notifies.';
END
$$;

-- ─── case 9: inverse order — deposit paid first, then PO ships ───────────────

UPDATE po_payments
   SET state = 'paid', paid_date = CURRENT_DATE
 WHERE id = 'f2000000-0000-4000-8000-000000000061';

DO $$
DECLARE
  v_state po_payment_state;
BEGIN
  SELECT state INTO v_state
    FROM po_payments WHERE id = 'f2000000-0000-4000-8000-000000000062';
  ASSERT v_state = 'pending',
    'FAIL 9a: balance must stay pending while the PO is only confirmed, got ' || v_state;

  RAISE NOTICE 'Case 9a passed: deposit paid pre-shipment leaves balance pending.';
END
$$;

UPDATE purchase_orders
   SET status = 'shipped'
 WHERE id = 'f0000000-0000-4000-8000-000000000006';

DO $$
DECLARE
  v_state       po_payment_state;
  v_due         DATE;
  v_notif_count INTEGER;
BEGIN
  SELECT state, due_date INTO v_state, v_due
    FROM po_payments WHERE id = 'f2000000-0000-4000-8000-000000000062';
  ASSERT v_state = 'due',
    'FAIL 9b: balance should flip to due when the PO ships with deposit already paid, got ' || v_state;
  ASSERT v_due = CURRENT_DATE,
    'FAIL 9c: flipped balance should get due_date = today (was NULL), got ' || COALESCE(v_due::text, 'NULL');

  SELECT COUNT(*) INTO v_notif_count
    FROM procurement_notifications
   WHERE kind = 'balance_due'
     AND subject_payment_id = 'f2000000-0000-4000-8000-000000000062';
  ASSERT v_notif_count = 1,
    'FAIL 9d: 00151 notify trigger should have created exactly one balance_due notification, got ' || v_notif_count;

  RAISE NOTICE 'Case 9 passed: PO shipping after deposit payment flips balance to due + notifies.';
END
$$;

-- ─── case 10: deposit already paid, PO jumps confirmed → delivered ──────────
--
-- A clean inspection on a confirmed PO advances it straight to 'delivered'
-- (Trigger C) — the PO never passes through 'shipped'. Trigger B's
-- balance-flip condition includes 'delivered', so the pending balance must
-- still flip to 'due' (and the 00151 trigger must notify).

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome)
VALUES ('f0000000-0000-4000-8000-000000000007', '99999999-9999-4999-8999-999999999999', 'clean');

DO $$
DECLARE
  v_po_status   TEXT;
  v_state       po_payment_state;
  v_due         DATE;
  v_notif_count INTEGER;
BEGIN
  SELECT status INTO v_po_status
    FROM purchase_orders WHERE id = 'f0000000-0000-4000-8000-000000000007';
  ASSERT v_po_status = 'delivered',
    'FAIL 10a: clean inspection should advance the confirmed PO to delivered, got ' || v_po_status;

  SELECT state, due_date INTO v_state, v_due
    FROM po_payments WHERE id = 'f2000000-0000-4000-8000-000000000072';
  ASSERT v_state = 'due',
    'FAIL 10b: balance should flip to due when the PO reaches delivered without passing shipped, got ' || v_state;
  ASSERT v_due = CURRENT_DATE,
    'FAIL 10c: flipped balance should get due_date = today (was NULL), got ' || COALESCE(v_due::text, 'NULL');

  SELECT COUNT(*) INTO v_notif_count
    FROM procurement_notifications
   WHERE kind = 'balance_due'
     AND subject_payment_id = 'f2000000-0000-4000-8000-000000000072';
  ASSERT v_notif_count = 1,
    'FAIL 10d: 00151 notify trigger should have created exactly one balance_due notification, got ' || v_notif_count;

  RAISE NOTICE 'Case 10 passed: confirmed → delivered jump flips balance to due + notifies.';
END
$$;

-- ─── case 11: re-link to a further-along PO ratchets; back-link is a no-op ───
--
-- Trigger A fires on UPDATE OF purchase_order_id whenever the link CHANGES,
-- not just on first link. Re-linking to a PO at a higher stage ratchets the
-- item up; re-linking back to a lower-stage PO must never move it backward.

-- i7: approved item linked to PO8 (draft) at insert → 'ordered'.
INSERT INTO project_ffe_items (id, project_id, name, status, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000007', 'eeee0000-0000-4000-8000-000000000001', 'Item re-linked across POs', 'approved', 'f0000000-0000-4000-8000-000000000008');

DO $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000007';
  ASSERT v_status = 'ordered',
    'FAIL 11a: item linked to draft PO should be ordered, got ' || v_status;

  RAISE NOTICE 'Case 11a passed: initial link to draft PO → ordered.';
END
$$;

-- Re-link to PO9 (in_production) → ratchets up to 'production'.
UPDATE project_ffe_items
   SET purchase_order_id = 'f0000000-0000-4000-8000-000000000009'
 WHERE id = 'f1000000-0000-4000-8000-000000000007';

DO $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000007';
  ASSERT v_status = 'production',
    'FAIL 11b: re-link to in_production PO should ratchet to production, got ' || v_status;

  RAISE NOTICE 'Case 11b passed: re-link to in_production PO → production.';
END
$$;

-- Re-link back to PO8 (draft, target 'ordered' = rank 3 < production = rank 4)
-- → ratchet no-op, status preserved.
UPDATE project_ffe_items
   SET purchase_order_id = 'f0000000-0000-4000-8000-000000000008'
 WHERE id = 'f1000000-0000-4000-8000-000000000007';

DO $$
DECLARE
  v_status TEXT;
  v_po_id  UUID;
BEGIN
  SELECT status, purchase_order_id INTO v_status, v_po_id
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000007';
  ASSERT v_status = 'production',
    'FAIL 11c: re-link back to draft PO must not move the item backward, got ' || v_status;
  ASSERT v_po_id = 'f0000000-0000-4000-8000-000000000008',
    'FAIL 11d: item should now be linked to the draft PO again';

  RAISE NOTICE 'Case 11 passed: re-link ratchets up; back-link to lower target is a no-op.';
END
$$;

-- ─── case 12: manual unlink leaves status untouched ──────────────────────────
--
-- Setting purchase_order_id = NULL by hand (designer detaches an item) must
-- not touch status: Trigger A early-returns on a NULL link, and Trigger B
-- only reacts to PO status changes — not item-side unlinks.

-- i8: approved item linked to PO10 (confirmed) at insert → 'ordered'.
INSERT INTO project_ffe_items (id, project_id, name, status, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000008', 'eeee0000-0000-4000-8000-000000000001', 'Item manually unlinked', 'approved', 'f0000000-0000-4000-8000-000000000010');

DO $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000008';
  ASSERT v_status = 'ordered',
    'FAIL 12a: item linked to confirmed PO should be ordered, got ' || v_status;

  RAISE NOTICE 'Case 12a passed: link to confirmed PO → ordered.';
END
$$;

UPDATE project_ffe_items
   SET purchase_order_id = NULL
 WHERE id = 'f1000000-0000-4000-8000-000000000008';

DO $$
DECLARE
  v_status TEXT;
  v_po_id  UUID;
BEGIN
  SELECT status, purchase_order_id INTO v_status, v_po_id
    FROM project_ffe_items WHERE id = 'f1000000-0000-4000-8000-000000000008';
  ASSERT v_status = 'ordered',
    'FAIL 12b: manual unlink must leave status untouched, got ' || v_status;
  ASSERT v_po_id IS NULL,
    'FAIL 12c: item should be unlinked';

  RAISE NOTICE 'Case 12 passed: manual unlink leaves status untouched.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All procurement state-chain assertions passed.'; END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
