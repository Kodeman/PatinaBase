-- 00858 — Claim windows require vendor terms, never invented defaults.
-- Local fixtures and sweep writes are rolled back, including job_runs.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL timezone TO 'UTC';

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('85800000-0000-4000-8000-000000000001', 'claim-window-858@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name)
VALUES ('85800000-0000-4000-8000-000000000001', 'claim-window-858@test.invalid', 'Claim Window Test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
VALUES ('85800000-0000-4000-8000-000000000002', 'design_studio', 'Claim Window Test', 'claim-window-858');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('85800000-0000-4000-8000-000000000001', '85800000-0000-4000-8000-000000000002', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES ('85800000-0000-4000-8000-000000000003', 'Claim Window Test', '85800000-0000-4000-8000-000000000001', '85800000-0000-4000-8000-000000000001', '85800000-0000-4000-8000-000000000002');
INSERT INTO public.vendors (id, name)
VALUES ('85800000-0000-4000-8000-000000000004', 'Claim Window Vendor'),
       ('85800000-0000-4000-8000-000000000005', 'No Account Vendor');
INSERT INTO public.studio_vendor_accounts (organization_id, vendor_id)
VALUES ('85800000-0000-4000-8000-000000000002', '85800000-0000-4000-8000-000000000004');
INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, delivered_date)
VALUES ('85800000-0000-4000-8000-000000000006', '85800000-0000-4000-8000-000000000001', '85800000-0000-4000-8000-000000000003', '85800000-0000-4000-8000-000000000004', 'net_30', 10000, 'delivered', '85800000-0000-4000-8000-000000000001', CURRENT_DATE - 2);
INSERT INTO public.receiving_inspections (id, purchase_order_id, inspected_by, outcome)
VALUES ('85800000-0000-4000-8000-000000000007', '85800000-0000-4000-8000-000000000006', '85800000-0000-4000-8000-000000000001', 'damaged');
INSERT INTO public.damage_claims (receiving_inspection_id, state, description)
VALUES ('85800000-0000-4000-8000-000000000007', 'drafted', 'Crushed corner');

DO $$
DECLARE
  clock record;
  windows record;
  sweep jsonb;
BEGIN
  SELECT * INTO windows FROM public.studio_vendor_claim_windows('85800000-0000-4000-8000-000000000002', '85800000-0000-4000-8000-000000000004');
  ASSERT windows.claims_window_days IS NULL AND windows.inspection_window_days IS NULL,
    'claim windows require vendor terms: null terms must remain unknown';
  SELECT * INTO windows FROM public.studio_vendor_claim_windows('85800000-0000-4000-8000-000000000002', '85800000-0000-4000-8000-000000000005');
  ASSERT windows.claims_window_days IS NULL AND windows.inspection_window_days IS NULL,
    'claim windows require vendor terms: missing account must remain unknown';
  SELECT * INTO clock FROM public.procurement_claim_deadline('85800000-0000-4000-8000-000000000006');
  ASSERT clock.delivered_on = CURRENT_DATE - 2 AND clock.claims_window_days IS NULL
    AND clock.vendor_deadline IS NULL AND clock.concealed_carrier_days IS NULL AND clock.carrier_deadline IS NULL,
    'claim windows require vendor terms: unknown terms must have no deadline';

  sweep := public.sweep_procurement_clocks();
  ASSERT NOT (sweep ? 'error') AND sweep ? 'claim_window_closing', 'claim windows require vendor terms: sweep must execute successfully';
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_notifications
    WHERE subject_purchase_order_id = '85800000-0000-4000-8000-000000000006' AND kind = 'claim_window_closing'),
    'claim windows require vendor terms: sweep must not notify an unknown deadline';
  ASSERT (SELECT claims_window_days IS NULL AND inspection_window_days IS NULL FROM public.studio_vendor_accounts
    WHERE organization_id = '85800000-0000-4000-8000-000000000002' AND vendor_id = '85800000-0000-4000-8000-000000000004'),
    'claim windows require vendor terms: reading and sweeping must not rewrite stored terms';

  UPDATE public.studio_vendor_accounts SET claims_window_days = 3, inspection_window_days = '{"concealed_carrier": 5}'
    WHERE organization_id = '85800000-0000-4000-8000-000000000002' AND vendor_id = '85800000-0000-4000-8000-000000000004';
  SELECT * INTO clock FROM public.procurement_claim_deadline('85800000-0000-4000-8000-000000000006');
  ASSERT clock.claims_window_days = 3 AND clock.vendor_deadline = CURRENT_DATE + 1
    AND clock.concealed_carrier_days = 5 AND clock.carrier_deadline = CURRENT_DATE + 3,
    'claim windows require vendor terms: entered terms must count from actual delivery';
  sweep := public.sweep_procurement_clocks();
  ASSERT NOT (sweep ? 'error') AND sweep ? 'claim_window_closing', 'claim windows require vendor terms: known-window sweep must execute';
  ASSERT (SELECT count(*) = 1 FROM public.procurement_notifications
    WHERE subject_purchase_order_id = '85800000-0000-4000-8000-000000000006' AND kind = 'claim_window_closing'),
    'claim windows require vendor terms: entered approaching deadline must notify';

  UPDATE public.purchase_orders SET delivered_date = NULL WHERE id = '85800000-0000-4000-8000-000000000006';
  SELECT * INTO clock FROM public.procurement_claim_deadline('85800000-0000-4000-8000-000000000006');
  ASSERT clock.claims_window_days = 3 AND clock.vendor_deadline IS NULL AND clock.carrier_deadline IS NULL,
    'claim windows require vendor terms: known terms without delivery must have no deadline';

  UPDATE public.purchase_orders SET delivered_date = CURRENT_DATE WHERE id = '85800000-0000-4000-8000-000000000006';
  UPDATE public.studio_vendor_accounts SET claims_window_days = 0, inspection_window_days = '{"parcel": 7}'
    WHERE organization_id = '85800000-0000-4000-8000-000000000002' AND vendor_id = '85800000-0000-4000-8000-000000000004';
  SELECT * INTO clock FROM public.procurement_claim_deadline('85800000-0000-4000-8000-000000000006');
  ASSERT clock.claims_window_days = 0 AND clock.vendor_deadline = CURRENT_DATE AND clock.carrier_deadline IS NULL,
    'claim windows require vendor terms: explicit zero is known; missing concealed-carrier key is unknown';
  RAISE NOTICE 'PASS: claim windows require vendor terms (unknown, entered, no delivery, zero, sweep, unchanged stored terms)';
END $$;
ROLLBACK;
