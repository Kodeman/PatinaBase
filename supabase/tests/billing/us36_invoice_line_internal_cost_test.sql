-- 00822: household invoice line reads never expose internal economics.
-- Run with psql -v ON_ERROR_STOP=1; transaction keeps fixtures local.
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('82200000-0000-4000-8000-000000000001', 'private-lead@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
 ('82200000-0000-4000-8000-000000000002', 'private-home@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
 ('82200000-0000-4000-8000-000000000001', 'private-lead@test.invalid', 'Private Lead', true, now(), now()),
 ('82200000-0000-4000-8000-000000000002', 'private-home@test.invalid', 'Private Home', false, now(), now())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('82200000-0000-4000-8000-000000000010', 'design_studio', 'Private Studio', 'private-822-test', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('82200000-0000-4000-8000-000000000001', '82200000-0000-4000-8000-000000000010', 'owner', 'active', now());
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '82200000-0000-4000-8000-000000000001', id, '82200000-0000-4000-8000-000000000001'
FROM public.roles WHERE name = 'studio_owner';
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('82200000-0000-4000-8000-000000000020', 'Private Job', '82200000-0000-4000-8000-000000000001',
 '82200000-0000-4000-8000-000000000001', '82200000-0000-4000-8000-000000000002',
 '82200000-0000-4000-8000-000000000010', 'active');
INSERT INTO public.invoices (id, project_id, designer_id, client_id, studio_id, status, currency, subtotal_cents, tax_cents, total_cents)
VALUES ('82200000-0000-4000-8000-000000000030', '82200000-0000-4000-8000-000000000020',
 '82200000-0000-4000-8000-000000000001', '82200000-0000-4000-8000-000000000002',
 '82200000-0000-4000-8000-000000000010', 'draft', 'USD', 0, 0, 0);
INSERT INTO public.studio_purchases (id, organization_id, project_id, kind, payee_name, purchased_on, amount_cents, tax_cents, buyer_premium_cents, shipping_cents)
VALUES
 ('82200000-0000-4000-8000-000000000040', '82200000-0000-4000-8000-000000000010', '82200000-0000-4000-8000-000000000020', 'expense', 'Fixture', current_date, 5000, 500, 200, 300),
 ('82200000-0000-4000-8000-000000000041', '82200000-0000-4000-8000-000000000010', '82200000-0000-4000-8000-000000000020', 'expense', 'Compose fixture', current_date, 8000, 0, 0, 0);
INSERT INTO public.vendors (id, name) VALUES ('82200000-0000-4000-8000-000000000050', 'Fixture vendor');
INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern)
VALUES ('82200000-0000-4000-8000-000000000051', '82200000-0000-4000-8000-000000000001',
 '82200000-0000-4000-8000-000000000020', '82200000-0000-4000-8000-000000000050', 'net_30');
INSERT INTO public.po_cost_lines (id, organization_id, purchase_order_id, kind, estimate_cents)
VALUES ('82200000-0000-4000-8000-000000000052', '82200000-0000-4000-8000-000000000010',
 '82200000-0000-4000-8000-000000000051', 'freight', 4200);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT count(*) FROM public.add_invoice_billing_lines('82200000-0000-4000-8000-000000000030',
 '[{"purchaseId":"82200000-0000-4000-8000-000000000040"},{"costLineId":"82200000-0000-4000-8000-000000000052","amountCents":9000}]'::jsonb);
RESET ROLE;
UPDATE public.invoices SET status = 'sent', invoice_number = 'PRIVATE-822' WHERE id = '82200000-0000-4000-8000-000000000030';

-- (a) The negative control on main 6988df3 fails THIS assertion: the old
-- writer places costCents on these household-readable issued rows.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
DECLARE v_row public.invoice_line_items%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_row FROM public.invoice_line_items
   WHERE invoice_id = '82200000-0000-4000-8000-000000000030' AND metadata ? 'studioPurchaseId';
  ASSERT FOUND, 'privacy: household sees issued line through SELECT *';
  ASSERT v_row.metadata = '{"studioPurchaseId":"82200000-0000-4000-8000-000000000040","billingRule":"at_cost"}'::jsonb,
    'privacy: household SELECT * has no cost/markup/margin/retail metadata key';
  SELECT count(*) INTO v_count FROM public.invoice_line_items
   WHERE invoice_id = '82200000-0000-4000-8000-000000000030'
     AND (metadata::text ~* '"(costCents|markup|margin|retail|tradePrice)"');
  ASSERT v_count = 0, 'privacy: explicit metadata SELECT has no internal economics';
END $$;
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.invoice_line_item_internals;
  ASSERT v_count = 0, 'privacy: household cannot read internals';
END $$;
RESET ROLE;

-- (b) The studio lead reads the exact billed costs, not overridden client amounts.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE v_cost bigint; v_amount integer;
BEGIN
  SELECT (internal.internal_metadata->>'costCents')::bigint, line.amount_cents
    INTO v_cost, v_amount
    FROM public.invoice_line_item_internals AS internal
    JOIN public.invoice_line_items AS line ON line.id = internal.line_item_id
   WHERE line.metadata ? 'studioPurchaseId' AND line.invoice_id = '82200000-0000-4000-8000-000000000030';
  ASSERT v_cost = 6000 AND v_amount = 6000, 'studio: purchase cost matches billed amount';
  SELECT (internal.internal_metadata->>'costCents')::bigint, line.amount_cents
    INTO v_cost, v_amount
    FROM public.invoice_line_item_internals AS internal
    JOIN public.invoice_line_items AS line ON line.id = internal.line_item_id
   WHERE line.metadata ? 'poCostLineId' AND line.invoice_id = '82200000-0000-4000-8000-000000000030';
  ASSERT v_cost = 4200 AND v_amount = 9000, 'studio: rider override does not change internal cost';
END $$;
RESET ROLE;

-- (c) Simulate an existing pre-00822 row, then call the same migration
-- backfill routine. No trigger toggles; this transaction restores the CHECK.
ALTER TABLE public.invoice_line_items DROP CONSTRAINT invoice_line_items_public_metadata_ck;
INSERT INTO public.invoice_line_items (id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata)
VALUES ('82200000-0000-4000-8000-000000000060', '82200000-0000-4000-8000-000000000030',
 'adhoc', 'Legacy purchase', 1, 10000, 10000,
 '{"costCents":7300,"markupPercent":20,"nested":{"suggestedRetailPriceCents":12000},"billingRule":"at_cost"}'::jsonb);
SELECT public._move_invoice_line_internal_metadata();
SELECT public._move_invoice_line_internal_metadata();
DO $$
DECLARE v_public jsonb; v_private jsonb;
BEGIN
  SELECT metadata INTO v_public FROM public.invoice_line_items WHERE id = '82200000-0000-4000-8000-000000000060';
  SELECT internal_metadata INTO v_private FROM public.invoice_line_item_internals WHERE line_item_id = '82200000-0000-4000-8000-000000000060';
  ASSERT v_public = '{"nested":{},"billingRule":"at_cost"}'::jsonb,
    'backfill: private keys removed recursively';
  ASSERT v_private->>'costCents' = '7300' AND v_private->>'markupPercent' = '20'
     AND v_private #>> '{nested,suggestedRetailPriceCents}' = '12000',
    'backfill: original internal values copied intact on rerun';
END $$;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_public_metadata_ck
  CHECK (metadata = public._invoice_line_public_metadata(metadata));

-- (d) The 00821 compose path calls the current billing writer with an override.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.compose_project_invoice(
 '82200000-0000-4000-8000-000000000020', '82200000-0000-4000-8000-000000000001',
 '82200000-0000-4000-8000-000000000002', '82200000-0000-4000-8000-000000000010',
 0, 15, 'privacy-compose', NULL,
 '[{"kind":"adhoc","description":"Design","quantity":1,"unit_amount_cents":10000,"sort_order":0}]'::jsonb,
 '{}'::uuid[], '[{"purchaseId":"82200000-0000-4000-8000-000000000041","amountCents":11000}]'::jsonb);
RESET ROLE;
DO $$
DECLARE v_cost bigint; v_amount integer; v_meta jsonb;
BEGIN
  SELECT (internal.internal_metadata->>'costCents')::bigint, line.amount_cents, line.metadata
    INTO v_cost, v_amount, v_meta
    FROM public.invoice_line_item_internals AS internal
    JOIN public.invoice_line_items AS line ON line.id = internal.line_item_id
    JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
   WHERE invoice.memo = 'privacy-compose' AND line.metadata ? 'studioPurchaseId';
  ASSERT v_cost = 8000 AND v_amount = 11000 AND NOT v_meta ? 'costCents',
    'compose: override bills client 11000, retains private cost 8000';
END $$;
-- 00823: compound economics keys disappear at any depth; client-facing money
-- fields and the PO cost-line identifier remain legible.
DO $$
DECLARE v_public jsonb;
BEGIN
  v_public := public._invoice_line_public_metadata(
    '{"lines":[{"suggestedMSRP_Cents":12000,"WHOLESALEprice":8000,"tradeAmountCents":3000,
                "marginNote":"internal","unitPriceCents":15000,"amountCents":15000,
                "grossCents":15000,"retainageCents":500,"depositPercent":20,
                "contractSumCents":15000,"poCostLineId":"82200000-0000-4000-8000-000000000052",
                "nested":{"poCostLineId":7300}}]}'::jsonb);
  ASSERT v_public =
    '{"lines":[{"unitPriceCents":15000,"amountCents":15000,"grossCents":15000,
                "retainageCents":500,"depositPercent":20,"contractSumCents":15000,
                "poCostLineId":"82200000-0000-4000-8000-000000000052","nested":{}}]}'::jsonb,
    'metadata alias: nested economics stripped while client-facing keys survive';
