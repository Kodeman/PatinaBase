-- 00414 design-services rail completion (gap hardening) integration test.
-- Runner: plain psql, ON_ERROR_STOP=1. The transaction rolls back.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_gap_hardening_test.sql
--
-- What this suite is for: 00412 stood the commercial rail up beside the legacy
-- proposal lifecycle. 00414 closes the seams it left — where a legacy project
-- could still reach commercial authority, where a commercial edition could
-- still leave through the legacy send, where the authority ledgers were only
-- guarded by RLS, and where client reads carried more than a client should see.
--
-- 00422 (the Authorized Schedule) re-aimed every furnishing act in this suite:
-- a release cites SCHEDULE lines instead of a re-authored proposal, so the
-- fixtures below carry a room, real project_ffe_items, and a budget line that
-- names the room it budgets. The authoring-vehicle section became a retirement
-- assertion. What the suite is FOR is unchanged.

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
  ('d6000000-0000-4000-8000-000000000001', 'gap-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000002', 'gap-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000003', 'gap-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'gap-designer@test.invalid', 'Gap Designer', true, now(), now()),
  ('d6000000-0000-4000-8000-000000000002', 'gap-client@test.invalid', 'Gap Client', false, now(), now()),
  ('d6000000-0000-4000-8000-000000000003', 'gap-outsider@test.invalid', 'Gap Outsider', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d6100000-0000-4000-8000-000000000001', 'design_studio',
        'Gap Hardening Studio', 'gap-hardening-test', 'active');
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES (
  'd6110000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'd6100000-0000-4000-8000-000000000001', 'owner', 'active', now()
);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Gap Client', 'proposal', 'direct'
);

INSERT INTO public.vendors (id, name, website)
VALUES ('d6710000-0000-4000-8000-000000000001', 'Gap Test Vendor', 'https://gap-vendor.test.invalid');

-- ── Fixture: the legacy rail, exactly as it shipped before 00412 ───────────
-- A legacy proposal walked through its own rail end to end: authored, sent
-- through send_proposal, signed, activated. Everything below asserts that 00414
-- hardens the commercial rail WITHOUT touching this path — and the send itself
-- is the regression proof that plain legacy sends still work.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  subtotal, total_amount, status, valid_until
) VALUES (
  'd6300000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Legacy grandfathered proposal', 'Authored before the commercial rail existed.',
  100000, 100000, 'draft', now() + interval '30 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd6310000-0000-4000-8000-000000000001',
  'd6300000-0000-4000-8000-000000000001',
  'Legacy phase', 'design-development', 14, 'main', 0, 0
);
INSERT INTO public.proposal_items (
  id, proposal_id, name, room, category, quantity, unit_price,
  markup_percent, unit_sell_price, line_total_cents, vendor_id,
  vendor_name, position, item_type, ffe_category
) VALUES (
  'd6320000-0000-4000-8000-000000000001',
  'd6300000-0000-4000-8000-000000000001', 'Legacy console',
  'Entry', 'Casegoods', 1, 60000, 66.67, 100000, 100000,
  'd6710000-0000-4000-8000-000000000001', 'Gap Test Vendor',
  0, 'fixed', 'furniture'
);
INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, label, percentage, amount_cents, sort_order
) VALUES (
  'd6330000-0000-4000-8000-000000000001',
  'd6300000-0000-4000-8000-000000000001', 'Final', 100, 100000, 0
);

SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
CREATE TEMP TABLE gap_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
DO $$
DECLARE v_sent public.proposals;
BEGIN
  v_sent := public.send_proposal(
    'd6300000-0000-4000-8000-000000000001', NULL::text, NULL::text, NULL::timestamptz
  );
  ASSERT v_sent.status = 'sent' AND v_sent.sent_at IS NOT NULL,
    'plain legacy send regressed under the 00414 send guards';
END $$;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
-- The legacy signature rail activates the project itself (activation is
-- mandatory after signature); section 4 exercises the standalone bridge on a
-- second accepted edition.
SELECT public.sign_proposal('d6300000-0000-4000-8000-000000000001', 'Gap Client');
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
INSERT INTO gap_ids
SELECT 'legacy_project', project_id FROM public.proposals
WHERE id = 'd6300000-0000-4000-8000-000000000001';

-- A second accepted legacy edition, left unactivated, so section 4 can call the
-- activation bridge directly.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  subtotal, total_amount, status, sent_at, signed_at, signed_by_name,
  accepted_at, valid_until
) VALUES (
  'd6300000-0000-4000-8000-000000000007',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Legacy accepted, not yet activated', 'Historical accepted edition.',
  50000, 50000, 'accepted', now(), now(), 'Gap Client', now(),
  now() + interval '30 days'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) HEADLINE — a project without an executed design-services origin has no
--     furnishing authority at all. This is the whole point of the rail.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, project_id, title,
  subtotal, total_amount, status
) SELECT
  'd6300000-0000-4000-8000-000000000006',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  value, 'Legacy-project furnishing source', 50000, 50000, 'draft'
