-- Studio invoices — an invoice with no house (00570)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/billing/studio_invoice_test.sql
--
-- Covers the whole houseless rail: draft (create_draft_studio_invoice) ->
-- issue (studio-keyed number) -> pay (Stripe Checkout claim -> finalize ->
-- settle, earnings with a NULL project) -> refund contra -> void, the
-- household/co-member/stranger read boundary, the payload and authority
-- rejections, the clean-draft bound set_invoice_studio_id puts on direct
-- PostgREST DML, and a two-studio designer drawing off the studio they named
-- rather than their primary one.

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('5f100000-0000-4000-8000-000000000001', 'studioinv-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5f100000-0000-4000-8000-000000000002', 'studioinv-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5f100000-0000-4000-8000-000000000003', 'studioinv-household@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5f100000-0000-4000-8000-000000000004', 'studioinv-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5f100000-0000-4000-8000-000000000005', 'studioinv-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('5f100000-0000-4000-8000-000000000001', 'studioinv-a@test.invalid', 'Studio Invoice A', true, now(), now()),
  ('5f100000-0000-4000-8000-000000000002', 'studioinv-b@test.invalid', 'Studio Invoice B', true, now(), now()),
  ('5f100000-0000-4000-8000-000000000003', 'studioinv-household@test.invalid', 'Studio Invoice Household', false, now(), now()),
  ('5f100000-0000-4000-8000-000000000004', 'studioinv-stranger@test.invalid', 'Studio Invoice Stranger', false, now(), now()),
  ('5f100000-0000-4000-8000-000000000005', 'studioinv-outsider@test.invalid', 'Studio Invoice Outsider', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Studio One and Studio Two both belong to member A: the two-studio case S8
-- rules on. Studio Three is a design studio A has no membership in.
INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('5f110000-0000-4000-8000-000000000001', 'design_studio', 'Studio Invoice One', 'studio-invoice-one'),
  ('5f110000-0000-4000-8000-000000000002', 'design_studio', 'Studio Invoice Two', 'studio-invoice-two'),
  ('5f110000-0000-4000-8000-000000000003', 'design_studio', 'Studio Invoice Three', 'studio-invoice-three');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('5f120000-0000-4000-8000-000000000001', '5f100000-0000-4000-8000-000000000001',
   '5f110000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('5f120000-0000-4000-8000-000000000002', '5f100000-0000-4000-8000-000000000002',
   '5f110000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('5f120000-0000-4000-8000-000000000003', '5f100000-0000-4000-8000-000000000001',
   '5f110000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('5f120000-0000-4000-8000-000000000004', '5f100000-0000-4000-8000-000000000005',
   '5f110000-0000-4000-8000-000000000003', 'owner', 'active', now());

-- The household sits on member A's roster only. The roster is per-designer
-- (00014), which is why the RPC resolves it and stamps that member.
INSERT INTO public.designer_clients (id, designer_id, client_id, status)
VALUES ('5f130000-0000-4000-8000-000000000001',
        '5f100000-0000-4000-8000-000000000001',
        '5f100000-0000-4000-8000-000000000003', 'active');

CREATE OR REPLACE FUNCTION pg_temp.assume_studio_actor(p_actor uuid)
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
GRANT EXECUTE ON FUNCTION pg_temp.assume_studio_actor(uuid) TO PUBLIC;

CREATE TEMP TABLE studio_invoice_ids (label text PRIMARY KEY, id uuid NOT NULL);
GRANT ALL ON studio_invoice_ids TO PUBLIC;

-- ── The draft: a house-less invoice with a household, a title, and money. ──
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_studio_actor('5f100000-0000-4000-8000-000000000001');

DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_draft_studio_invoice(
    '5f100000-0000-4000-8000-000000000003',
    '5f110000-0000-4000-8000-000000000001',
    '  Design consultation, September  ',
    0.1, 30, 'Two sessions and a site walk.',
    '[
      {"kind":"adhoc","description":"Consultation","quantity":2,
       "unit_amount_cents":25000,"sort_order":0},
      {"kind":"adhoc","description":"Site walk","quantity":1,
       "unit_amount_cents":10000,"sort_order":1}
     ]'::jsonb
  );
  INSERT INTO studio_invoice_ids VALUES ('issued', v_id);

  ASSERT (SELECT project_id IS NULL
                 AND studio_id = '5f110000-0000-4000-8000-000000000001'
                 AND designer_id = '5f100000-0000-4000-8000-000000000001'
                 AND client_id = '5f100000-0000-4000-8000-000000000003'
                 AND title = 'Design consultation, September'
                 AND status = 'draft'
                 AND currency = 'USD'
                 AND invoice_number IS NULL
                 AND subtotal_cents = 60000
                 AND tax_cents = 6000
                 AND total_cents = 66000
                 AND payment_terms_days = 30
          FROM public.invoices WHERE id = v_id),
    'a studio draft stands on the household with no project and exact totals';

  ASSERT (SELECT count(*) = 2 FROM public.invoice_line_items
          WHERE invoice_id = v_id AND kind = 'adhoc'),
    'the draft carries exactly its two ad-hoc lines';
  ASSERT (SELECT amount_cents = 50000 FROM public.invoice_line_items
          WHERE invoice_id = v_id AND sort_order = 0),
    'line money is quantity times unit, in cents';
END;
$$;

-- ── Issue: the number is minted from the studio counter, INV-####. ──
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM studio_invoice_ids WHERE label = 'issued';
  PERFORM public.issue_invoice(v_id, NULL);

  ASSERT (SELECT status = 'sent'
                 AND invoice_number = 'INV-0001'
                 AND invoice_number ~ '^INV-[0-9]{4}$'
                 AND total_cents = 66000
          FROM public.invoices WHERE id = v_id),
    'issue mints the studio-keyed number and holds the money';
END;
$$;

-- studio_invoice_counters is RPC-only (RLS on, zero policies), so the counter
-- is read back with the role reset.
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT next_number = 1 FROM public.studio_invoice_counters
          WHERE studio_id = '5f110000-0000-4000-8000-000000000001'),
    'the number came off this studio''s counter';
