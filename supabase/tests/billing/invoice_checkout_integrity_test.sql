-- Invoice lifecycle + Checkout integrity regression (00397)
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/billing/invoice_checkout_integrity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('b9700000-0000-4000-8000-000000000001', 'billing-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b9700000-0000-4000-8000-000000000002', 'billing-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b9700000-0000-4000-8000-000000000003', 'billing-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b9700000-0000-4000-8000-000000000004', 'billing-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, stripe_customer_id, created_at, updated_at
)
VALUES
  ('b9700000-0000-4000-8000-000000000001', 'billing-owner@test.invalid', 'Billing Owner', 'cus_billing_owner', now(), now()),
  ('b9700000-0000-4000-8000-000000000002', 'billing-peer@test.invalid', 'Billing Peer', 'cus_billing_peer', now(), now()),
  ('b9700000-0000-4000-8000-000000000003', 'billing-foreign@test.invalid', 'Billing Foreign', 'cus_billing_foreign', now(), now()),
  ('b9700000-0000-4000-8000-000000000004', 'billing-client@test.invalid', 'Billing Client', 'cus_billing_client', now(), now())
ON CONFLICT (id) DO UPDATE
SET stripe_customer_id = excluded.stripe_customer_id;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('b9710000-0000-4000-8000-000000000001',
   'design_studio', 'Billing Integrity Studio', 'billing-integrity-studio'),
  ('b9710000-0000-4000-8000-000000000002',
   'contractor', 'Billing Shared Contractor', 'billing-shared-contractor');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('b9720000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9710000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('b9720000-0000-4000-8000-000000000002',
   'b9700000-0000-4000-8000-000000000002',
   'b9710000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('b9720000-0000-4000-8000-000000000003',
   'b9700000-0000-4000-8000-000000000001',
   'b9710000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('b9720000-0000-4000-8000-000000000004',
   'b9700000-0000-4000-8000-000000000003',
   'b9710000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status
)
VALUES (
  'b9730000-0000-4000-8000-000000000001',
  'Billing Integrity Project',
  'b9700000-0000-4000-8000-000000000001',
  'b9700000-0000-4000-8000-000000000004',
  'b9700000-0000-4000-8000-000000000001',
  'active'
);

INSERT INTO public.project_payment_milestones (
  id, project_id, label, percentage, amount_cents, status, sort_order
)
VALUES
  ('b9740000-0000-4000-8000-000000000001', 'b9730000-0000-4000-8000-000000000001',
   'Design deposit', 25, 25000, 'pending', 1),
  ('b9740000-0000-4000-8000-000000000002', 'b9730000-0000-4000-8000-000000000001',
   'Procurement release', 35, 35000, 'pending', 2),
  ('b9740000-0000-4000-8000-000000000003', 'b9730000-0000-4000-8000-000000000001',
   'Rollback target', 10, 10000, 'pending', 3),
  ('b9740000-0000-4000-8000-000000000004', 'b9730000-0000-4000-8000-000000000001',
   'Header repair target', 15, 15000, 'outstanding', 4),
  ('b9740000-0000-4000-8000-000000000005', 'b9730000-0000-4000-8000-000000000001',
   'Sent owner convergence', 12, 12000, 'pending', 5),
  ('b9740000-0000-4000-8000-000000000006', 'b9730000-0000-4000-8000-000000000001',
   'Direct line latch', 8, 8000, 'pending', 6),
  ('b9740000-0000-4000-8000-000000000007', 'b9730000-0000-4000-8000-000000000001',
   'Paid owner convergence', 9, 9000, 'pending', 7),
  ('b9740000-0000-4000-8000-000000000008', 'b9730000-0000-4000-8000-000000000001',
   'Trusted workflow deposit', 7, 7000, 'pending', 8),
  ('b9740000-0000-4000-8000-000000000009', 'b9730000-0000-4000-8000-000000000001',
   'Contractor authority rejection', 6, 6000, 'pending', 9);

CREATE OR REPLACE FUNCTION pg_temp.assume_billing_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

-- ── Milestone draft is header + exact line + latch, and retry is exact. ──
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_first uuid;
  v_retry uuid;
BEGIN
  v_first := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000001'
  );
  v_retry := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000001'
  );
  ASSERT v_retry = v_first, 'milestone retry must return the exact invoice';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_line_items
          WHERE invoice_id = v_first
            AND milestone_id = 'b9740000-0000-4000-8000-000000000001'
            AND kind = 'milestone'
            AND description = 'Design deposit'
            AND quantity = 1
            AND unit_amount_cents = 25000
            AND amount_cents = 25000),
    'draft must contain exactly one exact-label/exact-amount milestone line';
  ASSERT (SELECT invoice_id = v_first AND status = 'pending' AND due_date IS NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000001'),
    'draft latch must not prematurely make the milestone outstanding';
END;
$$;

-- Existing header-only draft is repaired under the same milestone lock.
RESET ROLE;
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status,
  subtotal_cents, total_cents, memo
)
VALUES (
  'b9750000-0000-4000-8000-000000000004',
  'b9730000-0000-4000-8000-000000000001',
  'b9700000-0000-4000-8000-000000000001',
  'b9700000-0000-4000-8000-000000000004',
  'draft', 15000, 15000, 'legacy header only'
);
UPDATE public.project_payment_milestones
SET invoice_id = 'b9750000-0000-4000-8000-000000000004',
    status = 'outstanding', due_date = current_date