END $$;

-- The installed constraint itself, not just the helper, must refuse a nested alias.
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    UPDATE public.invoice_line_items
       SET metadata = '{"details":[{"suggestedMSRP_Cents":12000}]}'::jsonb
     WHERE id = '82200000-0000-4000-8000-000000000060';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '23514', 'metadata alias: CHECK refuses nested economics';
END $$;

-- An issued milestone line is not re-latched or rewritten for metadata-only
-- writes; this also lets the 00823 scrub touch legacy issued milestones.
INSERT INTO public.invoices (id, project_id, designer_id, client_id, studio_id, status,
                             currency, subtotal_cents, tax_cents, total_cents)
VALUES ('82200000-0000-4000-8000-000000000070', '82200000-0000-4000-8000-000000000020',
        '82200000-0000-4000-8000-000000000001', '82200000-0000-4000-8000-000000000002',
        '82200000-0000-4000-8000-000000000010', 'draft', 'USD', 15000, 0, 15000);
INSERT INTO public.project_payment_milestones (id, project_id, label, percentage, amount_cents, status, sort_order)
VALUES ('82200000-0000-4000-8000-000000000071', '82200000-0000-4000-8000-000000000020',
        'Issued metadata fixture', 10, 15000, 'pending', 1);
INSERT INTO public.invoice_line_items (id, invoice_id, milestone_id, kind, description, quantity,
                                       unit_amount_cents, amount_cents, metadata)