END;
$$;

-- ── Payment: the Stripe rail carries a houseless invoice end to end. ──
--
-- Driven through claim -> finalize -> settle exactly as the sibling suite
-- invoice_checkout_integrity_test.sql drives it, because the Checkout rail on
-- an invoice with no project is the one leg no other suite covers.
RESET ROLE;
UPDATE public.profiles
SET stripe_customer_id = 'cus_studio_invoice_household'
WHERE id = '5f100000-0000-4000-8000-000000000003';

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_id uuid;
  v_claim jsonb;
  v_final jsonb;
  v_settled jsonb;
  v_payment uuid;
BEGIN
  SELECT id INTO v_id FROM studio_invoice_ids WHERE label = 'issued';

  v_claim := public.claim_invoice_checkout_attempt(
    v_id, '5f100000-0000-4000-8000-000000000003',
    'cus_studio_invoice_household', false, 'card'
  );
  ASSERT (v_claim->>'amount_cents')::int = 66000
         AND (v_claim->>'surcharge_cents')::int = 1980,
    'the claim reads the houseless invoice''s own balance and its studio''s fee';

  v_payment := (v_claim->>'payment_id')::uuid;
  INSERT INTO studio_invoice_ids VALUES ('payment', v_payment);

  v_final := public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid,
    '5f100000-0000-4000-8000-000000000003',
    'cus_studio_invoice_household', 'cs_studio_invoice_1'
  );
  ASSERT v_final->>'stripe_checkout_session_id' = 'cs_studio_invoice_1',
    'finalize stamps the session on an invoice with no project';

  v_settled := public.settle_invoice_checkout_payment(
    v_payment, 'evt_studio_invoice_1', 'pi_studio_invoice_1', 67980, 'card'
  );
  ASSERT v_settled->>'outcome' = 'succeeded',
    'the webhook settles the houseless charge at gross';

  ASSERT (SELECT status = 'paid' AND amount_paid_cents = 66000
                 AND paid_at IS NOT NULL
          FROM public.invoices WHERE id = v_id),
    'a studio invoice settles like any other';
  ASSERT (SELECT count(*) = 1 FROM public.designer_earnings
          WHERE invoice_payment_id = v_payment
            AND designer_id = '5f100000-0000-4000-8000-000000000001'
            AND source_type = 'design_fee'
            AND status = 'confirmed'
            AND project_id IS NULL
            AND net_amount = 66000
            AND description LIKE '%Design consultation, September%'),
    'studio revenue earns a design fee with no project and the title on it';
