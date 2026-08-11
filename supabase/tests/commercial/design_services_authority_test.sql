-- 00412 design-services commercial authority integration test.
-- 00422: the furnishing-wave sections now walk the Authorized Schedule
-- ceremony — create_furnishings_authorization_from_schedule over existing
-- project_ffe_items — because the re-authoring RPC it used to call is retired.
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
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5000000-0000-4000-8000-000000000004', 'commercial-support@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d5000000-0000-4000-8000-000000000001', 'commercial-designer@test.invalid', 'Commercial Designer', true, now(), now()),
  ('d5000000-0000-4000-8000-000000000002', 'commercial-client@test.invalid', 'Commercial Client', false, now(), now()),
  ('d5000000-0000-4000-8000-000000000003', 'commercial-outsider@test.invalid', 'Commercial Outsider', false, now(), now()),
  ('d5000000-0000-4000-8000-000000000004', 'commercial-support@test.invalid', 'Commercial Support', true, now(), now())
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
    jsonb_build_array(
      jsonb_build_object(
        'version', 1, 'roleName', 'Designer', 'hourlyRateCents', 12000,
        'sortOrder', 0, 'effectiveAt', now() - interval '10 days'
      ),
      jsonb_build_object(
        'version', 1, 'roleName', 'Future Specialist', 'hourlyRateCents', 99000,
        'sortOrder', 1, 'effectiveAt', now() + interval '1 day'
      )
    )
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
UPDATE public.project_billing_authorities
SET effective_at = now() - interval '10 days'
WHERE source_proposal_id = 'd5300000-0000-4000-8000-000000000001';

-- Signed rates are immutable.
DO $$ BEGIN
  BEGIN
    UPDATE public.proposal_service_rates SET hourly_rate_cents = 1
    WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
    ASSERT false, 'historical rate update should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT pg_get_functiondef(
    'public.classify_project_time_entry_authority()'::regprocedure
  ) ~ 'FROM public\.projects project\s+WHERE project.id = NEW.project_id\s+FOR UPDATE',
    'time ceiling classifier must serialize on the stable project row';
  ASSERT pg_get_functiondef(
    'public._countersign_design_services_agreement_impl(uuid,text)'::regprocedure
  ) ~ 'PERFORM 1 FROM public\.projects\s+WHERE id = v_project_id\s+FOR UPDATE',
    'addendum countersign must serialize on the shared project row';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND tgname = 'aaa_guard_time_entry_invoice_insert_trg'
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT%'
  ), 'invoice insert guard must run before the classifier';
END $$;

-- A required unpaid retainer keeps otherwise-rated time pending and out of the
-- unbilled view. Paying the retainer and reclassifying opens invoiceability.
INSERT INTO public.project_time_entries (
  id, project_id, user_id, started_at, duration_minutes, billable, activity
) SELECT
  'd5400000-0000-4000-8000-000000000001', p.id,
  'd5000000-0000-4000-8000-000000000001', now(), 30, true, 'design'
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
DO $$ BEGIN
  ASSERT (SELECT billing_state FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000001') = 'pending_authorization',
    'unpaid retainer time should remain pending';
  ASSERT (SELECT rated_amount_cents FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000001') = 6000,
    'first entry rate snapshot';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_unbilled_time WHERE id = 'd5400000-0000-4000-8000-000000000001'),
    'retainer-gated entry leaked into unbilled view';
END $$;

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status, currency, memo
) SELECT
  'd5410000-0000-4000-8000-000000000001', project.id,
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002', 'draft', 'USD',
  'Forgery target'
FROM public.projects project
WHERE project.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id
) VALUES (
  'd5420000-0000-4000-8000-000000000001', 'Invoice guard other project',
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002'
);
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, status, currency, memo
) VALUES (
  'd5410000-0000-4000-8000-000000000002',
  'd5420000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'draft', 'USD', 'Cross-project insert target'
);
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, invoice_number, status,
  issue_date, sent_at, currency, memo
) SELECT
  'd5410000-0000-4000-8000-000000000003', project.id,
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'INV-INSERT-GUARD-SENT', 'sent', current_date, now(), 'USD',
  'Sent insert target'
