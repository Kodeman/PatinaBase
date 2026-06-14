-- The Document · Track 3 — local demo data for the F1 screenshot set.
--
-- LOCAL DEV ONLY. Idempotent (fixed ids + ON CONFLICT DO NOTHING). This seeds
-- REAL rows that the document then renders truthfully — it does NOT mock or
-- invent any figure: the Pledge arithmetic (R41/R37) is COMPUTED by the code
-- from these real Via-Patina commission rows. Mirrors the slice-rebuild seed
-- practice (I15). Designer = designer@patina.dev (a0000000-…-0004).
--
-- Run: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--        < scripts/the-document-track3-demo-earnings.sql

\set designer '''a0000000-0000-0000-0000-000000000004'''
\set whitfield_proposal '''b0000000-0000-0000-0000-000000000001'''
\set aspen_proposal '''b0000000-0000-0000-0000-000000000002'''

-- ── Earnings (the Accounts · Earnings page / the Aesthete fold, R37 + F2) ──
-- design_fee → "What you earn" band; product_commission → the twinned Pledge.
INSERT INTO designer_earnings
  (id, designer_id, source_type, proposal_id, gross_amount, platform_fee, net_amount, status, earned_at, description)
VALUES
  -- design fees (client-work income)
  ('ea000000-0000-0000-0000-0000000000d1', :designer, 'design_fee', :whitfield_proposal, 450000, 0, 450000, 'paid',    '2026-02-10T00:00:00Z', 'Design fee — Whitfield Living & Dining'),
  ('ea000000-0000-0000-0000-0000000000d2', :designer, 'design_fee', :aspen_proposal,     280000, 0, 280000, 'pending', '2026-05-05T00:00:00Z', 'Design fee — Aspen Loft'),
  -- Via-Patina commissions (each draws a two-sided Pledge: 25% returned + 10% commons)
  ('ea000000-0000-0000-0000-0000000000c1', :designer, 'product_commission', :whitfield_proposal,  33600, 0,  33600, 'paid',    '2026-03-12T00:00:00Z', 'Via-Patina order commission'),
  ('ea000000-0000-0000-0000-0000000000c2', :designer, 'product_commission', :whitfield_proposal, 120000, 0, 120000, 'paid',    '2026-04-02T00:00:00Z', 'Via-Patina order commission'),
  ('ea000000-0000-0000-0000-0000000000c3', :designer, 'product_commission', :aspen_proposal,       54000, 0,  54000, 'pending', '2026-05-18T00:00:00Z', 'Via-Patina order commission'),
  ('ea000000-0000-0000-0000-0000000000c4', :designer, 'product_commission', :aspen_proposal,       84000, 0,  84000, 'paid',    '2026-05-30T00:00:00Z', 'Via-Patina order commission')
ON CONFLICT (id) DO NOTHING;

-- ── A raw My Library capture (so the Promote paper RoomSheet, F4, has a piece) ──
-- Mirrors captureProduct's write (layer 'personal' + owner_user_id + captured_by).
INSERT INTO products
  (id, name, layer, status, owner_user_id, captured_by, captured_at, vendor_id, category, price_retail, price_trade, lead_time_weeks, source_url)
VALUES
  ('40000000-0000-0000-0000-0000000000a1',
   'Heirloom Oak Sideboard', 'personal', 'draft',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', now(),
   '11111111-1111-1111-1111-111111111105', 'storage', 420000, 336000, 11,
   'https://example.com/heirloom-oak-sideboard')
ON CONFLICT (id) DO NOTHING;

-- ── An overdue receivable (Accounts · Receivables + the Desk need, R41/I31) ──
-- Flip the existing sent invoice INV-0001 past due so it rises on the Desk and
-- ages on the Receivables page; clears when chased (ar_last_chased_at stamp).
UPDATE invoices
SET due_date = (now() - interval '24 days'),
    sent_at = COALESCE(sent_at, now() - interval '38 days'),
    issue_date = COALESCE(issue_date, (now() - interval '38 days')::date)
WHERE invoice_number = 'INV-0001'
  AND designer_id = 'a0000000-0000-0000-0000-000000000004'::uuid
  AND status = 'sent';

SELECT 'earnings rows' AS what, count(*) FROM designer_earnings WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'::uuid
UNION ALL
SELECT 'overdue sent invoices', count(*) FROM invoices WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'::uuid AND status='sent' AND due_date < now();