END;
$$;
RESET ROLE;

-- ── Refund: the contra row mirrors the credit, still houseless. ──
DO $$
DECLARE
  v_id uuid;
  v_payment uuid;
BEGIN
  SELECT id INTO v_id FROM studio_invoice_ids WHERE label = 'issued';
  SELECT id INTO v_payment FROM studio_invoice_ids WHERE label = 'payment';
  UPDATE public.invoice_payments SET status = 'refunded' WHERE id = v_payment;

  ASSERT (SELECT status = 'sent' AND amount_paid_cents = 0 AND paid_at IS NULL
          FROM public.invoices WHERE id = v_id),
    'a fully refunded studio invoice falls back to sent';
  ASSERT (SELECT count(*) = 1 FROM public.designer_earnings
          WHERE reverses_invoice_payment_id = v_payment
            AND project_id IS NULL
            AND net_amount = -66000
            AND description LIKE 'Refund reversal%'),
    'the contra row nets the credit out and keeps the NULL project';
END;
$$;

-- ── Void: a fresh studio draft can be withdrawn. ──
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_studio_actor('5f100000-0000-4000-8000-000000000001');
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_draft_studio_invoice(
    '5f100000-0000-4000-8000-000000000003',
    '5f110000-0000-4000-8000-000000000001',
    'Withdrawn retainer', 0, 15, NULL,
    '[{"kind":"adhoc","description":"Retainer","quantity":1,
       "unit_amount_cents":5000,"sort_order":0}]'::jsonb
  );
  INSERT INTO studio_invoice_ids VALUES ('voided', v_id);
  PERFORM public.void_invoice(v_id, 'Client postponed.');
  ASSERT (SELECT status = 'void' AND voided_at IS NOT NULL
                 AND void_reason = 'Client postponed.'
          FROM public.invoices WHERE id = v_id),
    'a studio draft voids without a project';
END;
$$;

-- ── A draft the household must never see. ──
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_draft_studio_invoice(
    '5f100000-0000-4000-8000-000000000003',
    '5f110000-0000-4000-8000-000000000001',
    'Unsent draft', 0, 15, NULL,
    '[{"kind":"adhoc","description":"Held back","quantity":1,
       "unit_amount_cents":9900,"sort_order":0}]'::jsonb
  );
  INSERT INTO studio_invoice_ids VALUES ('draft', v_id);
END;
$$;

-- ── S8: the same designer draws off the studio they named. ──
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_draft_studio_invoice(
    '5f100000-0000-4000-8000-000000000003',
    '5f110000-0000-4000-8000-000000000002',
    'Second studio consultation', 0, 15, NULL,
    '[{"kind":"adhoc","description":"Consultation","quantity":1,
       "unit_amount_cents":40000,"sort_order":0}]'::jsonb
  );
  INSERT INTO studio_invoice_ids VALUES ('second-studio', v_id);
  PERFORM public.issue_invoice(v_id, NULL);

  ASSERT (SELECT studio_id = '5f110000-0000-4000-8000-000000000002'
                 AND invoice_number = 'INV-0001'
          FROM public.invoices WHERE id = v_id),
    'a two-studio designer numbers off the chosen studio, not the primary one';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT next_number = 1 FROM public.studio_invoice_counters
          WHERE studio_id = '5f110000-0000-4000-8000-000000000001'),
    'the first studio''s counter is untouched by the second studio''s invoice';
  ASSERT (SELECT next_number = 1 FROM public.studio_invoice_counters
          WHERE studio_id = '5f110000-0000-4000-8000-000000000002'),
    'the second studio keeps its own count';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_studio_actor('5f100000-0000-4000-8000-000000000001');