FROM public.projects project
WHERE project.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, invoice_number, status,
  issue_date, sent_at, paid_at, total_cents, amount_paid_cents, currency, memo
) SELECT
  'd5410000-0000-4000-8000-000000000004', project.id,
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'INV-INSERT-GUARD-PAID', 'paid', current_date, now(), now(), 100, 100,
  'USD', 'Paid insert target'
FROM public.projects project
WHERE project.proposal_id = 'd5300000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_project_id uuid;
  v_entry_ids uuid[] := ARRAY[
    'd5400000-0000-4000-8000-000000000011'::uuid,
    'd5400000-0000-4000-8000-000000000012'::uuid,
    'd5400000-0000-4000-8000-000000000013'::uuid
  ];
  v_invoice_ids uuid[] := ARRAY[
    'd5410000-0000-4000-8000-000000000002'::uuid,
    'd5410000-0000-4000-8000-000000000003'::uuid,
    'd5410000-0000-4000-8000-000000000004'::uuid
  ];
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  FOR v_index IN 1..array_length(v_entry_ids, 1) LOOP
    BEGIN
      INSERT INTO public.project_time_entries (
        id, project_id, user_id, started_at, duration_minutes, billable,
        activity, invoice_id
      ) VALUES (
        v_entry_ids[v_index], v_project_id,
        'd5000000-0000-4000-8000-000000000001', now(), 15, true,
        'design', v_invoice_ids[v_index]
      );
      ASSERT false, 'authenticated caller attached invoice on insert';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  BEGIN
    UPDATE public.project_time_entries
    SET billing_state = 'authorized', rated_amount_cents = 1,
        invoice_id = 'd5410000-0000-4000-8000-000000000001'
    WHERE id = 'd5400000-0000-4000-8000-000000000001';
    ASSERT false, 'authenticated caller forged invoice-eligible billing state';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.project_time_entries
    SET authority_rate_id = NULL, hourly_rate_cents = 1
    WHERE id = 'd5400000-0000-4000-8000-000000000001';
    ASSERT false, 'authenticated caller mutated signed rate provenance';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT billing_state = 'pending_authorization'
                 AND rated_amount_cents = 6000 AND invoice_id IS NULL
                 AND authority_rate_id IS NOT NULL AND hourly_rate_cents = 12000
          FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000001'),
    'rejected derived-field write changed the stored entry';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_time_entries
    WHERE id IN (
      'd5400000-0000-4000-8000-000000000011',
      'd5400000-0000-4000-8000-000000000012',
      'd5400000-0000-4000-8000-000000000013'
    )
  ), 'rejected invoice-bearing inserts persisted time entries';
END $$;
RESET ROLE;

-- Internal invoice settlement opens retainer-gated invoiceability.
DO $$
DECLARE v_project uuid; v_retainer uuid; v_draft uuid;
BEGIN
  SELECT p.id, a.retainer_invoice_id INTO v_project, v_retainer
  FROM public.projects p JOIN public.project_billing_authorities a ON a.project_id = p.id
  WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
  PERFORM public.record_invoice_payment(v_retainer, 5000, 'check', 'RET-PAID', now(), NULL);
  UPDATE public.project_time_entries SET duration_minutes = duration_minutes
  WHERE id = 'd5400000-0000-4000-8000-000000000001';
  ASSERT (SELECT billing_state FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000001') = 'authorized',
    'paid retainer should authorize in-ceiling time';
  ASSERT EXISTS (SELECT 1 FROM public.project_unbilled_time
                 WHERE id = 'd5400000-0000-4000-8000-000000000001'),
    'paid retainer time should enter unbilled view';

  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity
  ) VALUES (
    'd5400000-0000-4000-8000-000000000002', v_project,
    'd5000000-0000-4000-8000-000000000001', now(), 60, true, 'sourcing'
  );
  ASSERT (SELECT billing_state FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000002') = 'pending_authorization',
    'over-cap entry should remain captured pending';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_unbilled_time
                     WHERE id = 'd5400000-0000-4000-8000-000000000002'),
    'over-cap pending entry leaked into unbilled view';

  INSERT INTO public.invoices (project_id, designer_id, client_id, status, currency, memo)
  VALUES (v_project, 'd5000000-0000-4000-8000-000000000001',
          'd5000000-0000-4000-8000-000000000002', 'draft', 'USD', 'Time draft')
  RETURNING id INTO v_draft;
  UPDATE public.project_time_entries SET invoice_id = v_draft
  WHERE id = 'd5400000-0000-4000-8000-000000000001';
  ASSERT (SELECT invoice_id FROM public.project_time_entries WHERE id = 'd5400000-0000-4000-8000-000000000001') = v_draft,
    'paid retainer should open invoice attachment';