FROM gap_ids WHERE key = 'legacy_project';
INSERT INTO public.proposal_items (
  id, proposal_id, name, room, category, quantity, unit_price,
  markup_percent, unit_sell_price, line_total_cents, position, item_type
) VALUES (
  'd6320000-0000-4000-8000-000000000002',
  'd6300000-0000-4000-8000-000000000006', 'Unauthorized chair',
  'Den', 'Seating', 1, 30000, 66.67, 50000, 50000, 0, 'fixed'
);
-- 00422: the release ceremony reads the SCHEDULE, so the probe names a real
-- schedule line the legacy activation produced. The origin precondition is
-- checked before any line is looked at, which is the point: no amount of
-- well-formed schedule earns furnishing authority on its own.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'legacy_project');
  v_line uuid;
  v_err text;
BEGIN
  SELECT id INTO v_line FROM public.project_ffe_items
  WHERE project_id = v_project AND name = 'Legacy console';
  ASSERT v_line IS NOT NULL, 'fixture: legacy activation must have carried FF&E';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Release without authority', ARRAY[v_line], NULL
    );
    ASSERT false, 'legacy project must not authorize a furnishing release';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%no executed design-services origin%',
    format('legacy release blocked by the wrong guard: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) A service addendum amends a signed authority. Without one there is
--     nothing to amend.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_project uuid := (SELECT value FROM gap_ids WHERE key = 'legacy_project');
BEGIN
  BEGIN
    PERFORM public.create_service_addendum(v_project, 'Amend nothing');
    ASSERT false, 'legacy project must not accept a service addendum';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) The trusted-IP and cutover rails are server-side only. An authenticated
--     caller reaching them directly is refused before any state moves.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      'd6300000-0000-4000-8000-000000000001', 'Gap Client',
      'd6000000-0000-4000-8000-000000000002', '203.0.113.7'
    );
    ASSERT false, 'authenticated caller reached trusted-IP signing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      'd6300000-0000-4000-8000-000000000001', 'Gap Client',
      'd6000000-0000-4000-8000-000000000002', '203.0.113.7'
    );
    ASSERT false, 'authenticated caller reached trusted-IP wave execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.supersede_unsigned_legacy_proposals(
      ARRAY['d6300000-0000-4000-8000-000000000001']::uuid[], NULL,
      'Authenticated cutover attempt'
    );
    ASSERT false, 'authenticated caller reached the legacy cutover';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) Legacy grandfathering: everything a pre-00412 engagement could do, it
--     still does. Activation, billable time, purchase ordering, and a client
--     read that answers instead of raising.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_time_entries (
  id, project_id, user_id, started_at, duration_minutes, billable, activity
) SELECT
  'd6400000-0000-4000-8000-000000000001', value,
  'd6000000-0000-4000-8000-000000000001', now(), 45, true, 'design'
FROM gap_ids WHERE key = 'legacy_project';
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'legacy_project');
  v_ffe_id uuid;
  v_po public.purchase_orders%ROWTYPE;
  v_activated uuid;
BEGIN
  v_activated := public.activate_proposal_as_project(
    'd6300000-0000-4000-8000-000000000007', current_date
  );
  ASSERT v_activated IS NOT NULL
     AND (SELECT count(*) FROM public.projects WHERE id = v_activated) = 1,
    'accepted legacy proposal must still activate via activate_proposal_as_project';
  ASSERT (SELECT count(*) FROM public.projects WHERE id = v_project) = 1,
    'legacy signature rail must still produce its project';
  ASSERT (SELECT project_id FROM public.proposals
          WHERE id = 'd6300000-0000-4000-8000-000000000001') = v_project,
    'legacy activation must back-link the proposal';
  ASSERT (SELECT billing_state FROM public.project_time_entries
          WHERE id = 'd6400000-0000-4000-8000-000000000001') = 'authorized',
    'legacy project time must classify as authorized';

  SELECT id INTO v_ffe_id FROM public.project_ffe_items
  WHERE project_id = v_project AND name = 'Legacy console';
  ASSERT v_ffe_id IS NOT NULL, 'legacy activation must carry FF&E';
  v_po := public.create_purchase_order(
    v_project, 'd6710000-0000-4000-8000-000000000001',
    'full_upfront', ARRAY[v_ffe_id]
  );
  ASSERT (SELECT purchase_order_id FROM public.project_ffe_items WHERE id = v_ffe_id) = v_po.id,
    'legacy FF&E must still accept a purchase order without a furnishing wave';
END $$;

SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
DO $$
DECLARE v_bundle jsonb;
BEGIN
  v_bundle := public.get_client_commercial_document_bundle(
    'd6300000-0000-4000-8000-000000000001'
  );
  ASSERT v_bundle->'document'->>'documentKind' = 'legacy'
     AND v_bundle->'document'->>'kind' = 'legacy'
     AND (v_bundle->'document'->>'retired')::boolean,
    'legacy client bundle must answer with a retired marker';
  ASSERT v_bundle->'document'->>'title' = 'Legacy grandfathered proposal'
     AND v_bundle->'document'->>'status' = 'accepted',
    'retired marker must still name the document';
  ASSERT NOT (v_bundle->'document' ? 'totalAmountCents')
     AND NOT (v_bundle->'document' ? 'depositPercent')
     AND NOT (v_bundle->'document' ? 'designerId')
     AND NOT (v_bundle->'document' ? 'clientId'),
    'retired marker leaked totals or identities';
  ASSERT NOT (v_bundle ? 'serviceTerms') AND NOT (v_bundle ? 'rates')
     AND NOT (v_bundle ? 'signatures') AND NOT (v_bundle ? 'furnishings'),
    'retired marker leaked commercial sections';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) Promotion: a legacy draft becomes a design-services edition through the