VALUES ('82200000-0000-4000-8000-000000000072', '82200000-0000-4000-8000-000000000070',
        '82200000-0000-4000-8000-000000000071', 'milestone', 'Issued metadata fixture',
        1, 15000, 15000, '{}'::jsonb);
UPDATE public.invoices SET status = 'sent', invoice_number = 'PRIVATE-MILESTONE-823'
 WHERE id = '82200000-0000-4000-8000-000000000070';
UPDATE public.project_payment_milestones SET status = 'outstanding'
 WHERE id = '82200000-0000-4000-8000-000000000071';
DO $$
DECLARE v_state text; v_before text; v_after text;
BEGIN
  SELECT status INTO v_before FROM public.project_payment_milestones
   WHERE id = '82200000-0000-4000-8000-000000000071';
  BEGIN
    UPDATE public.invoice_line_items SET metadata = '{"unitPriceCents":15000}'::jsonb
     WHERE id = '82200000-0000-4000-8000-000000000072';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  SELECT status INTO v_after FROM public.project_payment_milestones
   WHERE id = '82200000-0000-4000-8000-000000000071';
  ASSERT v_state IS NULL AND v_after = v_before AND v_after = 'outstanding'
    AND (SELECT metadata ? 'unitPriceCents' FROM public.invoice_line_items
         WHERE id = '82200000-0000-4000-8000-000000000072'),
    'milestone metadata: issued line updates without re-latching its status';
END $$;

