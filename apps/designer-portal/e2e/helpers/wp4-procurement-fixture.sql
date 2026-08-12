-- WP4 procurement-lifecycle screenshot fixture (ruling R7, DECISIONS I121–I125).
--
-- The seeds carry purchase orders, but none of them has ever been sent,
-- acknowledged, or paid a deposit against — so the fifteen-step trail renders
-- almost entirely `no-record` and not one gate reaches a settled or open
-- reading. This builds four lines on the Chen Residence document that between
-- them exercise every state the trail can draw:
--
--   A · mid-lifecycle   in_production, sent + acknowledged, deposit paid
--                       → settled 01–03 · 05/06 · live at 06 · dashed future
--                       → G1 settled · G2 unreached
--   B · delivered       delivered + counted clean
--                       → live at 10 · G1 settled · G2 settled
--   C · open claim      delivered, deposit UNPAID, never acknowledged,
--                       damage claim drafted
--                       → G1 open (terms outstanding) · G2 open (open claim)
--   D · passed-unsealed installed, never acknowledged, terms carry no deposit
--                       → G1 passed-unsealed · G2 settled · live at 13
--
-- LOCAL STACK ONLY. Idempotent: it deletes its own rows before rebuilding
-- them, and touches nothing it did not create.
BEGIN;

-- Torn down by id, never by predicate — the seeds' own rows on this project
-- must survive untouched.
DELETE FROM public.damage_claims
 WHERE id IN ('d4c00000-0000-0000-0000-0000000000c3');
DELETE FROM public.receiving_inspections
 WHERE id IN ('d4100000-0000-0000-0000-0000000000c3');
DELETE FROM public.project_ffe_items
 WHERE id IN (
   'd4f00000-0000-0000-0000-0000000000a1',
   'd4f00000-0000-0000-0000-0000000000a2',
   'd4f00000-0000-0000-0000-0000000000a3',
   'd4f00000-0000-0000-0000-0000000000a4'
 );
DELETE FROM public.po_payments
 WHERE purchase_order_id IN (
   'd4a00000-0000-0000-0000-0000000000a1',
   'd4a00000-0000-0000-0000-0000000000a2',
   'd4a00000-0000-0000-0000-0000000000a3',
   'd4a00000-0000-0000-0000-0000000000a4'
 );
DELETE FROM public.purchase_orders
 WHERE id IN (
   'd4a00000-0000-0000-0000-0000000000a1',
   'd4a00000-0000-0000-0000-0000000000a2',
   'd4a00000-0000-0000-0000-0000000000a3',
   'd4a00000-0000-0000-0000-0000000000a4'
 );

INSERT INTO public.purchase_orders
  (id, designer_id, project_id, vendor_id, vendor_po_number, payment_pattern,
   total_cents, status, sent_at, acknowledged_at, confirmed_eta,
   delivered_date, sidemark)
VALUES
  ('d4a00000-0000-0000-0000-0000000000a1',
   'a0000000-0000-0000-0000-000000000004',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   '0191f053-2213-4f23-af50-dec052c841bb',
   'WP4-A-001', 'fifty_fifty', 480000, 'in_production',
   '2026-07-02T15:00:00Z', '2026-07-05T09:20:00Z', '2026-09-18',
   NULL, 'Chen · Living'),
  ('d4a00000-0000-0000-0000-0000000000a2',
   'a0000000-0000-0000-0000-000000000004',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   '0191f053-2213-4f23-af50-dec052c841bb',
   'WP4-B-002', 'fifty_fifty', 312000, 'delivered',
   '2026-04-10T14:00:00Z', '2026-04-12T11:00:00Z', '2026-06-18',
   '2026-06-20', 'Chen · Dining'),
  ('d4a00000-0000-0000-0000-0000000000a3',
   'a0000000-0000-0000-0000-000000000004',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   '0191f053-2213-4f23-af50-dec052c841bb',
   'WP4-C-003', 'fifty_fifty', 196000, 'delivered',
   '2026-05-02T16:30:00Z', NULL, '2026-07-08',
   '2026-07-10', 'Chen · Study'),
  ('d4a00000-0000-0000-0000-0000000000a4',
   'a0000000-0000-0000-0000-000000000004',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   '0191f053-2213-4f23-af50-dec052c841bb',
   'WP4-D-004', 'net_30', 148000, 'delivered',
   '2026-03-05T13:00:00Z', NULL, NULL,
   '2026-05-15', 'Chen · Entry');

