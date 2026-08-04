-- 00412 design-services commercial authority integration test.
-- Runner: plain psql, ON_ERROR_STOP=1. The transaction rolls back.
-- Run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/commercial/design_services_authority_test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'commercial-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5000000-0000-4000-8000-000000000002', 'commercial-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5000000-0000-4000-8000-000000000003', 'commercial-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d5000000-0000-4000-8000-000000000001', 'commercial-designer@test.invalid', 'Commercial Designer', true, now(), now()),
  ('d5000000-0000-4000-8000-000000000002', 'commercial-client@test.invalid', 'Commercial Client', false, now(), now()),
  ('d5000000-0000-4000-8000-000000000003', 'commercial-outsider@test.invalid', 'Commercial Outsider', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d5100000-0000-4000-8000-000000000001', 'design_studio',
        'Commercial Studio', 'commercial-authority-test', 'active');
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES (
  'd5110000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5100000-0000-4000-8000-000000000001', 'owner', 'active', now()
);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'd5200000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'Commercial Client', 'proposal', 'direct'
);

-- Design-services draft, zero FF&E, one schedule phase.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd5300000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5200000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'Design services agreement', 'Services only', 0, 'draft', now() + interval '30 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd5310000-0000-4000-8000-000000000001',
  'd5300000-0000-4000-8000-000000000001',
  'Design development', 'design-development', 14, 'main', 0, 0
);

SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_save jsonb; v_snapshot jsonb; v_sent jsonb;
BEGIN
  v_save := public.upsert_design_services_draft(
    'd5300000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'scope', 'Interior design services for the living floor.',
      'deliverables', jsonb_build_array('Concept', 'Selections'),
      'exclusions', jsonb_build_array('Construction'),
      'billingCeilingCents', 10000,
      'retainerAmountCents', 5000,
      'retainerActivationPolicy', 'retainer_paid',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours, not to exceed the signed ceiling.',
      'currentRateVersion', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Designer', 'hourlyRateCents', 12000,
      'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  ASSERT v_save->>'documentKind' = 'design_services', 'draft save kind';
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd5300000-0000-4000-8000-000000000001'
  );
  v_sent := public.send_commercial_document(
    'd5300000-0000-4000-8000-000000000001',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );
  ASSERT v_sent->>'commercialState' = 'sent', 'commercial send state';
  ASSERT v_sent->>'proposalSendDispatchId' IS NOT NULL, 'commercial send dispatch';
END;
$$;