END;
$$;

-- Budget acknowledgement is planning truth only.
-- 00422: a budget line carries the room it budgets, because a furnishings
-- release proves coverage room by room against exactly these lines.
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
SELECT 'd5600000-0000-4000-8000-000000000001', p.id, 'Living room', 0
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.project_budget_versions (
  id, project_id, version, note, created_by
) SELECT 'd5500000-0000-4000-8000-000000000001', p.id, 1,
  'Studio working note — pad the seating line before the walkthrough.',
  'd5000000-0000-4000-8000-000000000001'
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.project_budget_lines (
  budget_version_id, project_room_id, room_name, category,
  low_cents, target_cents, high_cents
) VALUES (
  'd5500000-0000-4000-8000-000000000001',
  'd5600000-0000-4000-8000-000000000001',
  'Living room', 'Seating', 100000, 150000, 200000
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
  -- 00422: the schedule may exist long before any authorization — it is the
  -- studio's working surface. What acknowledgement must not do is authorize
  -- any of it.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items i
    JOIN public.projects p ON p.id = i.project_id
    WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001'
      AND (i.source_commercial_document_id IS NOT NULL
           OR i.source_authorization_item_id IS NOT NULL)
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
  -- 00414: the studio's working note and its override rationale are not client
  -- copy. The client's own acknowledgement stays — that is their act, not the
  -- studio's, and the portal renders it back to them.
  ASSERT NOT (v_budget->'version' ? 'note'),
    'client working budget leaked the studio version note';
  ASSERT NOT (v_budget->'checkpoint' ? 'overrideBy')
    AND NOT (v_budget->'checkpoint' ? 'overrideReason'),
    'client working budget leaked the studio override rationale';
  ASSERT (v_budget->'checkpoint' ? 'acknowledgedBy')
    AND (v_budget->'checkpoint' ? 'acknowledgedAt'),
    'client working budget dropped the client''s own acknowledgement';
END $$;
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_budget jsonb;
BEGIN
  v_budget := public.get_project_working_budget(
    (SELECT id FROM public.projects WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001')
  );
  ASSERT v_budget->'version'->>'note'
         = 'Studio working note — pad the seating line before the walkthrough.',
    'studio working budget lost the version note';
  ASSERT (v_budget->'checkpoint' ? 'overrideBy')
    AND (v_budget->'checkpoint' ? 'overrideReason'),
    'studio working budget lost the override rationale';
END $$;
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');

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
-- 00422: a release cites SCHEDULE lines, so the cross-project probe is a
-- schedule line filed on another project of the same client.
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('d5600000-0000-4000-8000-000000000002',
        'd5730000-0000-4000-8000-000000000001', 'Other living room', 0);
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, ffe_category, item_type, status,
  quantity, unit_price_cents, trade_price_cents, markup_percent,
  line_total_cents, vendor_id, vendor_name, sort_order
) VALUES (
  'd5720000-0000-4000-8000-000000000002',
  'd5730000-0000-4000-8000-000000000001',
  'd5600000-0000-4000-8000-000000000002',
  'Cross-project chair', 'Seating', 'fixed', 'specified', 1, 100000, 60000,
  66.67, 100000, 'd5710000-0000-4000-8000-000000000001',
  'Commercial Test Vendor', 0
);
DO $$
DECLARE v_project_id uuid; v_err text;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project_id, 'Cross-project release',
      ARRAY['d5720000-0000-4000-8000-000000000002'::uuid], NULL
    );
    ASSERT false, 'a same-client schedule line from another project should fail';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%does not belong to project%',
    format('cross-project release blocked by the wrong guard: %L', v_err);
