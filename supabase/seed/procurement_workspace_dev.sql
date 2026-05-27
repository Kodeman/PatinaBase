-- ============================================================================
-- Procurement Workspace v1 — Development Seed Data
-- ============================================================================
--
-- Prerequisites: a designer profile, the five vendors referenced below, and
-- the two demo projects. Everything is idempotent so the seed can be re-run.
-- The procurement DO block at the bottom is name-driven (ILIKE lookups) and
-- short-circuits with a RAISE NOTICE if any prereq is missing.

-- ─── PROLOGUE: prerequisite rows ─────────────────────────────────────────────
-- 1. Flag the seeded designer profile as `is_designer = true`.
-- Migration 00030 only backfills this for profiles with `role = 'designer'`
-- that existed at migration time. Seeded profiles are inserted AFTER the
-- migration runs (and the seed inserts trigger a backfill on individual rows
-- only if the role check held), so explicitly set the flag for the dev
-- designer here. Idempotent — narrows on the deterministic seed UUID.
UPDATE profiles
   SET is_designer = true
 WHERE id = 'a0000000-0000-0000-0000-000000000004'::uuid
   AND (is_designer IS NULL OR is_designer = false);

-- 2. Insert the four missing demo vendors. `Apparatus` already lives in
-- supabase/seed/vendors.sql; the other four don't. No UNIQUE on vendors.name,
-- so we guard each insert with a `WHERE NOT EXISTS` clause to stay idempotent.
INSERT INTO vendors (name, website, trade_terms, contact_info)
SELECT 'Nordic Atelier', 'https://nordicatelier.example.com',
       'Trade-only, 50/50 deposit/balance, 12-week lead time.',
       '{"email":"trade@nordicatelier.example.com"}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name ILIKE 'Nordic Atelier');

INSERT INTO vendors (name, website, trade_terms, contact_info)
SELECT 'Woodward & Sons', 'https://woodwardsons.example.com',
       'Trade-only, 50/50 deposit/balance, hardwood custom built-ins.',
       '{"email":"trade@woodwardsons.example.com"}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name ILIKE 'Woodward%Sons');

INSERT INTO vendors (name, website, trade_terms, contact_info)
SELECT 'Sawkille Co', 'https://sawkille.example.com',
       'Trade-only, 30/70 deposit/balance, 16-week lead time on case goods.',
       '{"email":"info@sawkille.example.com"}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name ILIKE 'Sawkille%');

INSERT INTO vendors (name, website, trade_terms, contact_info)
SELECT 'Ceramica Studio', 'https://ceramica.example.com',
       'Full upfront on small accessories, 4-6 week lead time.',
       '{"email":"orders@ceramica.example.com"}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name ILIKE 'Ceramica%');

-- 3. Insert the two demo projects owned by the seeded designer. `projects`
-- has no UNIQUE on (name, designer_id), so we guard on name + designer_id.
-- `created_by` is NOT NULL (added by 00004); seed it to the same designer.
INSERT INTO projects (name, designer_id, created_by, status, notes)
SELECT 'Chen Residence',
       'a0000000-0000-0000-0000-000000000004'::uuid,
       'a0000000-0000-0000-0000-000000000004'::uuid,
       'active',
       'Demo project — Park Slope renovation.'
 WHERE NOT EXISTS (
   SELECT 1 FROM projects
    WHERE name ILIKE 'Chen%'
      AND designer_id = 'a0000000-0000-0000-0000-000000000004'::uuid
 );

INSERT INTO projects (name, designer_id, created_by, status, notes)
SELECT 'Olsen Lake House',
       'a0000000-0000-0000-0000-000000000004'::uuid,
       'a0000000-0000-0000-0000-000000000004'::uuid,
       'active',
       'Demo project — Catskills weekend home.'
 WHERE NOT EXISTS (
   SELECT 1 FROM projects
    WHERE name ILIKE 'Olsen%'
      AND designer_id = 'a0000000-0000-0000-0000-000000000004'::uuid
 );

-- ─── Default payment-term assignments per vendor (post-00148 column) ─────────
UPDATE vendors SET default_payment_terms = 'fifty_fifty'
  WHERE name ILIKE 'Nordic Atelier';

UPDATE vendors SET default_payment_terms = 'fifty_fifty'
  WHERE name ILIKE 'Woodward%Sons';

UPDATE vendors SET default_payment_terms = 'thirty_seventy'
  WHERE name ILIKE 'Sawkille%';

UPDATE vendors SET default_payment_terms = 'net_30'
  WHERE name ILIKE 'Apparatus%';

UPDATE vendors SET default_payment_terms = 'full_upfront'
  WHERE name ILIKE 'Ceramica%';

