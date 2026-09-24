-- ═══════════════════════════════════════════════════════════════════════════
-- D9 — a delivery belongs to the inspecting phone's local day (migration 00665)
--
--   1. An inspection at 19:00 in Los Angeles (02:00 UTC the next day) that
--      carries inspected_local_date stamps delivered_date with that local day.
--   2. A legacy inspection with no local date falls back to the UTC day.
--   3. For both, the net-30 pending balance due_date = delivered_date + 30.
--   4. A later inspection's local day does not move an already-stamped
--      delivered_date or due_date.
--   5. The local day is bounded to ±1 day of the UTC day of inspected_at:
--      +2 and -2 raise check_violation on
--      receiving_inspections_local_date_near_inspected_at, while +1 (08:00 in
--      Pacific/Kiritimati, UTC+14) is accepted, stamps its local day, and puts
--      the net-30 due date 30 days after it.
--
-- The session zone is pinned to UTC, which is Strata's, so the fallback is the
-- UTC day it is in production. Runs as superuser in one transaction and rolls
-- back; the focus is the trigger, not RLS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL timezone = 'UTC';

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('d9000000-0000-4000-8000-000000000001', 'd9-delivery-day@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('d9000000-0000-4000-8000-000000000001', 'd9-delivery-day@test.invalid', 'D9 Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('d9000000-0000-4000-8000-000000000002', 'D9 Delivery Day Project',
        'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001');

INSERT INTO vendors (id, name)
VALUES ('d9000000-0000-4000-8000-000000000003', 'D9 Delivery Day Vendor');

-- PO-L: phone sends its local day.  PO-U: legacy client, no local day.
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status)
VALUES
  ('d9000000-0000-4000-8000-0000000000a1', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
   'd9000000-0000-4000-8000-000000000003', 'net_30', 100000, 'shipped'),
  ('d9000000-0000-4000-8000-0000000000b1', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
   'd9000000-0000-4000-8000-000000000003', 'net_30', 100000, 'shipped');

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, paid_date)
VALUES
  ('d9000000-0000-4000-8000-0000000000a2', 'd9000000-0000-4000-8000-0000000000a1', 'balance', 100000, 'pending', NULL),
  ('d9000000-0000-4000-8000-0000000000b2', 'd9000000-0000-4000-8000-0000000000b1', 'balance', 100000, 'pending', NULL);

-- 19:00 PDT on 23 Sep 2026 is 02:00 UTC on 24 Sep 2026.
INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome, inspected_at, inspected_local_date)
VALUES ('d9000000-0000-4000-8000-0000000000a1', 'd9000000-0000-4000-8000-000000000001', 'clean',
        '2026-09-23 19:00:00 America/Los_Angeles', '2026-09-23');

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome, inspected_at)
VALUES ('d9000000-0000-4000-8000-0000000000b1', 'd9000000-0000-4000-8000-000000000001', 'clean',
        '2026-09-23 19:00:00 America/Los_Angeles');

DO $$
DECLARE
  v_delivered DATE;
  v_due       DATE;
BEGIN
  -- Guard the fixture: the instant really is the next day in UTC.
  ASSERT ('2026-09-23 19:00:00 America/Los_Angeles'::timestamptz)::date = DATE '2026-09-24',
    'FIXTURE: 19:00 in Los Angeles should be the next UTC day';

  -- 1 + 3: local day wins, due date follows it.
  SELECT delivered_date INTO v_delivered
    FROM purchase_orders WHERE id = 'd9000000-0000-4000-8000-0000000000a1';
  ASSERT v_delivered = DATE '2026-09-23',
    'FAIL 1: local-day inspection should stamp 2026-09-23, got ' || COALESCE(v_delivered::text, 'NULL');
  ASSERT v_delivered = ('2026-09-23 19:00:00 America/Los_Angeles'::timestamptz AT TIME ZONE 'UTC')::date - 1,
    'FAIL 1b: the Los Angeles local day should be the UTC day - 1, got ' || COALESCE(v_delivered::text, 'NULL');
  SELECT due_date INTO v_due
    FROM po_payments WHERE id = 'd9000000-0000-4000-8000-0000000000a2';
  ASSERT v_due = v_delivered + 30,
    'FAIL 3a: due_date should be delivered + 30 (2026-10-23), got ' || COALESCE(v_due::text, 'NULL');

  -- 2 + 3: legacy row falls back to the UTC day, due date follows it.
  SELECT delivered_date INTO v_delivered
    FROM purchase_orders WHERE id = 'd9000000-0000-4000-8000-0000000000b1';
  ASSERT v_delivered = DATE '2026-09-24',
    'FAIL 2: legacy inspection should fall back to the UTC day 2026-09-24, got ' || COALESCE(v_delivered::text, 'NULL');
  SELECT due_date INTO v_due
    FROM po_payments WHERE id = 'd9000000-0000-4000-8000-0000000000b2';
  ASSERT v_due = v_delivered + 30,
    'FAIL 3b: due_date should be delivered + 30 (2026-10-24), got ' || COALESCE(v_due::text, 'NULL');

  RAISE NOTICE 'D9 passed: local day stamps delivered_date; legacy falls back to UTC; due_date = delivered + 30.';