--     authoring RPC, then leaves through the commercial send seam.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd6300000-0000-4000-8000-000000000003',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Promoted services agreement', 'Started life as a legacy draft.', 0, 'draft',
  now() + interval '30 days'
);
DO $$
DECLARE v_save jsonb; v_snapshot jsonb; v_sent jsonb;
BEGIN
  ASSERT (SELECT document_kind FROM public.proposals
          WHERE id = 'd6300000-0000-4000-8000-000000000003') = 'legacy',
    'promotion fixture must start legacy';
  v_save := public.upsert_design_services_draft(
    'd6300000-0000-4000-8000-000000000003',
    jsonb_build_object(
      'scope', 'Promotion path scope.',
      'deliverables', jsonb_build_array('Concept'),
      'exclusions', jsonb_build_array('Construction'),
      'billingCeilingCents', 20000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Hourly to the signed ceiling.', 'currentRateVersion', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 12000, 'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  ASSERT v_save->>'documentKind' = 'design_services', 'promotion must flip the kind';
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd6300000-0000-4000-8000-000000000003'
  );
  v_sent := public.send_commercial_document(
    'd6300000-0000-4000-8000-000000000003',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );
  ASSERT v_sent->>'commercialState' = 'sent'
     AND v_sent->>'documentKind' = 'design_services',
    'promoted draft must send through the commercial seam';
END $$;

-- ── Fixture: the executed design-services origin every later act needs ─────
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd6300000-0000-4000-8000-000000000002',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Design services agreement', 'The origin document.', 0, 'draft',
  now() + interval '60 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd6310000-0000-4000-8000-000000000002',
  'd6300000-0000-4000-8000-000000000002',
  'Design development', 'design-development', 21, 'main', 0, 0
);
DO $$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd6300000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections', 'Installation'),
      'exclusions', jsonb_build_array('Construction administration'),
      'billingCeilingCents', 500000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours, not to exceed the signed ceiling.',
      'currentRateVersion', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd6300000-0000-4000-8000-000000000002'
  );
  PERFORM public.send_commercial_document(
    'd6300000-0000-4000-8000-000000000002',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '60 days'
  );
END $$;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'd6300000-0000-4000-8000-000000000002', 'Gap Client'
);
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_executed jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    'd6300000-0000-4000-8000-000000000002', 'Gap Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean, 'origin countersign';
  INSERT INTO gap_ids VALUES ('services_project', (v_executed->>'projectId')::uuid);
END $$;

-- ── Fixture: the schedule every 00422 release below is drawn over ─────────
-- The instrument cites schedule lines, and coverage is proven room by room
-- against the checkpoint's budget lines — so the room, the lines, and the
-- budget line's project_room_id all have to be real.
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
SELECT 'd6600000-0000-4000-8000-000000000001', value, 'Living room', 0
FROM gap_ids WHERE key = 'services_project';
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, ffe_category, item_type, status,
  quantity, unit_price_cents, trade_price_cents, markup_percent,
  line_total_cents, vendor_id, vendor_name, sort_order
)
SELECT x.id, g.value, 'd6600000-0000-4000-8000-000000000001', x.name, x.category,
  'fixed', 'specified', x.quantity, x.unit_price, x.trade_price, 66.67,
  x.line_total, 'd6710000-0000-4000-8000-000000000001', 'Gap Test Vendor', x.sort_order
FROM gap_ids g,
  (VALUES
    ('d6620000-0000-4000-8000-000000000001'::uuid, 'Wave one sofa', 'Seating', 1, 100000, 60000, 100000, 0),
    ('d6620000-0000-4000-8000-000000000002'::uuid, 'Wave two rug', 'Textiles', 1, 50000, 30000, 50000, 1),
    ('d6620000-0000-4000-8000-000000000003'::uuid, 'Wave three lamp', 'Lighting', 2, 15000, 9000, 30000, 2),
    ('d6620000-0000-4000-8000-000000000004'::uuid, 'Wave four mirror', 'Decor', 1, 20000, 12000, 20000, 3)
  ) AS x(id, name, category, quantity, unit_price, trade_price, line_total, sort_order)
WHERE g.key = 'services_project';

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) An audited override is authority too: a release may be built on an
--     overridden checkpoint, not only an acknowledged one.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_budget_versions (id, project_id, version, note, created_by)
SELECT 'd6500000-0000-4000-8000-000000000001', value, 1,
  'Studio working note — never client copy.',
  'd6000000-0000-4000-8000-000000000001'
FROM gap_ids WHERE key = 'services_project';
INSERT INTO public.project_budget_lines (
  budget_version_id, project_room_id, room_name, category,
  low_cents, target_cents, high_cents
) VALUES (
  'd6500000-0000-4000-8000-000000000001',
  'd6600000-0000-4000-8000-000000000001',
  'Living room', 'Seating', 100000, 150000, 200000
);
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'services_project');
  v_published jsonb;
  v_override jsonb;
  v_wave jsonb;
