-- The parity re-audit — live-walk supplemental seed (local dev only). Idempotent.
--
-- Fills the walk chains the standing demo seeds leave empty for the seed
-- designer designer@patina.dev (a0000000-…-004):
--   · a triageable lead on the Desk (intake triage R61)
--   · an expired sent proposal (expired-state instruments R63)
--   · draft / sent / overdue invoices on Chen Residence (Accounts book ledger,
--     receivables aging, the chase)
--   · unbilled time entries on Chen + Olsen (Hours ledger, invoice pull-through)
--
-- document_state is a VIEW — no document rows to seed; the Desk derives.
--
-- Run:  docker exec -i supabase_db_supabase psql -U postgres -d postgres < scripts/the-document-reaudit-walk-seed.sql

BEGIN;

-- ── A LEAD ON THE DESK (needs-your-hand: new_lead, deadline inside 24h) ─────
INSERT INTO public.leads
  (id, designer_id, project_type, project_description, budget_range, timeline,
   location_city, location_state, status, response_deadline,
   contact_name, contact_email, source)
VALUES
  ('ad000004-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000004',
   'full_room', 'Pied-à-terre refresh — living room + study, warm minimalism, existing oak floors.',
   '50k_100k', '1_3_months', 'Minneapolis', 'MN', 'new', now() + interval '20 hours',
   'Priya Nair', 'priya.nair@example.com', 'referral')
ON CONFLICT (id) DO NOTHING;

-- ── AN EXPIRED SENT PROPOSAL (R63 instruments: Revise · Preview · Resend) ───
INSERT INTO public.proposals
  (id, designer_id, client_id, title, description, status, version,
   sent_at, valid_until, total_amount)
VALUES
  ('bb000004-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000005', 'Nair Pied-à-Terre — Full Refresh',
   'Walk seed — sent 20 days ago, expired 6 days ago.', 'sent', 1,
   now() - interval '20 days', now() - interval '6 days', 1850000)
ON CONFLICT (id) DO NOTHING;

-- ── INVOICES ON CHEN RESIDENCE (draft · sent · overdue) ─────────────────────
INSERT INTO public.invoices
  (id, project_id, designer_id, client_id, invoice_number, status,
   issue_date, due_date, sent_at, subtotal_cents, total_cents, memo)
VALUES
  ('cc000004-0000-0000-0000-000000000001', '38bc73b0-d391-404d-8234-3437123e2923',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005',
   NULL, 'draft', NULL, NULL, NULL, 175000, 175000,
   'Walk seed — draft invoice (design fee, phase 2)'),
  ('cc000004-0000-0000-0000-000000000002', '38bc73b0-d391-404d-8234-3437123e2923',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005',
   'INV-2026-W01', 'sent', current_date - 10, current_date + 20, now() - interval '10 days',
   240000, 240000, 'Walk seed — sent, not yet due'),
  ('cc000004-0000-0000-0000-000000000003', '38bc73b0-d391-404d-8234-3437123e2923',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005',
   'INV-2026-W02', 'sent', current_date - 45, current_date - 15, now() - interval '45 days',
   380000, 380000, 'Walk seed — 15 days overdue (receivables chase)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoice_line_items
  (id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, sort_order)
VALUES
  ('cd000004-0000-0000-0000-000000000001', 'cc000004-0000-0000-0000-000000000001',
   'adhoc', 'Design fee — phase 2 development', 1, 175000, 175000, 0),
  ('cd000004-0000-0000-0000-000000000002', 'cc000004-0000-0000-0000-000000000002',
   'adhoc', 'Design fee — schematic package', 1, 240000, 240000, 0),
  ('cd000004-0000-0000-0000-000000000003', 'cc000004-0000-0000-0000-000000000003',
   'adhoc', 'FF&E procurement deposit', 1, 380000, 380000, 0)
ON CONFLICT (id) DO NOTHING;

-- ── UNBILLED TIME (Hours ledger; invoice pull-through candidates) ───────────
INSERT INTO public.project_time_entries
  (id, project_id, user_id, phase_key, started_at, duration_minutes, notes,
   billable, hourly_rate_cents, invoice_id, source, activity)
VALUES
  ('dd000004-0000-0000-0000-000000000001', '38bc73b0-d391-404d-8234-3437123e2923',
   'a0000000-0000-0000-0000-000000000004', 'design', now() - interval '2 hours', 45,
   'Walk seed — sketch review', true, 15000, NULL, 'manual_entry', 'design'),
  ('dd000004-0000-0000-0000-000000000002', '38bc73b0-d391-404d-8234-3437123e2923',
   'a0000000-0000-0000-0000-000000000004', 'design', now() - interval '1 day 3 hours', 90,
   'Walk seed — client presentation prep', true, 15000, NULL, 'manual_entry', 'client'),
  ('dd000004-0000-0000-0000-000000000003', '04d5631a-f1df-485c-87de-d9fcca907fc9',
   'a0000000-0000-0000-0000-000000000004', 'design', now() - interval '2 days 5 hours', 60,
   'Walk seed — sourcing pass', true, 15000, NULL, 'manual_entry', 'sourcing'),
  ('dd000004-0000-0000-0000-000000000004', '04d5631a-f1df-485c-87de-d9fcca907fc9',
   'a0000000-0000-0000-0000-000000000004', 'design', now() - interval '3 days', 30,
   'Walk seed — vendor call', true, 15000, NULL, 'manual_entry', 'admin')
ON CONFLICT (id) DO NOTHING;

COMMIT;

\echo '── walk-seed verification (designer -004) ──'
SELECT 'leads' AS what, count(*) FROM public.leads WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
UNION ALL SELECT 'expired proposals', count(*) FROM public.proposals
  WHERE designer_id = 'a0000000-0000-0000-0000-000000000004' AND status = 'sent' AND valid_until < now()
UNION ALL SELECT 'invoices', count(*) FROM public.invoices WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
UNION ALL SELECT 'unbilled time entries', count(*) FROM public.project_time_entries
  WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND invoice_id IS NULL;