END
$$;

-- 4: a later inspection's local day never moves a delivery already stamped.
INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome, inspected_at, inspected_local_date)
VALUES ('d9000000-0000-4000-8000-0000000000a1', 'd9000000-0000-4000-8000-000000000001', 'damaged',
        '2026-09-30 10:00:00 America/Los_Angeles', '2026-09-30');

DO $$
DECLARE
  v_delivered DATE;
  v_due       DATE;
BEGIN
  SELECT delivered_date INTO v_delivered
    FROM purchase_orders WHERE id = 'd9000000-0000-4000-8000-0000000000a1';
  ASSERT v_delivered = DATE '2026-09-23',
    'FAIL 4a: an existing delivered_date must not move, got ' || COALESCE(v_delivered::text, 'NULL');
  SELECT due_date INTO v_due
    FROM po_payments WHERE id = 'd9000000-0000-4000-8000-0000000000a2';
  ASSERT v_due = DATE '2026-10-23',
    'FAIL 4b: an existing due_date must not move, got ' || COALESCE(v_due::text, 'NULL');

  RAISE NOTICE 'D9 passed: a later inspection leaves the stamped delivery day alone.';
END
$$;

-- 5a: a local day two days off the UTC day is refused, either way.
DO $$
DECLARE
  v_offset     INT;
  v_constraint TEXT;
BEGIN
  FOREACH v_offset IN ARRAY ARRAY[2, -2] LOOP
    v_constraint := NULL;
    BEGIN
      INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome, inspected_at, inspected_local_date)
      VALUES ('d9000000-0000-4000-8000-0000000000b1', 'd9000000-0000-4000-8000-000000000001', 'clean',
              '2026-09-25 12:00:00+00', DATE '2026-09-25' + v_offset);
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    END;
    ASSERT v_constraint = 'receiving_inspections_local_date_near_inspected_at',
      'FAIL 5a: a local day ' || v_offset || ' days off the UTC day should raise check_violation on '
      || 'receiving_inspections_local_date_near_inspected_at, got ' || COALESCE(v_constraint, 'no violation');
  END LOOP;

  RAISE NOTICE 'D9 passed: a local day two days off the UTC day is refused (+2 and -2).';
END
$$;

-- 5b: Pacific/Kiritimati (UTC+14). 08:00 on 24 Sep there is 18:00 UTC on 23 Sep,
-- so the local day is the UTC day + 1: accepted, stamped, due 30 days later.
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status)
VALUES ('d9000000-0000-4000-8000-0000000000c1', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
        'd9000000-0000-4000-8000-000000000003', 'net_30', 100000, 'shipped');

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, paid_date)
VALUES ('d9000000-0000-4000-8000-0000000000c2', 'd9000000-0000-4000-8000-0000000000c1', 'balance', 100000, 'pending', NULL);

INSERT INTO receiving_inspections (purchase_order_id, inspected_by, outcome, inspected_at, inspected_local_date)
VALUES ('d9000000-0000-4000-8000-0000000000c1', 'd9000000-0000-4000-8000-000000000001', 'clean',
        '2026-09-24 08:00:00 Pacific/Kiritimati', '2026-09-24');

DO $$
DECLARE
  v_delivered DATE;
  v_due       DATE;
BEGIN
  ASSERT ('2026-09-24 08:00:00 Pacific/Kiritimati'::timestamptz AT TIME ZONE 'UTC')::date = DATE '2026-09-23',
    'FIXTURE: 08:00 in Kiritimati should be the previous UTC day';

  SELECT delivered_date INTO v_delivered
    FROM purchase_orders WHERE id = 'd9000000-0000-4000-8000-0000000000c1';
  ASSERT v_delivered = DATE '2026-09-24',
    'FAIL 5b: the Kiritimati local day (UTC day + 1) should stamp 2026-09-24, got ' || COALESCE(v_delivered::text, 'NULL');
  SELECT due_date INTO v_due
    FROM po_payments WHERE id = 'd9000000-0000-4000-8000-0000000000c2';
  ASSERT v_due = DATE '2026-10-24',
    'FAIL 5c: the Kiritimati net-30 due_date should be 2026-10-24, got ' || COALESCE(v_due::text, 'NULL');

  RAISE NOTICE 'D9 passed: a +1 local day (Kiritimati) is accepted, stamped, and due 30 days later.';
END
$$;

ROLLBACK;