-- Simulate a pre-00823 issued milestone with private metadata, retaining
-- triggers. The same backfill must scrub it without touching latch status.
ALTER TABLE public.invoice_line_items DROP CONSTRAINT invoice_line_items_public_metadata_ck;
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    UPDATE public.invoice_line_items
       SET metadata = '{"WHOLESALEprice":8000,"unitPriceCents":15000}'::jsonb
     WHERE id = '82200000-0000-4000-8000-000000000072';
    PERFORM public._move_invoice_line_internal_metadata();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state IS NULL
     AND (SELECT metadata = '{"unitPriceCents":15000}'::jsonb
          FROM public.invoice_line_items
         WHERE id = '82200000-0000-4000-8000-000000000072')
     AND (SELECT internal_metadata->>'WHOLESALEprice' = '8000'
          FROM public.invoice_line_item_internals
         WHERE line_item_id = '82200000-0000-4000-8000-000000000072')
     AND (SELECT status = 'outstanding'
          FROM public.project_payment_milestones
         WHERE id = '82200000-0000-4000-8000-000000000071'),
    'milestone scrub: issued private metadata moves without status rewrite';
END $$;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_public_metadata_ck
  CHECK (metadata = public._invoice_line_public_metadata(metadata));

-- The exact metadata shape emitted by issue_trade_draw_invoice (00511) and
-- both authorized execution paths (00578) remains usable by the document reader.
INSERT INTO public.invoice_line_items (id, invoice_id, kind, description, quantity,
                                       unit_amount_cents, amount_cents, metadata)
VALUES ('82200000-0000-4000-8000-000000000080', '82200000-0000-4000-8000-000000000030',
        'adhoc', 'Trade draw', 1, 3000, 3000,
        '{"tradeScopeId":"82200000-0000-4000-8000-000000000020",
          "tradeScopeDocumentId":"82200000-0000-4000-8000-000000000071",
          "drawId":"82200000-0000-4000-8000-000000000080","kind":"trade_draw"}'::jsonb);
SELECT public._move_invoice_line_internal_metadata();
DO $$
DECLARE v_metadata jsonb;
BEGIN
  SELECT metadata INTO v_metadata FROM public.invoice_line_items
   WHERE id = '82200000-0000-4000-8000-000000000080';
  ASSERT v_metadata = '{"tradeScopeId":"82200000-0000-4000-8000-000000000020",
                        "tradeScopeDocumentId":"82200000-0000-4000-8000-000000000071",
                        "drawId":"82200000-0000-4000-8000-000000000080","kind":"trade_draw"}'::jsonb,
    'trade references: CHECK accepts both UUID ids and scrub preserves writer payload';
END $$;

DO $$
BEGIN
  ASSERT public._invoice_line_public_metadata(
    '{"tradeScopeId":"not-a-uuid","nested":[{"retail_item_id":7300,"tradeScopeDocumentId":"nope"}]}'::jsonb)
    = '{"nested":[{}]}'::jsonb,
    'non-UUID economic ids: references cannot bypass private-key classification';
END $$;

-- Stage one models 00822's fresh archive; stage two reruns 00823 over a legacy
-- update whose newly classified keys share the original nested array object.
ALTER TABLE public.invoice_line_items DROP CONSTRAINT invoice_line_items_public_metadata_ck;
INSERT INTO public.invoice_line_items (id, invoice_id, kind, description, quantity,
                                       unit_amount_cents, amount_cents, metadata)
VALUES ('82200000-0000-4000-8000-000000000081', '82200000-0000-4000-8000-000000000030',
        'adhoc', 'Two-stage archive', 1, 8000, 8000,
        '{"nested":[{"costCents":7300,"unitPriceCents":8000},{"costCents":10}]}'::jsonb);
SELECT public._move_invoice_line_internal_metadata();
UPDATE public.invoice_line_items
   SET metadata = '{"nested":[{"WHOLESALEprice":8000,"unitPriceCents":8000},
                              {"retailAmount":20},{"marginCents":30}]}'::jsonb
 WHERE id = '82200000-0000-4000-8000-000000000081';
