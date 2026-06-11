-- ═══════════════════════════════════════════════════════════════════════════
-- create_purchase_order / log_po_acknowledgment RPC tests (migration 00186)
--
-- Exercises the atomic PO-create RPC and the vendor-acknowledgment RPC:
--   1. Happy path fifty_fifty: header total = vendor TRADE total over items
--      with mixed trade/null-trade pricing, exactly 2 pending payment rows
--      with floor-split amounts, items linked + auto-ratcheted to 'ordered'
--      (00184 Trigger A), sidemark + notes stored, status 'draft'.
--   2. Rejects an item already linked to another PO.
--   3. Rejects a blocked (decision-gated) item — server-side guard for what
--      was previously client-side-only.
--   4. Rejects cross-project item ids (count mismatch hard-fail).
--   5. custom_milestones validation: Σ ≠ total raises; empty raises; a
--      valid set inserts one milestone row per entry with label/sort/due.
--   6. net_30: single pending balance row at the trade total, NULL due_date.
--   7. log_po_acknowledgment: sets acknowledged_at + status 'confirmed',
--      coalesce-updates vendor_po_number; idempotent re-call keeps the
--      original acknowledged_at and preserves fields on NULL args; linked
--      items stay 'ordered' (Trigger B rank no-op).
--   8. log_po_acknowledgment rejections: non-owner (request.jwt.claims
--      switched to another user) and wrong status ('shipped').
--   9. create_purchase_order rejection by a non-owner: rival user attempts to
--      create a PO against the owner's project; RPC must raise 'not found or
--      access denied' and leave the project untouched.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/procurement/create_po_rpc_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. The RPCs are SECURITY
-- DEFINER and resolve the caller from auth.uid(), so each case sets
-- request.jwt.claims (the auth-context idiom from
-- tests/rls/products_three_layer_test.sql) rather than relying on roles.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Designer (owner), rival designer (non-owner) auth users + profiles
-- (profiles may be auto-created by an auth.users trigger; ON CONFLICT keeps
-- this agnostic).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('77777777-7777-4777-8777-777777777701', 'create-po-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- u_owner
  ('77777777-7777-4777-8777-777777777702', 'create-po-rival@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- u_rival

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('77777777-7777-4777-8777-777777777701', 'create-po-designer@test.invalid', 'Create PO Designer', NOW(), NOW()), -- u_owner
  ('77777777-7777-4777-8777-777777777702', 'create-po-rival@test.invalid',    'Create PO Rival',    NOW(), NOW())  -- u_rival
ON CONFLICT (id) DO NOTHING;

-- Designer's project + a rival-owned project (for the cross-project case).
INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('cc000000-0000-4000-8000-000000000001', 'Create PO Test Project',  '77777777-7777-4777-8777-777777777701', '77777777-7777-4777-8777-777777777701'), -- p_owner
  ('cc000000-0000-4000-8000-000000000002', 'Create PO Rival Project', '77777777-7777-4777-8777-777777777702', '77777777-7777-4777-8777-777777777702'); -- p_rival

INSERT INTO vendors (id, name)
VALUES ('cc000000-0000-4000-8000-000000000003', 'Create PO Test Vendor'); -- v1

-- Pre-existing PO (for the already-linked rejection) and ack-fixture POs.
--   po_linked   draft       — i_linked already belongs to it (case 2)
--   po_ack2     confirmed   — pre-acknowledged sentinel for idempotency (case 7e/7f/7g);
--                             vendor_po_number starts 'KEEP-01', mutated to 'KEEP-02'
--                             by sub-case 7h — subsequent sub-cases must not assume 'KEEP-01'
--   po_shipped  shipped     — wrong-status ack rejection (case 8c)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, vendor_po_number, acknowledged_at)
VALUES
  ('cc100000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777701', 'cc000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000003', 'full_upfront', 50000, 'draft',     NULL,      NULL),      -- po_linked
  ('cc100000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777701', 'cc000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000003', 'net_30',       70000, 'confirmed', 'KEEP-01', '2026-01-01T00:00:00Z'), -- po_ack2
  ('cc100000-0000-4000-8000-000000000003', '77777777-7777-4777-8777-777777777701', 'cc000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000003', 'net_30',       90000, 'shipped',   NULL,      NULL);      -- po_shipped

-- FF&E items:
--   i1        trade 80000 × qty 2 (trade wins over unit 100000)  → 160000
--   i2        trade NULL, unit 50000 × qty 1 (unit fallback)     →  50000
--                                              case-1 trade total: 210000
--   i_linked  already on po_linked (case 2)
--   i_blocked blocked = true (case 3)
--   i_rival   belongs to the rival's project (case 4)
--   i3        trade 40000 × qty 1 (cases 5a/5b/5c — custom milestones)
--   i4        trade NULL, unit NULL → COALESCE(...,0) → 0; with i5 keeps
--             net_30 total = 30000 (case 6, NULL-price tolerance)
--   i5        trade 30000 × qty 1 (case 6)
--   i6        trade 25000 × qty 1 (case 7 — acknowledgment fixture PO)
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, blocked, purchase_order_id)
VALUES
  ('cc200000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'Trade-priced sofa',   'approved', 2, 100000, 80000, 200000, FALSE, NULL),                             -- i1
  ('cc200000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000001', 'No-trade lamp',       'approved', 1,  50000,  NULL,  50000, FALSE, NULL),                             -- i2
  ('cc200000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000001', 'Already-ordered rug', 'approved', 1,  30000, 20000,  30000, FALSE, 'cc100000-0000-4000-8000-000000000001'), -- i_linked
  ('cc200000-0000-4000-8000-000000000004', 'cc000000-0000-4000-8000-000000000001', 'Blocked credenza',    'approved', 1,  60000, 45000,  60000, TRUE,  NULL),                             -- i_blocked
  ('cc200000-0000-4000-8000-000000000005', 'cc000000-0000-4000-8000-000000000002', 'Rival project chair', 'approved', 1,  40000, 30000,  40000, FALSE, NULL),                             -- i_rival
  ('cc200000-0000-4000-8000-000000000006', 'cc000000-0000-4000-8000-000000000001', 'Milestone console',   'approved', 1,  55000, 40000,  55000, FALSE, NULL),                             -- i3
  ('cc200000-0000-4000-8000-000000000007', 'cc000000-0000-4000-8000-000000000001', 'Unpriced ottoman',    'approved', 3,   NULL,  NULL,   NULL, FALSE, NULL),                             -- i4
  ('cc200000-0000-4000-8000-000000000008', 'cc000000-0000-4000-8000-000000000001', 'Net-30 side table',   'approved', 1,  42000, 30000,  42000, FALSE, NULL),                             -- i5
  ('cc200000-0000-4000-8000-000000000009', 'cc000000-0000-4000-8000-000000000001', 'Ack-fixture mirror',  'approved', 1,  32000, 25000,  32000, FALSE, NULL),                             -- i6
  ('cc200000-0000-4000-8000-000000000010', 'cc000000-0000-4000-8000-000000000001', 'Non-owner test lamp', 'approved', 1,  20000, 15000,  20000, FALSE, NULL);                             -- i7 (case 9 non-owner rejection)

-- ─── helpers ───────────────────────────────────────────────────────────────
--
-- The RPCs resolve the caller via auth.uid() = request.jwt.claims->>'sub'.
-- SECURITY DEFINER means the function body never depends on the session role,
-- so switching the claims GUC alone is enough (same claims idiom as
-- tests/rls/products_three_layer_test.sql).

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

-- ─── case 1: happy path fifty_fifty ──────────────────────────────────────────

DO $$
DECLARE
  v_po       purchase_orders;
  v_payments INTEGER;
  r          RECORD;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');

  v_po := create_purchase_order(
    p_project_id       => 'cc000000-0000-4000-8000-000000000001',
    p_vendor_id        => 'cc000000-0000-4000-8000-000000000003',
    p_payment_pattern  => 'fifty_fifty',
    p_ffe_item_ids     => ARRAY[
      'cc200000-0000-4000-8000-000000000001',
      'cc200000-0000-4000-8000-000000000002'
    ]::uuid[],
    p_deposit_due_date => '2026-07-01',
    p_sidemark         => 'Middlewest / Olsen / Lake House / Great Room',
    p_notes            => 'White-glove delivery.'
  );

  -- Header: server-computed TRADE total = 80000×2 + COALESCE(NULL,50000)×1.
  ASSERT v_po.total_cents = 210000,
    'FAIL 1a: total_cents should be the trade total 210000, got ' || v_po.total_cents::text;
  ASSERT v_po.status = 'draft',
    'FAIL 1b: new PO should be draft, got ' || v_po.status;
  ASSERT v_po.designer_id = '77777777-7777-4777-8777-777777777701',
    'FAIL 1c: designer_id should be the caller';
  ASSERT v_po.sidemark = 'Middlewest / Olsen / Lake House / Great Room',
    'FAIL 1d: sidemark should be stored, got ' || COALESCE(v_po.sidemark, 'NULL');
  ASSERT v_po.notes = 'White-glove delivery.',
    'FAIL 1e: notes should be stored';
  ASSERT v_po.acknowledged_at IS NULL,
    'FAIL 1f: acknowledged_at should start NULL';

  -- Payments: deposit floor(210000/2)=105000 (due 2026-07-01) + balance 105000.
  SELECT COUNT(*) INTO v_payments FROM po_payments WHERE purchase_order_id = v_po.id;
  ASSERT v_payments = 2,
    'FAIL 1g: fifty_fifty should create exactly 2 payment rows, got ' || v_payments::text;

  SELECT * INTO r FROM po_payments
   WHERE purchase_order_id = v_po.id AND kind = 'deposit';
  ASSERT r.amount_cents = 105000 AND r.state = 'pending' AND r.sort_order = 0
         AND r.due_date = '2026-07-01',
    'FAIL 1h: deposit row should be 105000/pending/sort 0/due 2026-07-01';

  SELECT * INTO r FROM po_payments
   WHERE purchase_order_id = v_po.id AND kind = 'balance';
  ASSERT r.amount_cents = 105000 AND r.state = 'pending' AND r.sort_order = 1
         AND r.due_date IS NULL,
    'FAIL 1i: balance row should be 105000/pending/sort 1/no due date';

  -- Items linked + ratcheted to 'ordered' by 00184 Trigger A.
  SELECT COUNT(*) INTO v_payments
    FROM project_ffe_items
   WHERE purchase_order_id = v_po.id AND status = 'ordered';
  ASSERT v_payments = 2,
    'FAIL 1j: both items should be linked and auto-advanced to ordered, got ' || v_payments::text;

  RAISE NOTICE 'Case 1 passed: fifty_fifty happy path (trade total, payment split, link + ratchet, sidemark).';
END
$$;

-- ─── case 2: rejects an already-linked item ──────────────────────────────────

DO $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');
  BEGIN
    PERFORM create_purchase_order(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000003',
      'net_30',
      ARRAY['cc200000-0000-4000-8000-000000000003']::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%already linked to a purchase order%',
    'FAIL 2: already-linked item should raise, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 2 passed: already-linked item rejected.';
END
$$;

-- ─── case 3: rejects a blocked item (server-side decision guard) ─────────────

DO $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');
  BEGIN
    PERFORM create_purchase_order(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000003',
      'net_30',
      ARRAY['cc200000-0000-4000-8000-000000000004']::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%blocked pending a client decision%',
    'FAIL 3: blocked item should raise, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 3 passed: decision-blocked item rejected.';
END
$$;

-- ─── case 4: rejects cross-project item ids ──────────────────────────────────

DO $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');
  BEGIN
    -- One valid item + one item from the rival's project: the count check
    -- must fail the WHOLE transaction (no partial link).
    PERFORM create_purchase_order(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000003',
      'net_30',
      ARRAY[
        'cc200000-0000-4000-8000-000000000006',
        'cc200000-0000-4000-8000-000000000005'
      ]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found in project%',
    'FAIL 4a: cross-project ids should raise, got ' || COALESCE(v_err, 'no error');

  -- The valid item must remain untouched (atomicity).
  PERFORM 1 FROM project_ffe_items
   WHERE id = 'cc200000-0000-4000-8000-000000000006'
     AND purchase_order_id IS NULL AND status = 'approved';
  ASSERT FOUND, 'FAIL 4b: failed create must not partially link/advance items';

  RAISE NOTICE 'Case 4 passed: cross-project ids rejected atomically.';
END
$$;

-- ─── case 5: custom_milestones validation + happy path ───────────────────────

DO $$
DECLARE
  v_err TEXT;
  v_po  purchase_orders;
  r     RECORD;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');

  -- 5a: Σ ≠ total raises (item trade total is 40000, milestones sum 30000).
  v_err := NULL;
  BEGIN
    PERFORM create_purchase_order(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000003',
      'custom_milestones',
      ARRAY['cc200000-0000-4000-8000-000000000006']::uuid[],
      p_custom_milestones => '[{"label":"Deposit","amount_cents":10000,"sort_order":0},
                              {"label":"Final","amount_cents":20000,"sort_order":1}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%milestone amounts sum to 30000 but the PO trade total is 40000%',
    'FAIL 5a: milestone sum mismatch should raise, got ' || COALESCE(v_err, 'no error');

  -- 5b: empty milestones raises.
  v_err := NULL;
  BEGIN
    PERFORM create_purchase_order(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000003',
      'custom_milestones',
      ARRAY['cc200000-0000-4000-8000-000000000006']::uuid[],
      p_custom_milestones => '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%requires at least one milestone%',
    'FAIL 5b: empty milestones should raise, got ' || COALESCE(v_err, 'no error');

  -- 5c: valid set inserts one row per milestone with label/due/sort ported.
  v_po := create_purchase_order(
    'cc000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000003',
    'custom_milestones',
    ARRAY['cc200000-0000-4000-8000-000000000006']::uuid[],
    p_custom_milestones => '[{"label":"Deposit","amount_cents":10000,"due_date":"2026-07-15","sort_order":0},
                            {"label":"Mid-production","amount_cents":15000,"sort_order":1},
                            {"label":"Final","amount_cents":15000,"sort_order":2}]'::jsonb
  );
  ASSERT v_po.total_cents = 40000,
    'FAIL 5c: custom PO trade total should be 40000, got ' || v_po.total_cents::text;

  SELECT COUNT(*) AS n,
         COUNT(*) FILTER (WHERE kind = 'milestone' AND state = 'pending') AS pending_milestones
    INTO r
    FROM po_payments WHERE purchase_order_id = v_po.id;
  ASSERT r.n = 3 AND r.pending_milestones = 3,
    'FAIL 5d: expected 3 pending milestone rows, got ' || r.n::text;

  SELECT * INTO r FROM po_payments
   WHERE purchase_order_id = v_po.id AND sort_order = 0;
  ASSERT r.label = 'Deposit' AND r.amount_cents = 10000 AND r.due_date = '2026-07-15',
    'FAIL 5e: first milestone should carry label/amount/due_date';

  RAISE NOTICE 'Case 5 passed: custom_milestones validation (sum mismatch, empty) + happy path.';
END
$$;

-- ─── case 6: net_30 single pending balance ───────────────────────────────────

DO $$
DECLARE
  v_po purchase_orders;
  r    RECORD;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');

  -- i4 has NULL trade AND NULL unit (counts 0); i5 has trade 30000.
  v_po := create_purchase_order(
    'cc000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000003',
    'net_30',
    ARRAY[
      'cc200000-0000-4000-8000-000000000007',
      'cc200000-0000-4000-8000-000000000008'
    ]::uuid[]
  );
  ASSERT v_po.total_cents = 30000,
    'FAIL 6a: net_30 trade total should be 30000 (NULL-priced item counts 0), got ' || v_po.total_cents::text;

  SELECT COUNT(*) AS n, MIN(kind::text) AS kind, MIN(state::text) AS state,
         BOOL_AND(due_date IS NULL) AS no_due
    INTO r
    FROM po_payments WHERE purchase_order_id = v_po.id;
  ASSERT r.n = 1 AND r.kind = 'balance' AND r.state = 'pending' AND r.no_due,
    'FAIL 6b: net_30 should create exactly one pending balance with NULL due_date';

  RAISE NOTICE 'Case 6 passed: net_30 single pending balance at the trade total.';
END
$$;

-- ─── case 7: log_po_acknowledgment happy path + idempotency ──────────────────

DO $$
DECLARE
  v_create  purchase_orders;
  v_po      purchase_orders;
  v_ordered INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');

  -- 7a: fresh draft PO over the dedicated i6 item (every other unblocked
  -- item in this project is already linked by cases 1/5c/6).
  v_create := create_purchase_order(
    'cc000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000003',
    'full_upfront',
    ARRAY['cc200000-0000-4000-8000-000000000009']::uuid[]
  );
  ASSERT v_create.status = 'draft' AND v_create.acknowledged_at IS NULL,
    'FAIL 7-pre: fixture PO should start draft/unacknowledged';

  v_po := log_po_acknowledgment(v_create.id, 'ACK-123', '2026-08-01');
  ASSERT v_po.status = 'confirmed',
    'FAIL 7a: ack should advance draft → confirmed, got ' || v_po.status;
  ASSERT v_po.acknowledged_at IS NOT NULL,
    'FAIL 7b: ack should stamp acknowledged_at';
  ASSERT v_po.vendor_po_number = 'ACK-123' AND v_po.confirmed_eta = '2026-08-01',
    'FAIL 7c: ack should set vendor_po_number + confirmed_eta';

  -- Trigger B ('confirmed' → 'ordered' mapping) is a rank no-op for the
  -- already-'ordered' linked item.
  SELECT COUNT(*) INTO v_ordered
    FROM project_ffe_items
   WHERE purchase_order_id = v_create.id AND status = 'ordered';
  ASSERT v_ordered = 1,
    'FAIL 7d: linked item should remain ordered after acknowledgment';

  -- 7e: idempotent re-call with NULL args — keeps acknowledged_at,
  -- vendor_po_number, confirmed_eta exactly as they were. Uses the
  -- pre-acknowledged sentinel fixture (acknowledged_at = 2026-01-01,
  -- vendor_po_number = KEEP-01) because NOW() is frozen per-transaction and
  -- can't distinguish first-stamp from re-stamp within this test.
  v_po := log_po_acknowledgment('cc100000-0000-4000-8000-000000000002');
  ASSERT v_po.acknowledged_at = '2026-01-01T00:00:00Z'::timestamptz,
    'FAIL 7e: re-ack must keep the original acknowledged_at, got ' || v_po.acknowledged_at::text;
  ASSERT v_po.vendor_po_number = 'KEEP-01',
    'FAIL 7f: NULL vendor_po_number arg must preserve the existing value, got ' || COALESCE(v_po.vendor_po_number, 'NULL');
  ASSERT v_po.status = 'confirmed',
    'FAIL 7g: re-ack of a confirmed PO stays confirmed';

  -- 7h: coalesce-overwrite — supplying a value DOES update it.
  v_po := log_po_acknowledgment('cc100000-0000-4000-8000-000000000002', 'KEEP-02');
  ASSERT v_po.vendor_po_number = 'KEEP-02',
    'FAIL 7h: non-NULL vendor_po_number arg should overwrite, got ' || COALESCE(v_po.vendor_po_number, 'NULL');
  ASSERT v_po.acknowledged_at = '2026-01-01T00:00:00Z'::timestamptz,
    'FAIL 7i: overwriting the PO number must still not touch acknowledged_at';

  RAISE NOTICE 'Case 7 passed: acknowledgment happy path + idempotent re-call.';
END
$$;

-- ─── case 8: acknowledgment rejections (non-owner, wrong status) ─────────────

DO $$
DECLARE
  v_err TEXT;
BEGIN
  -- 8a: non-owner — switch the auth context to the rival designer.
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777702');
  v_err := NULL;
  BEGIN
    PERFORM log_po_acknowledgment('cc100000-0000-4000-8000-000000000002', 'HIJACK-01');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found or access denied%',
    'FAIL 8a: non-owner ack should raise, got ' || COALESCE(v_err, 'no error');

  -- The rival's attempt must not have changed anything.
  PERFORM 1 FROM purchase_orders
   WHERE id = 'cc100000-0000-4000-8000-000000000002' AND vendor_po_number = 'KEEP-02';
  ASSERT FOUND, 'FAIL 8b: non-owner ack must not mutate the PO';

  -- 8c: wrong status — owner acks a shipped PO.
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');
  v_err := NULL;
  BEGIN
    PERFORM log_po_acknowledgment('cc100000-0000-4000-8000-000000000003');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is shipped, expected draft or confirmed%',
    'FAIL 8c: shipped PO ack should raise, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 8 passed: acknowledgment rejects non-owner and wrong status.';
END
$$;

-- ─── case 9: create_purchase_order rejected for non-owner ───────────────────
--
-- The rival user (u_rival) attempts to create a PO against the owner's project
-- (p_owner) using a valid unlinked item (i7) that belongs to that project.
-- The RPC resolves ownership via auth.uid() and must refuse the call with
-- 'not found or access denied', leaving i7 untouched.

DO $$
DECLARE
  v_err TEXT;
BEGIN
  -- Switch auth context to the rival designer.
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777702');
  v_err := NULL;
  BEGIN
    PERFORM create_purchase_order(
      'cc000000-0000-4000-8000-000000000001',  -- p_owner's project
      'cc000000-0000-4000-8000-000000000003',
      'net_30',
      ARRAY['cc200000-0000-4000-8000-000000000010']::uuid[]  -- i7
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found or access denied%',
    'FAIL 9a: rival create_purchase_order against owner project should raise, got ' || COALESCE(v_err, 'no error');

  -- Restore owner context and verify i7 was NOT linked by the failed attempt.
  PERFORM pg_temp.assume_user('77777777-7777-4777-8777-777777777701');
  PERFORM 1 FROM project_ffe_items
   WHERE id = 'cc200000-0000-4000-8000-000000000010'
     AND purchase_order_id IS NULL AND status = 'approved';
  ASSERT FOUND, 'FAIL 9b: non-owner create must not partially link/advance item i7';

  RAISE NOTICE 'Case 9 passed: non-owner create_purchase_order rejected with not found or access denied.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All create_purchase_order / log_po_acknowledgment assertions passed.'; END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