-- A and B cleared their deposits; C's is still due; D's terms carry none at
-- all, which is the vacuous-settlement case the ruling names explicitly.
INSERT INTO public.po_payments
  (id, purchase_order_id, kind, amount_cents, due_date, paid_date, state,
   label, sort_order)
VALUES
  ('d4700000-0000-0000-0000-0000000000a1',
   'd4a00000-0000-0000-0000-0000000000a1', 'deposit', 240000,
   '2026-07-01', '2026-07-01', 'paid', 'Deposit', 0),
  ('d4700000-0000-0000-0000-0000000000a2',
   'd4a00000-0000-0000-0000-0000000000a2', 'deposit', 156000,
   '2026-04-09', '2026-04-09', 'paid', 'Deposit', 0),
  ('d4700000-0000-0000-0000-0000000000a3',
   'd4a00000-0000-0000-0000-0000000000a3', 'deposit', 98000,
   '2026-05-01', NULL, 'due', 'Deposit', 0);

INSERT INTO public.project_ffe_items
  (id, project_id, name, ffe_category, item_type, status, quantity,
   unit_price_cents, line_total_cents, vendor_name, sort_order,
   last_status_change_at, purchase_order_id, received_quantity,
   trade_price_cents, markup_percent)
VALUES
  ('d4f00000-0000-0000-0000-0000000000a1',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   'Ashford Slipper Chair — Pair', 'seating', 'fixed', 'production', 2,
   240000, 480000, 'Nordic Atelier', 10,
   '2026-07-20T10:00:00Z', 'd4a00000-0000-0000-0000-0000000000a1', NULL,
   192000, 25.00),
  ('d4f00000-0000-0000-0000-0000000000a2',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   'Larkspur Walnut Credenza', 'casegoods', 'fixed', 'delivered', 1,
   312000, 312000, 'Nordic Atelier', 11,
   '2026-06-20T17:00:00Z', 'd4a00000-0000-0000-0000-0000000000a2', 1,
   249600, 25.00),
  ('d4f00000-0000-0000-0000-0000000000a3',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   'Hollis Reading Lamp', 'lighting', 'fixed', 'delivered', 1,
   196000, 196000, 'Nordic Atelier', 12,
   '2026-07-10T18:00:00Z', 'd4a00000-0000-0000-0000-0000000000a3', NULL,
   156800, 25.00),
  ('d4f00000-0000-0000-0000-0000000000a4',
   '6053f182-f2ff-4687-9d7c-c73daae96531',
   'Weld Iron Console', 'casegoods', 'fixed', 'installed', 1,
   148000, 148000, 'Nordic Atelier', 13,
   '2026-06-01T12:00:00Z', 'd4a00000-0000-0000-0000-0000000000a4', 1,
   118400, 25.00);

-- C's receipt was inspected and came up damaged; the claim is still drafted,
-- which is what holds G2 open (the loudest fact about a receipt).
INSERT INTO public.receiving_inspections
  (id, purchase_order_id, inspected_at, inspected_by, outcome, notes)
VALUES
  ('d4100000-0000-0000-0000-0000000000c3',
   'd4a00000-0000-0000-0000-0000000000a3',
   '2026-07-10T18:00:00Z',
   'a0000000-0000-0000-0000-000000000004',
   'damaged',
   'Shade crushed in transit; base sound.');

INSERT INTO public.damage_claims
  (id, receiving_inspection_id, state, description, ffe_item_id, created_at)
VALUES
  ('d4c00000-0000-0000-0000-0000000000c3',
   'd4100000-0000-0000-0000-0000000000c3',
   'drafted',
   'Shade crushed in transit — replacement requested.',
   'd4f00000-0000-0000-0000-0000000000a3',
   '2026-07-11T09:00:00Z');

COMMIT;
