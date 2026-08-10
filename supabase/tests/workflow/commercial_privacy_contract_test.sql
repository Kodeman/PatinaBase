-- Workflow Stage-0 privacy contract: raw FF&E and commercial authority ledgers.
-- Runner: plain psql with ON_ERROR_STOP=1. Every fixture is transaction-local.
--
-- Expected on the pre-remediation schema: this suite is RED. It reports every
-- failing contract before exiting 1; individual gaps are never skipped merely
-- because an earlier assertion failed.
--
-- Run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/workflow/commercial_privacy_contract_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE TEMP TABLE workflow_privacy_results (
  case_id text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON workflow_privacy_results TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.assume_workflow_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', p_actor, 'role', p_role))::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- Deterministic Studio A owner, exact client, and unrelated user.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a3500000-0000-4000-8000-000000000001', 'commercial-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3500000-0000-4000-8000-000000000002', 'commercial-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3500000-0000-4000-8000-000000000003', 'commercial-unrelated@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3500000-0000-4000-8000-000000000004', 'commercial-project-party@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
) VALUES
  ('a3500000-0000-4000-8000-000000000001', 'commercial-designer@test.invalid', 'Commercial Designer', true, now(), now()),
  ('a3500000-0000-4000-8000-000000000002', 'commercial-client@test.invalid', 'Commercial Client', false, now(), now()),
  ('a3500000-0000-4000-8000-000000000003', 'commercial-unrelated@test.invalid', 'Commercial Unrelated', false, now(), now()),
  ('a3500000-0000-4000-8000-000000000004', 'commercial-project-party@test.invalid', 'Commercial Project Party', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES (
  'a3510000-0000-4000-8000-000000000001', 'design_studio',
  'Commercial Contract Studio', 'commercial-contract-studio', 'active'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES (
  'a3520000-0000-4000-8000-000000000001',
  'a3500000-0000-4000-8000-000000000001',
  'a3510000-0000-4000-8000-000000000001',
  'owner', 'active', now()
);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'a3530000-0000-4000-8000-000000000001',
  'a3500000-0000-4000-8000-000000000001',
  'a3500000-0000-4000-8000-000000000002',
  'Commercial Client', 'active', 'direct'
);

-- The legacy project proves that raw FF&E must no longer be a client portal.
-- The commercial-origin project proves the existing commercial fail-closed
-- branch remains intact while draft document metadata is hidden.
INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
) VALUES
  ('a3540000-0000-4000-8000-000000000001', 'Legacy Working Project',
   'a3500000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000002',
   'a3500000-0000-4000-8000-000000000001', 'a3510000-0000-4000-8000-000000000001'),
  ('a3540000-0000-4000-8000-000000000002', 'Commercial Origin Project',
   'a3500000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000002',
   'a3500000-0000-4000-8000-000000000001', 'a3510000-0000-4000-8000-000000000001'),
  ('a3540000-0000-4000-8000-000000000003', 'Pre-execution Commercial Project',
   'a3500000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000002',
   'a3500000-0000-4000-8000-000000000001', 'a3510000-0000-4000-8000-000000000001');

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, profile_id, created_by
) VALUES (
  'a3541000-0000-4000-8000-000000000001',
  'a3540000-0000-4000-8000-000000000002',
  'client_rep', 'Opted-in commercial representative',
  'a3500000-0000-4000-8000-000000000004',
  'a3500000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('a3550000-0000-4000-8000-000000000001', 'a3540000-0000-4000-8000-000000000001', 'Legacy Room', 0),
  ('a3550000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000002', 'Commercial Room', 0),
  ('a3550000-0000-4000-8000-000000000003', 'a3540000-0000-4000-8000-000000000003', 'Pre-execution Room', 0);

INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, ffe_category, item_type, status,
  quantity, unit_price_cents, trade_price_cents, markup_percent,
  line_total_cents, vendor_name, sort_order
) VALUES
  ('a3560000-0000-4000-8000-000000000001', 'a3540000-0000-4000-8000-000000000001',
   'a3550000-0000-4000-8000-000000000001', 'Legacy private sofa', 'Seating', 'fixed',
   'specified', 1, 450000, 240000, 87.50, 450000, 'Private Trade Vendor', 0),
  ('a3560000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000002',
   'a3550000-0000-4000-8000-000000000002', 'Commercial authorized sofa', 'Seating', 'fixed',
   'specified', 1, 500000, 260000, 92.31, 500000, 'Commercial Trade Vendor', 0),
  ('a3560000-0000-4000-8000-000000000003', 'a3540000-0000-4000-8000-000000000002',
   'a3550000-0000-4000-8000-000000000002', 'Commercial unbound chair', 'Seating', 'fixed',
   'specified', 1, 180000, 90000, 100.00, 180000, 'Commercial Trade Vendor', 1),
  ('a3560000-0000-4000-8000-000000000004', 'a3540000-0000-4000-8000-000000000003',
   'a3550000-0000-4000-8000-000000000003', 'Unexecuted authorization chair', 'Seating', 'fixed',
   'specified', 1, 200000, 100000, 100.00, 200000, 'Pre-execution Trade Vendor', 0);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, project_id, title,
  description, status, document_kind, commercial_state, sent_at, signed_at
) VALUES
  ('a3570000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000001', 'a3530000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000002',
   'Executed design services', 'Commercial origin', 'accepted', 'design_services',
   'executed', now(), now()),
  ('a3570000-0000-4000-8000-000000000002',
   'a3500000-0000-4000-8000-000000000001', 'a3530000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000002',
   'Unpublished service addendum', 'Draft rates and scope', 'draft', 'service_addendum',
   'draft', NULL, NULL),
  ('a3570000-0000-4000-8000-000000000003',
   'a3500000-0000-4000-8000-000000000001', 'a3530000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000002',
   'Executed furnishings release', 'Frozen client authorization', 'accepted',
   'furnishings_authorization', 'executed', now(), now()),
  ('a3570000-0000-4000-8000-000000000004',
   'a3500000-0000-4000-8000-000000000001', 'a3530000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000003',
   'Pre-execution design services', 'Commercial origin', 'accepted', 'design_services',
   'executed', now(), now()),
  ('a3570000-0000-4000-8000-000000000005',
   'a3500000-0000-4000-8000-000000000001', 'a3530000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000003',
   'Sent but unexecuted furnishings release', 'Must not appear in client selections',
   'sent', 'furnishings_authorization', 'sent', now(), NULL);

INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, wave_name, source_proposal_id,
  is_origin, executed_at, created_by
) VALUES
  ('a3580000-0000-4000-8000-000000000001', 'a3540000-0000-4000-8000-000000000002',
   'a3570000-0000-4000-8000-000000000001', 'design_services', NULL, NULL,
   true, now(), 'a3500000-0000-4000-8000-000000000001'),
  ('a3580000-0000-4000-8000-000000000002', 'a3540000-0000-4000-8000-000000000002',
   'a3570000-0000-4000-8000-000000000002', 'service_addendum', NULL,
   'a3570000-0000-4000-8000-000000000001', false, NULL,
   'a3500000-0000-4000-8000-000000000001'),
  ('a3580000-0000-4000-8000-000000000003', 'a3540000-0000-4000-8000-000000000002',
   'a3570000-0000-4000-8000-000000000003', 'furnishings_authorization', 'Wave 1',
   'a3570000-0000-4000-8000-000000000001', false, now(),
   'a3500000-0000-4000-8000-000000000001'),
  ('a3580000-0000-4000-8000-000000000004', 'a3540000-0000-4000-8000-000000000003',
   'a3570000-0000-4000-8000-000000000004', 'design_services', NULL, NULL,
   true, now(), 'a3500000-0000-4000-8000-000000000001'),
  ('a3580000-0000-4000-8000-000000000005', 'a3540000-0000-4000-8000-000000000003',
   'a3570000-0000-4000-8000-000000000005', 'furnishings_authorization', 'Pending Wave',
   'a3570000-0000-4000-8000-000000000004', false, NULL,
   'a3500000-0000-4000-8000-000000000001');

INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_proposal_item_id, source_ffe_item_id,
  project_room_id, name, room_name, category, item_type, quantity,
  client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents,
  markup_percent, vendor_name, snapshot, sort_order
) VALUES (
  'a3590000-0000-4000-8000-000000000001',
  'a3580000-0000-4000-8000-000000000003', NULL,
  'a3560000-0000-4000-8000-000000000002',
  'a3550000-0000-4000-8000-000000000002', 'Commercial authorized sofa',
  'Commercial Room', 'Seating', 'fixed', 1, 500000, 500000, 260000, 92.31,
  'Commercial Trade Vendor', '{"source":"fixture"}'::jsonb, 0
), (
  'a3590000-0000-4000-8000-000000000003',
  'a3580000-0000-4000-8000-000000000005', NULL,
  'a3560000-0000-4000-8000-000000000004',
  'a3550000-0000-4000-8000-000000000003', 'Unexecuted authorization chair',
  'Pre-execution Room', 'Seating', 'fixed', 1, 200000, 200000, 100000, 100.00,
  'Pre-execution Trade Vendor', '{"source":"fixture","executed":false}'::jsonb, 0
);