DO $$
DECLARE
  v_designer_id  UUID;
  v_proj_chen    UUID;
  v_proj_olsen   UUID;
  v_v_nordic     UUID;
  v_v_woodward   UUID;
  v_v_sawkille   UUID;
  v_v_apparatus  UUID;
  v_v_ceramica   UUID;

  v_po1  UUID := gen_random_uuid();
  v_po2  UUID := gen_random_uuid();
  v_po3  UUID := gen_random_uuid();
  v_po4  UUID := gen_random_uuid();
  v_po5  UUID := gen_random_uuid();
  v_po6  UUID := gen_random_uuid();
  v_po7  UUID := gen_random_uuid();
  v_po8  UUID := gen_random_uuid();
BEGIN
  SELECT id INTO v_designer_id FROM profiles WHERE is_designer = true LIMIT 1;
  SELECT id INTO v_proj_chen   FROM projects WHERE name ILIKE 'Chen%' LIMIT 1;
  SELECT id INTO v_proj_olsen  FROM projects WHERE name ILIKE 'Olsen%' LIMIT 1;
  SELECT id INTO v_v_nordic    FROM vendors WHERE name ILIKE 'Nordic Atelier' LIMIT 1;
  SELECT id INTO v_v_woodward  FROM vendors WHERE name ILIKE 'Woodward%' LIMIT 1;
  SELECT id INTO v_v_sawkille  FROM vendors WHERE name ILIKE 'Sawkille%' LIMIT 1;
  SELECT id INTO v_v_apparatus FROM vendors WHERE name ILIKE 'Apparatus%' LIMIT 1;
  SELECT id INTO v_v_ceramica  FROM vendors WHERE name ILIKE 'Ceramica%' LIMIT 1;

  IF v_designer_id IS NULL OR v_proj_chen IS NULL THEN
    RAISE NOTICE 'Skipping procurement seed: required projects or designer not found.';
    RETURN;
  END IF;

  -- PO 1: Nordic Atelier / Chen Residence — 50/50, in production, deposit paid
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po1, v_designer_id, v_proj_chen, v_v_nordic, 'NA-2026-041',
    '2026-07-18', 'fifty_fifty', 762000, 'in_production');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po1, 'deposit', 381000, '2026-04-12', '2026-04-12', 'paid', 0),
         (v_po1, 'balance', 381000, NULL, NULL, 'pending', 1);

  -- PO 2: Woodward & Sons / Chen — 50/50, deposit paid, balance DUE
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po2, v_designer_id, v_proj_chen, v_v_woodward, 'WS-188',
    '2026-05-20', 'fifty_fifty', 680000, 'in_production');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po2, 'deposit', 340000, '2026-04-08', '2026-04-08', 'paid', 0),
         (v_po2, 'balance', 340000, '2026-05-12', NULL, 'due', 1);

  -- PO 3: Sawkille / Chen — 30/70, just ordered, deposit DUE
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po3, v_designer_id, v_proj_chen, v_v_sawkille, 'SK-087',
    '2026-08-02', 'thirty_seventy', 240000, 'confirmed');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po3, 'deposit', 72000, '2026-04-19', NULL, 'due', 0),
         (v_po3, 'balance', 168000, NULL, NULL, 'pending', 1);

  -- PO 4: Apparatus / Olsen — net_30, shipped
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po4, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen),
    COALESCE(v_v_apparatus, v_v_woodward), 'AP-012',
    '2026-05-06', 'net_30', 420000, 'shipped');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po4, 'balance', 420000, NULL, NULL, 'pending', 0);

  -- PO 5: Ceramica / Olsen — full_upfront, shipped, paid
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po5, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen),
    COALESCE(v_v_ceramica, v_v_sawkille), 'CER-0044',
    '2026-05-25', 'full_upfront', 189000, 'shipped');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po5, 'deposit', 189000, '2026-04-01', '2026-04-01', 'paid', 0);

  -- PO 6: Nordic / Olsen — 50/50, draft
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id,
    payment_pattern, total_cents, status)
  VALUES (v_po6, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen), v_v_nordic,
    'fifty_fifty', 340000, 'draft');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES (v_po6, 'deposit', 170000, NULL, 'pending', 0),
         (v_po6, 'balance', 170000, NULL, 'pending', 1);

  -- PO 7: Woodward / Olsen — net_30, delivered, balance DUE
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status)
  VALUES (v_po7, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen),
    v_v_woodward, 'WS-201', 'net_30', 510000, 'delivered');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES (v_po7, 'balance', 510000, '2026-06-05', 'due', 0);

  -- PO 8: Sawkille / Chen — custom_milestones
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status)
  VALUES (v_po8, v_designer_id, v_proj_chen, v_v_sawkille, 'SK-102',
    'custom_milestones', 960000, 'in_production');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, label, sort_order)
  VALUES (v_po8, 'milestone', 288000, '2026-03-15', '2026-03-15', 'paid', 'Deposit — 30%', 0),
         (v_po8, 'milestone', 384000, '2026-05-30', NULL, 'pending', 'Mid-production — 40%', 1),
         (v_po8, 'milestone', 288000, NULL, NULL, 'pending', 'Before ship — 30%', 2);
END $$;
