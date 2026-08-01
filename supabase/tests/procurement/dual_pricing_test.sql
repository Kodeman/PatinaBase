-- ═══════════════════════════════════════════════════════════════════════════
-- FF&E dual-pricing tests (migration 00185)
--
-- Exercises the trade/client dual-pricing model on project_ffe_items:
--   1. activate_proposal_as_project maps pricing correctly (BUG repair):
--      unit_price_cents = proposal unit_sell_price (CLIENT), trade_price_cents
--      = proposal unit_price (TRADE), markup_percent carried, line_total =
--      qty × unit_sell_price — for a 30%-markup item and a zero-markup item.
--      projects.budget_cents still sums the client line totals.
--   2. Three-tier backfill (statements copied verbatim from 00185):
--      (a) proposal-sourced fixed item repaired from proposal_items (and a
--          non-fixed allowance item is NOT matched by tier a),
--      (b) product-linked item takes products.price_trade (markup stays NULL),
--      (c) bare remainder gets trade = unit price, markup 0;
--      already-dual-priced rows (from case 1) are untouched (IS NULL guard).
--   3. apply_decision feed-through: winning option with a product that has
--      price_trade → trade = price_trade, markup derived (25.00 for
--      100000/80000); product without price_trade → trade = option (client)
--      price, markup 0. Re-apply (reopen → re-choose) updates the SAME line
--      with the new option's dual pricing (still exactly one line).
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/procurement/dual_pricing_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. It runs as superuser — the
-- focus is RPC/backfill logic, not RLS (see tests/rls/ for RLS coverage).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Designer + client auth users and profiles (profiles may be auto-created by
-- an auth.users trigger; ON CONFLICT keeps this agnostic).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('88888888-8888-4888-8888-888888888801', 'dual-pricing-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('88888888-8888-4888-8888-888888888802', 'dual-pricing-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('88888888-8888-4888-8888-888888888801', 'dual-pricing-designer@test.invalid', 'Dual Pricing Designer', NOW(), NOW()),
  ('88888888-8888-4888-8888-888888888802', 'dual-pricing-client@test.invalid',   'Dual Pricing Client',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO designer_clients (id, designer_id, client_id, status)
VALUES ('dddd0000-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888802', 'proposal');

CREATE OR REPLACE FUNCTION pg_temp.assume_dual_pricing_designer()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config(
    'request.jwt.claims',
    '{"sub":"88888888-8888-4888-8888-888888888801","role":"authenticated"}',
    true
  )::void
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_dual_pricing_designer()
  TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assume_dual_pricing_client()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config(
    'request.jwt.claims',
    '{"sub":"88888888-8888-4888-8888-888888888802","role":"authenticated"}',
    true
  )::void
$$;

-- Products: one with a catalog trade price, one without.
INSERT INTO products (id, name, source_url, captured_by, captured_at, price_retail, price_trade)
VALUES
  ('dddd0000-0000-4000-8000-000000000011', 'Dual Pricing Chair (trade priced)', 'https://test.invalid/chair', '88888888-8888-4888-8888-888888888801', NOW(), 110000, 80000),
  ('dddd0000-0000-4000-8000-000000000012', 'Dual Pricing Lamp (no trade price)', 'https://test.invalid/lamp', '88888888-8888-4888-8888-888888888801', NOW(), 70000, NULL);

-- ─── case 1: activation maps dual pricing correctly ──────────────────────────

INSERT INTO proposals (id, designer_id, client_id, title, status, total_amount)
VALUES ('dddd0000-0000-4000-8000-000000000021', '88888888-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888802', 'Dual Pricing Proposal', 'draft', 310000);

-- Item A: 30% markup — trade 100000, client 130000, qty 2, client total 260000.
-- Item B: zero markup — trade = client = 50000, qty 1.
INSERT INTO proposal_items (id, proposal_id, name, quantity, unit_price, markup_percent, unit_sell_price, line_total_cents, item_type, position)
VALUES
  ('dddd0000-0000-4000-8000-000000000031', 'dddd0000-0000-4000-8000-000000000021', 'Marked-up sofa', 2, 100000, 30.00, 130000, 260000, 'fixed', 0),
  ('dddd0000-0000-4000-8000-000000000032', 'dddd0000-0000-4000-8000-000000000021', 'Pass-through rug', 1, 50000, 0, 50000, 50000, 'fixed', 1);

SELECT set_config(
  'app.proposal_accept_id',
  'dddd0000-0000-4000-8000-000000000021',
  true
);
UPDATE proposals SET status = 'accepted'
WHERE id = 'dddd0000-0000-4000-8000-000000000021';
SELECT set_config('app.proposal_accept_id', '', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_dual_pricing_designer();
SELECT activate_proposal_as_project('dddd0000-0000-4000-8000-000000000021'::uuid);
RESET ROLE;

DO $$
DECLARE
  v_project_id UUID;
  v_budget     INTEGER;
  r            RECORD;
BEGIN
  SELECT project_id INTO v_project_id
    FROM proposals WHERE id = 'dddd0000-0000-4000-8000-000000000021';
  ASSERT v_project_id IS NOT NULL, 'FAIL 1a: activation should back-link proposals.project_id';

  -- Item A (markup 30%): unit = CLIENT sell price, trade = TRADE price.
  SELECT unit_price_cents, trade_price_cents, markup_percent, line_total_cents, quantity
    INTO r
    FROM project_ffe_items
   WHERE source_proposal_item_id = 'dddd0000-0000-4000-8000-000000000031';
  ASSERT r.unit_price_cents = 130000,
    'FAIL 1b: marked-up item unit_price_cents should be the CLIENT price 130000, got ' || COALESCE(r.unit_price_cents::text, 'NULL');
  ASSERT r.trade_price_cents = 100000,
    'FAIL 1c: marked-up item trade_price_cents should be the TRADE price 100000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 30.00,
    'FAIL 1d: marked-up item markup_percent should carry as 30.00, got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.line_total_cents = r.quantity * r.unit_price_cents,
    'FAIL 1e: line_total must equal qty × CLIENT unit (' || (r.quantity * r.unit_price_cents)::text || '), got ' || r.line_total_cents::text;

  -- Item B (zero markup): trade = client.
  SELECT unit_price_cents, trade_price_cents, markup_percent, line_total_cents
    INTO r
    FROM project_ffe_items
   WHERE source_proposal_item_id = 'dddd0000-0000-4000-8000-000000000032';
  ASSERT r.unit_price_cents = 50000,
    'FAIL 1f: zero-markup item unit_price_cents should be 50000, got ' || COALESCE(r.unit_price_cents::text, 'NULL');
  ASSERT r.trade_price_cents = 50000,
    'FAIL 1g: zero-markup item trade_price_cents should be 50000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 0,
    'FAIL 1h: zero-markup item markup_percent should be 0, got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.line_total_cents = 50000,
    'FAIL 1i: zero-markup item line_total should be 50000, got ' || r.line_total_cents::text;

  -- Budget semantics unchanged: budget_cents = Σ client line totals.
  SELECT budget_cents INTO v_budget FROM projects WHERE id = v_project_id;
  ASSERT v_budget = 310000,
    'FAIL 1j: projects.budget_cents should still sum CLIENT line totals (310000), got ' || COALESCE(v_budget::text, 'NULL');

  RAISE NOTICE 'Case 1 passed: activation maps client/trade/markup correctly (bug repaired).';
END
$$;

-- ─── case 2: three-tier backfill (statements verbatim from 00185) ────────────

INSERT INTO projects (id, name, designer_id, created_by, client_id)
VALUES (
  'dddd0000-0000-4000-8000-000000000041', 'Dual Pricing Backfill Project',
  '88888888-8888-4888-8888-888888888801',
  '88888888-8888-4888-8888-888888888801',
  '88888888-8888-4888-8888-888888888802'
);

-- Pre-00185-shaped rows (trade_price_cents / markup_percent NULL):
--   t_a  — proposal-sourced FIXED item still carrying the buggy TRADE price
--          in unit_price_cents (tier a repairs from proposal_items).
--   t_a2 — proposal-sourced ALLOWANCE item: tier a must skip it (item_type
--          guard); tier c catches it with the zero-margin assumption.
--   t_b  — product-linked, no provenance (tier b: products.price_trade).
--   t_c  — bare (tier c: trade = unit, markup 0).
INSERT INTO project_ffe_items (id, project_id, source_proposal_item_id, product_id, name, item_type, quantity, unit_price_cents, line_total_cents, budget_min_cents, budget_max_cents)
VALUES
  ('dddd0000-0000-4000-8000-000000000051', 'dddd0000-0000-4000-8000-000000000041', 'dddd0000-0000-4000-8000-000000000031', NULL, 'Backfill tier-a item', 'fixed', 2, 100000, 260000, NULL, NULL),
  ('dddd0000-0000-4000-8000-000000000052', 'dddd0000-0000-4000-8000-000000000041', 'dddd0000-0000-4000-8000-000000000032', NULL, 'Backfill allowance item', 'allowance', 1, 40000, 40000, 30000, 50000),
  ('dddd0000-0000-4000-8000-000000000053', 'dddd0000-0000-4000-8000-000000000041', NULL, 'dddd0000-0000-4000-8000-000000000011', 'Backfill tier-b item', 'fixed', 1, 100000, 100000, NULL, NULL),
  ('dddd0000-0000-4000-8000-000000000054', 'dddd0000-0000-4000-8000-000000000041', NULL, NULL, 'Backfill tier-c item', 'fixed', 1, 25000, 25000, NULL, NULL);

-- ── backfill statements: VERBATIM copies of 00185 part 2 ──
UPDATE public.project_ffe_items f
   SET unit_price_cents  = pi.unit_sell_price,
       trade_price_cents = GREATEST(pi.unit_price, 0),
       markup_percent    = GREATEST(COALESCE(pi.markup_percent, 0), 0)
  FROM public.proposal_items pi
 WHERE pi.id = f.source_proposal_item_id
   AND f.trade_price_cents IS NULL
   AND f.item_type = 'fixed';

UPDATE public.project_ffe_items f
   SET trade_price_cents = p.price_trade
  FROM public.products p
 WHERE p.id = f.product_id
   AND f.trade_price_cents IS NULL
   AND p.price_trade IS NOT NULL
   AND p.price_trade >= 0;

UPDATE public.project_ffe_items
   SET trade_price_cents = GREATEST(unit_price_cents, 0),
       markup_percent    = 0
 WHERE trade_price_cents IS NULL
   AND unit_price_cents IS NOT NULL;
-- ── end verbatim backfill ──

DO $$
DECLARE
  r RECORD;
BEGIN
  -- t_a: tier a repaired unit from the proposal's client price.
  SELECT unit_price_cents, trade_price_cents, markup_percent, line_total_cents INTO r
    FROM project_ffe_items WHERE id = 'dddd0000-0000-4000-8000-000000000051';
  ASSERT r.unit_price_cents = 130000,
    'FAIL 2a: tier-a unit_price_cents should be repaired to CLIENT 130000, got ' || COALESCE(r.unit_price_cents::text, 'NULL');
  ASSERT r.trade_price_cents = 100000,
    'FAIL 2b: tier-a trade_price_cents should be 100000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 30.00,
    'FAIL 2c: tier-a markup_percent should be 30.00, got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.line_total_cents = 260000,
    'FAIL 2d: tier-a line_total_cents must NOT be touched, got ' || r.line_total_cents::text;

  -- t_a2: allowance item skipped by tier a (unit untouched), caught by tier c.
  SELECT unit_price_cents, trade_price_cents, markup_percent INTO r
    FROM project_ffe_items WHERE id = 'dddd0000-0000-4000-8000-000000000052';
  ASSERT r.unit_price_cents = 40000,
    'FAIL 2e: allowance item must not be repriced by tier a, got ' || COALESCE(r.unit_price_cents::text, 'NULL');
  ASSERT r.trade_price_cents = 40000,
    'FAIL 2f: allowance item should get tier-c trade = unit (40000), got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 0,
    'FAIL 2g: allowance item should get tier-c markup 0, got ' || COALESCE(r.markup_percent::text, 'NULL');

  -- t_b: tier b took the catalog trade price; markup stays NULL (unknown).
  SELECT unit_price_cents, trade_price_cents, markup_percent INTO r
    FROM project_ffe_items WHERE id = 'dddd0000-0000-4000-8000-000000000053';
  ASSERT r.trade_price_cents = 80000,
    'FAIL 2h: tier-b trade_price_cents should be products.price_trade 80000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent IS NULL,
    'FAIL 2i: tier-b markup_percent should stay NULL, got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.unit_price_cents = 100000,
    'FAIL 2j: tier-b unit_price_cents must be untouched (100000), got ' || COALESCE(r.unit_price_cents::text, 'NULL');

  -- t_c: zero-margin remainder.
  SELECT unit_price_cents, trade_price_cents, markup_percent INTO r
    FROM project_ffe_items WHERE id = 'dddd0000-0000-4000-8000-000000000054';
  ASSERT r.trade_price_cents = 25000,
    'FAIL 2k: tier-c trade_price_cents should equal unit (25000), got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 0,
    'FAIL 2l: tier-c markup_percent should be 0, got ' || COALESCE(r.markup_percent::text, 'NULL');

  -- Idempotency: the activation-created rows from case 1 already carry dual
  -- pricing — the IS NULL guards must leave them exactly as they were.
  SELECT unit_price_cents, trade_price_cents, markup_percent INTO r
    FROM project_ffe_items
   WHERE source_proposal_item_id = 'dddd0000-0000-4000-8000-000000000031'
     AND id <> 'dddd0000-0000-4000-8000-000000000051';
  ASSERT r.unit_price_cents = 130000 AND r.trade_price_cents = 100000 AND r.markup_percent = 30.00,
    'FAIL 2m: re-running backfill must not clobber already-dual-priced rows';

  RAISE NOTICE 'Case 2 passed: three-tier backfill (repair, product trade price, zero-margin remainder; idempotent).';
END
$$;

-- ─── case 3: apply_decision feed-through carries dual pricing ────────────────

-- d1: non-blocking decision, winning option o1 → product WITH price_trade.
INSERT INTO client_decisions (id, designer_client_id, project_id, title, status, blocking_status)
VALUES ('dddd0000-0000-4000-8000-000000000061', 'dddd0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000041', 'Pick the chair', 'pending', 'non_blocking');

INSERT INTO client_decision_options (id, decision_id, name, product_id, price, quantity)
VALUES
  ('dddd0000-0000-4000-8000-000000000071', 'dddd0000-0000-4000-8000-000000000061', 'Chair option', 'dddd0000-0000-4000-8000-000000000011', 100000, 2),
  ('dddd0000-0000-4000-8000-000000000072', 'dddd0000-0000-4000-8000-000000000061', 'Lamp alternative', 'dddd0000-0000-4000-8000-000000000012', 90000, 1);

SELECT pg_temp.assume_dual_pricing_client();
SELECT apply_decision('dddd0000-0000-4000-8000-000000000061'::uuid, 'dddd0000-0000-4000-8000-000000000071'::uuid, '88888888-8888-4888-8888-888888888802'::uuid);

DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT unit_price_cents, trade_price_cents, markup_percent, line_total_cents, quantity INTO r
    FROM project_ffe_items
   WHERE source_decision_id = 'dddd0000-0000-4000-8000-000000000061';
  ASSERT FOUND, 'FAIL 3a: apply_decision should have created an FF&E line';
  ASSERT r.unit_price_cents = 100000,
    'FAIL 3b: unit_price_cents should be the option (CLIENT) price 100000, got ' || COALESCE(r.unit_price_cents::text, 'NULL');
  ASSERT r.trade_price_cents = 80000,
    'FAIL 3c: trade_price_cents should be products.price_trade 80000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 25.00,
    'FAIL 3d: markup_percent should be derived 25.00 (100000/80000), got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.line_total_cents = 200000,
    'FAIL 3e: line_total should be 2 × 100000 = 200000, got ' || r.line_total_cents::text;

  RAISE NOTICE 'Case 3a passed: product with price_trade feeds through with derived markup.';
END
$$;

-- d2: winning option's product has NO price_trade → trade = client, markup 0.
INSERT INTO client_decisions (id, designer_client_id, project_id, title, status, blocking_status)
VALUES ('dddd0000-0000-4000-8000-000000000062', 'dddd0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000041', 'Pick the lamp', 'pending', 'non_blocking');

INSERT INTO client_decision_options (id, decision_id, name, product_id, price, quantity)
VALUES ('dddd0000-0000-4000-8000-000000000073', 'dddd0000-0000-4000-8000-000000000062', 'Lamp option', 'dddd0000-0000-4000-8000-000000000012', 60000, 1);

SELECT apply_decision('dddd0000-0000-4000-8000-000000000062'::uuid, 'dddd0000-0000-4000-8000-000000000073'::uuid, '88888888-8888-4888-8888-888888888802'::uuid);

DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT unit_price_cents, trade_price_cents, markup_percent, line_total_cents INTO r
    FROM project_ffe_items
   WHERE source_decision_id = 'dddd0000-0000-4000-8000-000000000062';
  ASSERT FOUND, 'FAIL 3f: apply_decision should have created an FF&E line';
  ASSERT r.trade_price_cents = 60000,
    'FAIL 3g: with no price_trade, trade should fall back to the option price 60000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 0,
    'FAIL 3h: fallback markup_percent should be 0, got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.unit_price_cents = 60000 AND r.line_total_cents = 60000,
    'FAIL 3i: client unit/line should be 60000/60000';

  RAISE NOTICE 'Case 3b passed: product without price_trade falls back to zero-margin.';
END
$$;

-- Re-apply: reopen d1 (responded → pending is a legal transition) and
-- choose the no-trade-price alternative — the SAME line must be updated with
-- the new option's dual pricing.
SELECT pg_temp.assume_dual_pricing_designer();
SELECT reopen_client_decision(
  'dddd0000-0000-4000-8000-000000000061'
);

SELECT pg_temp.assume_dual_pricing_client();
SELECT apply_decision('dddd0000-0000-4000-8000-000000000061'::uuid, 'dddd0000-0000-4000-8000-000000000072'::uuid, '88888888-8888-4888-8888-888888888802'::uuid);

DO $$
DECLARE
  r       RECORD;
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM project_ffe_items
   WHERE source_decision_id = 'dddd0000-0000-4000-8000-000000000061';
  ASSERT v_count = 1,
    'FAIL 3j: re-apply must update the single existing line, got ' || v_count::text || ' rows';

  SELECT unit_price_cents, trade_price_cents, markup_percent, line_total_cents INTO r
    FROM project_ffe_items
   WHERE source_decision_id = 'dddd0000-0000-4000-8000-000000000061';
  ASSERT r.unit_price_cents = 90000 AND r.line_total_cents = 90000,
    'FAIL 3k: re-applied line should carry the new client price 90000';
  ASSERT r.trade_price_cents = 90000,
    'FAIL 3l: re-applied line (no price_trade product) should fall back to trade 90000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 0,
    'FAIL 3m: re-applied fallback markup should be 0, got ' || COALESCE(r.markup_percent::text, 'NULL');

  RAISE NOTICE 'Case 3 passed: apply_decision feed-through + re-apply carry dual pricing.';
END
$$;

-- ─── case 4: negative markup/trade clamped to 0 on activation ───────────────
--
-- A proposal item with markup_percent = -10.00 (and unit_sell_price < unit_price,
-- consistent with a negative-markup discount) must activate successfully — the
-- GREATEST(COALESCE(...,0),0) clamp prevents a check_violation on the new >= 0
-- CHECKs. The resulting FF&E row must have markup_percent = 0 and
-- trade_price_cents = 0 (GREATEST(negative,0)), while unit_price_cents carries
-- the raw unit_sell_price unclamped (no CHECK on that pre-existing column).

INSERT INTO proposals (id, designer_id, client_id, title, status, total_amount)
VALUES ('dddd0000-0000-4000-8000-000000000091', '88888888-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888802', 'Negative Markup Proposal', 'draft', 45000);

-- Item with negative markup: trade 50000, markup -10.00, client 45000.
INSERT INTO proposal_items (id, proposal_id, name, quantity, unit_price, markup_percent, unit_sell_price, line_total_cents, item_type, position)
VALUES
  ('dddd0000-0000-4000-8000-000000000092', 'dddd0000-0000-4000-8000-000000000091', 'Discounted item',    1, 50000, -10.00, 45000, 45000, 'fixed', 0),
  -- Negative unit_price (-5000) AND negative markup (-10.00): GREATEST clamp must fire on trade_price_cents → 0.
  ('dddd0000-0000-4000-8000-000000000093', 'dddd0000-0000-4000-8000-000000000091', 'Negative trade item', 1, -5000, -10.00,  4500,  4500, 'fixed', 1);

SELECT set_config(
  'app.proposal_accept_id',
  'dddd0000-0000-4000-8000-000000000091',
  true
);
UPDATE proposals SET status = 'accepted'
WHERE id = 'dddd0000-0000-4000-8000-000000000091';
SELECT set_config('app.proposal_accept_id', '', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_dual_pricing_designer();
SELECT activate_proposal_as_project('dddd0000-0000-4000-8000-000000000091'::uuid);
RESET ROLE;

DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT unit_price_cents, trade_price_cents, markup_percent INTO r
    FROM project_ffe_items
   WHERE source_proposal_item_id = 'dddd0000-0000-4000-8000-000000000092';
  ASSERT FOUND,
    'FAIL 4a: activation with negative markup should succeed and create the FF&E row';
  ASSERT r.markup_percent = 0,
    'FAIL 4b: negative markup_percent must be clamped to 0, got ' || COALESCE(r.markup_percent::text, 'NULL');
  ASSERT r.trade_price_cents = 50000,
    'FAIL 4c: trade_price_cents should be the raw (positive) unit_price 50000, got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.unit_price_cents = 45000,
    'FAIL 4d: unit_price_cents (client sell price) must pass through unclamped as 45000, got ' || COALESCE(r.unit_price_cents::text, 'NULL');

  -- Item with negative unit_price (-5000): GREATEST(-5000, 0) = 0; clamp actually fires on trade_price_cents.
  SELECT unit_price_cents, trade_price_cents, markup_percent INTO r
    FROM project_ffe_items
   WHERE source_proposal_item_id = 'dddd0000-0000-4000-8000-000000000093';
  ASSERT FOUND,
    'FAIL 4e: activation with negative unit_price should succeed and create the FF&E row';
  ASSERT r.trade_price_cents = 0,
    'FAIL 4f: negative unit_price must be clamped to trade_price_cents = 0 (GREATEST actually fires), got ' || COALESCE(r.trade_price_cents::text, 'NULL');
  ASSERT r.markup_percent = 0,
    'FAIL 4g: negative markup_percent must be clamped to 0, got ' || COALESCE(r.markup_percent::text, 'NULL');

  RAISE NOTICE 'Case 4 passed: negative markup/trade clamped on activation; client price unclamped; GREATEST clamp fires on negative unit_price.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All dual-pricing assertions passed.'; END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