WHERE id = 'b9740000-0000-4000-8000-000000000004';

-- Two open receivables exercise the exact-studio manual-payment boundary:
-- one for an allowed design-studio peer and one for a contractor-only peer.
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, invoice_number, status,
  currency, subtotal_cents, total_cents, amount_paid_cents
)
VALUES
  ('b9750000-0000-4000-8000-000000000005',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-05', 'sent', 'USD', 1000, 1000, 0),
  ('b9750000-0000-4000-8000-000000000006',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-06', 'sent', 'USD', 1000, 1000, 0);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000002');
DO $$
DECLARE v_invoice uuid;
BEGIN
  v_invoice := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000004'
  );
  ASSERT v_invoice = 'b9750000-0000-4000-8000-000000000004',
    'repair must preserve the existing draft id';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_line_items
          WHERE invoice_id = v_invoice
            AND milestone_id = 'b9740000-0000-4000-8000-000000000004'
            AND description = 'Header repair target'
            AND amount_cents = 15000),
    'header-only draft must receive its exact line';
  ASSERT (SELECT status = 'pending' AND due_date IS NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000004'),
    'repaired draft milestone must reset to pending/no due date';
END;
$$;

-- A unique milestone line on a later sent/paid invoice is canonical over an
-- older empty draft latch. Repair must converge without copying or rewriting
-- either authored line or the stale invoice history.
RESET ROLE;
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status,
  subtotal_cents, total_cents, memo
)
VALUES
  ('b9750000-0000-4000-8000-000000000007',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'draft', 12000, 12000, 'canonical sent owner'),
  ('b9750000-0000-4000-8000-000000000008',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'draft', 12000, 12000, 'stale sent-owner latch'),
  ('b9750000-0000-4000-8000-000000000009',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'draft', 8000, 8000, 'direct latch trigger'),
  ('b9750000-0000-4000-8000-000000000070',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'draft', 9000, 9000, 'canonical paid owner'),
  ('b9750000-0000-4000-8000-000000000071',
   'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000004',
   'draft', 9000, 9000, 'stale paid-owner latch');

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000001');
INSERT INTO public.invoice_line_items (
  invoice_id, kind, milestone_id, description, quantity,
  unit_amount_cents, amount_cents, sort_order
)
VALUES
  ('b9750000-0000-4000-8000-000000000007', 'milestone',
   'b9740000-0000-4000-8000-000000000005', 'Sent owner convergence', 1,
   12000, 12000, 0),
  ('b9750000-0000-4000-8000-000000000009', 'milestone',
   'b9740000-0000-4000-8000-000000000006', 'Direct line latch', 1,
   8000, 8000, 0),
  ('b9750000-0000-4000-8000-000000000070', 'milestone',
   'b9740000-0000-4000-8000-000000000007', 'Paid owner convergence', 1,
   9000, 9000, 0);