BEGIN
  v_published := public.publish_budget_checkpoint(
    v_project, 'd6500000-0000-4000-8000-000000000001'
  );
  INSERT INTO gap_ids VALUES ('checkpoint', (v_published->>'checkpointId')::uuid);
  v_override := public.override_budget_checkpoint(
    (v_published->>'checkpointId')::uuid,
    'Client travelling; proceeding on the reviewed budget.'
  );
  ASSERT v_override->>'status' = 'overridden'
     AND (v_override->>'newlyOverridden')::boolean,
    'audited override must open the checkpoint';

  v_wave := public.create_furnishings_authorization_from_schedule(
    v_project, 'Wave one', ARRAY['d6620000-0000-4000-8000-000000000001'::uuid], 0
  );
  ASSERT v_wave->>'commercialState' = 'draft'
     AND (v_wave->>'itemCount')::integer = 1,
    'overridden checkpoint must authorize a release';
  INSERT INTO gap_ids VALUES ('wave1', (v_wave->>'proposalId')::uuid);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) A published budget version is the thing a checkpoint fingerprints. It
--     is immutable even to the trusted role — while a DRAFT version's lines
--     stay ordinary authoring (00412's guard raised 42703 on every line write).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_budget_versions (id, project_id, version, created_by)
SELECT 'd6500000-0000-4000-8000-000000000003', value, 2,
  'd6000000-0000-4000-8000-000000000001'
FROM gap_ids WHERE key = 'services_project';
INSERT INTO public.project_budget_lines (
  id, budget_version_id, room_name, category, low_cents, target_cents, high_cents
) VALUES (
  'd6510000-0000-4000-8000-000000000001',
  'd6500000-0000-4000-8000-000000000003', 'Study', 'Casegoods', 1000, 2000, 3000
);
UPDATE public.project_budget_lines SET target_cents = 2500
WHERE id = 'd6510000-0000-4000-8000-000000000001';
DO $$ BEGIN
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE id = 'd6510000-0000-4000-8000-000000000001') = 2500,
    'draft budget lines must remain editable';
END $$;
DELETE FROM public.project_budget_lines
WHERE id = 'd6510000-0000-4000-8000-000000000001';
DELETE FROM public.project_budget_versions
WHERE id = 'd6500000-0000-4000-8000-000000000003';
DO $$ BEGIN
  BEGIN
    UPDATE public.project_budget_versions SET note = 'rewritten'
    WHERE id = 'd6500000-0000-4000-8000-000000000001';
    ASSERT false, 'published budget version should be immutable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.project_budget_lines SET target_cents = 1
    WHERE budget_version_id = 'd6500000-0000-4000-8000-000000000001';
    ASSERT false, 'published budget line should be immutable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) Expiry stays lazily evaluated — there is no 'expired' commercial state,
--     so both signing acts must read valid_until themselves.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.proposals'::regclass
      AND conname = 'proposals_commercial_state_check'
      AND pg_get_constraintdef(oid) LIKE '%expired%'
  ), 'commercial_state must no longer admit an expired value';
END $$;
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd6300000-0000-4000-8000-000000000004',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Stale services agreement', 'Sent with a window already closed.', 0, 'draft',
  now() + interval '30 days'
);
DO $$
DECLARE
  v_snapshot jsonb;
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'services_project');
  v_draft jsonb;
  v_wave jsonb;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd6300000-0000-4000-8000-000000000004',
    jsonb_build_object(
      'scope', 'An agreement whose window closed.',
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
    'd6300000-0000-4000-8000-000000000004'
  );
  PERFORM public.send_commercial_document(
    'd6300000-0000-4000-8000-000000000004',
    v_snapshot->>'documentFingerprint', NULL, now() - interval '1 day'
  );

  -- An expired furnishing release, built off the same overridden checkpoint.
  v_wave := public.create_furnishings_authorization_from_schedule(
    v_project, 'Wave two', ARRAY['d6620000-0000-4000-8000-000000000002'::uuid], 0
  );
  INSERT INTO gap_ids VALUES ('wave2', (v_wave->>'proposalId')::uuid);
  v_snapshot := public.get_commercial_document_send_snapshot(
    (v_wave->>'proposalId')::uuid
  );
  PERFORM public.send_commercial_document(
    (v_wave->>'proposalId')::uuid,
    v_snapshot->>'documentFingerprint', NULL, now() - interval '1 day'
  );
END $$;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
DO $$
DECLARE v_wave2 uuid := (SELECT value FROM gap_ids WHERE key = 'wave2');
BEGIN
  BEGIN
    PERFORM public.sign_design_services_agreement(
      'd6300000-0000-4000-8000-000000000004', 'Gap Client'
    );
    ASSERT false, 'expired agreement should not be signable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_furnishings_authorization(v_wave2, 'Gap Client');
    ASSERT false, 'expired furnishing wave should not execute';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) The checkpoint fingerprint is the tie between a wave and the budget the
--     client saw. Break it and the wave cannot execute.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'services_project');
  v_draft jsonb;
  v_wave jsonb;
  v_snapshot jsonb;
BEGIN
  v_wave := public.create_furnishings_authorization_from_schedule(
    v_project, 'Wave three', ARRAY['d6620000-0000-4000-8000-000000000003'::uuid], 0
  );
  INSERT INTO gap_ids VALUES ('wave3', (v_wave->>'proposalId')::uuid);
  v_snapshot := public.get_commercial_document_send_snapshot(
    (v_wave->>'proposalId')::uuid
  );
  PERFORM public.send_commercial_document(
    (v_wave->>'proposalId')::uuid,
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );
END $$;
UPDATE public.project_budget_checkpoints
SET snapshot_fingerprint = repeat('a', 64)
WHERE id = (SELECT value FROM gap_ids WHERE key = 'checkpoint');
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
DO $$
DECLARE v_wave3 uuid := (SELECT value FROM gap_ids WHERE key = 'wave3');
BEGIN
  BEGIN
    PERFORM public.execute_furnishings_authorization(v_wave3, 'Gap Client');
    ASSERT false, 'tampered checkpoint fingerprint should block wave execution';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