-- Client act records immutable consent but does not produce legacy accepted
-- state, a project, or a billing authority.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
DO $$
DECLARE v_result jsonb; v_status text; v_state text; v_project uuid;
BEGIN
  v_result := public.sign_design_services_agreement(
    'd5300000-0000-4000-8000-000000000001', 'Commercial Client'
  );
  ASSERT (v_result->>'newlyClientSigned')::boolean, 'first client sign';
  SELECT status, commercial_state, project_id INTO v_status, v_state, v_project
  FROM public.proposals WHERE id = 'd5300000-0000-4000-8000-000000000001';
  ASSERT v_status IN ('sent', 'viewed'), 'client sign must not set legacy accepted';
  ASSERT v_state = 'client_signed', 'client-sign commercial state';
  ASSERT v_project IS NULL, 'client sign must not create project';
  ASSERT NOT EXISTS (SELECT 1 FROM public.projects WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001'),
    'client sign created project';
END;
$$;

-- Wrong actor cannot countersign.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.countersign_design_services_agreement(
      'd5300000-0000-4000-8000-000000000001', 'Outsider'
    );
    ASSERT false, 'outsider countersign should fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- Studio countersign creates exactly one project/authority/retainer invoice;
-- retry returns the same topology.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_first jsonb; v_retry jsonb;
BEGIN
  v_first := public.countersign_design_services_agreement(
    'd5300000-0000-4000-8000-000000000001', 'Commercial Designer'
  );
  v_retry := public.countersign_design_services_agreement(
    'd5300000-0000-4000-8000-000000000001', 'Commercial Designer'
  );
  ASSERT (v_first->>'newlyExecuted')::boolean, 'first countersign';
  ASSERT NOT (v_retry->>'newlyExecuted')::boolean, 'retry countersign';
  ASSERT v_first->>'projectId' = v_retry->>'projectId', 'retry project identity';
  ASSERT v_first->>'billingAuthorityId' = v_retry->>'billingAuthorityId', 'retry authority identity';
  ASSERT (SELECT count(*) FROM public.projects WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001') = 1,
    'exactly one project';
  ASSERT (SELECT count(*) FROM public.project_billing_authorities WHERE source_proposal_id = 'd5300000-0000-4000-8000-000000000001') = 1,
    'exactly one authority';
  ASSERT (SELECT status FROM public.invoices WHERE id = (v_first->>'retainerInvoiceId')::uuid) = 'sent',
    'retainer invoice must be issued';
END;
$$;

-- Signed rates are immutable.
DO $$ BEGIN
  BEGIN
    UPDATE public.proposal_service_rates SET hourly_rate_cents = 1
    WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
    ASSERT false, 'historical rate update should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Cap classification: $60 authorized, next $120 captured pending.
INSERT INTO public.project_time_entries (
  id, project_id, user_id, started_at, duration_minutes, billable, activity
) SELECT
  'd5400000-0000-4000-8000-000000000001', p.id,
  'd5000000-0000-4000-8000-000000000001', now(), 30, true, 'design'
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.project_time_entries (
  id, project_id, user_id, started_at, duration_minutes, billable, activity
) SELECT
  'd5400000-0000-4000-8000-000000000002', p.id,
  'd5000000-0000-4000-8000-000000000001', now(), 60, true, 'sourcing'
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
DO $$ BEGIN
  ASSERT (SELECT billing_state FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000001') = 'authorized',
    'first entry should be authorized';
  ASSERT (SELECT rated_amount_cents FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000001') = 6000,
    'first entry rate snapshot';
  ASSERT (SELECT billing_state FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000002') = 'pending_authorization',
    'over-cap entry should remain captured pending';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_unbilled_time WHERE id = 'd5400000-0000-4000-8000-000000000002'),
    'pending entry leaked into unbilled view';
END $$;

-- Internal invoice settlement opens retainer-gated invoiceability.
DO $$
DECLARE v_project uuid; v_retainer uuid; v_draft uuid;
BEGIN
  SELECT p.id, a.retainer_invoice_id INTO v_project, v_retainer
  FROM public.projects p JOIN public.project_billing_authorities a ON a.project_id = p.id
  WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
  INSERT INTO public.invoices (project_id, designer_id, client_id, status, currency, memo)
  VALUES (v_project, 'd5000000-0000-4000-8000-000000000001',
          'd5000000-0000-4000-8000-000000000002', 'draft', 'USD', 'Time draft')
  RETURNING id INTO v_draft;
  BEGIN
    UPDATE public.project_time_entries SET invoice_id = v_draft
    WHERE id = 'd5400000-0000-4000-8000-000000000001';
    ASSERT false, 'unpaid retainer should gate invoice attachment';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.record_invoice_payment(v_retainer, 5000, 'check', 'RET-PAID', now(), NULL);
  UPDATE public.project_time_entries SET invoice_id = v_draft
  WHERE id = 'd5400000-0000-4000-8000-000000000001';
  ASSERT (SELECT invoice_id FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000001') = v_draft,
    'paid retainer should open invoice attachment';
END;
$$;

-- Budget acknowledgement is planning truth only.
INSERT INTO public.project_budget_versions (
  id, project_id, version, created_by
) SELECT 'd5500000-0000-4000-8000-000000000001', p.id, 1,
  'd5000000-0000-4000-8000-000000000001'
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.project_budget_lines (
  budget_version_id, room_name, category, low_cents, target_cents, high_cents
) VALUES (
  'd5500000-0000-4000-8000-000000000001', 'Living room', 'Seating', 100000, 150000, 200000
);
SELECT public.publish_budget_checkpoint(
  (SELECT id FROM public.projects WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001'),
  'd5500000-0000-4000-8000-000000000001'
);
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
SELECT public.acknowledge_budget_checkpoint(
  (SELECT id FROM public.project_budget_checkpoints WHERE budget_version_id = 'd5500000-0000-4000-8000-000000000001')
);
DO $$
DECLARE v_budget jsonb;
BEGIN
  ASSERT (SELECT status FROM public.project_budget_checkpoints WHERE budget_version_id = 'd5500000-0000-4000-8000-000000000001') = 'acknowledged',
    'budget acknowledgement';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items i
    JOIN public.projects p ON p.id = i.project_id
    WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001'
  ), 'budget acknowledgement must not authorize purchases';
  v_budget := public.get_project_working_budget(
    (SELECT id FROM public.projects WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001')
  );
  ASSERT v_budget->'version'->>'currency' = 'USD'
    AND v_budget->'version'->>'createdAt' IS NOT NULL,
    'working budget version adapter fields';
  ASSERT v_budget->'checkpoint'->>'projectId' IS NOT NULL
    AND v_budget->'checkpoint'->>'versionId' = 'd5500000-0000-4000-8000-000000000001'
    AND v_budget->'checkpoint'->>'acknowledgedBy' = 'd5000000-0000-4000-8000-000000000002',
    'working budget checkpoint adapter fields';
END $$;

-- Furnishings are authorized wave-by-wave after budget acknowledgement. The
-- signed snapshot and paid deposit gate the existing create_purchase_order RPC.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
INSERT INTO public.vendors (id, name, website)
VALUES ('d5710000-0000-4000-8000-000000000001', 'Commercial Test Vendor', 'https://vendor.test.invalid');
INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id
) VALUES (
  'd5730000-0000-4000-8000-000000000001', 'Other same-client project',
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002'
);
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, project_id,
  title, total_amount, status
) VALUES (
  'd5740000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5200000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'd5730000-0000-4000-8000-000000000001',
  'Cross-project furnishings source', 0, 'draft'
);
DO $$
DECLARE v_project_id uuid;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.create_furnishings_authorization(
      v_project_id, 'Cross-project wave',
      'd5740000-0000-4000-8000-000000000001'
    );
    ASSERT false, 'same-client source from another project should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, project_id, title, description,
  subtotal, total_amount, deposit_percent, status, valid_until
) SELECT
  'd5700000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5200000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  p.id,
  'Living floor furnishings source', 'One authorized furnishing item.',
  100000, 100000, 50, 'draft', now() + interval '30 days'
FROM public.projects p
WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.proposal_items (
  id, proposal_id, name, room, category, quantity, unit_price,
  markup_percent, unit_sell_price, line_total_cents, vendor_id,
  vendor_name, position, item_type, ffe_category
) VALUES (
  'd5720000-0000-4000-8000-000000000001',
  'd5700000-0000-4000-8000-000000000001', 'Test lounge chair',
  'Living room', 'Seating', 1, 60000, 66.67, 100000, 100000,
  'd5710000-0000-4000-8000-000000000001', 'Commercial Test Vendor',
  0, 'fixed', 'furniture'
);
DO $$
DECLARE
  v_project_id uuid;
  v_wave jsonb;
  v_snapshot jsonb;
  v_execution jsonb;
  v_wave_proposal_id uuid;
  v_ffe_id uuid;
  v_deposit_id uuid;
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  v_wave := public.create_furnishings_authorization(
    v_project_id, 'Living floor wave',
    'd5700000-0000-4000-8000-000000000001'
  );
  v_wave_proposal_id := (v_wave->>'proposalId')::uuid;
  v_snapshot := public.get_commercial_document_send_snapshot(v_wave_proposal_id);
  PERFORM public.send_commercial_document(
    v_wave_proposal_id, v_snapshot->>'documentFingerprint', NULL,
    now() + interval '30 days'
  );

  PERFORM pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
  v_execution := public.execute_furnishings_authorization(
    v_wave_proposal_id, 'Commercial Client'
  );
  v_ffe_id := ((v_execution->'appliedItemIds')->>0)::uuid;
  v_deposit_id := (v_execution->>'depositInvoiceId')::uuid;
  ASSERT (v_execution->>'depositRequiredCents')::integer = 50000,
    'furnishings deposit amount';
  ASSERT (SELECT status FROM public.invoices WHERE id = v_deposit_id) = 'sent',
    'furnishings deposit invoice must be issued';

  PERFORM pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.create_purchase_order(
      v_project_id, 'd5710000-0000-4000-8000-000000000001',
      'full_upfront', ARRAY[v_ffe_id]
    );
    ASSERT false, 'unpaid furnishing deposit should block a PO';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM public.record_invoice_payment(
    v_deposit_id, 50000, 'check', 'FFE-DEP-PAID', now(), NULL
  );
  UPDATE public.project_ffe_items SET quantity = 2 WHERE id = v_ffe_id;
  BEGIN
    PERFORM public.create_purchase_order(
      v_project_id, 'd5710000-0000-4000-8000-000000000001',
      'full_upfront', ARRAY[v_ffe_id]
    );
    ASSERT false, 'changed furnishing snapshot should block a PO';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.project_ffe_items SET quantity = 1 WHERE id = v_ffe_id;
  v_po := public.create_purchase_order(
    v_project_id, 'd5710000-0000-4000-8000-000000000001',
    'full_upfront', ARRAY[v_ffe_id]
  );
  ASSERT v_po.total_cents = 60000, 'PO must use the signed item trade total';
  ASSERT (SELECT purchase_order_id FROM public.project_ffe_items WHERE id = v_ffe_id) = v_po.id,
    'authorized furnishing item should link to PO';
  BEGIN
    INSERT INTO public.project_ffe_items (
      project_id, name, item_type, status, quantity, unit_price_cents,
      line_total_cents, purchase_order_id
    ) VALUES (
      v_project_id, 'Direct linked bypass', 'fixed', 'ordered', 1,
      60000, 100000, v_po.id
    );
    ASSERT false, 'direct INSERT with a PO link should require signed provenance';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- A service addendum reuses the same project identity, creates a new signed
-- authority at countersign, and leaves historical time provenance untouched.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_project_id uuid;
  v_old_authority_id uuid;
  v_old_rate_id uuid;
  v_addendum_id uuid;
  v_created jsonb;
  v_snapshot jsonb;
  v_executed jsonb;
  v_retry jsonb;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  SELECT billing_authority_id, authority_rate_id
  INTO v_old_authority_id, v_old_rate_id
  FROM public.project_time_entries
  WHERE id = 'd5400000-0000-4000-8000-000000000001';

  v_created := public.create_service_addendum(v_project_id, 'Additional sourcing services');
  v_addendum_id := (v_created->>'proposalId')::uuid;
  DELETE FROM public.proposal_service_rates WHERE proposal_id = v_addendum_id;
  DELETE FROM public.proposal_service_terms WHERE proposal_id = v_addendum_id;
  v_snapshot := public.get_commercial_document_send_snapshot(v_addendum_id);
  BEGIN
    PERFORM public.send_commercial_document(
      v_addendum_id, v_snapshot->>'documentFingerprint', NULL,
      now() + interval '30 days'
    );
    ASSERT false, 'addendum without terms and rates should not send';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.upsert_design_services_draft(
    v_addendum_id,
    jsonb_build_object(
      'scope', 'Additional sourcing and installation coordination.',
      'deliverables', jsonb_build_array('Sourcing', 'Installation coordination'),
      'exclusions', jsonb_build_array('Construction administration'),
      'billingCeilingCents', 30000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours under the amended authority.',
      'currentRateVersion', 2
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 2, 'roleName', 'Designer', 'hourlyRateCents', 15000,
      'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  v_snapshot := public.get_commercial_document_send_snapshot(v_addendum_id);
  PERFORM public.send_commercial_document(
    v_addendum_id, v_snapshot->>'documentFingerprint', NULL,
    now() + interval '30 days'
  );

  PERFORM pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
  PERFORM public.sign_design_services_agreement(v_addendum_id, 'Commercial Client');
  PERFORM pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    v_addendum_id, 'Commercial Designer'
  );
  v_retry := public.countersign_design_services_agreement(
    v_addendum_id, 'Commercial Designer'
  );

  ASSERT (v_executed->>'projectId')::uuid = v_project_id,
    'addendum must bind the existing project';
  ASSERT NOT (v_retry->>'newlyExecuted')::boolean,
    'addendum countersign retry must be idempotent';
  ASSERT (SELECT count(*) FROM public.projects WHERE id = v_project_id) = 1,
    'addendum must not create a second project';
  ASSERT (SELECT status FROM public.project_billing_authorities WHERE id = v_old_authority_id) = 'superseded',
    'prior authority must be superseded';
  ASSERT (SELECT count(*) FROM public.project_billing_authorities
          WHERE project_id = v_project_id AND status = 'active') = 1,
    'exactly one active authority after addendum';
  ASSERT (SELECT billing_authority_id FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000001') = v_old_authority_id,
    'historical time authority changed';
  ASSERT (SELECT authority_rate_id FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000001') = v_old_rate_id,
    'historical time rate changed';
END;
$$;

-- Client-safe reads contain no raw entry notes or trade cost keys.
DO $$
DECLARE v_project uuid; v_summary jsonb; v_bundle text;
BEGIN
  SELECT id INTO v_project FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  v_summary := public.get_project_authority_summary(v_project);
  v_bundle := public.get_client_commercial_document_bundle(
    'd5300000-0000-4000-8000-000000000001'
  )::text;
  ASSERT v_summary ?& ARRAY[
    'id', 'projectId', 'agreementId', 'state', 'currency', 'ceilingCents',
    'authorizedCents', 'accruedCents', 'invoicedCents',
    'pendingAuthorizationCents', 'remainingCents', 'retainerAmountCents',
    'retainerPaidCents', 'retainerActivationPolicy', 'activeRateVersion',
    'billingThrough', 'rates', 'includesRawEntries'
  ], 'frozen flat authority contract keys';
  ASSERT jsonb_typeof(v_summary->'rates') = 'array', 'flat authority rates';
  ASSERT NOT (v_summary->>'includesRawEntries')::boolean, 'curated summary marker';
  ASSERT position('notes' in v_summary::text) = 0, 'raw time notes leaked';
  ASSERT NOT (v_summary ? 'authority') AND NOT (v_summary ? 'summary'),
    'authority response must not require a nested adapter';
  ASSERT position('trade' in lower(v_bundle)) = 0, 'trade cost leaked';
  ASSERT position('Interior design services' in v_bundle) > 0, 'scope string missing';
END;
$$;

-- Service-role cutover supersedes only unsigned legacy rows; accepted history
-- remains untouched.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, status
) VALUES
  ('d5600000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
   'd5200000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002',
   'Unsigned legacy', 'draft'),
  ('d5600000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001',
   'd5200000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002',
   'Accepted legacy', 'accepted');
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001', 'service_role');
SELECT public.supersede_unsigned_legacy_proposals(
  ARRAY['d5600000-0000-4000-8000-000000000001','d5600000-0000-4000-8000-000000000002']::uuid[],
  'd5300000-0000-4000-8000-000000000001', 'Commercial rail cutover test'
);
DO $$ BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = 'd5600000-0000-4000-8000-000000000001') = 'superseded',
    'unsigned legacy should supersede';
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = 'd5600000-0000-4000-8000-000000000002') IS NULL,
    'accepted legacy history must remain untouched';
END $$;

ROLLBACK;

SELECT 'design_services_authority_test: all assertions passed' AS result;