DO $$
BEGIN
  ASSERT (SELECT invoice_id = 'b9750000-0000-4000-8000-000000000009'
                 AND status = 'pending'
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000006'),
    'direct milestone-line insert must immediately own the header latch';
END;
$$;

DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    UPDATE public.invoice_line_items
    SET invoice_id = 'b9750000-0000-4000-8000-000000000007'
    WHERE milestone_id = 'b9740000-0000-4000-8000-000000000006';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;

  ASSERT v_state = '23514',
    'an existing invoice line must not be reparented across invoice headers';
  ASSERT (SELECT invoice_id = 'b9750000-0000-4000-8000-000000000009'
          FROM public.invoice_line_items
          WHERE milestone_id = 'b9740000-0000-4000-8000-000000000006'),
    'rejected line reparent must preserve the original invoice owner';
END;
$$;

UPDATE public.project_payment_milestones
SET invoice_id = NULL
WHERE id = 'b9740000-0000-4000-8000-000000000006';

DO $$
DECLARE v_invoice uuid;
BEGIN
  v_invoice := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000006'
  );
  ASSERT v_invoice = 'b9750000-0000-4000-8000-000000000009',
    'unlatched unique line must be recovered without creating a second header';
  ASSERT (SELECT invoice_id = v_invoice
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000006'),
    'unlatched runtime recovery must restore the canonical header latch';
END;
$$;

DELETE FROM public.invoice_line_items
WHERE invoice_id = 'b9750000-0000-4000-8000-000000000009'
  AND milestone_id = 'b9740000-0000-4000-8000-000000000006';

DO $$
BEGIN
  ASSERT (SELECT invoice_id IS NULL AND status = 'pending'
                 AND due_date IS NULL AND paid_at IS NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000006'),
    'deleting a draft milestone line must release only its exact latch';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000003');
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status,
  subtotal_cents, total_cents, memo
)
VALUES (
  'b9750000-0000-4000-8000-000000000072',
  'b9730000-0000-4000-8000-000000000001',
  'b9700000-0000-4000-8000-000000000003',
  'b9700000-0000-4000-8000-000000000004',
  'draft', 6000, 6000, 'contractor-only authority probe'
);

DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    INSERT INTO public.invoice_line_items (
      invoice_id, kind, milestone_id, description, quantity,
      unit_amount_cents, amount_cents, sort_order
    ) VALUES (
      'b9750000-0000-4000-8000-000000000072', 'milestone',
      'b9740000-0000-4000-8000-000000000009', 'Contractor authority rejection',
      1, 6000, 6000, 0
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;

  ASSERT v_state = '42501',
    'contractor-only shared organization must fail exact design-studio authority';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.invoice_line_items
    WHERE milestone_id = 'b9740000-0000-4000-8000-000000000009'
  ), 'rejected contractor line must roll back';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT invoice_id IS NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000009'),
    'rejected contractor line must not mutate the milestone latch';
END;
$$;

-- Header-only repair must fail closed when the draft is addressed to a
-- different client, even if every other header field looks repairable.
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status,
  subtotal_cents, total_cents, memo
)
VALUES (
  'b9750000-0000-4000-8000-000000000073',
  'b9730000-0000-4000-8000-000000000001',
  'b9700000-0000-4000-8000-000000000001',
  'b9700000-0000-4000-8000-000000000003',
  'draft', 6000, 6000, 'unsafe wrong-client header repair probe'
);
UPDATE public.project_payment_milestones
SET invoice_id = 'b9750000-0000-4000-8000-000000000073'
WHERE id = 'b9740000-0000-4000-8000-000000000009';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000001');
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    PERFORM public.generate_milestone_invoice(
      'b9740000-0000-4000-8000-000000000009'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;

  ASSERT v_state = '23514',
    'wrong-client header-only repair must fail closed';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.invoice_line_items
    WHERE milestone_id = 'b9740000-0000-4000-8000-000000000009'
  ), 'unsafe header-only repair must not create a financial line';
  ASSERT (SELECT invoice_id = 'b9750000-0000-4000-8000-000000000073'
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000009'),
    'unsafe header-only repair must preserve the existing latch for review';
END;
$$;

UPDATE public.invoices
SET status = 'sent', invoice_number = 'INV-BILL-07',
    issue_date = current_date, due_date = current_date + 30, sent_at = now()
WHERE id = 'b9750000-0000-4000-8000-000000000007';

UPDATE public.invoices
SET status = 'paid', invoice_number = 'INV-BILL-70',
    issue_date = current_date - 10, due_date = current_date + 20,
    sent_at = now() - interval '10 days', paid_at = now(), amount_paid_cents = 9000
WHERE id = 'b9750000-0000-4000-8000-000000000070';

UPDATE public.project_payment_milestones
SET invoice_id = 'b9750000-0000-4000-8000-000000000008',
    status = 'outstanding', due_date = current_date - 1
WHERE id = 'b9740000-0000-4000-8000-000000000005';

UPDATE public.project_payment_milestones
SET invoice_id = 'b9750000-0000-4000-8000-000000000071',
    status = 'paid', due_date = current_date - 10, paid_at = now() - interval '1 day'
WHERE id = 'b9740000-0000-4000-8000-000000000007';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_sent uuid;
  v_paid uuid;
BEGIN
  v_sent := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000005'
  );
  ASSERT v_sent = 'b9750000-0000-4000-8000-000000000007',
    'sent line owner must replace the stale empty-draft latch';
  ASSERT public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000005'
  ) = v_sent, 'sent owner retry must be exact';
  ASSERT (SELECT invoice_id = v_sent AND status = 'outstanding'
                 AND due_date = current_date + 30 AND paid_at IS NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000005'),
    'sent owner convergence must synchronize latch and due lifecycle';
  ASSERT (SELECT status = 'draft'
                 AND NOT EXISTS (
                   SELECT 1 FROM public.invoice_line_items li
                   WHERE li.invoice_id = 'b9750000-0000-4000-8000-000000000008'
                 )
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000008'),
    'stale empty draft must remain untouched for audit history';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_line_items
          WHERE milestone_id = 'b9740000-0000-4000-8000-000000000005'),
    'sent convergence must preserve one global milestone line';

  v_paid := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000007'
  );
  ASSERT v_paid = 'b9750000-0000-4000-8000-000000000070',
    'paid line owner must replace the stale empty-draft latch';
  ASSERT (SELECT invoice_id = v_paid AND status = 'paid'
                 AND due_date = current_date + 20 AND paid_at IS NOT NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000007'),
    'paid owner convergence must preserve the paid lifecycle';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_line_items
          WHERE milestone_id = 'b9740000-0000-4000-8000-000000000007'),
    'paid convergence must preserve one global milestone line';