-- Execution binds the live schedule line to the frozen authorization row. The
-- fixture supplies the same exact-row capability the canonical execution RPC
-- sets; it is restored immediately and the whole fixture still rolls back.
SELECT set_config(
  'app.commercial_document_id',
  'a3570000-0000-4000-8000-000000000003',
  true
);
UPDATE public.project_ffe_items
SET source_commercial_document_id = 'a3580000-0000-4000-8000-000000000003',
    source_authorization_item_id = 'a3590000-0000-4000-8000-000000000001'
WHERE id = 'a3560000-0000-4000-8000-000000000002';
SELECT set_config('app.commercial_document_id', '', true);

INSERT INTO public.commercial_document_signatures (
  id, proposal_id, party_role, signer_user_id, signed_name,
  evidence_fingerprint, signed_at
) VALUES (
  'a35a0000-0000-4000-8000-000000000001',
  'a3570000-0000-4000-8000-000000000003', 'client',
  'a3500000-0000-4000-8000-000000000002', 'Commercial Client',
  repeat('a', 64), now()
);

-- Unrelated access remains fail-closed.
SELECT pg_temp.assume_workflow_actor('a3500000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'C01_UNRELATED_CANNOT_READ_LEGACY_RAW_FFE',
  count(*) = 0,
  format('unrelated legacy raw FF&E row count=%s; required=0', count(*))
FROM public.project_ffe_items
WHERE id = 'a3560000-0000-4000-8000-000000000001';
RESET ROLE;

-- Opting a coordination party into a project does not grant the raw working or
-- commercial-ledger surfaces. Any client-safe edition is a separate grant.
SELECT pg_temp.assume_workflow_actor('a3500000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'C14_PROJECT_PARTY_CANNOT_READ_WORKING_COMMERCIAL_ROWS',
  (
    (SELECT count(*) FROM public.project_ffe_items
     WHERE project_id = 'a3540000-0000-4000-8000-000000000002') = 0
    AND
    (SELECT count(*) FROM public.project_commercial_documents
     WHERE project_id = 'a3540000-0000-4000-8000-000000000002') = 0
    AND
    (SELECT count(*) FROM public.furnishing_authorization_items
     WHERE commercial_document_id = 'a3580000-0000-4000-8000-000000000003') = 0
  ),
  format(
    'party raw FF&E=%s commercial docs=%s auth items=%s; required=0/0/0',
    (SELECT count(*) FROM public.project_ffe_items
     WHERE project_id = 'a3540000-0000-4000-8000-000000000002'),
    (SELECT count(*) FROM public.project_commercial_documents
     WHERE project_id = 'a3540000-0000-4000-8000-000000000002'),
    (SELECT count(*) FROM public.furnishing_authorization_items
     WHERE commercial_document_id = 'a3580000-0000-4000-8000-000000000003')
  );
RESET ROLE;

-- A project client must use a released client-safe projection, never a raw
-- working row or unpublished commercial-ledger metadata.
SELECT pg_temp.assume_workflow_actor('a3500000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'C02_CLIENT_CANNOT_READ_LEGACY_RAW_FFE',
  count(*) = 0,
  format('client legacy raw FF&E row count=%s; required=0', count(*))
FROM public.project_ffe_items
WHERE id = 'a3560000-0000-4000-8000-000000000001';

INSERT INTO workflow_privacy_results
SELECT
  'C03_COMMERCIAL_PROJECT_RAW_FFE_REMAINS_PRIVATE',
  count(*) = 0,
  format('client commercial raw FF&E row count=%s; required=0', count(*))
FROM public.project_ffe_items
WHERE id = 'a3560000-0000-4000-8000-000000000002';

INSERT INTO workflow_privacy_results
SELECT
  'C04_CLIENT_CANNOT_READ_DRAFT_COMMERCIAL_DOCUMENT',
  count(*) = 0,
  format('client draft project-commercial-document row count=%s; required=0', count(*))
FROM public.project_commercial_documents
WHERE id = 'a3580000-0000-4000-8000-000000000002';

INSERT INTO workflow_privacy_results
SELECT
  'C05_CLIENT_CANNOT_READ_RAW_AUTHORIZATION_ITEMS',
  count(*) = 0,
  format('client raw furnishing-authorization-item row count=%s; required=0', count(*))
FROM public.furnishing_authorization_items
WHERE id = 'a3590000-0000-4000-8000-000000000001';

WITH response AS (
  SELECT public.get_client_project_selections(
    'a3540000-0000-4000-8000-000000000003'
  ) AS payload
)
INSERT INTO workflow_privacy_results
SELECT
  'C12_CLIENT_SELECTIONS_EMPTY_BEFORE_EXECUTION',
  jsonb_array_length(payload->'selections') = 0,
  format(
    'pre-execution client selection count=%s; required=0',
    jsonb_array_length(payload->'selections')
  )
FROM response;

WITH response AS (
  SELECT public.get_client_project_selections(
    'a3540000-0000-4000-8000-000000000002'
  ) AS payload
)
INSERT INTO workflow_privacy_results
SELECT
  'C13_CLIENT_SELECTIONS_EXECUTED_AND_REDACTED',
  jsonb_array_length(payload->'selections') = 1
    AND payload::text !~ '"(tradePriceCents|markupPercent|tradeUnitCostCents|poNumber|vendorId|vendorName)"[[:space:]]*:',
  format(
    'executed selection count=%s forbidden trade/PO key present=%s; required=1/false',
    jsonb_array_length(payload->'selections'),
    payload::text ~ '"(tradePriceCents|markupPercent|tradeUnitCostCents|poNumber|vendorId|vendorName)"[[:space:]]*:'
  )
FROM response;
RESET ROLE;

-- Preserve Studio A's working-table access.
SELECT pg_temp.assume_workflow_actor('a3500000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'C06_OWN_STUDIO_CAN_READ_WORKING_FFE',
  count(*) = 1,
  format('own-studio working FF&E row count=%s; required=1', count(*))
FROM public.project_ffe_items
WHERE id = 'a3560000-0000-4000-8000-000000000001';
RESET ROLE;

-- service_role bypasses RLS, so immutable signed truth needs table-edge guards
-- on INSERT as well as UPDATE/DELETE. Canonical SECURITY DEFINER RPCs run as
-- postgres and remain the sole intended writers.
SELECT pg_temp.assume_workflow_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    INSERT INTO public.furnishing_authorization_items (
      id, commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, name, room_name, category, item_type, quantity,
      client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents,
      markup_percent, vendor_name, snapshot, sort_order
    ) VALUES (
      'a3590000-0000-4000-8000-000000000002',
      'a3580000-0000-4000-8000-000000000003', NULL,
      'a3560000-0000-4000-8000-000000000003',
      'a3550000-0000-4000-8000-000000000002', 'Forged service-role chair',
      'Commercial Room', 'Seating', 'fixed', 1, 1, 1, 1, 0,
      'Forged Vendor', '{"forged":true}'::jsonb, 1
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_detail := format('service_role immutable INSERT affected %s rows; required=error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role immutable INSERT rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('C07_SERVICE_ROLE_CANNOT_INSERT_AUTHORIZATION_ITEM', v_denied, v_detail);
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.furnishing_authorization_items
    SET name = 'Service role rewrote executed truth'
    WHERE id = 'a3590000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role immutable UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role immutable UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('C08_SERVICE_ROLE_CANNOT_UPDATE_AUTHORIZATION_ITEM', v_denied, v_detail);
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    INSERT INTO public.commercial_document_signatures (
      id, proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, signed_at
    ) VALUES (
      'a35a0000-0000-4000-8000-000000000002',
      'a3570000-0000-4000-8000-000000000002', 'client',
      'a3500000-0000-4000-8000-000000000002', 'Forged Client',
      repeat('f', 64), now()
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_detail := format('service_role signature INSERT affected %s rows; required=error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role signature INSERT rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('C09_SERVICE_ROLE_CANNOT_INSERT_SIGNATURE', v_denied, v_detail);
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.commercial_document_signatures
    SET signed_name = 'Service Role Rewrite'
    WHERE id = 'a35a0000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role signature UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role signature UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('C10_SERVICE_ROLE_CANNOT_UPDATE_SIGNATURE', v_denied, v_detail);
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.project_commercial_documents
    SET wave_name = 'Service role rewrite'
    WHERE id = 'a3580000-0000-4000-8000-000000000003';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role commercial-document UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role commercial-document UPDATE rejected: %s', SQLERRM);
  END;

  INSERT INTO workflow_privacy_results
  VALUES ('C11_SERVICE_ROLE_CANNOT_UPDATE_COMMERCIAL_DOCUMENT', v_denied, v_detail);
END;
$$;

RESET ROLE;

TABLE workflow_privacy_results ORDER BY case_id;

SELECT
  bool_and(passed) AS all_contracts_passed,
  count(*) FILTER (WHERE passed) AS passing_cases,
  count(*) FILTER (WHERE NOT passed) AS failing_cases
FROM workflow_privacy_results
\gset

ROLLBACK;

\if :all_contracts_passed
  \echo 'workflow commercial privacy contracts: PASS (' :passing_cases ' cases)'
\else
  \echo 'workflow commercial privacy contracts: FAIL (' :failing_cases ' failing, ' :passing_cases ' passing)'
  DO $contract_failure$
  BEGIN
    RAISE EXCEPTION 'workflow commercial privacy contract failed';
  END
  $contract_failure$;
\endif