UPDATE public.project_budget_checkpoints
SET snapshot_fingerprint = public._budget_version_fingerprint(budget_version_id)
WHERE id = (SELECT value FROM gap_ids WHERE key = 'checkpoint');

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) Purchase orders are minted by their RPC, never at the table edge.
-- ═══════════════════════════════════════════════════════════════════════════
-- The role-switched probes below cannot read the temp fixture table, so the two
-- project ids ride transaction-local settings instead.
SELECT set_config('gap.legacy_project',
         (SELECT value::text FROM gap_ids WHERE key = 'legacy_project'), true),
       set_config('gap.services_project',
         (SELECT value::text FROM gap_ids WHERE key = 'services_project'), true);
GRANT INSERT ON public.purchase_orders TO authenticated;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_project uuid := current_setting('gap.legacy_project')::uuid;
BEGIN
  BEGIN
    INSERT INTO public.purchase_orders (
      designer_id, project_id, vendor_id, payment_pattern, total_cents
    ) VALUES (
      'd6000000-0000-4000-8000-000000000001', v_project,
      'd6710000-0000-4000-8000-000000000001', 'full_upfront', 1000
    );
    ASSERT false, 'direct purchase-order insert should be blocked';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- (11) 00414's ledger guards: the commercial document and billing-authority
--      tables are RPC-write-only at the table edge, independent of RLS. The
--      probe grants privileges and permissive policies on purpose — the point
--      is that the trigger, not the policy, is what holds.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_commercial_documents'::regclass
      AND tgname = 'aab_guard_project_commercial_documents_write_trg'
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE%'
  ), 'commercial document write guard missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_billing_authorities'::regclass
      AND tgname = 'aab_guard_project_billing_authorities_write_trg'
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE%'
  ), 'billing authority write guard missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_billing_authorities'::regclass
      AND tgname = 'guard_project_billing_authorities_immutable'
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) LIKE '%BEFORE DELETE%'
  ), 'billing authority delete guard missing';
END $$;
GRANT INSERT, UPDATE ON public.project_commercial_documents TO authenticated;
GRANT INSERT, UPDATE ON public.project_billing_authorities TO authenticated;
CREATE POLICY gap_tmp_commercial_documents_write ON public.project_commercial_documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gap_tmp_billing_authorities_write ON public.project_billing_authorities
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_project uuid := current_setting('gap.services_project')::uuid;
  v_err text;
BEGIN
  BEGIN
    UPDATE public.project_billing_authorities
    SET status = 'exhausted' WHERE project_id = v_project;
    ASSERT false, 'authenticated caller mutated a signed billing authority';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%canonical commercial RPCs%',
    format('authority update blocked by the wrong guard: %L', v_err);
  BEGIN
    UPDATE public.project_commercial_documents
    SET executed_at = now() WHERE project_id = v_project;
    ASSERT false, 'authenticated caller mutated a commercial document binding';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%canonical commercial RPCs%',
    format('document update blocked by the wrong guard: %L', v_err);
  BEGIN
    INSERT INTO public.project_commercial_documents (
      project_id, proposal_id, document_kind, created_by
    ) VALUES (
      v_project, 'd6300000-0000-4000-8000-000000000003', 'design_services',
      'd6000000-0000-4000-8000-000000000001'
    );
    ASSERT false, 'authenticated caller forged a commercial document binding';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%canonical commercial RPCs%',
    format('document insert blocked by the wrong guard: %L', v_err);
END $$;
RESET ROLE;
DO $$
DECLARE v_project uuid := (SELECT value FROM gap_ids WHERE key = 'services_project');
BEGIN
  ASSERT (SELECT count(*) FROM public.project_billing_authorities
          WHERE project_id = v_project AND status = 'active') = 1,
    'rejected authority write changed stored state';
  ASSERT (SELECT count(*) FROM public.project_commercial_documents
          WHERE project_id = v_project
            AND proposal_id = 'd6300000-0000-4000-8000-000000000003') = 0,
    'rejected commercial binding persisted';
END $$;
DROP POLICY gap_tmp_commercial_documents_write ON public.project_commercial_documents;
DROP POLICY gap_tmp_billing_authorities_write ON public.project_billing_authorities;

-- ═══════════════════════════════════════════════════════════════════════════
-- (12) A checkpoint is an act of signed authority. A legacy project cannot
--      publish one, no matter how well-formed its budget version is.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_budget_versions (id, project_id, version, created_by)
SELECT 'd6500000-0000-4000-8000-000000000002', value, 1,
  'd6000000-0000-4000-8000-000000000001'