SELECT public._move_invoice_line_internal_metadata();
DO $$
DECLARE v_public jsonb; v_archive jsonb;
BEGIN
  SELECT line.metadata, internal.internal_metadata INTO v_public, v_archive
    FROM public.invoice_line_items AS line
    JOIN public.invoice_line_item_internals AS internal ON internal.line_item_id = line.id
   WHERE line.id = '82200000-0000-4000-8000-000000000081';
  ASSERT v_public = '{"nested":[{"unitPriceCents":8000},{},{}]}'::jsonb
     AND v_archive #>> '{nested,0,costCents}' = '7300'
     AND v_archive #>> '{nested,1,costCents}' = '10'
     AND v_archive #>> '{archiveSnapshots,0,nested,0,WHOLESALEprice}' = '8000'
     AND v_archive #>> '{archiveSnapshots,0,nested,1,retailAmount}' = '20'
     AND v_archive #>> '{archiveSnapshots,0,nested,2,marginCents}' = '30',
    'two-stage archive: prior and new nested array economics survive both scrubs';
END $$;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_public_metadata_ck
  CHECK (metadata = public._invoice_line_public_metadata(metadata));

-- A conflicting top-level value is never descended into or overwritten. The
-- full incoming object stays associated with its own private values.
ALTER TABLE public.invoice_line_items DROP CONSTRAINT invoice_line_items_public_metadata_ck;
INSERT INTO public.invoice_line_items (id, invoice_id, kind, description, quantity,
                                       unit_amount_cents, amount_cents, metadata)
VALUES ('82200000-0000-4000-8000-000000000082', '82200000-0000-4000-8000-000000000030',
        'adhoc', 'Type-conflict archive', 1, 8000, 8000,
        '{"nested":{"wholesalePrice":8000},"markupCents":55}'::jsonb),
       ('82200000-0000-4000-8000-000000000083', '82200000-0000-4000-8000-000000000030',
        'adhoc', 'Reordered archive', 1, 8000, 8000,
        '{"nested":[{"id":"B","WHOLESALEprice":8000},{"id":"A","costCents":7300}]}'::jsonb);
INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
VALUES ('82200000-0000-4000-8000-000000000082', '{"nested":null,"costCents":7300}'::jsonb),
       ('82200000-0000-4000-8000-000000000083',
        '{"nested":[{"id":"A","costCents":7300},{"id":"B","WHOLESALEprice":8000}]}'::jsonb);
SELECT public._move_invoice_line_internal_metadata();
DO $$
DECLARE v_public jsonb; v_archive jsonb;
BEGIN
  SELECT line.metadata, internal.internal_metadata INTO v_public, v_archive
    FROM public.invoice_line_items line JOIN public.invoice_line_item_internals internal
      ON internal.line_item_id = line.id WHERE line.id = '82200000-0000-4000-8000-000000000082';
  ASSERT v_public = '{"nested":{}}'::jsonb
     AND v_archive->>'costCents' = '7300'
     AND v_archive->'nested' = 'null'::jsonb
     AND v_archive->>'markupCents' = '55'
     AND v_archive #>> '{archiveSnapshots,0,nested,wholesalePrice}' = '8000',
    'type-conflict archive: old cost and new wholesale survive without nested merge';
END $$;
DO $$
DECLARE v_public jsonb; v_archive jsonb;
BEGIN
  SELECT line.metadata, internal.internal_metadata INTO v_public, v_archive
    FROM public.invoice_line_items line JOIN public.invoice_line_item_internals internal
      ON internal.line_item_id = line.id WHERE line.id = '82200000-0000-4000-8000-000000000083';
  ASSERT v_public = '{"nested":[{"id":"B"},{"id":"A"}]}'::jsonb
     AND v_archive->'nested' =
       '[{"id":"A","costCents":7300},{"id":"B","WHOLESALEprice":8000}]'::jsonb
     AND v_archive #> '{archiveSnapshots,0,nested}' =
       '[{"id":"B","WHOLESALEprice":8000},{"id":"A","costCents":7300}]'::jsonb,
    'reordered archive: B wholesale never attaches to A';
END $$;
-- Replay the identical incoming extract, not merely the now-public row.
UPDATE public.invoice_line_items
   SET metadata = '{"nested":{"wholesalePrice":8000},"markupCents":55}'::jsonb
 WHERE id = '82200000-0000-4000-8000-000000000082';
SELECT public._move_invoice_line_internal_metadata();
DO $$
BEGIN
  ASSERT (SELECT jsonb_array_length(internal_metadata->'archiveSnapshots') = 1
          FROM public.invoice_line_item_internals
         WHERE line_item_id = '82200000-0000-4000-8000-000000000082'),
    'archive rerun: identical incoming extract adds no second snapshot';