END;
$$;
-- The line the whole wave walk below is drawn over.
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, ffe_category, item_type, status,
  quantity, unit_price_cents, trade_price_cents, markup_percent,
  line_total_cents, vendor_id, vendor_name, sort_order
) SELECT
  'd5720000-0000-4000-8000-000000000001', p.id,
  'd5600000-0000-4000-8000-000000000001',
  'Test lounge chair', 'Seating', 'fixed', 'specified', 1, 100000, 60000,
  66.67, 100000, 'd5710000-0000-4000-8000-000000000001',
  'Commercial Test Vendor', 0
FROM public.projects p
WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';

-- An older acknowledgement cannot authorize a wave after a newer checkpoint
-- is published. The newest checkpoint itself must be acknowledged/overridden.
INSERT INTO public.project_budget_versions (
  id, project_id, version, created_by
) SELECT 'd5500000-0000-4000-8000-000000000002', p.id, 2,
  'd5000000-0000-4000-8000-000000000001'
FROM public.projects p WHERE p.proposal_id = 'd5300000-0000-4000-8000-000000000001';
INSERT INTO public.project_budget_lines (
  budget_version_id, project_room_id, room_name, category,
  low_cents, target_cents, high_cents
) VALUES (
  'd5500000-0000-4000-8000-000000000002',
  'd5600000-0000-4000-8000-000000000001',
  'Living room', 'Seating', 110000, 160000, 210000
);
SELECT public.publish_budget_checkpoint(
  (SELECT id FROM public.projects WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001'),
  'd5500000-0000-4000-8000-000000000002'
);
DO $$
DECLARE v_project_id uuid;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project_id, 'Blocked by newer checkpoint',
      ARRAY['d5720000-0000-4000-8000-000000000001'::uuid], NULL
    );
    ASSERT false, 'older acknowledgement must not bypass newer open checkpoint';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
SELECT public.acknowledge_budget_checkpoint(
  (SELECT id FROM public.project_budget_checkpoints
   WHERE budget_version_id = 'd5500000-0000-4000-8000-000000000002')
);
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
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
  v_wave := public.create_furnishings_authorization_from_schedule(
    v_project_id, 'Living floor wave',
    ARRAY['d5720000-0000-4000-8000-000000000001'::uuid], NULL
  );
  v_wave_proposal_id := (v_wave->>'proposalId')::uuid;
  ASSERT (SELECT deposit_percent FROM public.proposals WHERE id = v_wave_proposal_id) = 50,
    'an engagement with no furnishings deposit term must fall to the 50% default';
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
  ASSERT v_execution->>'checkpointId' = (
    SELECT id::text FROM public.project_budget_checkpoints
    WHERE budget_version_id = 'd5500000-0000-4000-8000-000000000002'
  ), 'execution checkpoint alias';
  ASSERT (v_execution->>'depositPaidCents')::integer = 0,
    'new deposit invoice paid amount';
  ASSERT (v_execution->>'deposit_required_cents')::integer = 50000
      AND (v_execution->>'deposit_paid_cents')::integer = 0,
    'execution snake-case deposit aliases';
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