FROM gap_ids WHERE key = 'legacy_project';
INSERT INTO public.project_budget_lines (
  budget_version_id, room_name, category, low_cents, target_cents, high_cents
) VALUES (
  'd6500000-0000-4000-8000-000000000002', 'Den', 'Seating', 10000, 20000, 30000
);
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'legacy_project');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.publish_budget_checkpoint(
      v_project, 'd6500000-0000-4000-8000-000000000002'
    );
    ASSERT false, 'legacy project should not publish a budget checkpoint';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%no executed design-services origin%',
    format('publication blocked by the wrong guard: %L', v_err);
  ASSERT (SELECT status FROM public.project_budget_versions
          WHERE id = 'd6500000-0000-4000-8000-000000000002') = 'draft',
    'rejected publication left the version published';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13) Defense in depth: a wave already in flight cannot outlive the origin
--      that authorized it. Unbind the origin and execution stops.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.project_commercial_documents SET is_origin = false
WHERE project_id = (SELECT value FROM gap_ids WHERE key = 'services_project')
  AND is_origin;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_wave3 uuid := (SELECT value FROM gap_ids WHERE key = 'wave3');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.execute_furnishings_authorization(v_wave3, 'Gap Client');
    ASSERT false, 'wave execution must re-assert the executed design-services origin';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%no executed design-services origin%',
    format('wave execution blocked by the wrong guard: %L', v_err);
END $$;
UPDATE public.project_commercial_documents SET is_origin = true
WHERE proposal_id = 'd6300000-0000-4000-8000-000000000002';
-- Executed through the trusted-IP server rail so the signature actually
-- carries an IP — which is what makes the mirror assertion below meaningful.
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002', 'service_role');
DO $$
DECLARE
  v_wave3 uuid := (SELECT value FROM gap_ids WHERE key = 'wave3');
  v_execution jsonb;
BEGIN
  v_execution := public.execute_furnishings_authorization_with_trusted_ip(
    v_wave3, 'Gap Client', 'd6000000-0000-4000-8000-000000000002', '203.0.113.44'
  );
  ASSERT (v_execution->>'newlyExecuted')::boolean,
    'restored origin must let the same wave execute';
  ASSERT jsonb_array_length(v_execution->'appliedItemIds') = 1,
    'executed wave must apply its snapshot';
END $$;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
-- 00414: the signing IP lives on the signature row and NOWHERE else. Mirroring
-- it onto public.proposals would hand it straight back to every studio
-- co-member, because proposals keeps table-level SELECT while
-- commercial_document_signatures.signed_ip is un-granted (section 16).
DO $$
DECLARE
  v_wave3 uuid := (SELECT value FROM gap_ids WHERE key = 'wave3');
BEGIN
  ASSERT (SELECT s.signed_ip FROM public.commercial_document_signatures s
          WHERE s.proposal_id = v_wave3 AND s.party_role = 'client') = '203.0.113.44',
    'the signature row must hold the trusted signing IP';
  ASSERT (SELECT p.signed_ip IS NULL AND p.commercial_state = 'executed'
                 AND p.signed_by_name = 'Gap Client'
          FROM public.proposals p WHERE p.id = v_wave3),
    'commercial execution must not mirror signed_ip onto proposals';
  ASSERT (SELECT p.signed_ip IS NULL
          FROM public.proposals p
          WHERE p.id = 'd6300000-0000-4000-8000-000000000002'),
    'countersign must not mirror signed_ip onto proposals';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (14) Two send seams, one per rail. 00422 retired the authoring vehicle that