END;
$$;

-- Trusted SECURITY DEFINER workflows may draft on behalf of a client/trade
-- actor after performing their own domain authorization. The latch trigger is
-- SECURITY INVOKER so it inherits postgres from that trusted outer function
-- instead of mistaking the initiating JWT for the financial author.
RESET ROLE;
CREATE FUNCTION pg_temp.trusted_milestone_draft(p_milestone_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.draft_invoice_from_milestone(p_milestone_id);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.trusted_milestone_draft(uuid) TO authenticated;
CREATE TEMP TABLE trusted_milestone_draft_result (invoice_id uuid) ON COMMIT DROP;
GRANT INSERT ON TABLE pg_temp.trusted_milestone_draft_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000004');
INSERT INTO pg_temp.trusted_milestone_draft_result (invoice_id)
SELECT pg_temp.trusted_milestone_draft(
  'b9740000-0000-4000-8000-000000000008'
);

RESET ROLE;
DO $$
DECLARE
  v_invoice uuid := (
    SELECT invoice_id FROM pg_temp.trusted_milestone_draft_result
  );
BEGIN
  ASSERT (SELECT invoice_id = v_invoice AND status = 'pending'
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000008'),
    'trusted outer workflow must retain automatic drafting and latch sync';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_line_items
          WHERE invoice_id = v_invoice
            AND milestone_id = 'b9740000-0000-4000-8000-000000000008'
            AND amount_cents = 7000),
    'trusted outer workflow must create one exact milestone line';
END;
$$;

SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000002');

-- Co-member can generate, issue, and void; void fully releases for redraft.
DO $$
DECLARE
  v_first uuid;
  v_redraft uuid;
BEGIN
  ASSERT public.can_manage_invoice('b9750000-0000-4000-8000-000000000005'),
    'active design-studio peer must retain invoice management authority';
  PERFORM public.record_invoice_payment(
    'b9750000-0000-4000-8000-000000000005', 1000, 'check', 'peer-positive'
  );
  ASSERT (SELECT status = 'paid' AND amount_paid_cents = 1000
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000005'),
    'active design-studio peer may record an exact offline payment';

  v_first := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000002'
  );
  PERFORM public.issue_invoice(v_first, current_date + 20);
  ASSERT (SELECT status = 'outstanding' AND due_date = current_date + 20
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000002'),
    'issue must make the linked milestone outstanding with exact due date';

  PERFORM public.void_invoice(v_first, 'test redraft');
  ASSERT (SELECT invoice_id IS NULL AND status = 'pending'
                 AND due_date IS NULL AND paid_at IS NULL
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000002'),
    'void must clear header latch/status/dates';
  ASSERT (SELECT milestone_id IS NULL AND kind = 'adhoc'
                 AND metadata->>'released_milestone_id' =
                     'b9740000-0000-4000-8000-000000000002'
          FROM public.invoice_line_items WHERE invoice_id = v_first),
    'void must release the unique live line slot with audit metadata';

  v_redraft := public.generate_milestone_invoice(
    'b9740000-0000-4000-8000-000000000002'
  );
  ASSERT v_redraft <> v_first, 'redraft after void must create a new invoice';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_line_items
          WHERE invoice_id = v_redraft
            AND milestone_id = 'b9740000-0000-4000-8000-000000000002'
            AND description = 'Procurement release'
            AND amount_cents = 35000),
    'redraft must recreate exactly one milestone line';
END;
$$;

-- A contractor-only co-member is visible through the broad workspace helper,
-- but must never gain client-receivable authority.
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000003');
DO $$
DECLARE v_error text;
BEGIN
  ASSERT public.is_studio_comember('b9700000-0000-4000-8000-000000000001'),
    'fixture must prove the actor shares a non-studio organization with owner';
  ASSERT NOT public.can_manage_invoice('b9750000-0000-4000-8000-000000000004'),
    'contractor-only peer must fail the invoice-send capability';
  BEGIN
    PERFORM public.generate_milestone_invoice(
      'b9740000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%not found or access denied%',
    format('contractor-only generate must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.issue_invoice('b9750000-0000-4000-8000-000000000004', NULL);
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%not found or access denied%',
    format('contractor-only issue must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.void_invoice('b9750000-0000-4000-8000-000000000004', 'forged');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%not found or access denied%',
    format('contractor-only void must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.record_invoice_payment(
      'b9750000-0000-4000-8000-000000000006', 1000, 'check', 'forged'
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%not found or access denied%',
    format('contractor-only record payment must reject, got %L', v_error);
  ASSERT (SELECT status = 'sent' AND amount_paid_cents = 0
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000006'),
    'rejected contractor payment must leave the receivable unchanged';
END;
$$;

-- A line failure rolls header + latch back. Only notification is best-effort.
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.reject_billing_line()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.milestone_id = 'b9740000-0000-4000-8000-000000000003'::uuid THEN
    RAISE EXCEPTION 'forced milestone line failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_billing_line
BEFORE INSERT ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_billing_line();

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_billing_actor('b9700000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_before bigint;
  v_error text;
BEGIN
  SELECT count(*) INTO v_before FROM public.invoices
  WHERE project_id = 'b9730000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.generate_milestone_invoice(
      'b9740000-0000-4000-8000-000000000003'
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'forced milestone line failure',
    format('line trigger must surface, got %L', v_error);
  ASSERT (SELECT count(*) = v_before FROM public.invoices
          WHERE project_id = 'b9730000-0000-4000-8000-000000000001'),
    'line failure must not leave an invoice header';
  ASSERT (SELECT invoice_id IS NULL AND status = 'pending'
          FROM public.project_payment_milestones
          WHERE id = 'b9740000-0000-4000-8000-000000000003'),
    'line failure must not latch or advance the milestone';
END;
$$;

RESET ROLE;
DROP TRIGGER reject_billing_line ON public.invoice_line_items;

-- ── Checkout fixtures ──
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, invoice_number, status,
  currency, subtotal_cents, total_cents, amount_paid_cents
)
VALUES
  ('b9750000-0000-4000-8000-000000000010', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-10', 'sent', 'USD', 10000, 10000, 0),
  ('b9750000-0000-4000-8000-000000000011', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-11', 'sent', 'USD', 10000, 10000, 0),
  ('b9750000-0000-4000-8000-000000000012', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-12', 'sent', 'USD', 10000, 10000, 0),
  ('b9750000-0000-4000-8000-000000000013', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-13', 'sent', 'USD', 10000, 10000, 0),
  ('b9750000-0000-4000-8000-000000000014', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-14', 'sent', 'USD', 10000, 10000, 0),
  ('b9750000-0000-4000-8000-000000000015', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-15', 'sent', 'USD', 5000, 5000, 0),
  ('b9750000-0000-4000-8000-000000000016', 'b9730000-0000-4000-8000-000000000001',
   'b9700000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000004',
   'INV-BILL-16', 'sent', 'USD', 10000, 10000, 0);

-- Private invoice implementations stay private even after the generated
-- legacy-grant replay. This catches a reset-only privilege regression where
-- the blanket compatibility seed could reopen a newly renamed SECURITY
-- DEFINER body and bypass its exact design-studio wrapper.
DO $$
DECLARE
  v_role text;
  v_signature text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public._can_manage_invoice_owner(uuid)',
      'public.lock_invoice_for_line_insert()',
      'public.reject_invoice_line_reparent()',
      'public.sync_invoice_line_milestone_latch()',
      'public._issue_invoice_authorized_legacy_00397(uuid,date)',
      'public._record_invoice_payment_authorized_legacy_00397(uuid,integer,text,text,timestamp with time zone,text)',
      'public._void_invoice_authorized_legacy_00397(uuid,text)'
    ]
    LOOP
      ASSERT NOT has_function_privilege(v_role, v_signature, 'EXECUTE'),
        format('%s must not execute private invoice function %s',
               v_role, v_signature);
    END LOOP;
  END LOOP;

  -- Service-only Checkout authority remains explicit.
  ASSERT has_function_privilege(
    'service_role',
    'public.claim_invoice_checkout_attempt(uuid,uuid,text,boolean,text)',
    'EXECUTE'
  ), 'service role must execute claim';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.claim_invoice_checkout_attempt(uuid,uuid,text,boolean,text)',
    'EXECUTE'
  ), 'browser role must not execute service checkout claim';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.recover_invoice_checkout_session_evidence(uuid,uuid,text,text)',
    'EXECUTE'
  ), 'browser role must not execute signed-session evidence recovery';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.invoice_checkout_attempts', 'SELECT'
  ), 'browser must not read the service-only attempt ledger';
END;
$$;

SET LOCAL ROLE service_role;

-- Repeated/concurrent-equivalent claim returns one attempt + one payment.
DO $$
DECLARE
  v_first jsonb;
  v_retry jsonb;
  v_error text;
BEGIN
  v_first := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000010',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  v_retry := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000010',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  ASSERT v_first->>'attempt_id' = v_retry->>'attempt_id',
    'same-payer retry must return one attempt';
  ASSERT v_first->>'payment_id' = v_retry->>'payment_id',
    'same-payer retry must return one pending payment';
  ASSERT (v_first->>'amount_cents')::int = 10000
         AND v_first->>'currency' = 'usd',
    'claim amount/currency must be authoritative DB values';
  ASSERT v_first->>'stripe_idempotency_key' =
         'invoice-checkout:' || (v_first->>'attempt_id'),
    'stable Stripe key must derive from the immutable attempt id';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_payments
          WHERE invoice_id = 'b9750000-0000-4000-8000-000000000010'
            AND checkout_attempt_id = (v_first->>'attempt_id')::uuid
            AND status = 'pending' AND amount_cents = 10000
            AND recorded_by = 'b9700000-0000-4000-8000-000000000004'),
    'claim must atomically persist exactly one payer-bound payment row';

  -- Unique active slot is the final concurrency backstop.
  BEGIN
    INSERT INTO public.invoice_checkout_attempts (
      invoice_id, payer_id, stripe_customer_id, amount_cents, currency,
      stripe_idempotency_key
    ) VALUES (
      'b9750000-0000-4000-8000-000000000010',
      'b9700000-0000-4000-8000-000000000004',
      'cus_billing_client', 10000, 'usd', 'forced-second-active'
    );
  EXCEPTION WHEN unique_violation THEN v_error := sqlerrm; END;
  ASSERT v_error IS NOT NULL, 'a second active attempt must violate the unique slot';

  v_error := NULL;
  BEGIN
    PERFORM public.claim_invoice_checkout_attempt(
      'b9750000-0000-4000-8000-000000000010',
      'b9700000-0000-4000-8000-000000000003',
      'cus_billing_foreign', false
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_payer_not_allowed',
    format('foreign payer must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.claim_invoice_checkout_attempt(
      'b9750000-0000-4000-8000-000000000010',
      'b9700000-0000-4000-8000-000000000001',
      'cus_billing_owner', false
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_payer_not_allowed',
    'designer must not pay a client invoice unless test mode is explicit';

  v_error := NULL;
  BEGIN
    PERFORM public.claim_invoice_checkout_attempt(
      'b9750000-0000-4000-8000-000000000011',
      'b9700000-0000-4000-8000-000000000004',
      'cus_billing_foreign', false
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_customer_mismatch',
    'payer must use the Stripe customer persisted on that payer profile';
END;
$$;

-- Finalize is exact, payer-bound, and idempotent; mismatched session fails.
DO $$
DECLARE
  v_claim jsonb;
  v_done jsonb;
  v_error text;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000010',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid,
      'b9700000-0000-4000-8000-000000000003',
      'cus_billing_foreign', 'cs_bill_10'
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'cross-payer finalization must reject';

  v_done := public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid,
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', 'cs_bill_10'
  );
  ASSERT v_done->>'stripe_checkout_session_id' = 'cs_bill_10',
    'finalize must stamp exact session';
  ASSERT public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid,
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', 'cs_bill_10'
  )->>'payment_id' = v_claim->>'payment_id',
    'exact finalize retry must be idempotent';

  v_error := NULL;
  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid,
      'b9700000-0000-4000-8000-000000000004',
      'cus_billing_client', 'cs_wrong'
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_session_mismatch',
    'one attempt cannot be rebound to a second Stripe session';
END;
$$;

-- Missing payment rows recover only from the exact attempt; expired attempts
-- close their row/pointer before a fresh identity is claimed.
DO $$
DECLARE
  v_claim jsonb;
  v_repaired jsonb;
  v_fresh jsonb;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000011',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  DELETE FROM public.invoice_payments
  WHERE id = (v_claim->>'payment_id')::uuid;
  v_repaired := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000011',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  ASSERT v_repaired->>'attempt_id' = v_claim->>'attempt_id'
         AND v_repaired->>'payment_id' <> v_claim->>'payment_id',
    'missing payment must recover beneath the exact attempt only';

  PERFORM public.finalize_invoice_checkout_attempt(
    (v_repaired->>'attempt_id')::uuid,
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', 'cs_bill_11'
  );
  ASSERT public.fail_invoice_checkout_attempt(
    (v_repaired->>'attempt_id')::uuid, 'cs_bill_11', 'checkout_session_expired'
  ), 'exact expired session must close';
  ASSERT (SELECT state = 'expired' FROM public.invoice_checkout_attempts
          WHERE id = (v_repaired->>'attempt_id')::uuid),
    'attempt must be expired';
  ASSERT (SELECT status = 'failed' FROM public.invoice_payments
          WHERE checkout_attempt_id = (v_repaired->>'attempt_id')::uuid),
    'expired attempt payment must fail';
  ASSERT (SELECT stripe_checkout_session_id IS NULL FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000011'),
    'expired attempt must clear invoice pointer';

  v_fresh := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000011',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  ASSERT v_fresh->>'attempt_id' <> v_repaired->>'attempt_id',
    'claim after exact expiry must mint a fresh attempt/key';
END;
$$;

-- Test-mode designer checkout is separately gated and still payer-persisted.
DO $$
DECLARE v_claim jsonb;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000012',
    'b9700000-0000-4000-8000-000000000001',
    'cus_billing_owner', true
  );
  ASSERT v_claim->>'payer_id' = 'b9700000-0000-4000-8000-000000000001'
         AND v_claim->>'stripe_customer_id' = 'cus_billing_owner',
    'explicit designer test mode must still bind the exact payer/customer';
END;
$$;

-- Manual balance drift supersedes the old payable identity. A late charge on
-- that old session is blocked, does not inflate the invoice, freezes the new
-- attempt, and creates one review task.
DO $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_result jsonb;
  v_error text;
BEGIN
  v_old := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000013',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_old->>'attempt_id')::uuid,
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', 'cs_bill_13_old'
  );

  -- Trusted fixture write represents a manual check landing while the hosted
  -- session is open; the same payment-effects trigger runs as the RPC path.
  INSERT INTO public.invoice_payments (
    invoice_id, amount_cents, method, status, reference, recorded_by, received_at
  ) VALUES (
    'b9750000-0000-4000-8000-000000000013', 2000, 'check', 'succeeded',
    'CHECK-DRIFT', 'b9700000-0000-4000-8000-000000000001', now()
  );

  v_new := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000013',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  ASSERT (v_new->>'amount_cents')::int = 8000
         AND v_new->>'attempt_id' <> v_old->>'attempt_id',
    'balance drift must supersede old attempt and claim exact remaining amount';
  ASSERT (SELECT state = 'superseded' FROM public.invoice_checkout_attempts
          WHERE id = (v_old->>'attempt_id')::uuid),
    'old balance attempt must be auditable as superseded';

  v_result := public.settle_invoice_checkout_payment(
    (v_old->>'payment_id')::uuid,
    'evt_bill_late_overpay', 'pi_bill_late_overpay', 10000
  );
  ASSERT v_result->>'outcome' = 'requires_refund',
    'late charge above remaining balance must require refund';
  ASSERT (SELECT amount_paid_cents = 2000 AND status = 'partially_paid'
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000013'),
    'blocked overpayment must not change invoice paid rollup/status';
  ASSERT (SELECT status = 'requires_refund'
          FROM public.invoice_payments
          WHERE id = (v_old->>'payment_id')::uuid),
    'charged row must remain explicit and auditable';
  ASSERT (SELECT state = 'failed' FROM public.invoice_checkout_attempts
          WHERE id = (v_new->>'attempt_id')::uuid),
    'reconciliation must freeze the newer active attempt';
  ASSERT (SELECT count(*) = 1 FROM public.agent_tasks
          WHERE idempotency_key = 'invoice-overpayment:' || (v_old->>'payment_id')),
    'blocked charge must enqueue exactly one awaiting-review reconciliation';
  ASSERT (SELECT status = 'awaiting_review'
                 AND payload->>'required_action' = 'refund_and_reconcile'
          FROM public.agent_tasks
          WHERE idempotency_key = 'invoice-overpayment:' || (v_old->>'payment_id')),
    'reconciliation task contract must name the required refund action';

  -- Settlement replay is idempotent and cannot duplicate the task.
  PERFORM public.settle_invoice_checkout_payment(
    (v_old->>'payment_id')::uuid,
    'evt_bill_late_overpay_replay', 'pi_bill_late_overpay', 10000
  );
  ASSERT (SELECT count(*) = 1 FROM public.agent_tasks
          WHERE idempotency_key = 'invoice-overpayment:' || (v_old->>'payment_id')),
    'overpayment replay must not duplicate reconciliation';

  BEGIN
    PERFORM public.claim_invoice_checkout_attempt(
      'b9750000-0000-4000-8000-000000000013',
      'b9700000-0000-4000-8000-000000000004',
      'cus_billing_client', false
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_reconciliation_required',
    'new Checkout must remain blocked until charged overpayment is reconciled';
END;
$$;

-- If Stripe created a session but local finalization never persisted before
-- the attempt closed, a signed exact-session event may record evidence solely
-- for reconciliation. It must not reopen the attempt or invoice Checkout, and
-- the late charge must never become an applied payment.
DO $$
DECLARE
  v_claim jsonb;
  v_recovered jsonb;
  v_result jsonb;
  v_error text;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000016',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  ASSERT public.fail_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, NULL, 'local_finalize_failed'
  ), 'local persistence failure must close the unfinalized attempt';

  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid,
      'b9700000-0000-4000-8000-000000000004',
      'cus_billing_client', 'cs_bill_16_late_signed'
    );
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_not_active:failed',
    'normal finalization must never reopen a terminal local attempt';

  v_recovered := public.recover_invoice_checkout_session_evidence(
    (v_claim->>'attempt_id')::uuid,
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', 'cs_bill_16_late_signed'
  );
  ASSERT v_recovered->>'state' = 'failed'
         AND v_recovered->>'stripe_checkout_session_id' = 'cs_bill_16_late_signed',
    'signed evidence recovery must stamp the exact session while staying terminal';
  ASSERT (SELECT state = 'failed' AND stripe_checkout_session_id = 'cs_bill_16_late_signed'
          FROM public.invoice_checkout_attempts
          WHERE id = (v_claim->>'attempt_id')::uuid),
    'evidence recovery must not reopen the attempt';
  ASSERT (SELECT status = 'failed' AND stripe_checkout_session_id = 'cs_bill_16_late_signed'
          FROM public.invoice_payments
          WHERE id = (v_claim->>'payment_id')::uuid),
    'evidence recovery must preserve the closed payment row';
  ASSERT (SELECT stripe_checkout_session_id IS NULL
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000016'),
    'evidence recovery must not expose the terminal session as current Checkout';

  v_result := public.settle_invoice_checkout_payment(
    (v_claim->>'payment_id')::uuid,
    'evt_bill_16_late_signed', 'pi_bill_16_late_signed', 10000
  );
  ASSERT v_result->>'outcome' = 'requires_refund',
    'a charge on a locally closed attempt must require refund even if balance remains';
  ASSERT (SELECT status = 'sent' AND amount_paid_cents = 0
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000016'),
    'terminal-attempt charge must not credit or close the invoice';
  ASSERT (SELECT state = 'requires_refund'
          FROM public.invoice_checkout_attempts
          WHERE id = (v_claim->>'attempt_id')::uuid),
    'terminal attempt must become explicit reconciliation state after the charge';
  ASSERT (SELECT status = 'awaiting_review'
          FROM public.agent_tasks
          WHERE idempotency_key = 'invoice-overpayment:' || (v_claim->>'payment_id')),
    'terminal-attempt charge must enqueue the refund/reconciliation review';
END;
$$;

-- ACH stays pending/processing until the async success boundary settles it.
DO $$
DECLARE
  v_claim jsonb;
  v_result jsonb;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'b9750000-0000-4000-8000-000000000014',
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', false
  );
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid,
    'b9700000-0000-4000-8000-000000000004',
    'cus_billing_client', 'cs_bill_14_ach'
  );
  UPDATE public.invoice_payments
  SET stripe_payment_intent_id = 'pi_bill_14_ach'
  WHERE id = (v_claim->>'payment_id')::uuid;
  ASSERT (SELECT status = 'pending' FROM public.invoice_payments
          WHERE id = (v_claim->>'payment_id')::uuid),
    'ACH PI stamp must remain pending';
  ASSERT (SELECT state = 'processing' FROM public.invoice_checkout_attempts
          WHERE id = (v_claim->>'attempt_id')::uuid),
    'ACH PI stamp must put attempt in processing';
  ASSERT (SELECT amount_paid_cents = 0 FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000014'),
    'processing ACH must not credit the invoice';

  v_result := public.settle_invoice_checkout_payment(
    (v_claim->>'payment_id')::uuid,
    'evt_bill_14_ach', 'pi_bill_14_ach', 10000
  );
  ASSERT v_result->>'outcome' = 'succeeded'
         AND (v_result->>'changed')::boolean,
    'async ACH success must settle once';
  ASSERT (SELECT status = 'paid' AND amount_paid_cents = 10000
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000014'),
    'settled ACH must credit exact invoice total';
END;
$$;

-- Legacy sessions without an attempt still receive the overpayment guard and
-- reconciliation task; they never silently bypass the new contract.
DO $$
DECLARE
  v_legacy_payment uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.invoice_payments (
    invoice_id, amount_cents, method, status, reference, recorded_by, received_at
  ) VALUES (
    'b9750000-0000-4000-8000-000000000015', 1000, 'check', 'succeeded',
    'CHECK-LEGACY-DRIFT', 'b9700000-0000-4000-8000-000000000001', now()
  );
  INSERT INTO public.invoice_payments (
    invoice_id, amount_cents, method, status, stripe_checkout_session_id,
    recorded_by
  ) VALUES (
    'b9750000-0000-4000-8000-000000000015', 5000, 'stripe', 'pending',
    'cs_bill_15_legacy', 'b9700000-0000-4000-8000-000000000004'
  ) RETURNING id INTO v_legacy_payment;

  v_result := public.settle_invoice_checkout_payment(
    v_legacy_payment, 'evt_bill_15_legacy', 'pi_bill_15_legacy', 5000
  );
  ASSERT v_result->>'outcome' = 'requires_refund',
    'legacy late overpayment must require refund';
  ASSERT (SELECT amount_paid_cents = 1000 AND status = 'partially_paid'
          FROM public.invoices
          WHERE id = 'b9750000-0000-4000-8000-000000000015'),
    'legacy blocked charge must not inflate the invoice';
  ASSERT (SELECT status = 'awaiting_review'
          FROM public.agent_tasks
          WHERE idempotency_key = 'invoice-overpayment:' || v_legacy_payment::text),
    'legacy blocked charge must land the same human reconciliation contract';
END;
$$;

ROLLBACK;