-- Commercial-project FF&E and signature evidence are not directly client
-- readable. Legacy-project FF&E visibility remains intact, while curated RPCs
-- expose only client-safe commercial aliases and amounts.
INSERT INTO public.project_ffe_items (
  id, project_id, name, item_type, status, quantity,
  unit_price_cents, line_total_cents
) VALUES (
  'd5750000-0000-4000-8000-000000000001',
  'd5730000-0000-4000-8000-000000000001',
  'Legacy visible chair', 'fixed', 'specified', 1, 30000, 45000
);
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_project_id uuid;
  v_list jsonb;
  v_bundle jsonb;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE project_id = v_project_id) = 0,
    'client directly read commercial-origin FF&E';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                     WHERE id = 'd5750000-0000-4000-8000-000000000001'),
    'client directly read a legacy raw FF&E row';
  ASSERT (SELECT count(*) FROM public.commercial_document_signatures
          WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001') = 0,
    'client directly read commercial signatures';

  v_list := public.list_furnishings_authorizations(v_project_id);
  ASSERT jsonb_array_length(v_list) = 1, 'safe furnishings list missing wave';
  ASSERT (v_list->0->>'depositRequiredCents')::integer = 50000,
    'safe furnishings required deposit alias';
  ASSERT (v_list->0->>'depositPaidCents')::integer = 50000,
    'safe furnishings paid deposit alias';
  ASSERT (v_list->0->>'deposit_required_cents')::integer = 50000
      AND (v_list->0->>'deposit_paid_cents')::integer = 50000,
    'safe furnishings snake-case deposit aliases';
  ASSERT v_list->0->>'checkpointId' = v_list->0->>'budgetCheckpointId',
    'safe furnishings checkpoint alias';
  ASSERT v_list->0->>'proposalSendDispatchId' IS NOT NULL
      AND v_list->0->>'proposalSendDispatchId' = v_list->0->>'proposal_send_dispatch_id'
      AND v_list->0->>'sentAt' = v_list->0->>'sent_at',
    'safe furnishings persistent send status';
  ASSERT position('trade' in lower(v_list::text)) = 0,
    'safe furnishings list leaked trade fields';

  v_bundle := public.get_client_commercial_document_bundle(
    (SELECT proposal_id FROM public.project_commercial_documents
     WHERE project_id = v_project_id
       AND document_kind = 'furnishings_authorization')
  );
  ASSERT (v_bundle->'furnishings'->>'depositRequiredCents')::integer = 50000,
    'bundle required deposit alias';
  ASSERT (v_bundle->'furnishings'->>'depositPaidCents')::integer = 50000,
    'bundle paid deposit alias';
  ASSERT (v_bundle->'furnishings'->>'deposit_required_cents')::integer = 50000
      AND (v_bundle->'furnishings'->>'deposit_paid_cents')::integer = 50000,
    'bundle snake-case deposit aliases';
  ASSERT v_bundle->'furnishings'->>'checkpointId'
         = v_bundle->'furnishings'->>'budgetCheckpointId',
    'bundle checkpoint alias';
  ASSERT NOT (v_bundle->'signatures'->0 ? 'signerUserId'),
    'bundle leaked signer user id';
  ASSERT v_bundle->'document'->>'proposalSendDispatchId' IS NOT NULL
      AND v_bundle->'document'->>'proposalSendDispatchId'
          = v_bundle->'document'->>'proposal_send_dispatch_id'
      AND v_bundle->'furnishings'->>'proposalSendDispatchId'
          = v_bundle->'document'->>'proposalSendDispatchId'
      AND v_bundle->'furnishings'->>'sentAt' = v_bundle->'furnishings'->>'sent_at',
    'bundle persistent send status';
  -- 00414: the client bundle names the document, not its parties, and never
  -- carries the studio's internal reason for retiring an edition.
  ASSERT NOT (v_bundle->'document' ? 'designerId')
      AND NOT (v_bundle->'document' ? 'clientId'),
    'bundle leaked party identities';
  ASSERT NOT (v_bundle->'document' ? 'supersededReason'),
    'bundle leaked the studio supersession rationale';
END;
$$;
RESET ROLE;
DO $$
DECLARE v_project_id uuid; v_list jsonb;
BEGIN
  SELECT id INTO v_project_id FROM public.projects
  WHERE proposal_id = 'd5300000-0000-4000-8000-000000000001';
  v_list := public.list_furnishings_authorizations(v_project_id);
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_send_dispatches dispatch
    WHERE dispatch.id = (v_list->0->>'proposalSendDispatchId')::uuid
      AND dispatch.proposal_id = (v_list->0->>'proposalId')::uuid
      AND dispatch.sent_at = (v_list->0->>'sentAt')::timestamptz
  ), 'safe furnishings send status does not match persisted dispatch';
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
  v_old_pending_authority_id uuid;
  v_old_pending_rate_id uuid;
  v_support_authority_id uuid;
  v_support_rate_id uuid;
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
  SELECT billing_authority_id, authority_rate_id
  INTO v_old_pending_authority_id, v_old_pending_rate_id
  FROM public.project_time_entries
  WHERE id = 'd5400000-0000-4000-8000-000000000002';

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
      'billingCeilingCents', 40000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours under the amended authority.',
      'currentRateVersion', 2
    ),
    jsonb_build_array(
      jsonb_build_object(
        'version', 2, 'roleName', 'Lead Designer', 'hourlyRateCents', 15000,
        'sortOrder', 0, 'effectiveAt', now()
      ),
      jsonb_build_object(
        'version', 2, 'roleName', 'Support Designer', 'hourlyRateCents', 10000,
        'sortOrder', 1, 'effectiveAt', now()
      )
    )
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
  ASSERT (SELECT billing_state FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000002') = 'authorized',
    'addendum ceiling should promote oldest prior pending work';
  ASSERT (SELECT billing_authority_id FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000002') = v_old_pending_authority_id,
    'promoted time authority provenance changed';
  ASSERT (SELECT authority_rate_id FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000002') = v_old_pending_rate_id,
    'promoted time rate provenance changed';
  ASSERT (SELECT rated_amount_cents FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000002') = 12000,
    'promoted time amount snapshot changed';

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by
  ) VALUES (
    v_project_id, 'd5000000-0000-4000-8000-000000000004',
    'support_designer', 'd5000000-0000-4000-8000-000000000001'
  );
  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity
  ) VALUES
    ('d5400000-0000-4000-8000-000000000003', v_project_id,
     'd5000000-0000-4000-8000-000000000001', now(), 30, true, 'design'),
    ('d5400000-0000-4000-8000-000000000004', v_project_id,
     'd5000000-0000-4000-8000-000000000004', now(), 30, true, 'sourcing');
  ASSERT (SELECT hourly_rate_cents FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000003') = 15000,
    'lead role did not select the signed lead rate';
  ASSERT (SELECT hourly_rate_cents FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000004') = 10000,
    'support role did not select the signed support rate';
  SELECT billing_authority_id, authority_rate_id
  INTO v_support_authority_id, v_support_rate_id
  FROM public.project_time_entries
  WHERE id = 'd5400000-0000-4000-8000-000000000004';

  -- Work entered after the addendum but dated inside the prior authority's
  -- signed interval keeps that historical authority/rate provenance.
  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity
  ) VALUES (
    'd5400000-0000-4000-8000-000000000007', v_project_id,
    'd5000000-0000-4000-8000-000000000001', now() - interval '1 day',
    5, true, 'design'
  );
  ASSERT (SELECT billing_authority_id = v_old_authority_id
                 AND authority_rate_id = v_old_rate_id
                 AND hourly_rate_cents = 12000
                 AND rated_amount_cents = 1000
                 AND billing_state = 'authorized'
          FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000007'),
    'late historical time did not bind the superseded effective authority';

  -- Caller-selected authority/rate ids are ignored. With multiple current
  -- rates and no server-owned project role, classification fails closed.
  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity,
    billing_authority_id, authority_rate_id
  ) VALUES (
    'd5400000-0000-4000-8000-000000000005', v_project_id,
    'd5000000-0000-4000-8000-000000000003', now(), 30, true, 'admin',
    (v_executed->>'billingAuthorityId')::uuid,
    (SELECT id FROM public.project_billing_authority_rates
     WHERE billing_authority_id = (v_executed->>'billingAuthorityId')::uuid
       AND role_name = 'Support Designer')
  );
  ASSERT (SELECT billing_state FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000005') = 'pending_authorization'
      AND (SELECT authority_rate_id FROM public.project_time_entries
           WHERE id = 'd5400000-0000-4000-8000-000000000005') IS NULL,
    'caller-selected ambiguous rate did not fail closed';

  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes, billable, activity
  ) VALUES (
    'd5400000-0000-4000-8000-000000000006', v_project_id,
    'd5000000-0000-4000-8000-000000000001', now(), 60, true, 'design'
  );
  ASSERT (SELECT billing_state FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000006') = 'pending_authorization',
    'addendum incorrectly reset the cumulative project ceiling';

  -- Once an entry is bound, a later team-role change cannot re-select a rate.
  -- Duration edits recalculate from the immutable hourly snapshot only.
  UPDATE public.project_team_members
  SET role = 'vendor'
  WHERE project_id = v_project_id
    AND user_id = 'd5000000-0000-4000-8000-000000000004'
    AND role = 'support_designer';
  UPDATE public.project_time_entries SET duration_minutes = 60
  WHERE id = 'd5400000-0000-4000-8000-000000000004';
  ASSERT (SELECT billing_authority_id = v_support_authority_id
                 AND authority_rate_id = v_support_rate_id
                 AND hourly_rate_cents = 10000
                 AND rated_amount_cents = 10000
                 AND billing_state = 'authorized'
          FROM public.project_time_entries
          WHERE id = 'd5400000-0000-4000-8000-000000000004'),
    'bound duration edit re-selected authority/rate from the changed role';

  BEGIN
    UPDATE public.project_billing_authorities SET status = 'active'
    WHERE id = v_old_authority_id;
    ASSERT false, 'two active authorities should violate the partial unique index';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- Client-safe reads contain no raw entry notes or trade cost keys.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
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
  ASSERT (v_summary->>'ceilingCents')::integer = 40000
      AND (v_summary->>'accruedCents')::integer = 36500
      AND (v_summary->>'pendingAuthorizationCents')::integer = 15000
      AND (v_summary->>'remainingCents')::integer = 3500,
    'authority summary must aggregate the cumulative project ceiling';
  ASSERT NOT (v_summary->>'includesRawEntries')::boolean, 'curated summary marker';
  ASSERT position('notes' in v_summary::text) = 0, 'raw time notes leaked';
  ASSERT NOT (v_summary ? 'authority') AND NOT (v_summary ? 'summary'),
    'authority response must not require a nested adapter';
  ASSERT position('trade' in lower(v_bundle)) = 0, 'trade cost leaked';
  ASSERT position('signerUserId' in v_bundle) = 0, 'signer user id leaked';
  ASSERT position('Interior design services' in v_bundle) > 0, 'scope string missing';
END;
$$;

-- Declining a commercial edition atomically closes both lifecycle fields and
-- the dedicated signing rail cannot revive it.
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd5800000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd5200000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002',
  'Declined services agreement', 'Decline lifecycle fixture', 0, 'draft',
  now() + interval '30 days'
);
INSERT INTO public.proposal_phases (
  proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd5800000-0000-4000-8000-000000000001',
  'Advisory', 'advisory', 7, 'main', 0, 0
);
DO $$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd5800000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'scope', 'A declinable services edition.',
      'deliverables', jsonb_build_array('Advice'),
      'exclusions', jsonb_build_array('Purchasing'),
      'billingCeilingCents', 10000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Hourly.', 'currentRateVersion', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 10000, 'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd5800000-0000-4000-8000-000000000001'
  );
  PERFORM public.send_commercial_document(
    'd5800000-0000-4000-8000-000000000001',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );
END;
$$;
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
SELECT public.decline_proposal(
  'd5800000-0000-4000-8000-000000000001', 'Not proceeding'
);
DO $$
BEGIN
  ASSERT (SELECT status = 'declined' AND commercial_state = 'declined'
          FROM public.proposals
          WHERE id = 'd5800000-0000-4000-8000-000000000001'),
    'commercial decline states diverged';
  BEGIN
    PERFORM public.sign_design_services_agreement(
      'd5800000-0000-4000-8000-000000000001', 'Commercial Client'
    );
    ASSERT false, 'declined agreement should not be signable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Service-role cutover supersedes only unsigned legacy rows; accepted history
-- remains untouched.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, status, valid_until
) VALUES
  ('d5600000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
   'd5200000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002',
   'Unsigned legacy', 'sent', now() + interval '30 days'),
  ('d5600000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001',
   'd5200000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002',
   'Accepted legacy', 'accepted', now() + interval '30 days');
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

SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000002');
DO $$ BEGIN
  BEGIN
    PERFORM public.sign_proposal(
      'd5600000-0000-4000-8000-000000000001', 'Commercial Client'
    );
    ASSERT false, 'superseded legacy proposal should not be signable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT pg_temp.assume_user('d5000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    PERFORM public.activate_proposal_as_project(
      'd5600000-0000-4000-8000-000000000001', current_date
    );
    ASSERT false, 'superseded legacy proposal should not activate';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Even an exact-row canonical capability cannot bypass terminal cutover.
  PERFORM set_config(
    'app.proposal_accept_id',
    'd5600000-0000-4000-8000-000000000001', true
  );
  BEGIN
    UPDATE public.proposals SET status = 'accepted', accepted_at = now()
    WHERE id = 'd5600000-0000-4000-8000-000000000001';
    ASSERT false, 'canonical lifecycle GUC revived superseded proposal';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM set_config('app.proposal_accept_id', '', true);
END $$;

ROLLBACK;

SELECT 'design_services_authority_test: all assertions passed' AS result;