END $$;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_public_metadata_ck
  CHECK (metadata = public._invoice_line_public_metadata(metadata));

-- Draft RLS accepts any active co-member, but the latch must still require a
-- design-studio seat. Issued rows remain immutable to authenticated callers.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('82200000-0000-4000-8000-000000000003', 'foreign-member@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
 ('82200000-0000-4000-8000-000000000004', 'studio-member@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
 ('82200000-0000-4000-8000-000000000003', 'foreign-member@test.invalid', 'Foreign Member', true, now(), now()),
 ('82200000-0000-4000-8000-000000000004', 'studio-member@test.invalid', 'Studio Member', true, now(), now())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('82200000-0000-4000-8000-000000000011', 'manufacturer', 'Other Organization', 'other-822-test', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('82200000-0000-4000-8000-000000000001', '82200000-0000-4000-8000-000000000011', 'owner', 'active', now()),
       ('82200000-0000-4000-8000-000000000003', '82200000-0000-4000-8000-000000000011', 'member', 'active', now()),
       ('82200000-0000-4000-8000-000000000004', '82200000-0000-4000-8000-000000000010', 'member', 'active', now());
INSERT INTO public.invoices (id, project_id, designer_id, client_id, studio_id, status,
                             currency, subtotal_cents, tax_cents, total_cents)
VALUES ('82200000-0000-4000-8000-000000000090', '82200000-0000-4000-8000-000000000020',
        '82200000-0000-4000-8000-000000000001', '82200000-0000-4000-8000-000000000002',
        '82200000-0000-4000-8000-000000000010', 'draft', 'USD', 15000, 0, 15000);
INSERT INTO public.project_payment_milestones (id, project_id, label, percentage, amount_cents, status, sort_order)
VALUES ('82200000-0000-4000-8000-000000000091', '82200000-0000-4000-8000-000000000020',
        'Draft authority fixture', 10, 15000, 'pending', 2);
INSERT INTO public.invoice_line_items (id, invoice_id, milestone_id, kind, description, quantity,
                                       unit_amount_cents, amount_cents, metadata)
VALUES ('82200000-0000-4000-8000-000000000092', '82200000-0000-4000-8000-000000000090',
        '82200000-0000-4000-8000-000000000091', 'milestone', 'Draft authority fixture',
        1, 15000, 15000, '{}'::jsonb);
-- Expose this fixture's referenced rows only, so the trigger authority check
-- (rather than an unrelated project/milestone visibility policy) is exercised.
CREATE POLICY test_foreign_milestone_read ON public.project_payment_milestones
  FOR ALL TO authenticated
  USING (id = '82200000-0000-4000-8000-000000000091')
  WITH CHECK (id = '82200000-0000-4000-8000-000000000091');
CREATE POLICY test_foreign_project_read ON public.projects
  FOR SELECT TO authenticated
  USING (id = '82200000-0000-4000-8000-000000000020');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    UPDATE public.invoice_line_items SET metadata = '{"note":"foreign"}'::jsonb
     WHERE id = '82200000-0000-4000-8000-000000000092';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_state = '42501', 'draft metadata: non-design co-member refused by latch';
END $$;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.invoice_line_items SET metadata = '{"note":"studio"}'::jsonb
   WHERE id = '82200000-0000-4000-8000-000000000092';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1 AND (SELECT metadata->>'note' = 'studio'
                         FROM public.invoice_line_items
                        WHERE id = '82200000-0000-4000-8000-000000000092'),
    'draft metadata: design-studio member can update milestone';
END $$;
RESET ROLE;
UPDATE public.invoices SET status = 'sent', invoice_number = 'PRIVATE-AUTH-823'
 WHERE id = '82200000-0000-4000-8000-000000000090';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82200000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$
DECLARE v_rows integer := 0; v_state text;
BEGIN
  BEGIN
    UPDATE public.invoice_line_items SET metadata = '{"note":"issued edit"}'::jsonb
     WHERE id = '82200000-0000-4000-8000-000000000092';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  ASSERT (v_rows = 0 OR v_state IS NOT NULL)
     AND (SELECT metadata->>'note' = 'studio' FROM public.invoice_line_items
          WHERE id = '82200000-0000-4000-8000-000000000092'),
    'issued metadata: authenticated studio member cannot update milestone';
END $$;
RESET ROLE;
ROLLBACK;