-- ── Rejections. ──
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    PERFORM public.create_draft_studio_invoice(
      '5f100000-0000-4000-8000-000000000003',
      '5f110000-0000-4000-8000-000000000001',
      'Milestone smuggling', 0, 15, NULL,
      '[{"kind":"milestone","description":"Deposit","quantity":1,
         "unit_amount_cents":25000,"sort_order":0}]'::jsonb
    );
    RAISE EXCEPTION 'a non-adhoc line was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '23514', 'milestone lines are project-bound and refused';

  BEGIN
    PERFORM public.create_draft_studio_invoice(
      '5f100000-0000-4000-8000-000000000003',
      '5f110000-0000-4000-8000-000000000001',
      '   ', 0, 15, NULL,
      '[{"kind":"adhoc","description":"Consultation","quantity":1,
         "unit_amount_cents":1000,"sort_order":0}]'::jsonb
    );
    RAISE EXCEPTION 'a blank title was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '23514', 'the regarding line is required (S12)';

  BEGIN
    PERFORM public.create_draft_studio_invoice(
      '5f100000-0000-4000-8000-000000000003',
      '5f110000-0000-4000-8000-000000000001',
      'Empty invoice', 0, 15, NULL, '[]'::jsonb
    );
    RAISE EXCEPTION 'a line-less studio invoice was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '23514', 'a studio invoice needs at least one line';

  BEGIN
    PERFORM public.create_draft_studio_invoice(
      '5f100000-0000-4000-8000-000000000004',
      '5f110000-0000-4000-8000-000000000001',
      'Off-roster household', 0, 15, NULL,
      '[{"kind":"adhoc","description":"Consultation","quantity":1,
         "unit_amount_cents":1000,"sort_order":0}]'::jsonb
    );
    RAISE EXCEPTION 'an off-roster household was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'the household must be on a studio member''s roster';

  BEGIN
    PERFORM public.create_draft_studio_invoice(
      '5f100000-0000-4000-8000-000000000003',
      '5f110000-0000-4000-8000-000000000003',
      'Foreign studio', 0, 15, NULL,
      '[{"kind":"adhoc","description":"Consultation","quantity":1,
         "unit_amount_cents":1000,"sort_order":0}]'::jsonb
    );
    RAISE EXCEPTION 'a non-member studio was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '42501', 'the actor must be an active member of the studio';
END;
$$;

-- The trigger, not the RPC, is the last word: a hand-rolled studio invoice
-- for a studio the actor does not belong to is refused at the row.
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id, title, status,
      subtotal_cents, total_cents
    ) VALUES (
      '5f140000-0000-4000-8000-000000000001', NULL,
      '5f100000-0000-4000-8000-000000000001',
      '5f100000-0000-4000-8000-000000000003',
      '5f110000-0000-4000-8000-000000000003',
      'Direct write into a foreign studio', 'draft', 1000, 1000
    );
    RAISE EXCEPTION 'a foreign-studio direct write was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = 'P0001',
    'set_invoice_studio_id refuses a studio the actor is not in';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = '5f140000-0000-4000-8000-000000000001'
  ), 'the refused row rolled back';
END;
$$;

-- Direct PostgREST DML on a studio invoice is held to the same clean draft the
-- project path allows: state, number and money belong to the billing RPCs, so
-- a member cannot hand-write a paid invoice or a number the studio counter
-- never minted.
DO $$
DECLARE
  v_state text;
  v_accepted boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id, title, status,
      invoice_number, subtotal_cents, total_cents, amount_paid_cents,
      sent_at, paid_at
    ) VALUES (
      '5f140000-0000-4000-8000-000000000002', NULL,
      '5f100000-0000-4000-8000-000000000001',
      '5f100000-0000-4000-8000-000000000003',
      '5f110000-0000-4000-8000-000000000001',
      'Spoofed paid studio invoice', 'paid', 'INV-9999',
      100000, 100000, 100000, now(), now()
    );
    v_accepted := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT NOT v_accepted AND v_state = 'P0001',
    'direct DML cannot hand-write a paid studio invoice or its number';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = '5f140000-0000-4000-8000-000000000002'
  ), 'the spoofed paid row never landed';
END;
$$;