--      used to sit behind the furnishing seam — the schedule is the vehicle now
--      — so this section keeps the legacy-send half intact and replaces the
--      vehicle half with the retirement it became.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd6300000-0000-4000-8000-000000000005',
  'd6000000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000002',
  'Wrong-seam services agreement', 'Must not leave through send_proposal.',
  0, 'draft', now() + interval '30 days'
);
INSERT INTO public.proposal_phases (
  proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd6300000-0000-4000-8000-000000000005',
  'Advisory', 'advisory', 7, 'main', 0, 0
);
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'services_project');
  v_draft jsonb;
  v_wave jsonb;
  v_err text;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd6300000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'scope', 'A commercial edition aimed at the legacy seam.',
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
  BEGIN
    PERFORM public.send_proposal(
      'd6300000-0000-4000-8000-000000000005', NULL::text, NULL::text, NULL::timestamptz
    );
    ASSERT false, 'commercial edition must not send through send_proposal';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'commercial documents send through send_commercial_document',
    format('commercial send blocked by the wrong guard: %L', v_err);
  ASSERT (SELECT status = 'draft' AND sent_at IS NULL FROM public.proposals
          WHERE id = 'd6300000-0000-4000-8000-000000000005'),
    'rejected legacy send moved the commercial edition';

  -- 00422: the authoring vehicle is retired. There is nothing left to hand-make
  -- and nothing left to refuse a send on — the ceremony reads the schedule.
  BEGIN
    PERFORM public.create_furnishing_wave_draft(v_project, 'Wave four authoring');
    ASSERT false, 'create_furnishing_wave_draft must be retired';
  EXCEPTION WHEN feature_not_supported THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is retired; release from the schedule%',
    format('wave draft retirement message: %L', v_err);
  BEGIN
    PERFORM public.create_furnishings_authorization(
      v_project, 'Wave four', 'd6300000-0000-4000-8000-000000000005'
    );
    ASSERT false, 'create_furnishings_authorization must be retired';
  EXCEPTION WHEN feature_not_supported THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is retired; release from the schedule%',
    format('wave retirement message: %L', v_err);

  -- The 00414 vehicle refusal in send_proposal is left standing for the shape
  -- it names: it answers for legacy DRAFTS only. An activated legacy
  -- proposal carries a project back-link too (activate_proposal_as_project
  -- writes it), and must reach the base body's own status answer instead of
  -- being told it is an authoring vehicle.
  ASSERT (SELECT project_id IS NOT NULL AND status = 'accepted'
                 AND document_kind = 'legacy'
          FROM public.proposals WHERE id = 'd6300000-0000-4000-8000-000000000001'),
    'fixture must be a project-bound, non-draft legacy proposal';
  v_err := NULL;
  BEGIN
    PERFORM public.send_proposal(
      'd6300000-0000-4000-8000-000000000001', NULL::text, NULL::text, NULL::timestamptz
    );
    ASSERT false, 'an accepted legacy proposal must still not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err NOT LIKE 'project-bound furnishing drafts%',
    format('activated legacy proposal hit the vehicle refusal: %L', v_err);
  ASSERT v_err = 'proposal must be in draft status before sending',
    format('activated legacy send blocked by the wrong guard: %L', v_err);

  -- The replacement ceremony still works, off the same schedule and checkpoint.
  v_wave := public.create_furnishings_authorization_from_schedule(
    v_project, 'Wave four', ARRAY['d6620000-0000-4000-8000-000000000004'::uuid], 0
  );
  ASSERT (v_wave->>'itemCount')::integer = 1
     AND v_wave->>'commercialState' = 'draft',
    'the from-schedule release must stand where the wave draft used to';
  -- A furnishing edition still refuses the legacy seam.
  v_err := NULL;
  BEGIN
    PERFORM public.send_proposal(
      (v_wave->>'proposalId')::uuid, NULL::text, NULL::text, NULL::timestamptz
    );
    ASSERT false, 'a furnishing edition must not send through send_proposal';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'commercial documents send through send_commercial_document',
    format('furnishing edition send blocked by the wrong guard: %L', v_err);

  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'x', ARRAY['d6620000-0000-4000-8000-000000000004'::uuid], 0
    );
    ASSERT false, 'a release must require a real name';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
DO $$
DECLARE
  v_legacy uuid := (SELECT value FROM gap_ids WHERE key = 'legacy_project');
  v_line uuid;
  v_err text;
BEGIN
  SELECT id INTO v_line FROM public.project_ffe_items
  WHERE project_id = v_legacy AND name = 'Legacy console';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_legacy, 'Legacy release attempt', ARRAY[v_line], NULL
    );
    ASSERT false, 'a release must require an executed design-services origin';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%no executed design-services origin%',
    format('legacy release blocked by the wrong guard: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (15) Discovery seeds the commercial rail, and a retired seed does not trap
--      the engagement.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'd6200000-0000-4000-8000-000000000002',
  'd6000000-0000-4000-8000-000000000001',
  NULL, 'Discovery Household', 'lead', 'direct'
);
INSERT INTO public.client_discovery (
  designer_client_id, designer_id, project_type, rooms,
  budget_min_cents, budget_max_cents, target_date,
  style_keywords, lifestyle
) VALUES (
  'd6200000-0000-4000-8000-000000000002',
  'd6000000-0000-4000-8000-000000000001',
  'full_service',
  '[{"name":"Living room","room_type":"living"},{"name":"Study","room_type":"office"}]'::jsonb,
  100000, 250000, current_date + 90,
  ARRAY['warm', 'collected'], '["family","entertains"]'::jsonb
);
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_seed uuid;
BEGIN
  v_seed := public.begin_direction_from_discovery('d6200000-0000-4000-8000-000000000002');
  INSERT INTO gap_ids VALUES ('discovery_seed', v_seed);
  ASSERT (SELECT document_kind = 'design_services'
                 AND commercial_state = 'draft'
                 AND status = 'draft'
          FROM public.proposals WHERE id = v_seed),
    'Discovery must seed a design-services draft on the commercial rail';
  ASSERT (SELECT count(*) FROM public.proposal_scope_rooms WHERE proposal_id = v_seed) = 2,
    'Discovery seed must carry its scope rooms';
  ASSERT EXISTS (SELECT 1 FROM public.proposal_sections
                 WHERE proposal_id = v_seed AND type = 'vision'),
    'Discovery seed must carry its vision section';
  ASSERT (SELECT seeded_proposal_id = v_seed AND seeded_at IS NOT NULL
          FROM public.client_discovery
          WHERE designer_client_id = 'd6200000-0000-4000-8000-000000000002'),
    'Discovery row must be stamped with its seed';
  ASSERT public.begin_direction_from_discovery('d6200000-0000-4000-8000-000000000002') = v_seed,
    'a live seed must remain idempotent';
END $$;

-- Retire the seed through the cutover capability (exact-row GUC + trusted
-- role), then prove the act mints a fresh draft rather than returning a
-- terminal one.
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001', 'service_role');
DO $$
DECLARE v_seed uuid := (SELECT value FROM gap_ids WHERE key = 'discovery_seed');
BEGIN
  PERFORM set_config('app.commercial_cutover_id', v_seed::text, true);
  UPDATE public.proposals SET
    commercial_state = 'superseded', superseded_at = now(),
    superseded_reason = 'Gap-hardening cutover fixture', updated_at = now()
  WHERE id = v_seed;
  PERFORM set_config('app.commercial_cutover_id', '', true);
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_seed) = 'superseded',
    'cutover fixture did not retire the seed';
END $$;
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_old uuid := (SELECT value FROM gap_ids WHERE key = 'discovery_seed');
  v_new uuid;
BEGIN
  v_new := public.begin_direction_from_discovery('d6200000-0000-4000-8000-000000000002');
  ASSERT v_new <> v_old, 'a superseded seed must not be returned';
  ASSERT (SELECT document_kind = 'design_services' AND commercial_state = 'draft'
          FROM public.proposals WHERE id = v_new),
    're-minted seed must be a live design-services draft';
  ASSERT (SELECT seeded_proposal_id = v_new
          FROM public.client_discovery
          WHERE designer_client_id = 'd6200000-0000-4000-8000-000000000002'),
    'Discovery row must be re-stamped onto the fresh seed';
  ASSERT (SELECT count(*) FROM public.proposal_scope_rooms WHERE proposal_id = v_new) = 2,
    're-minted seed must carry its scope rooms';
  ASSERT public.begin_direction_from_discovery('d6200000-0000-4000-8000-000000000002') = v_new,
    're-minted seed must be idempotent in turn';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (16) A signing IP is evidence held for the signer, not studio-readable
--      metadata. RLS filters rows; only a column grant filters this.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_ip text; v_count integer;
BEGIN
  BEGIN
    SELECT s.signed_ip INTO v_ip FROM public.commercial_document_signatures s
    WHERE s.proposal_id = 'd6300000-0000-4000-8000-000000000002' LIMIT 1;
    ASSERT false, 'studio co-member read the client signing IP';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_count FROM (
    SELECT s.id, s.proposal_id, s.party_role, s.signer_user_id, s.signed_name,
           s.evidence_fingerprint, s.signed_at, s.metadata
    FROM public.commercial_document_signatures s
    WHERE s.proposal_id = 'd6300000-0000-4000-8000-000000000002'
  ) granted;
  ASSERT v_count = 2, 'studio must still read the granted signature columns';
END $$;
RESET ROLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- (17) The client proposal list speaks the commercial vocabulary, so a portal
--      can route a row to the right reader without a second round trip.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_list jsonb;
  v_services jsonb;
  v_legacy jsonb;
BEGIN
  v_list := public.list_client_proposals();
  ASSERT jsonb_array_length(v_list) > 0, 'client proposal list is empty';
  SELECT elem INTO v_services FROM jsonb_array_elements(v_list) elem
  WHERE elem->>'id' = 'd6300000-0000-4000-8000-000000000002';
  SELECT elem INTO v_legacy FROM jsonb_array_elements(v_list) elem
  WHERE elem->>'id' = 'd6300000-0000-4000-8000-000000000001';
  ASSERT v_services IS NOT NULL, 'executed services agreement missing from client list';
  ASSERT v_legacy IS NOT NULL, 'accepted legacy proposal missing from client list';
  ASSERT v_services->>'document_kind' = 'design_services'
     AND v_services->>'commercial_state' = 'executed',
    'client list must carry the commercial vocabulary';
  ASSERT v_legacy->>'document_kind' = 'legacy'
     AND NOT (v_legacy ? 'commercial_state'),
    'legacy rows must carry the kind and no null commercial state';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (18) Minting a proposal row is an authoring act, not a shared-workspace act.
--      is_studio_comember accepts co-membership in ANY organization; the
--      proposals INSERT policy and every sibling authoring RPC require an
--      active design_studio. 00422's release ceremony is SECURITY DEFINER and
--      mints a client-facing edition, so only the helper it names stands
--      between a contractor co-member and a document attributed to the designer.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d6100000-0000-4000-8000-000000000002', 'contractor',
        'Gap Hardening Trades', 'gap-hardening-trades', 'active');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('d6110000-0000-4000-8000-000000000002',
   'd6000000-0000-4000-8000-000000000001',
   'd6100000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('d6110000-0000-4000-8000-000000000003',
   'd6000000-0000-4000-8000-000000000003',
   'd6100000-0000-4000-8000-000000000002', 'member', 'active', now());
SELECT pg_temp.assume_user('d6000000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM gap_ids WHERE key = 'services_project');
  v_before integer;
  v_err text;
BEGIN
  ASSERT public.is_studio_comember('d6000000-0000-4000-8000-000000000001'),
    'fixture must make the outsider a shared-workspace co-member';
  ASSERT NOT public._can_author_proposal('d6000000-0000-4000-8000-000000000001'),
    'a contractor co-member must not carry proposal-authoring authority';
  SELECT count(*) INTO v_before FROM public.proposals
  WHERE designer_id = 'd6000000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Contractor authoring attempt',
      ARRAY['d6620000-0000-4000-8000-000000000001'::uuid], NULL
    );
    ASSERT false, 'a contractor co-member minted a proposal through the release RPC';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found or access denied%',
    format('release blocked by the wrong guard: %L', v_err);
  ASSERT (SELECT count(*) FROM public.proposals
          WHERE designer_id = 'd6000000-0000-4000-8000-000000000001') = v_before,
    'refused release still wrote a proposal row';
END $$;

ROLLBACK;

SELECT 'design_services_gap_hardening_test: all assertions passed' AS result;