DO $$
DECLARE
  v_draft uuid;
  v_state text;
  v_accepted boolean;
BEGIN
  SELECT id INTO v_draft FROM studio_invoice_ids WHERE label = 'draft';

  v_accepted := false;
  v_state := NULL;
  BEGIN
    UPDATE public.invoices SET amount_paid_cents = 9999 WHERE id = v_draft;
    v_accepted := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT NOT v_accepted AND v_state = 'P0001',
    'direct DML cannot move money onto a studio draft';

  v_accepted := false;
  v_state := NULL;
  BEGIN
    UPDATE public.invoices
    SET invoice_number = 'INV-7777', status = 'sent', sent_at = now()
    WHERE id = v_draft;
    v_accepted := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT NOT v_accepted AND v_state = 'P0001',
    'direct DML cannot issue a studio draft or name its number';

  ASSERT (SELECT status = 'draft' AND amount_paid_cents = 0
                 AND invoice_number IS NULL AND sent_at IS NULL
          FROM public.invoices WHERE id = v_draft),
    'the refused writes left the draft exactly as it stood';

  UPDATE public.invoices
  SET memo = 'Two sessions and a site walk, revised.'
  WHERE id = v_draft;
  ASSERT (SELECT memo = 'Two sessions and a site walk, revised.'
          FROM public.invoices WHERE id = v_draft),
    'a clean studio draft still edits from the composer';
END;
$$;

-- ── The read boundary. ──
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_studio_actor('5f100000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_issued uuid;
  v_draft uuid;
BEGIN
  SELECT id INTO v_issued FROM studio_invoice_ids WHERE label = 'issued';
  SELECT id INTO v_draft FROM studio_invoice_ids WHERE label = 'draft';

  ASSERT (SELECT count(*) = 1 FROM public.invoices WHERE id = v_issued),
    'the household reads the studio invoice addressed to it';
  ASSERT (SELECT count(*) = 2 FROM public.invoice_line_items
          WHERE invoice_id = v_issued),
    'the household reads its lines';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_payments
          WHERE invoice_id = v_issued),
    'the household reads the payments against it';
  ASSERT (SELECT count(*) = 0 FROM public.invoices WHERE id = v_draft),
    'a draft studio invoice never reaches the household';
  ASSERT (SELECT count(*) = 0 FROM public.invoice_line_items
          WHERE invoice_id = v_draft),
    'a draft''s lines never reach the household either';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_studio_actor('5f100000-0000-4000-8000-000000000002');
DO $$
DECLARE v_issued uuid;
BEGIN
  SELECT id INTO v_issued FROM studio_invoice_ids WHERE label = 'issued';
  ASSERT (SELECT count(*) = 1 FROM public.invoices WHERE id = v_issued),
    'a co-member of the studio reads the studio invoice';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_studio_actor('5f100000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_issued uuid;
  v_draft uuid;
BEGIN
  SELECT id INTO v_issued FROM studio_invoice_ids WHERE label = 'issued';
  SELECT id INTO v_draft FROM studio_invoice_ids WHERE label = 'draft';
  ASSERT (SELECT count(*) = 0 FROM public.invoices
          WHERE id IN (v_issued, v_draft)),
    'a stranger reads nothing and is never told the row exists';
  ASSERT (SELECT count(*) = 0 FROM public.invoice_line_items
          WHERE invoice_id IN (v_issued, v_draft)),
    'a stranger reads no lines';
  ASSERT (SELECT count(*) = 0 FROM public.invoice_payments
          WHERE invoice_id IN (v_issued, v_draft)),
    'a stranger reads no payments';
END;
$$;

-- ── The letterhead follows the invoice's own studio (S8). ──
RESET ROLE;
DO $$
DECLARE v_name text;
BEGIN
  SELECT identity.name INTO v_name
  FROM public.resolve_studio_identity(
    NULL, '5f100000-0000-4000-8000-000000000001',
    '5f110000-0000-4000-8000-000000000002'
  ) AS identity;
  ASSERT v_name = 'Studio Invoice Two',
    'a named studio brands the letter, never the designer''s primary studio';
END;
$$;

ROLLBACK;
