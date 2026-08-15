-- 00422 Authorized Schedule (phase 1) integration test.
-- Runner: same-session SQL-test helper. The transaction rolls back.
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/commercial/authorized_schedule_test.sql
--
-- What this suite is for: before 00422 a furnishing authorization was a
-- re-authored parallel proposal, and executing it MINTED a second population of
-- project_ffe_items. The schedule the studio worked in and the document the
-- client signed were two sets of the same furniture. This suite walks the
-- inverted rail — release FROM the schedule, execute by LINKING — and pins the
-- guards that make the schedule safe to keep working in while a client is
-- looking at an instrument drawn over it.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;

-- ── Cast ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('d7000000-0000-4000-8000-000000000001', 'sched-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000002', 'sched-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000003', 'sched-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d7000000-0000-4000-8000-000000000001', 'sched-designer@test.invalid', 'Schedule Designer', true, now(), now()),
  ('d7000000-0000-4000-8000-000000000002', 'sched-client@test.invalid', 'Schedule Client', false, now(), now()),
  ('d7000000-0000-4000-8000-000000000003', 'sched-stranger@test.invalid', 'Schedule Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d7100000-0000-4000-8000-000000000001', 'design_studio',
        'Authorized Schedule Studio', 'authorized-schedule-test', 'active');
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES (
  'd7110000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001', 'owner', 'active', now()
);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'd7200000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'Schedule Client', 'proposal', 'direct'
);

INSERT INTO public.vendors (id, name, website)
VALUES ('d7710000-0000-4000-8000-000000000001', 'Schedule Test Vendor',
        'https://schedule-vendor.test.invalid');

INSERT INTO public.products (
  id, name, captured_at, status, layer, images
) VALUES (
  'd7750000-0000-4000-8000-000000000001', 'Catalogue sofa', now(), 'published',
  'catalog', ARRAY['https://cdn.test.invalid/sofa-hero.jpg',
                   'https://cdn.test.invalid/sofa-alt.jpg']
), (
  'd7750000-0000-4000-8000-000000000002', 'Configured bench', now(), 'published',
  'catalog', ARRAY['https://cdn.test.invalid/bench.jpg']
);

CREATE TEMP TABLE sched_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) THE CARVE-OUT, FROM A COLD SESSION. This section runs FIRST, before any
--     commercial RPC has touched app.commercial_document_id, because that is
--     the only state in which the reported bypass reproduces: once a rail has
--     set the GUC it reads '' for the rest of the session and can never read
--     NULL again (set_config with NULL and RESET both leave '').
--
--     The bypass: guard_project_ffe_configuration_integrity's carve-out tested
--     current_user — always 'postgres' inside a SECURITY DEFINER trigger — and
--     compared an unset GUC (NULL) with IS NOT DISTINCT FROM against the NULL
--     a NULL source_commercial_document_id yields. Both conjuncts true, so a
--     plain authenticated UPDATE that stamped source_authorization_item_id
--     approved a configured line and skipped the whole 00403/00413 workflow:
--     the valid/complete check, the snapshot-hash agreement, the custom-
--     commission gate, the price normalization and the spec stamp.
--
--     Everything below is built with direct INSERTs on purpose. Calling any
--     ceremony here would set the GUC and destroy the state under test.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.projects (id, name, client_id, designer_id, created_by)
VALUES ('d7500000-0000-4000-8000-000000000001', 'Cold session project',
        'd7000000-0000-4000-8000-000000000002',
        'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('d7600000-0000-4000-8000-000000000001',
        'd7500000-0000-4000-8000-000000000001', 'Cold room', 0);
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, version, schema_revision, status,
  normalized_selection, component_quantities, evaluation, snapshot, snapshot_hash,
  is_complete, is_valid, retail_price_cents, trade_price_cents, approved_by, approved_at
) VALUES (
  'd7770000-0000-4000-8000-000000000000',
  'd7750000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001', 1, 1, 'approved',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_object('retailPriceCents', 100000, 'tradePriceCents', 60000),
  repeat('e', 64), true, true, 100000, 60000,
  'd7000000-0000-4000-8000-000000000001', now()
);
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status,
  version, document_kind, commercial_state
) VALUES (
  'd7300000-0000-4000-8000-000000000009',
  'd7000000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'Cold session instrument', 100000, 'draft', 1,
  'furnishings_authorization', 'draft'
);
INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, wave_name, created_by
) VALUES (
  'd7400000-0000-4000-8000-000000000009',
  'd7500000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000009', 'furnishings_authorization',
  'Cold session instrument', 'd7000000-0000-4000-8000-000000000001'
);
DO $$
DECLARE
  v_line uuid;
  v_snapshot_item uuid;
  v_err text;
BEGIN
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, product_id, name, ffe_category, item_type,
    status, quantity, unit_price_cents, trade_price_cents, line_total_cents,
    sort_order
  ) VALUES (
    'd7500000-0000-4000-8000-000000000001',
    'd7600000-0000-4000-8000-000000000001',
    'd7750000-0000-4000-8000-000000000001', 'Cold sofa', 'Seating', 'fixed',
    'specified', 1, 100000, 60000, 100000, 0
  ) RETURNING id INTO v_line;

  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  INSERT INTO public.project_ffe_specs (
    ffe_item_id, configuration_id, configuration_snapshot,
    configuration_snapshot_hash, configuration_locked_at
  ) VALUES (
    v_line, 'd7770000-0000-4000-8000-000000000000',
    jsonb_build_object('retailPriceCents', 100000, 'tradePriceCents', 60000),
    repeat('e', 64), now()
  ) ON CONFLICT (ffe_item_id) DO UPDATE SET
    configuration_id = EXCLUDED.configuration_id,
    configuration_snapshot = EXCLUDED.configuration_snapshot,
    configuration_snapshot_hash = EXCLUDED.configuration_snapshot_hash,
    configuration_locked_at = EXCLUDED.configuration_locked_at;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);

  INSERT INTO public.furnishing_authorization_items (
    commercial_document_id, source_proposal_item_id, source_ffe_item_id,
    project_room_id, name, room_name, category, item_type, quantity,
    client_unit_price_cents, client_line_total_cents, sort_order
  ) VALUES (
    'd7400000-0000-4000-8000-000000000009', NULL, v_line,
    'd7600000-0000-4000-8000-000000000001', 'Cold sofa', 'Cold room',
    'Seating', 'fixed', 1, 100000, 100000, 0
  ) RETURNING id INTO v_snapshot_item;

  -- The precondition the whole section rests on. If this ever fails, something
  -- earlier in the file started a rail and this section must move back above it.
  ASSERT current_setting('app.commercial_document_id', true) IS NULL,
    'fixture: a cold session must carry no execution GUC at all (not even empty)';

  -- The attack, as a studio member: stamp the snapshot onto the line and call
  -- it approved. The document column stays NULL — that is what made the old
  -- GUC comparison NULL-vs-NULL. This fixture's configuration hash is
  -- deliberately not the real one, so the workflow, once it runs, refuses.
  BEGIN
    UPDATE public.project_ffe_items SET
      status = 'approved',
      source_authorization_item_id = v_snapshot_item
    WHERE id = v_line;
    ASSERT false, 'a cold-session provenance stamp must not skip the configuration workflow';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'configuration snapshot or hash does not match its approved source',
    format('cold-session carve-out bypass refusal: %L', v_err);
  ASSERT (SELECT source_authorization_item_id IS NULL AND status = 'specified'
          FROM public.project_ffe_items WHERE id = v_line),
    'the refused stamp must not have landed';

  -- And the client, who is nobody''s studio co-member, is refused earlier still.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE public.project_ffe_items SET
      status = 'approved',
      source_authorization_item_id = v_snapshot_item
    WHERE id = v_line;
    ASSERT false, 'a client must not approve a configured line by stamping provenance';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'project not found or not accessible',
    format('cold-session client refusal: %L', v_err);
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
END $$;

-- ── Fixture: an executed design-services engagement (project A) ────────────
-- Its agreement carries a standing 30% furnishings deposit term — section 8
-- proves every later release inherits it.
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd7300000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'Whole-home design services', 'The origin document.', 0, 'draft',
  now() + interval '180 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd7310000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000001',
  'Design development', 'design-development', 30, 'main', 0, 0
);
DO $$
DECLARE v_snapshot jsonb; v_save jsonb;
BEGIN
  v_save := public.upsert_design_services_draft(
    'd7300000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections', 'Installation'),
      'exclusions', jsonb_build_array('Construction administration'),
      'billingCeilingCents', 900000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours to the signed ceiling.',
      'currentRateVersion', 1,
      'furnishingsDepositPercent', 30
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  ASSERT v_save->>'documentKind' = 'design_services', 'origin draft kind';
  ASSERT (SELECT furnishings_deposit_percent FROM public.proposal_service_terms
          WHERE proposal_id = 'd7300000-0000-4000-8000-000000000001') = 30,
    'upsert_design_services_draft must persist furnishingsDepositPercent';
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd7300000-0000-4000-8000-000000000001'
  );
  PERFORM public.send_commercial_document(
    'd7300000-0000-4000-8000-000000000001',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '180 days'
  );
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'd7300000-0000-4000-8000-000000000001', 'Schedule Client'
);
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_executed jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    'd7300000-0000-4000-8000-000000000001', 'Schedule Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean, 'origin countersign';
  INSERT INTO sched_ids VALUES ('project', (v_executed->>'projectId')::uuid);
END $$;

-- ── Fixture: the schedule the studio actually works in ────────────────────
DO $$
DECLARE v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_living uuid; v_study uuid;
BEGIN
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Living room', 0) RETURNING id INTO v_living;
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Study', 1) RETURNING id INTO v_study;
  INSERT INTO sched_ids VALUES ('living', v_living), ('study', v_study);

  -- Living room
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, product_id, name, ffe_category, item_type,
    status, quantity, unit_price_cents, trade_price_cents, markup_percent,
    line_total_cents, budget_max_cents, vendor_id, vendor_name, doc_code,
    sort_order, notes
  ) VALUES
    (v_project, v_living, 'd7750000-0000-4000-8000-000000000001', 'Lounge sofa',
     'Seating', 'fixed', 'specified', 1, 400000, 240000, 66.67, 400000, NULL,
     'd7710000-0000-4000-8000-000000000001', 'Schedule Test Vendor', 'LR-01', 0,
     'Fabric TBC with client.'),
    (v_project, v_living, NULL, 'Side table', 'Casegoods', 'fixed', 'specified',
     2, 50000, 30000, 66.67, 100000, NULL,
     'd7710000-0000-4000-8000-000000000001', 'Schedule Test Vendor', 'LR-02', 1, NULL),
    (v_project, v_living, NULL, 'Room rug', 'Textiles', 'allowance', 'specified',
     1, NULL, NULL, NULL, NULL, 200000, NULL, NULL, 'LR-03', 2, NULL),
    (v_project, v_living, NULL, 'Wall art', 'Art', 'tbd', 'specified',
     1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'LR-04', 3, NULL),
    (v_project, v_living, NULL, 'Entry console', 'Casegoods', 'fixed', 'specified',
     1, 150000, 90000, 66.67, 150000, NULL,
     'd7710000-0000-4000-8000-000000000001', 'Schedule Test Vendor', 'LR-05', 4, NULL),
    (v_project, v_living, NULL, 'Paired sconce', 'Lighting', 'fixed', 'specified',
     1, 60000, 36000, 66.67, 60000, NULL, NULL, NULL, 'LR-06', 6, NULL),
    (v_project, v_living, NULL, 'Paired sconce', 'Lighting', 'fixed', 'specified',
     1, 60000, 36000, 66.67, 60000, NULL, NULL, NULL, 'LR-06', 6, NULL),
    (v_project, v_living, 'd7750000-0000-4000-8000-000000000002', 'Window bench',
     'Seating', 'fixed', 'specified', 1, 90000, 54000, 66.67, 90000, NULL,
     NULL, NULL, 'LR-08', 7, NULL),
    (v_project, v_living, NULL, 'Bar stool', 'Seating', 'fixed', 'specified',
     1, 40000, 24000, 66.67, 40000, NULL, NULL, NULL, 'LR-09', 8, NULL);

  -- Study
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, markup_percent,
    line_total_cents, vendor_id, vendor_name, doc_code, sort_order
  ) VALUES
    (v_project, v_study, 'Writing desk', 'Casegoods', 'fixed', 'specified',
     1, 300000, 180000, 66.67, 300000,
     'd7710000-0000-4000-8000-000000000001', 'Schedule Test Vendor', 'ST-01', 0),
    (v_project, v_study, 'Desk chair', 'Seating', 'fixed', 'specified',
     1, 120000, 72000, 66.67, 120000, NULL, NULL, 'ST-02', 1);

  -- A line nobody filed in a room. Section 2 proves it cannot be released.
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, line_total_cents, sort_order
  ) VALUES (
    v_project, NULL, 'Floating floor lamp', 'Lighting', 'fixed', 'specified',
    1, 30000, 18000, 30000, 9
  );
END $$;

-- Name → id, so the sections below read like the schedule they describe.
INSERT INTO sched_ids (key, value)
SELECT lower(replace(i.name, ' ', '_')) || '_' || i.doc_code, i.id
FROM public.project_ffe_items i
WHERE i.project_id = (SELECT value FROM sched_ids WHERE key = 'project')
  AND i.doc_code IS NOT NULL
ON CONFLICT (key) DO NOTHING;
INSERT INTO sched_ids (key, value)
SELECT 'floating_lamp', i.id FROM public.project_ffe_items i
WHERE i.project_id = (SELECT value FROM sched_ids WHERE key = 'project')
  AND i.name = 'Floating floor lamp';
-- The two identically-priced sconces (section 13) need stable, separate keys.
INSERT INTO sched_ids (key, value)
SELECT 'sconce_a', i.id FROM public.project_ffe_items i
WHERE i.project_id = (SELECT value FROM sched_ids WHERE key = 'project')
  AND i.name = 'Paired sconce' ORDER BY i.id LIMIT 1;
INSERT INTO sched_ids (key, value)
SELECT 'sconce_b', i.id FROM public.project_ffe_items i
WHERE i.project_id = (SELECT value FROM sched_ids WHERE key = 'project')
  AND i.name = 'Paired sconce' ORDER BY i.id DESC LIMIT 1;

-- ── Fixture: the working budget, derived and acknowledged ─────────────────
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_budget jsonb;
  v_published jsonb;
BEGIN
  v_budget := public.derive_working_budget_draft(v_project);
  INSERT INTO sched_ids VALUES ('version1', (v_budget->'version'->>'id')::uuid);
  -- Seven room×category pairs (Living × Seating/Casegoods/Textiles/Art/Lighting,
  -- Study × Casegoods/Seating). The roomless lamp is not one of them.
  ASSERT jsonb_array_length(v_budget->'lines') = 7,
    format('derived budget line count: %s', jsonb_array_length(v_budget->'lines'));
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = (v_budget->'version'->>'id')::uuid
            AND room_name = 'Living room' AND category = 'Seating') = 530000,
    'derived Living/Seating target must sum the scheduled fixed lines';
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = (v_budget->'version'->>'id')::uuid
            AND room_name = 'Living room' AND category = 'Textiles') = 200000,
    'derived allowance target must use the ceiling';
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = (v_budget->'version'->>'id')::uuid
            AND room_name = 'Living room' AND category = 'Art') = 0,
    'a TBD line contributes nothing to the derived target';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_budget_lines
    WHERE budget_version_id = (v_budget->'version'->>'id')::uuid
      AND low_cents <> 0),
    'derivation must leave the range open (low = high = 0)';

  v_published := public.publish_budget_checkpoint(
    v_project, (v_budget->'version'->>'id')::uuid
  );
  INSERT INTO sched_ids VALUES ('checkpoint1', (v_published->>'checkpointId')::uuid);
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
SELECT public.acknowledge_budget_checkpoint(
  (SELECT value FROM sched_ids WHERE key = 'checkpoint1')
);
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) HEADLINE — the whole rail, end to end, into a purchase order. Two fixed
--     lines and one allowance are released, signed, and LINKED. The client's
--     project gains no furniture rows: the schedule was already the furniture.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_living uuid := (SELECT value FROM sched_ids WHERE key = 'living');
  v_sofa uuid := (SELECT value FROM sched_ids WHERE key = 'lounge_sofa_LR-01');
  v_table uuid := (SELECT value FROM sched_ids WHERE key = 'side_table_LR-02');
  v_rug uuid := (SELECT value FROM sched_ids WHERE key = 'room_rug_LR-03');
  v_release jsonb;
  v_snapshot jsonb;
  v_before integer;
  v_after integer;
  v_execution jsonb;
BEGIN
  SELECT count(*) INTO v_before FROM public.project_ffe_items WHERE project_id = v_project;

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Release one', ARRAY[v_sofa, v_table, v_rug], NULL
  );
  INSERT INTO sched_ids VALUES
    ('release1', (v_release->>'proposalId')::uuid),
    ('release1_doc', (v_release->>'documentId')::uuid);
  ASSERT (v_release->>'itemCount')::integer = 3
     AND v_release->>'commercialState' = 'draft'
     AND (v_release->>'budgetCheckpointId')::uuid
         = (SELECT value FROM sched_ids WHERE key = 'checkpoint1'),
    'release must snapshot three lines against the acknowledged checkpoint';
  -- 400000 + 100000 + 200000 (the allowance at its ceiling)
  ASSERT (SELECT total_amount FROM public.proposals
          WHERE id = (v_release->>'proposalId')::uuid) = 700000,
    'release total must sum fixed line totals and allowance ceilings';
  ASSERT (SELECT deposit_percent FROM public.proposals
          WHERE id = (v_release->>'proposalId')::uuid) = 30,
    'a NULL deposit argument must inherit the agreement term';
  ASSERT NOT EXISTS (SELECT 1 FROM public.proposal_items
    WHERE proposal_id = (v_release->>'proposalId')::uuid),
    'the release must clone NOTHING into proposal_items';

  -- Snapshot provenance and room identity.
  ASSERT (SELECT count(*) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = (v_release->>'documentId')::uuid
            AND a.source_ffe_item_id IS NOT NULL
            AND a.source_proposal_item_id IS NULL
            AND a.project_room_id = v_living
            AND a.room_name = 'Living room') = 3,
    'every snapshot must cite its schedule line, its room, and no proposal item';
  ASSERT (SELECT client_line_total_cents FROM public.furnishing_authorization_items
          WHERE source_ffe_item_id = v_rug) = 200000
     AND (SELECT client_unit_price_cents FROM public.furnishing_authorization_items
          WHERE source_ffe_item_id = v_rug) = 200000
     AND (SELECT item_type FROM public.furnishing_authorization_items
          WHERE source_ffe_item_id = v_rug) = 'allowance',
    'an allowance is snapshotted at its ceiling';
  ASSERT (SELECT snapshot->>'productImageUrl' FROM public.furnishing_authorization_items
          WHERE source_ffe_item_id = v_sofa) = 'https://cdn.test.invalid/sofa-hero.jpg',
    'the snapshot must carry the product hero image';
  ASSERT (SELECT snapshot->>'notes' FROM public.furnishing_authorization_items
          WHERE source_ffe_item_id = v_sofa) = 'Fabric TBC with client.',
    'the snapshot must carry the line notes';

  v_snapshot := public.get_commercial_document_send_snapshot(
    (v_release->>'proposalId')::uuid
  );
  PERFORM public.send_commercial_document(
    (v_release->>'proposalId')::uuid,
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );

  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  v_execution := public.execute_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Schedule Client'
  );
  ASSERT (v_execution->>'newlyExecuted')::boolean, 'first execution';
  ASSERT jsonb_array_length(v_execution->'appliedItemIds') = 3,
    'execution must apply all three schedule lines';
  INSERT INTO sched_ids VALUES ('deposit1', (v_execution->>'depositInvoiceId')::uuid);
  ASSERT (v_execution->>'depositRequiredCents')::integer = 210000,
    'deposit must be 30% of the released total';

  SELECT count(*) INTO v_after FROM public.project_ffe_items WHERE project_id = v_project;
  ASSERT v_after = v_before,
    format('execution minted %s new schedule rows; it must link, never insert',
           v_after - v_before);
  ASSERT (SELECT count(*) FROM public.project_ffe_items i
          WHERE i.id = ANY (ARRAY[v_sofa, v_table, v_rug])
            AND i.source_commercial_document_id = (v_release->>'documentId')::uuid
            AND i.source_authorization_item_id IS NOT NULL
            AND i.status = 'approved'
            AND i.project_room_id = v_living) = 3,
    'released lines must be linked, ratcheted to approved, and keep their room';

  -- The deposit gates the purchase order; paying it opens the gate.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.create_purchase_order(
      v_project, 'd7710000-0000-4000-8000-000000000001',
      'full_upfront', ARRAY[v_sofa]
    );
    ASSERT false, 'unpaid furnishings deposit must block a purchase order';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.record_invoice_payment(
    (v_execution->>'depositInvoiceId')::uuid, 210000, 'check', 'SCHED-DEP-1', now(), NULL
  );
  PERFORM public.create_purchase_order(
    v_project, 'd7710000-0000-4000-8000-000000000001',
    'full_upfront', ARRAY[v_sofa]
  );
  ASSERT (SELECT purchase_order_id IS NOT NULL FROM public.project_ffe_items
          WHERE id = v_sofa),
    'a paid, authorized fixed line must accept a purchase order';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1b) "Agreed so far", live. The stamped authorized_cents froze at PUBLICATION
--      — necessarily before any release could be minted against the checkpoint,
--      because the checkpoint has to be acknowledged first. So the stamp reads
--      $0 for a version that has since been signed against, and a client grid
--      rendering the stamp told a client who had just signed that they had
--      agreed to nothing. liveAuthorizedCents answers "now", from the same
--      rollup, with no re-publish anywhere in the sentence.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_version uuid := (SELECT value FROM sched_ids WHERE key = 'version1');
  v_budget jsonb;
  v_line jsonb;
BEGIN
  -- The stamp is untouched by execution. That is the point of a stamp.
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_budget_lines
    WHERE budget_version_id = v_version AND authorized_cents <> 0),
    'publication stamped a non-zero authorized figure before anything was signed';

  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  v_budget := public.get_project_working_budget(v_project);
  ASSERT (v_budget->'version'->>'id')::uuid = v_version,
    'the client reads the published version';

  SELECT value INTO v_line FROM jsonb_array_elements(v_budget->'lines') AS value
  WHERE value->>'roomName' = 'Living room' AND value->>'category' = 'Seating';
  ASSERT (v_line->>'authorizedCents')::bigint = 0,
    'the stamped figure must still say what was true at publication';
  ASSERT (v_line->>'liveAuthorizedCents')::bigint = 400000,
    format('Living/Seating live authorized: %s (expected the released sofa)',
           v_line->>'liveAuthorizedCents');
  ASSERT (v_line->>'scheduledCents')::bigint = 530000,
    'the schedule rollup is unchanged — releasing is not scheduling';

  SELECT value INTO v_line FROM jsonb_array_elements(v_budget->'lines') AS value
  WHERE value->>'roomName' = 'Living room' AND value->>'category' = 'Casegoods';
  ASSERT (v_line->>'liveAuthorizedCents')::bigint = 100000,
    format('Living/Casegoods live authorized: %s (side table only; the console '
           || 'was never released)', v_line->>'liveAuthorizedCents');

  -- An allowance counts at the CEILING it was signed at, exactly as the publish
  -- stamp counts it: client_line_total_cents, not whatever it resolves to.
  SELECT value INTO v_line FROM jsonb_array_elements(v_budget->'lines') AS value
  WHERE value->>'roomName' = 'Living room' AND value->>'category' = 'Textiles';
  ASSERT (v_line->>'liveAuthorizedCents')::bigint = 200000,
    format('Living/Textiles live authorized: %s (the signed ceiling)',
           v_line->>'liveAuthorizedCents');

  -- A room nobody released into stays at zero. "Agreed so far" is not "planned".
  SELECT value INTO v_line FROM jsonb_array_elements(v_budget->'lines') AS value
  WHERE value->>'roomName' = 'Study' AND value->>'category' = 'Casegoods';
  ASSERT (v_line->>'liveAuthorizedCents')::bigint = 0,
    'an unreleased room must not report authorized money';

  ASSERT (v_budget->'version'->>'liveAuthorizedTotalCents')::bigint = 700000,
    format('project live authorized total: %s (expected the release total)',
           v_budget->'version'->>'liveAuthorizedTotalCents');
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1c) The client's list names the project a furnishings authorization is bound
--      to. A release is minted straight from the schedule and never goes through
--      activate_proposal_as_project, so proposals.project_id stays NULL and the
--      binding lives one table over. A client surface that filters this list by
--      project — the awaiting-signature cards do — saw none of them.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_release uuid := (SELECT value FROM sched_ids WHERE key = 'release1');
  v_row jsonb;
BEGIN
  -- The column really is empty. Without that, this section proves nothing.
  ASSERT (SELECT project_id IS NULL FROM public.proposals WHERE id = v_release),
    'a furnishings authorization is expected to carry no proposals.project_id';
  ASSERT (SELECT project_id FROM public.project_commercial_documents
          WHERE proposal_id = v_release) = v_project,
    'the binding lives on project_commercial_documents';

  SELECT value INTO v_row
  FROM jsonb_array_elements(public.list_client_proposals()) AS value
  WHERE value->>'id' = v_release::text;
  ASSERT v_row IS NOT NULL, 'the client must see their own executed release';
  ASSERT (v_row->>'project_id')::uuid = v_project,
    format('client list project_id for a furnishings authorization: %s',
           COALESCE(v_row->>'project_id', 'ABSENT'));
  -- The sibling object hangs off the same id — a payload naming a project_id
  -- while `project` reads NULL is the next consumer's trap.
  ASSERT (v_row->'project'->>'id')::uuid = v_project,
    'the project object must resolve from the same binding';

  -- The design-services origin is unaffected: it already carried the column.
  ASSERT (SELECT count(*) FROM jsonb_array_elements(public.list_client_proposals()) AS value
          WHERE (value->>'project_id')::uuid = v_project) >= 1,
    'the coalesce must not drop rows that already had a project_id';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1d) The authorization document the client actually reads. Its shell files
--      the named lines by ROOM and states the terms — total, deposit, percent —
--      so the keys it renders from are pinned here rather than discovered by a
--      blank strip in production.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_release uuid := (SELECT value FROM sched_ids WHERE key = 'release1');
  v_bundle jsonb;
  v_items jsonb;
BEGIN
  v_bundle := public.get_client_commercial_document_bundle(v_release);
  ASSERT (v_bundle->'document'->>'totalAmountCents')::bigint = 700000,
    format('bundle totalAmountCents: %s', v_bundle->'document'->>'totalAmountCents');
  ASSERT (v_bundle->'document'->>'depositPercent')::numeric = 30,
    format('bundle depositPercent: %s', v_bundle->'document'->>'depositPercent');
  ASSERT (v_bundle->'furnishings'->>'depositRequiredCents')::bigint = 210000,
    'the deposit the strip states must be the one the instrument asks for';

  v_items := v_bundle->'furnishings'->'items';
  ASSERT jsonb_array_length(v_items) = 3, 'the document names all three lines';
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) AS item
    WHERE item->>'roomName' IS NULL
  ), 'every named line must carry the room it files under';
  ASSERT (SELECT count(DISTINCT item->>'roomName') FROM jsonb_array_elements(v_items) AS item) = 1
     AND (SELECT DISTINCT item->>'roomName' FROM jsonb_array_elements(v_items) AS item) = 'Living room',
    'this release is one room; the grouping must not invent a second';

  -- The invariant the document's total rests on. clientLineTotalCents is the
  -- authoritative per-line figure — quantity × clientUnitPriceCents truncates
  -- for an allowance whose ceiling does not divide evenly — so the shell sums
  -- the line totals and they must reconcile to the document's own total.
  ASSERT (SELECT SUM((item->>'clientLineTotalCents')::bigint)
          FROM jsonb_array_elements(v_items) AS item)
         = (v_bundle->'document'->>'totalAmountCents')::bigint,
    'the sum of the named line totals must equal the document total';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) Coverage is HARD. A room the client never saw a budget for cannot be
--     authorized, and a line filed in no room cannot prove coverage at all.
--     Two different defects, two different sentences.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_pantry uuid;
  v_cabinet uuid;
  v_lamp uuid := (SELECT value FROM sched_ids WHERE key = 'floating_lamp');
  v_err text;
BEGIN
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Pantry', 2) RETURNING id INTO v_pantry;
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, line_total_cents, sort_order
  ) VALUES (
    v_project, v_pantry, 'Pantry cabinet', 'Casegoods', 'fixed', 'specified',
    1, 80000, 48000, 80000, 10
  ) RETURNING id INTO v_cabinet;
  INSERT INTO sched_ids VALUES ('pantry', v_pantry), ('cabinet', v_cabinet);

  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Uncovered room release', ARRAY[v_cabinet], NULL
    );
    ASSERT false, 'a room outside the acknowledged budget must not be releasable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'room "Pantry" is not covered by the acknowledged budget',
    format('coverage refusal named the wrong thing: %L', v_err);

  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Roomless release', ARRAY[v_lamp], NULL
    );
    ASSERT false, 'a roomless line must not be releasable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%has no room; file it in a room before releasing',
    format('roomless refusal must be distinct from the coverage refusal: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) A line must be resolved, and it may sit on exactly one live instrument.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_art uuid := (SELECT value FROM sched_ids WHERE key = 'wall_art_LR-04');
  v_sofa uuid := (SELECT value FROM sched_ids WHERE key = 'lounge_sofa_LR-01');
  v_chair uuid := (SELECT value FROM sched_ids WHERE key = 'desk_chair_ST-02');
  v_hold jsonb;
  v_err text;
BEGIN
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'TBD release', ARRAY[v_art], NULL
    );
    ASSERT false, 'a TBD line must not be releasable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%still TBD; resolve it before releasing',
    format('TBD refusal: %L', v_err);

  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Double release', ARRAY[v_sofa], NULL
    );
    ASSERT false, 'a line on an executed instrument must not be re-released';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%already named by a live authorization',
    format('executed-instrument refusal: %L', v_err);

  -- A DRAFT instrument holds its lines just as firmly as an executed one.
  v_hold := public.create_furnishings_authorization_from_schedule(
    v_project, 'Draft hold', ARRAY[v_chair], NULL
  );
  INSERT INTO sched_ids VALUES ('draft_hold', (v_hold->>'proposalId')::uuid);
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Draft collision', ARRAY[v_chair], NULL
    );
    ASSERT false, 'a line on a draft instrument must not be re-released';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%already named by a live authorization',
    format('draft-instrument refusal: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) An allowance is signed as a CEILING. The studio resolves it afterwards;
--     the purchase-order gate accepts anything at or under what was signed and
--     refuses everything else — including a quantity the client never saw.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_rug uuid := (SELECT value FROM sched_ids WHERE key = 'room_rug_LR-03');
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  -- Over the ceiling.
  UPDATE public.project_ffe_items SET
    unit_price_cents = 250000, line_total_cents = 250000,
    trade_price_cents = 150000, vendor_id = 'd7710000-0000-4000-8000-000000000001',
    vendor_name = 'Schedule Test Vendor'
  WHERE id = v_rug;
  BEGIN
    PERFORM public.create_purchase_order(
      v_project, 'd7710000-0000-4000-8000-000000000001', 'full_upfront', ARRAY[v_rug]
    );
    ASSERT false, 'an allowance resolved above its ceiling must not reach a PO';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Under the ceiling, but at a quantity the client did not sign.
  UPDATE public.project_ffe_items SET
    quantity = 2, unit_price_cents = 50000, line_total_cents = 100000
  WHERE id = v_rug;
  BEGIN
    PERFORM public.create_purchase_order(
      v_project, 'd7710000-0000-4000-8000-000000000001', 'full_upfront', ARRAY[v_rug]
    );
    ASSERT false, 'an allowance at a changed quantity must not reach a PO';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Resolved honestly: signed quantity, consistent arithmetic, under ceiling.
  UPDATE public.project_ffe_items SET
    quantity = 1, unit_price_cents = 180000, line_total_cents = 180000
  WHERE id = v_rug;
  v_po := public.create_purchase_order(
    v_project, 'd7710000-0000-4000-8000-000000000001', 'full_upfront', ARRAY[v_rug]
  );
  ASSERT (SELECT purchase_order_id FROM public.project_ffe_items WHERE id = v_rug) = v_po.id,
    'an allowance resolved under its signed ceiling must reach a PO';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) While a client is LOOKING at an instrument, the money under it holds
--     still. Everything else on the line stays the studio's to edit, and the
--     refusal names the instrument and the way out.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_desk uuid := (SELECT value FROM sched_ids WHERE key = 'writing_desk_ST-01');
  v_release jsonb;
  v_snapshot jsonb;
  v_err text;
BEGIN
  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Release two', ARRAY[v_desk], NULL
  );
  INSERT INTO sched_ids VALUES ('release2', (v_release->>'proposalId')::uuid);
  v_snapshot := public.get_commercial_document_send_snapshot(
    (v_release->>'proposalId')::uuid
  );
  PERFORM public.send_commercial_document(
    (v_release->>'proposalId')::uuid,
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );

  BEGIN
    UPDATE public.project_ffe_items SET unit_price_cents = 310000,
      line_total_cents = 310000 WHERE id = v_desk;
    ASSERT false, 'a price edit under a sent instrument must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'schedule line quantity or price is locked while it sits on sent authorization "Release two"; void the authorization to edit',
    format('soft lock said the wrong thing: %L', v_err);
  ASSERT (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = v_desk) = 300000,
    'the refused price edit still landed';

  -- The lock is on money, not on the line. Working notes stay working notes.
  UPDATE public.project_ffe_items SET notes = 'Client asked about the finish.'
  WHERE id = v_desk;
  ASSERT (SELECT notes FROM public.project_ffe_items WHERE id = v_desk)
         = 'Client asked about the finish.',
    'the soft lock must not freeze non-money fields';

  -- Void it and the line is the studio's again.
  PERFORM public.void_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Client changed the desk direction.'
  );
  UPDATE public.project_ffe_items SET unit_price_cents = 310000,
    line_total_cents = 310000 WHERE id = v_desk;
  ASSERT (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = v_desk) = 310000,
    'voiding must release the soft lock';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) Voiding: a draft or sent instrument can be retired with an audited
--     reason; an executed one cannot. Freed lines are selectable again, and
--     the retired document is terminal on every rail.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_hold uuid := (SELECT value FROM sched_ids WHERE key = 'draft_hold');
  v_release1 uuid := (SELECT value FROM sched_ids WHERE key = 'release1');
  v_chair uuid := (SELECT value FROM sched_ids WHERE key = 'desk_chair_ST-02');
  v_console uuid := (SELECT value FROM sched_ids WHERE key = 'entry_console_LR-05');
  v_voided jsonb;
  v_release jsonb;
  v_snapshot jsonb;
  v_err text;
BEGIN
  -- A reason is not a formality.
  BEGIN
    PERFORM public.void_furnishings_authorization(v_hold, 'no');
    ASSERT false, 'voiding must require a real reason';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  v_voided := public.void_furnishings_authorization(v_hold, 'Client deferred the study.');
  ASSERT v_voided->>'commercialState' = 'superseded'
     AND (v_voided->'freedLineIds')->>0 = v_chair::text,
    'voiding a draft must report the schedule lines it freed';
  ASSERT (SELECT superseded_at IS NOT NULL
                 AND superseded_reason = 'Client deferred the study.'
                 AND status = 'draft'
          FROM public.proposals WHERE id = v_hold),
    'a voided draft carries its audit and keeps its legacy status column';

  -- Freed means freed: the chair goes onto a new instrument.
  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Release three', ARRAY[v_chair, v_console], NULL
  );
  INSERT INTO sched_ids VALUES ('release3', (v_release->>'proposalId')::uuid);
  v_snapshot := public.get_commercial_document_send_snapshot(
    (v_release->>'proposalId')::uuid
  );
  PERFORM public.send_commercial_document(
    (v_release->>'proposalId')::uuid,
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );
  -- A sent instrument voids too.
  PERFORM public.void_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Superseded by a combined release.'
  );

  -- A retired document is terminal: it cannot be re-sent.
  BEGIN
    v_snapshot := public.get_commercial_document_send_snapshot(v_hold);
    PERFORM public.send_commercial_document(
      v_hold, v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
    );
    ASSERT false, 'a voided instrument must not be sendable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is terminal', format('voided send refusal: %L', v_err);

  -- Nor executed.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.execute_furnishings_authorization(
      (v_release->>'proposalId')::uuid, 'Schedule Client'
    );
    ASSERT false, 'a voided instrument must not be executable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- And an executed instrument is past voiding.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.void_furnishings_authorization(v_release1, 'Too late for this one.');
    ASSERT false, 'an executed instrument must not be voidable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is executed and can no longer be voided',
    format('executed void refusal: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) Executing twice is the same act twice, not two acts. The retry answers
--     with the same applied lines and mints nothing.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_release1 uuid := (SELECT value FROM sched_ids WHERE key = 'release1');
  v_before integer;
  v_first jsonb;
  v_retry jsonb;
BEGIN
  SELECT count(*) INTO v_before FROM public.project_ffe_items WHERE project_id = v_project;
  SELECT to_jsonb(array_agg(i.id ORDER BY i.id)) INTO v_first
  FROM public.project_ffe_items i
  WHERE i.source_commercial_document_id = (SELECT value FROM sched_ids WHERE key = 'release1_doc');

  v_retry := public.execute_furnishings_authorization(v_release1, 'Schedule Client');
  ASSERT NOT (v_retry->>'newlyExecuted')::boolean, 'a retry is not a new execution';
  ASSERT v_retry->'appliedItemIds' = v_first,
    'a retry must answer with the same applied schedule lines';
  ASSERT (SELECT count(*) FROM public.project_ffe_items WHERE project_id = v_project) = v_before,
    'a retry must mint nothing';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) The deposit: the agreement's standing term, overridable per release,
--     with a house default when the engagement never named one.
-- ═══════════════════════════════════════════════════════════════════════════
-- Release one already proved the standing 30% term (section 1). Here: an
-- explicit argument wins, and a second engagement with no term falls to 50.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_stool uuid := (SELECT value FROM sched_ids WHERE key = 'bar_stool_LR-09');
  v_release jsonb;
BEGIN
  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Release four', ARRAY[v_stool], 10
  );
  ASSERT (SELECT deposit_percent FROM public.proposals
          WHERE id = (v_release->>'proposalId')::uuid) = 10,
    'an explicit deposit argument must beat the agreement term';
  PERFORM public.void_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Deposit probe, retired immediately.'
  );
END $$;

-- Project B: the same studio and client, an agreement with NO furnishings
-- deposit term, and a single scheduled line.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd7300000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'Guest house design services', 'A second engagement.', 0, 'draft',
  now() + interval '180 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd7310000-0000-4000-8000-000000000002',
  'd7300000-0000-4000-8000-000000000002',
  'Design development', 'design-development', 30, 'main', 0, 0
);
DO $$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd7300000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'scope', 'Guest house.', 'deliverables', jsonb_build_array('Concept'),
      'exclusions', jsonb_build_array('Construction'),
      'billingCeilingCents', 100000, 'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate', 'billingCadence', 'monthly',
      'currency', 'USD', 'terms', 'Hourly.', 'currentRateVersion', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  ASSERT (SELECT furnishings_deposit_percent FROM public.proposal_service_terms
          WHERE proposal_id = 'd7300000-0000-4000-8000-000000000002') IS NULL,
    'an omitted furnishings deposit term must stay NULL';
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd7300000-0000-4000-8000-000000000002'
  );
  PERFORM public.send_commercial_document(
    'd7300000-0000-4000-8000-000000000002',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '180 days'
  );
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'd7300000-0000-4000-8000-000000000002', 'Schedule Client'
);
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_executed jsonb;
  v_project uuid;
  v_room uuid;
  v_line uuid;
  v_budget jsonb;
  v_published jsonb;
  v_release jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    'd7300000-0000-4000-8000-000000000002', 'Schedule Designer'
  );
  v_project := (v_executed->>'projectId')::uuid;
  INSERT INTO sched_ids VALUES ('project_b', v_project);
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Guest bedroom', 0) RETURNING id INTO v_room;
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, line_total_cents, sort_order
  ) VALUES (
    v_project, v_room, 'Guest bed', 'Beds', 'fixed', 'specified',
    1, 200000, 120000, 200000, 0
  ) RETURNING id INTO v_line;

  v_budget := public.derive_working_budget_draft(v_project);
  v_published := public.publish_budget_checkpoint(
    v_project, (v_budget->'version'->>'id')::uuid
  );
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  PERFORM public.acknowledge_budget_checkpoint((v_published->>'checkpointId')::uuid);
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Guest release', ARRAY[v_line], NULL
  );
  ASSERT (SELECT deposit_percent FROM public.proposals
          WHERE id = (v_release->>'proposalId')::uuid) = 50,
    'an engagement with no furnishings deposit term must fall to the 50% default';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) The working budget is DERIVED, never dictated. Re-deriving adds what the
--     schedule grew and leaves the studio's own judgement alone. Publication
--     stamps the coverage picture; acknowledgement re-verifies it.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_budget jsonb;
  v_version2 uuid;
  v_hall uuid;
  v_edited integer;
  v_published jsonb;
BEGIN
  -- Version 1 is published, so this mints version 2 from the schedule.
  v_budget := public.derive_working_budget_draft(v_project);
  v_version2 := (v_budget->'version'->>'id')::uuid;
  ASSERT v_version2 IS DISTINCT FROM (SELECT value FROM sched_ids WHERE key = 'version1'),
    'deriving against a published version must mint the next one';
  ASSERT (v_budget->'version'->>'version')::integer = 2, 'version numbering';
  INSERT INTO sched_ids VALUES ('version2', v_version2);
  -- Version 2 sees the Pantry that arrived after version 1 was published.
  ASSERT EXISTS (SELECT 1 FROM public.project_budget_lines
    WHERE budget_version_id = v_version2 AND room_name = 'Pantry'),
    'the derivation must pick up rooms added since the last version';

  -- The studio narrows one line by hand; a new room appears in the schedule.
  UPDATE public.project_budget_lines SET target_cents = 999999
  WHERE budget_version_id = v_version2 AND room_name = 'Living room'
    AND category = 'Seating';
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Hall', 3) RETURNING id INTO v_hall;
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, line_total_cents, sort_order
  ) VALUES (
    v_project, v_hall, 'Hall runner', 'Textiles', 'fixed', 'specified',
    1, 70000, 42000, 70000, 11
  );

  PERFORM public.derive_working_budget_draft(v_project);
  SELECT target_cents INTO v_edited FROM public.project_budget_lines
  WHERE budget_version_id = v_version2 AND room_name = 'Living room'
    AND category = 'Seating';
  ASSERT v_edited = 999999,
    format('re-deriving overwrote a hand-edited target (%s)', v_edited);
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version2 AND room_name = 'Hall'
            AND category = 'Textiles') = 70000,
    're-deriving must add the room the schedule grew';

  -- A version of derived lines is (0, target, 0). It must publish cleanly —
  -- the low ≤ target ≤ high ordering CHECKs are gone on purpose.
  v_published := public.publish_budget_checkpoint(v_project, v_version2);
  INSERT INTO sched_ids VALUES ('checkpoint2', (v_published->>'checkpointId')::uuid);
  ASSERT (SELECT low_total_cents = 0 AND high_total_cents = 0
                 AND target_total_cents > 0
          FROM public.project_budget_versions WHERE id = v_version2),
    'a derived version must publish with an open range and a real target';

  -- Publication stamped the coverage picture.
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version2 AND room_name = 'Study'
            AND category = 'Casegoods') = 310000,
    'publication must stamp the scheduled sum (the desk repriced in section 5)';
  ASSERT (SELECT authorized_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version2 AND room_name = 'Living room'
            AND category = 'Textiles') = 200000,
    'publication must stamp the executed allowance ceiling as authorized';
  ASSERT (SELECT authorized_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version2 AND room_name = 'Pantry'
            AND category = 'Casegoods') = 0,
    'an unauthorized room×category must stamp zero authorized';

  -- The stamps are inside the evidence hash, so acknowledgement verifies them.
  ASSERT (SELECT snapshot_fingerprint FROM public.project_budget_checkpoints
          WHERE id = (v_published->>'checkpointId')::uuid)
         = public._budget_version_fingerprint(v_version2),
    'checkpoint fingerprint must describe the stamped version';

  v_budget := public.get_project_working_budget(v_project);
  ASSERT (SELECT (line->>'scheduledCents')::integer FROM jsonb_array_elements(v_budget->'lines') AS line
          WHERE line->>'roomName' = 'Study' AND line->>'category' = 'Casegoods') = 310000
     AND (SELECT (line->>'authorizedCents')::integer FROM jsonb_array_elements(v_budget->'lines') AS line
          WHERE line->>'roomName' = 'Living room' AND line->>'category' = 'Textiles') = 200000,
    'the working budget read must carry scheduled and authorized cents';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE v_ack jsonb;
BEGIN
  v_ack := public.acknowledge_budget_checkpoint(
    (SELECT value FROM sched_ids WHERE key = 'checkpoint2')
  );
  ASSERT v_ack->>'status' = 'acknowledged',
    'a stamped checkpoint must acknowledge (its fingerprint verifies)';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) The re-authoring rail is retired. A fully authorized studio, on a
--      project that satisfies every other precondition, still gets a sentence
--      pointing at the new ceremony.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.create_furnishing_wave_draft(v_project, 'Old ceremony');
    ASSERT false, 'create_furnishing_wave_draft must be retired';
  EXCEPTION WHEN feature_not_supported THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is retired; release from the schedule (create_furnishings_authorization_from_schedule)',
    format('wave draft retirement message: %L', v_err);
  BEGIN
    PERFORM public.create_furnishings_authorization(
      v_project, 'Old ceremony', 'd7300000-0000-4000-8000-000000000001'
    );
    ASSERT false, 'create_furnishings_authorization must be retired';
  EXCEPTION WHEN feature_not_supported THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%is retired; release from the schedule (create_furnishings_authorization_from_schedule)',
    format('wave retirement message: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (11) The client's read of their own selections: everything they authorized,
--      nothing about what it cost the studio to buy.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_sofa uuid := (SELECT value FROM sched_ids WHERE key = 'lounge_sofa_LR-01');
  v_rug uuid := (SELECT value FROM sched_ids WHERE key = 'room_rug_LR-03');
  v_payload jsonb;
  v_sofa_row jsonb;
  v_rug_row jsonb;
BEGIN
  v_payload := public.get_client_project_selections(v_project);
  ASSERT v_payload->>'origin' = 'commercial',
    'a project with a design-services origin reads as commercial';
  ASSERT jsonb_array_length(v_payload->'selections') = 3,
    format('client sees %s selections; expected the three executed lines',
           jsonb_array_length(v_payload->'selections'));

  SELECT value INTO v_sofa_row FROM jsonb_array_elements(v_payload->'selections') AS value
  WHERE value->>'id' = v_sofa::text;
  ASSERT v_sofa_row->>'roomName' = 'Living room'
     AND (v_sofa_row->>'clientLineTotalCents')::integer = 400000
     AND v_sofa_row->>'status' = 'ordered'
     AND v_sofa_row->>'imageUrl' = 'https://cdn.test.invalid/sofa-hero.jpg'
     AND v_sofa_row->>'docCode' = 'LR-01'
     AND v_sofa_row->'instrument'->>'name' = 'Release one'
     AND v_sofa_row->'instrument'->>'executedAt' IS NOT NULL,
    'a fixed selection must name its room, price, image, and instrument';
  ASSERT v_sofa_row->'allowance' = 'null'::jsonb,
    'a fixed selection carries no allowance block';

  -- Section 4 priced this allowance honestly (1 × 180000, under the signed
  -- 200000 ceiling) and put it on a purchase order — but it left the SCHEDULE
  -- still calling the line an allowance. So the client is still owed the
  -- ceiling, not a flat price: a provisional number under a ceiling is not a
  -- selection. resolvedCents is NULL, and NULL is the whole signal the client
  -- card branches on.
  SELECT value INTO v_rug_row FROM jsonb_array_elements(v_payload->'selections') AS value
  WHERE value->>'id' = v_rug::text;
  ASSERT (v_rug_row->'allowance'->>'ceilingCents')::integer = 200000,
    'an allowance must show the ceiling the client signed';
  ASSERT v_rug_row->'allowance' ? 'resolvedCents'
     AND v_rug_row->'allowance'->>'resolvedCents' IS NULL,
    format('an allowance the schedule still types as an allowance must read '
           || 'unresolved, whatever price sits on it; got %s',
           v_rug_row->'allowance'->>'resolvedCents');
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items WHERE id = v_rug) = 180000,
    'the live price is present — the read withholds it on purpose, not by accident';

  ASSERT v_payload::text !~* 'trade|markup',
    'the client selections payload leaked a trade-side field';
END $$;
-- (Section 19 carries the other half: once the schedule stops calling the line
-- an allowance, resolvedCents reports what it resolved to.)
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.get_client_project_selections(
      (SELECT value FROM sched_ids WHERE key = 'project')
    );
    ASSERT false, 'a stranger must not read a project''s selections';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found or access denied', format('stranger refusal: %L', v_err);
END $$;
-- The RPC is the only client door: the raw table is closed on a commercial
-- project (00414 narrowed the client SELECT policy to legacy-origin projects).
SELECT set_config('sched.project',
  (SELECT value::text FROM sched_ids WHERE key = 'project'), true);
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.project_ffe_items
  WHERE project_id = current_setting('sched.project')::uuid;
  ASSERT v_rows = 0,
    format('client read %s raw schedule rows on a commercial project', v_rows);
END $$;
RESET ROLE;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (12) A configured line can be authorized. The configuration approval that
--      normally runs at status→approved is DEFERRED to purchase-order linking
--      (00413's lock_configuration_snapshot_on_po_link), because the actor at
--      execution is the client and the configuration workflow is a studio act.
--      The price lock itself is untouched.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, version, schema_revision, status,
  normalized_selection, component_quantities, evaluation, snapshot, snapshot_hash,
  is_complete, is_valid, retail_price_cents, trade_price_cents,
  approved_by, approved_at
) VALUES (
  'd7770000-0000-4000-8000-000000000001',
  'd7750000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000001', 1, 1, 'approved',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_object('retailPriceCents', 90000, 'tradePriceCents', 54000),
  repeat('c', 64), true, true, 90000, 54000,
  'd7000000-0000-4000-8000-000000000001', now()
);
-- A spec row is minted for every schedule line by the spec-book trigger, and
-- its configuration linkage is guarded — adopt the configuration workflow
-- capability the way 00403's own RPCs do.
SELECT set_config('patina.configuration_spec_workflow', '00403', true);
INSERT INTO public.project_ffe_specs (
  ffe_item_id, configuration_id, configuration_snapshot,
  configuration_snapshot_hash, configuration_locked_at
) VALUES (
  (SELECT value FROM sched_ids WHERE key = 'window_bench_LR-08'),
  'd7770000-0000-4000-8000-000000000001',
  jsonb_build_object('retailPriceCents', 90000, 'tradePriceCents', 54000),
  repeat('c', 64), now()
) ON CONFLICT (ffe_item_id) DO UPDATE SET
  configuration_id = EXCLUDED.configuration_id,
  configuration_snapshot = EXCLUDED.configuration_snapshot,
  configuration_snapshot_hash = EXCLUDED.configuration_snapshot_hash,
  configuration_locked_at = EXCLUDED.configuration_locked_at;
SELECT set_config('patina.configuration_spec_workflow', '', true);
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_bench uuid := (SELECT value FROM sched_ids WHERE key = 'window_bench_LR-08');
  v_release jsonb;
  v_snapshot jsonb;
  v_err text;
BEGIN
  -- The configuration price lock still holds against an ordinary studio edit.
  BEGIN
    UPDATE public.project_ffe_items SET unit_price_cents = 95000,
      line_total_cents = 95000 WHERE id = v_bench;
    ASSERT false, 'a locked configuration must still freeze the line price';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%configuration-derived project line fields are locked%',
    format('configuration lock message: %L', v_err);

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Release five', ARRAY[v_bench], NULL
  );
  v_snapshot := public.get_commercial_document_send_snapshot(
    (v_release->>'proposalId')::uuid
  );
  PERFORM public.send_commercial_document(
    (v_release->>'proposalId')::uuid,
    v_snapshot->>'documentFingerprint', NULL, now() + interval '30 days'
  );
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  PERFORM public.execute_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Schedule Client'
  );
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
  ASSERT (SELECT status = 'approved' AND unit_price_cents = 90000
                 AND line_total_cents = 90000
          FROM public.project_ffe_items WHERE id = v_bench),
    'executing over a configured line must link it without touching its prices';

  -- The lock is still there afterwards.
  BEGIN
    UPDATE public.project_ffe_items SET unit_price_cents = 95000,
      line_total_cents = 95000 WHERE id = v_bench;
    ASSERT false, 'the configuration lock must survive the authorization link';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13) The signed evidence is keyed on WHICH LINE, not only on the money. Two
--      instruments over two identically-priced, identically-named lines must
--      not hash to the same furnishings object.
--
--      Comparing whole document fingerprints would prove nothing here —
--      _proposal_review_fingerprint already mixes in the proposal id, so any
--      two documents differ. The test therefore reconstructs the furnishings
--      projection itself: the pre-00422 shape (which omitted the citation) and
--      the current one, over the same two snapshot rows.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_a uuid := (SELECT value FROM sched_ids WHERE key = 'sconce_a');
  v_b uuid := (SELECT value FROM sched_ids WHERE key = 'sconce_b');
  v_release_a jsonb;
  v_release_b jsonb;
  v_old_a jsonb; v_old_b jsonb;
  v_new_a jsonb; v_new_b jsonb;
BEGIN
  v_release_a := public.create_furnishings_authorization_from_schedule(
    v_project, 'Sconce release A', ARRAY[v_a], NULL
  );
  v_release_b := public.create_furnishings_authorization_from_schedule(
    v_project, 'Sconce release B', ARRAY[v_b], NULL
  );

  -- The two snapshots agree on everything a price-only fingerprint could see.
  ASSERT (SELECT count(DISTINCT (a.name, a.room_name, a.category, a.item_type,
                                 a.quantity, a.client_unit_price_cents,
                                 a.client_line_total_cents, a.snapshot, a.sort_order))
          FROM public.furnishing_authorization_items a
          WHERE a.source_ffe_item_id IN (v_a, v_b)) = 1,
    'fixture broken: the two sconce snapshots must be indistinguishable on price';

  SELECT jsonb_agg(jsonb_build_object(
    'sourceProposalItemId', a.source_proposal_item_id,
    'productId', a.product_id, 'name', a.name, 'roomName', a.room_name,
    'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
    'clientUnitPriceCents', a.client_unit_price_cents,
    'clientLineTotalCents', a.client_line_total_cents,
    'snapshot', a.snapshot, 'sortOrder', a.sort_order))
  INTO v_old_a FROM public.furnishing_authorization_items a
  WHERE a.source_ffe_item_id = v_a;
  SELECT jsonb_agg(jsonb_build_object(
    'sourceProposalItemId', a.source_proposal_item_id,
    'productId', a.product_id, 'name', a.name, 'roomName', a.room_name,
    'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
    'clientUnitPriceCents', a.client_unit_price_cents,
    'clientLineTotalCents', a.client_line_total_cents,
    'snapshot', a.snapshot, 'sortOrder', a.sort_order))
  INTO v_old_b FROM public.furnishing_authorization_items a
  WHERE a.source_ffe_item_id = v_b;
  ASSERT v_old_a = v_old_b,
    'the pre-00422 furnishings projection would NOT have collided; test is stale';

  SELECT jsonb_agg(jsonb_build_object(
    'sourceProposalItemId', a.source_proposal_item_id,
    'sourceFfeItemId', a.source_ffe_item_id,
    'projectRoomId', a.project_room_id,
    'productId', a.product_id, 'name', a.name, 'roomName', a.room_name,
    'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
    'clientUnitPriceCents', a.client_unit_price_cents,
    'clientLineTotalCents', a.client_line_total_cents,
    'snapshot', a.snapshot, 'sortOrder', a.sort_order))
  INTO v_new_a FROM public.furnishing_authorization_items a
  WHERE a.source_ffe_item_id = v_a;
  SELECT jsonb_agg(jsonb_build_object(
    'sourceProposalItemId', a.source_proposal_item_id,
    'sourceFfeItemId', a.source_ffe_item_id,
    'projectRoomId', a.project_room_id,
    'productId', a.product_id, 'name', a.name, 'roomName', a.room_name,
    'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
    'clientUnitPriceCents', a.client_unit_price_cents,
    'clientLineTotalCents', a.client_line_total_cents,
    'snapshot', a.snapshot, 'sortOrder', a.sort_order))
  INTO v_new_b FROM public.furnishing_authorization_items a
  WHERE a.source_ffe_item_id = v_b;
  ASSERT v_new_a <> v_new_b,
    'the 00422 furnishings projection must key on the cited schedule line';
  ASSERT public._commercial_document_fingerprint((v_release_a->>'proposalId')::uuid)
     IS DISTINCT FROM public._commercial_document_fingerprint((v_release_b->>'proposalId')::uuid),
    'two instruments must not share an evidence fingerprint';

  ASSERT (SELECT entry->>'sourceFfeItemId'
          FROM jsonb_array_elements(public.list_furnishings_authorizations(v_project)) AS doc,
               jsonb_array_elements(doc->'items') AS entry
          WHERE doc->>'waveName' = 'Sconce release A') = v_a::text,
    'the instrument list must name each item''s schedule line';
  ASSERT (SELECT (entry->>'depositPaid')::boolean
          FROM jsonb_array_elements(public.list_furnishings_authorizations(v_project)) AS entry
          WHERE entry->>'waveName' = 'Release one'),
    'the instrument list must report a paid deposit';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13b) Instrument numbers are a thing the studio says out loud. They follow
--       the order the instruments were drawn, a VOIDED instrument still spends
--       its number, and the client's list — which never shows a never-issued
--       one — still calls each instrument by the same number the studio does.
--
--       Every document in this suite is bound inside one transaction, so
--       bound_at ties and the id tiebreaker orders them at random. The order
--       is therefore stamped explicitly first: without that, ANY assertion
--       about a specific number would be unfalsifiable.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.project_commercial_documents d
SET bound_at = now() + (intended.rank * interval '1 second')
FROM (VALUES
  ('Release one', 1), ('Draft hold', 2), ('Release two', 3), ('Release three', 4),
  ('Release four', 5), ('Release five', 6), ('Sconce release A', 7),
  ('Sconce release B', 8)
) AS intended(wave_name, rank)
WHERE d.project_id = (SELECT value FROM sched_ids WHERE key = 'project')
  AND d.document_kind = 'furnishings_authorization'
  AND d.wave_name = intended.wave_name;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_living uuid := (SELECT value FROM sched_ids WHERE key = 'living');
  v_study uuid := (SELECT value FROM sched_ids WHERE key = 'study');
  v_listed jsonb;
  v_numbers jsonb;
BEGIN
  v_listed := public.list_furnishings_authorizations(v_project);
  SELECT jsonb_object_agg(entry->>'waveName', (entry->>'number')::integer)
  INTO v_numbers FROM jsonb_array_elements(v_listed) AS entry;
  ASSERT v_numbers = jsonb_build_object(
    'Release one', 1, 'Draft hold', 2, 'Release two', 3, 'Release three', 4,
    'Release four', 5, 'Release five', 6, 'Sconce release A', 7,
    'Sconce release B', 8
  ), format('instrument numbering does not follow the order drawn: %s', v_numbers);
  -- 'Draft hold' (2) and 'Release two' (3) were both voided. Numbering that
  -- skipped retired instruments would have made 'Release two' number 2.
  ASSERT (v_numbers->>'Release two')::integer = 3,
    'a voided instrument must still spend its number';
  ASSERT (SELECT bool_and((entry->>'number')::integer = position)
          FROM jsonb_array_elements(v_listed) WITH ORDINALITY AS listed(entry, position)),
    'the list must return instruments in the order it numbers them';

  -- Exactly the rooms the instrument's checkpoint covered — not "at least one".
  -- Release one was proven against checkpoint 1, whose budget version knew the
  -- Living room and the Study and nothing else.
  ASSERT (SELECT entry->'coveredRoomIds'
          FROM jsonb_array_elements(v_listed) AS entry
          WHERE entry->>'waveName' = 'Release one')
         @> jsonb_build_array(v_living, v_study)
     AND (SELECT jsonb_array_length(entry->'coveredRoomIds')
          FROM jsonb_array_elements(v_listed) AS entry
          WHERE entry->>'waveName' = 'Release one') = 2,
    'the instrument list must report exactly the rooms its checkpoint covered';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (14) The checkpoint fingerprint re-stamp. 00422 added two keys to
--      _budget_version_fingerprint, which changes the hash of every checkpoint
--      published before it. A checkpoint whose stored hash no longer describes
--      its version is un-acknowledgeable, un-overridable AND un-releasable —
--      all three preconditions are the same comparison — so the migration
--      re-stamps them. This section proves the cost of a stale fingerprint and
--      that the migration's own statement buys it back.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_checkpoint2 uuid := (SELECT value FROM sched_ids WHERE key = 'checkpoint2');
  v_version2 uuid := (SELECT value FROM sched_ids WHERE key = 'version2');
  v_cabinet uuid := (SELECT value FROM sched_ids WHERE key = 'cabinet');
  v_release jsonb;
  v_err text;
BEGIN
  -- Nothing in this database carries a fingerprint the current hash shape
  -- disagrees with. On a stack that replayed 00422 over checkpoints published
  -- under the 00412 shape, this is exactly the assertion the re-stamp keeps
  -- true — and exactly the one every such row fails without it.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.snapshot_fingerprint IS DISTINCT FROM
          public._budget_version_fingerprint(c.budget_version_id)
  ), 'a stored checkpoint fingerprint no longer describes its budget version';

  -- What a stale fingerprint costs.
  UPDATE public.project_budget_checkpoints
  SET snapshot_fingerprint = repeat('a', 64) WHERE id = v_checkpoint2;
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Stale checkpoint release', ARRAY[v_cabinet], NULL
    );
    ASSERT false, 'a checkpoint that no longer matches its version must block a release';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'budget checkpoint no longer matches its published version',
    format('stale-checkpoint refusal: %L', v_err);

  -- The migration's own re-stamp statement, verbatim. It is idempotent, and it
  -- must leave nothing stale anywhere.
  UPDATE public.project_budget_checkpoints c
  SET snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  WHERE c.snapshot_fingerprint IS DISTINCT FROM
        public._budget_version_fingerprint(c.budget_version_id);
  ASSERT (SELECT snapshot_fingerprint FROM public.project_budget_checkpoints
          WHERE id = v_checkpoint2) = public._budget_version_fingerprint(v_version2),
    're-stamping must restore a checkpoint to its version''s current hash';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.snapshot_fingerprint IS DISTINCT FROM
          public._budget_version_fingerprint(c.budget_version_id)
  ), 're-stamping must leave nothing stale behind';

  -- And the rail it was blocking works again. (The Pantry was uncovered under
  -- checkpoint 1 — section 2 — and is covered under checkpoint 2.)
  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Pantry release', ARRAY[v_cabinet], NULL
  );
  ASSERT (v_release->>'itemCount')::integer = 1,
    'a re-stamped checkpoint must authorize releases again';
  PERFORM public.void_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Fingerprint probe, retired immediately.'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (15) Voiding is not publishing. A studio that drafts a release, prices it,
--      thinks better of it and voids it has told the client NOTHING — void
--      writes commercial_state 'superseded', and the client gates used to read
--      "superseded" as "not a draft, therefore issued". A terminal edition
--      reaches the client only if it was actually sent.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_hold uuid := (SELECT value FROM sched_ids WHERE key = 'draft_hold');
  v_release2 uuid := (SELECT value FROM sched_ids WHERE key = 'release2');
  v_listed jsonb;
  v_names text[];
  v_bundle jsonb;
  v_err text;
BEGIN
  -- The fixture that makes this section falsifiable: after the void, the
  -- never-sent draft carries exactly the state the old gates read as "issued"
  -- — commercial_state 'superseded', which is not 'draft' — with no sent_at.
  ASSERT (SELECT commercial_state = 'superseded' AND sent_at IS NULL
          FROM public.proposals WHERE id = v_hold),
    'fixture: a voided draft must be superseded and never sent';

  v_listed := public.list_furnishings_authorizations(v_project);
  SELECT array_agg(entry->>'waveName') INTO v_names
  FROM jsonb_array_elements(v_listed) AS entry;

  ASSERT NOT ('Draft hold' = ANY (v_names)),
    'voiding a never-sent draft must not publish it to the client';
  ASSERT NOT ('Release four' = ANY (v_names)),
    'a never-sent deposit probe, voided, must not reach the client';
  ASSERT NOT ('Sconce release A' = ANY (v_names)),
    'an unsent draft must not reach the client';
  ASSERT 'Release two' = ANY (v_names),
    'an instrument that WAS sent stays the client''s to see after it is voided';
  ASSERT (SELECT entry->>'commercialState' FROM jsonb_array_elements(v_listed) AS entry
          WHERE entry->>'waveName' = 'Release two') = 'superseded',
    'the client reads a voided sent instrument as superseded';

  BEGIN
    PERFORM public.get_client_commercial_document_bundle(v_hold);
    ASSERT false, 'the client must not open a never-sent instrument that was voided';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found or access denied',
    format('voided-draft bundle refusal: %L', v_err);

  v_bundle := public.get_client_commercial_document_bundle(v_release2);
  ASSERT v_bundle->'document'->>'commercialState' = 'superseded',
    'a voided SENT instrument stays readable, as superseded';

  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.list_client_proposals()) AS entry
    WHERE (entry->>'id')::uuid = v_hold
  ), 'the client proposal list must not carry a never-issued voided edition';
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.list_client_proposals()) AS entry
    WHERE (entry->>'id')::uuid = v_release2
  ), 'the client proposal list keeps an issued edition that was later voided';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_names text[];
BEGIN
  SELECT array_agg(entry->>'waveName') INTO v_names
  FROM jsonb_array_elements(public.list_furnishings_authorizations(
    (SELECT value FROM sched_ids WHERE key = 'project'))) AS entry;
  ASSERT 'Draft hold' = ANY (v_names) AND 'Sconce release A' = ANY (v_names),
    'the studio still sees every instrument it drew, issued or not';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (16) The configuration carve-out is an honest two-part gate. It fires ONLY
--      inside the execution rail — the transaction-local GUC naming the very
--      document the row is being stamped with — and never for an ordinary
--      authenticated UPDATE that happens to stamp the same columns.
--
--      (current_user is deliberately not part of the gate: this trigger is
--      SECURITY DEFINER and owned by postgres, so it reads 'postgres' for
--      every caller and would wave everything through.)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, version, schema_revision, status,
  normalized_selection, component_quantities, evaluation, snapshot, snapshot_hash,
  is_complete, is_valid, retail_price_cents, trade_price_cents,
  approved_by, approved_at
) VALUES (
  'd7770000-0000-4000-8000-000000000002',
  'd7750000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000001', 1, 1, 'approved',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_object('retailPriceCents', 45000, 'tradePriceCents', 27000),
  repeat('d', 64), true, true, 45000, 27000,
  'd7000000-0000-4000-8000-000000000001', now()
);
UPDATE public.project_ffe_items
SET product_id = 'd7750000-0000-4000-8000-000000000002'
WHERE id = (SELECT value FROM sched_ids WHERE key = 'bar_stool_LR-09');
SELECT set_config('patina.configuration_spec_workflow', '00403', true);
INSERT INTO public.project_ffe_specs (
  ffe_item_id, configuration_id, configuration_snapshot,
  configuration_snapshot_hash, configuration_locked_at
) VALUES (
  (SELECT value FROM sched_ids WHERE key = 'bar_stool_LR-09'),
  'd7770000-0000-4000-8000-000000000002',
  jsonb_build_object('retailPriceCents', 45000, 'tradePriceCents', 27000),
  repeat('d', 64), now()
) ON CONFLICT (ffe_item_id) DO UPDATE SET
  configuration_id = EXCLUDED.configuration_id,
  configuration_snapshot = EXCLUDED.configuration_snapshot,
  configuration_snapshot_hash = EXCLUDED.configuration_snapshot_hash,
  configuration_locked_at = EXCLUDED.configuration_locked_at;
SELECT set_config('patina.configuration_spec_workflow', '', true);
DO $$
DECLARE
  v_stool uuid := (SELECT value FROM sched_ids WHERE key = 'bar_stool_LR-09');
  v_doc uuid;
  v_snapshot_item uuid;
  v_err text;
BEGIN
  -- A snapshot row nobody has claimed yet: the draft sconce instrument's.
  SELECT d.id, a.id INTO v_doc, v_snapshot_item
  FROM public.project_commercial_documents d
  JOIN public.furnishing_authorization_items a ON a.commercial_document_id = d.id
  WHERE d.wave_name = 'Sconce release A';
  ASSERT v_doc IS NOT NULL AND v_snapshot_item IS NOT NULL, 'fixture: sconce snapshot';
  ASSERT COALESCE(current_setting('app.commercial_document_id', true), '') = '',
    'fixture: the execution GUC must name no document outside the rail';

  -- The shape the old gate ADMITTED, reconstructed the way section 13
  -- reconstructs the pre-00422 fingerprint projection — otherwise the refusals
  -- below would prove nothing. Inside a SECURITY DEFINER trigger owned by
  -- postgres, current_user is always 'postgres'; and in a fresh PostgREST
  -- session app.commercial_document_id is unset, reading NULL, which
  -- IS NOT DISTINCT FROM the NULL a NULL document id yields. Both conjuncts
  -- true, carve-out fires, workflow skipped. (This suite cannot get the GUC
  -- back to NULL once a rail has run, so that reading is written out here.)
  ASSERT (
    'postgres' IS NOT DISTINCT FROM 'postgres'
    AND v_snapshot_item IS NOT NULL
    AND NULL::text IS NOT DISTINCT FROM (
      SELECT d.proposal_id::text FROM public.project_commercial_documents d
      WHERE d.id = NULL::uuid
    )
  ), 'the pre-00422 carve-out would NOT have admitted this UPDATE; test is stale';

  -- THE ATTACK, exactly as reported: approve a configured line while stamping
  -- ONLY source_authorization_item_id and leaving the document column NULL.
  -- Under the old carve-out both gating conjuncts were inert — current_user is
  -- 'postgres' inside a SECURITY DEFINER trigger, and an unset GUC compared
  -- IS NOT DISTINCT FROM the NULL that a NULL document yields — so this UPDATE
  -- returned early and skipped the entire configuration workflow.
  --
  -- The client is not a studio co-member, so the approval branch must refuse.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE public.project_ffe_items SET
      status = 'approved',
      source_authorization_item_id = v_snapshot_item
    WHERE id = v_stool;
    ASSERT false, 'stamping provenance without the execution GUC must not skip the guard';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'project not found or not accessible',
    format('carve-out bypass refusal (client actor, NULL document): %L', v_err);

  -- A studio member gets the configuration workflow, not a free pass: this
  -- fixture's snapshot hash is deliberately not the real one, so the workflow
  -- refuses where the carve-out would have returned silently.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.project_ffe_items SET
      status = 'approved',
      source_authorization_item_id = v_snapshot_item
    WHERE id = v_stool;
    ASSERT false, 'stamping provenance without the execution GUC must not skip the guard';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'configuration snapshot or hash does not match its approved source',
    format('carve-out bypass refusal (studio actor, NULL document): %L', v_err);

  -- And with a REAL document named but the GUC still unset — the shape the old
  -- gate happened to refuse for the wrong reason — it is refused for the right
  -- one: the GUC is what says "inside the execution rail".
  BEGIN
    UPDATE public.project_ffe_items SET
      status = 'approved',
      source_commercial_document_id = v_doc,
      source_authorization_item_id = v_snapshot_item
    WHERE id = v_stool;
    ASSERT false, 'naming a real document without the GUC must not skip the guard';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'configuration snapshot or hash does not match its approved source',
    format('carve-out bypass refusal (studio actor, real document): %L', v_err);

  ASSERT (SELECT source_authorization_item_id IS NULL
                 AND source_commercial_document_id IS NULL
                 AND status <> 'approved'
          FROM public.project_ffe_items WHERE id = v_stool),
    'the refused stamp must not have landed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (17) The soft lock is not bypassable through the configuration guard. That
--      guard fires AFTER the soft lock and REWRITES the line's money from the
--      configuration snapshot, so advancing a configured line to 'approved'
--      while a client is looking at it used to move money the lock had already
--      waved through. After execution the same act is allowed: post-execution
--      drift is narrated, not refused.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_runner uuid;
  v_snapshot jsonb := jsonb_build_object('retailPriceCents', 90000, 'tradePriceCents', 54000);
  v_release jsonb;
  v_send jsonb;
  v_err text;
BEGIN
  SELECT id INTO v_runner FROM public.project_ffe_items
  WHERE project_id = v_project AND name = 'Hall runner';
  INSERT INTO sched_ids VALUES ('hall_runner', v_runner);

  UPDATE public.project_ffe_items
  SET product_id = 'd7750000-0000-4000-8000-000000000002' WHERE id = v_runner;
  INSERT INTO public.product_configurations (
    id, product_id, owner_user_id, version, schema_revision, status,
    normalized_selection, component_quantities, evaluation, snapshot, snapshot_hash,
    is_complete, is_valid, retail_price_cents, trade_price_cents,
    approved_by, approved_at
  ) VALUES (
    'd7770000-0000-4000-8000-000000000003',
    'd7750000-0000-4000-8000-000000000002',
    'd7000000-0000-4000-8000-000000000001', 1, 1, 'approved',
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, v_snapshot,
    public._configuration_snapshot_hash(v_snapshot), true, true, 90000, 54000,
    'd7000000-0000-4000-8000-000000000001', now()
  );
  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  INSERT INTO public.project_ffe_specs (
    ffe_item_id, configuration_id, configuration_snapshot,
    configuration_snapshot_hash, configuration_locked_at
  ) VALUES (
    v_runner, 'd7770000-0000-4000-8000-000000000003', v_snapshot,
    public._configuration_snapshot_hash(v_snapshot), now()
  ) ON CONFLICT (ffe_item_id) DO UPDATE SET
    configuration_id = EXCLUDED.configuration_id,
    configuration_snapshot = EXCLUDED.configuration_snapshot,
    configuration_snapshot_hash = EXCLUDED.configuration_snapshot_hash,
    configuration_locked_at = EXCLUDED.configuration_locked_at;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Release six', ARRAY[v_runner], NULL
  );
  INSERT INTO sched_ids VALUES ('release6', (v_release->>'proposalId')::uuid);
  v_send := public.get_commercial_document_send_snapshot((v_release->>'proposalId')::uuid);
  PERFORM public.send_commercial_document(
    (v_release->>'proposalId')::uuid,
    v_send->>'documentFingerprint', NULL, now() + interval '30 days'
  );

  -- The line sits on a SENT instrument. Approving its configuration would
  -- rewrite the price the client is looking at.
  BEGIN
    UPDATE public.project_ffe_items SET status = 'approved' WHERE id = v_runner;
    ASSERT false, 'a configuration price rewrite under a sent instrument must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'schedule line quantity or price is locked while it sits on sent authorization "Release six"; void the authorization to edit',
    format('configuration-guard soft lock said the wrong thing: %L', v_err);
  ASSERT (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = v_runner) = 70000,
    'the refused configuration approval still moved the price';

  -- Executed: the same act is the studio''s again.
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  PERFORM public.execute_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Schedule Client'
  );
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');
  UPDATE public.project_ffe_items SET status = 'specified' WHERE id = v_runner;
  UPDATE public.project_ffe_items SET status = 'approved' WHERE id = v_runner;
  ASSERT (SELECT unit_price_cents = 90000 AND line_total_cents = 90000
          FROM public.project_ffe_items WHERE id = v_runner),
    'after execution the configuration approval must run and normalize the price';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (18) Two rooms may share a name. They are still two rooms: two budget lines,
--      two stamps, two independent coverage answers. Keyed on room_name the
--      derivation dropped the second room entirely, the id-keyed coverage proof
--      then refused every release from it, and the publish stamp summed both
--      rooms into the survivor.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project_b');
  v_room_a uuid;
  v_room_b uuid;
  v_line_b uuid;
  v_budget jsonb;
  v_version uuid;
  v_published jsonb;
  v_release jsonb;
BEGIN
  SELECT id INTO v_room_a FROM public.project_rooms
  WHERE project_id = v_project AND name = 'Guest bedroom';
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Guest bedroom', 1) RETURNING id INTO v_room_b;
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, line_total_cents, sort_order
  ) VALUES (
    v_project, v_room_b, 'Guest bed two', 'Beds', 'fixed', 'specified',
    1, 150000, 90000, 150000, 1
  ) RETURNING id INTO v_line_b;

  v_budget := public.derive_working_budget_draft(v_project);
  v_version := (v_budget->'version'->>'id')::uuid;
  ASSERT (SELECT count(*) FROM public.project_budget_lines
          WHERE budget_version_id = v_version AND category = 'Beds') = 2,
    'two rooms sharing a name must derive two budget lines';
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version AND project_room_id = v_room_a
            AND category = 'Beds') = 200000
     AND (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version AND project_room_id = v_room_b
            AND category = 'Beds') = 150000,
    'each same-named room must carry its own rollup, not the other''s';

  v_published := public.publish_budget_checkpoint(v_project, v_version);
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version AND project_room_id = v_room_a
            AND category = 'Beds') = 200000
     AND (SELECT scheduled_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version AND project_room_id = v_room_b
            AND category = 'Beds') = 150000,
    'the publish stamp must file each room''s schedule under its own room';

  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  PERFORM public.acknowledge_budget_checkpoint((v_published->>'checkpointId')::uuid);
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Guest release two', ARRAY[v_line_b], NULL
  );
  ASSERT (v_release->>'itemCount')::integer = 1,
    'a room that shares its name must still prove its own coverage';
  ASSERT (SELECT total_amount FROM public.proposals
          WHERE id = (v_release->>'proposalId')::uuid) = 150000,
    'the release must price the room it named, not its namesake';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (19) "What you authorized" means what was SIGNED. The schedule is allowed to
--      move after execution — an allowance MUST be resolved afterwards — so the
--      client's read projects the snapshot for the signed figures and reserves
--      live money for the one place it is honestly labelled: the allowance's
--      resolvedCents.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sofa uuid := (SELECT value FROM sched_ids WHERE key = 'lounge_sofa_LR-01');
  v_rug uuid := (SELECT value FROM sched_ids WHERE key = 'room_rug_LR-03');
BEGIN
  -- The studio reprices an executed, purchase-ordered line. Nothing refuses it.
  UPDATE public.project_ffe_items
  SET unit_price_cents = 450000, line_total_cents = 450000 WHERE id = v_sofa;
  ASSERT (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = v_sofa) = 450000,
    'fixture: post-execution drift must be permitted, not refused';

  -- And the studio finishes resolving the allowance section 4 priced: the line
  -- stops being an allowance. That single column is what the budget rollups
  -- already consult to decide whether line_total_cents is this line's money
  -- (publish_budget_checkpoint / derive_working_budget_draft read
  -- budget_max_cents while item_type = 'allowance'), so it is what the client's
  -- read consults too. Section 11 proved the other side: priced-but-still-typed
  -- -an-allowance reads as unresolved.
  UPDATE public.project_ffe_items SET item_type = 'fixed' WHERE id = v_rug;
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items WHERE id = v_rug) = 180000,
    'fixture: the resolved allowance keeps the price section 4 gave it';
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_sofa uuid := (SELECT value FROM sched_ids WHERE key = 'lounge_sofa_LR-01');
  v_rug uuid := (SELECT value FROM sched_ids WHERE key = 'room_rug_LR-03');
  v_payload jsonb;
  v_sofa_row jsonb;
  v_rug_row jsonb;
BEGIN
  v_payload := public.get_client_project_selections(v_project);
  SELECT value INTO v_sofa_row FROM jsonb_array_elements(v_payload->'selections') AS value
  WHERE value->>'id' = v_sofa::text;
  ASSERT (v_sofa_row->>'clientUnitPriceCents')::integer = 400000
     AND (v_sofa_row->>'clientLineTotalCents')::integer = 400000
     AND (v_sofa_row->>'quantity')::integer = 1,
    format('the client must be shown the figures they signed, not the live schedule: %s',
           v_sofa_row);

  SELECT value INTO v_rug_row FROM jsonb_array_elements(v_payload->'selections') AS value
  WHERE value->>'id' = v_rug::text;
  ASSERT (v_rug_row->>'clientLineTotalCents')::integer = 200000
     AND (v_rug_row->'allowance'->>'ceilingCents')::integer = 200000
     AND (v_rug_row->'allowance'->>'resolvedCents')::integer = 180000,
    format('a RESOLVED allowance signs its ceiling and reports its live '
           || 'resolution separately: %s', v_rug_row);
END $$;
SELECT pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (20) The named refusals: a line with no quantity to authorize, an engagement
--      whose agreement carries no terms row at all, and a release past what an
--      integer money column can hold.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_living uuid := (SELECT value FROM sched_ids WHERE key = 'living');
  v_zero uuid;
  v_big_a uuid;
  v_big_b uuid;
  v_err text;
BEGIN
  -- (a) An allowance is snapshotted at ceiling ÷ quantity, and quantity has no
  -- CHECK on the table. Zero used to raise a bare 22012 out of the release.
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, budget_max_cents, sort_order
  ) VALUES (
    v_project, v_living, 'Zero-quantity throw', 'Textiles', 'allowance',
    'specified', 0, 50000, 12
  ) RETURNING id INTO v_zero;
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Zero quantity release', ARRAY[v_zero], NULL
    );
    ASSERT false, 'a line with no quantity must not be releasable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%has no quantity to authorize',
    format('zero-quantity refusal: %L', v_err);

  -- (c) Two commissions past int4 between them. The refusal names itself
  -- instead of surfacing a bare numeric_value_out_of_range.
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, line_total_cents, sort_order
  ) VALUES
    (v_project, v_living, 'Grand commission A', 'Seating', 'fixed', 'specified',
     1, 2000000000, 0, 2000000000, 13) ,
    (v_project, v_living, 'Grand commission B', 'Seating', 'fixed', 'specified',
     1, 2000000000, 0, 2000000000, 14);
  SELECT id INTO v_big_a FROM public.project_ffe_items
  WHERE project_id = v_project AND name = 'Grand commission A';
  SELECT id INTO v_big_b FROM public.project_ffe_items
  WHERE project_id = v_project AND name = 'Grand commission B';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Overflow release', ARRAY[v_big_a, v_big_b], NULL
    );
    ASSERT false, 'a release past int4 must refuse by name';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%past the largest amount this ledger can hold',
    format('release overflow refusal: %L', v_err);

  -- The same guard sits on the derivation''s per-room rollup.
  BEGIN
    PERFORM public.derive_working_budget_draft(v_project);
    ASSERT false, 'a derived rollup past int4 must refuse by name';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE 'the scheduled rollup for Living room · Seating is % past the largest amount this ledger can hold',
    format('derivation overflow refusal: %L', v_err);
END $$;

-- (b) The deposit term is resolved from the NEWEST active billing authority,
--     and an authority whose source agreement carries no service-terms row at
--     all — a different shape from section 8's row-present-but-NULL — falls to
--     the 50% house default. The inner join this replaced dropped a termless
--     authority BEFORE the ORDER BY, so the answer could come from an older
--     one; that particular collision needs two simultaneously-active
--     authorities, which uniq_project_billing_authorities_active forbids, so
--     what is pinned here is the reachable half: the missing row resolves to
--     the house default rather than to anything else.
--
--     The authority is superseded and replaced rather than edited, because
--     proposal_service_terms is immutable once its proposal leaves draft
--     (guard_commercial_authored_child) — the termless state is only reachable
--     through an authority sourced from a document that never had terms.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, version, document_kind, commercial_state
) VALUES (
  'd7300000-0000-4000-8000-000000000003',
  'd7000000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'Termless standing authority', 'Carries no service terms row.',
  0, 'draft', 1, 'service_addendum', 'draft'
);
INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, created_by
) VALUES (
  'd7400000-0000-4000-8000-000000000003',
  (SELECT value FROM sched_ids WHERE key = 'project_b'),
  'd7300000-0000-4000-8000-000000000003', 'service_addendum',
  'd7000000-0000-4000-8000-000000000001'
);
UPDATE public.project_billing_authorities SET status = 'superseded', ended_at = now()
WHERE project_id = (SELECT value FROM sched_ids WHERE key = 'project_b')
  AND status = 'active';
INSERT INTO public.project_billing_authorities (
  project_id, commercial_document_id, source_proposal_id, billing_ceiling_cents,
  retainer_amount_cents, retainer_activation_policy, billing_cadence,
  effective_at, status
) VALUES (
  (SELECT value FROM sched_ids WHERE key = 'project_b'),
  'd7400000-0000-4000-8000-000000000003',
  'd7300000-0000-4000-8000-000000000003', 100000, 0, 'immediate', 'monthly',
  now() + interval '1 day', 'active'
);
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project_b');
  v_bed uuid;
  v_existing uuid;
  v_release jsonb;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_billing_authorities ba
    JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
    WHERE ba.project_id = v_project AND ba.status = 'active'
  ), 'fixture: the active authority must have no terms row';

  SELECT d.proposal_id INTO v_existing FROM public.project_commercial_documents d
  WHERE d.project_id = v_project AND d.wave_name = 'Guest release';
  PERFORM public.void_furnishings_authorization(v_existing, 'Freeing the bed to re-release it.');
  SELECT id INTO v_bed FROM public.project_ffe_items
  WHERE project_id = v_project AND name = 'Guest bed';

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Termless deposit probe', ARRAY[v_bed], NULL
  );
  ASSERT (SELECT deposit_percent FROM public.proposals
          WHERE id = (v_release->>'proposalId')::uuid) = 50,
    'an active authority with no terms row must fall to the house default';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (21) The composition bar states the deposit a release will ask for before
--      the studio opens the review sheet, and the only place that figure lives
--      is the standing agreement. The authority summary carries it, for the
--      studio and for the client.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM sched_ids WHERE key = 'project');
  v_summary jsonb;
BEGIN
  v_summary := public.get_project_authority_summary(v_project);
  ASSERT v_summary ? 'furnishingsDepositPercent',
    'the authority summary must carry furnishingsDepositPercent';
  ASSERT (v_summary->>'furnishingsDepositPercent')::numeric = 30,
    format('studio authority summary deposit percent: %s',
           v_summary->>'furnishingsDepositPercent');

  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000002');
  v_summary := public.get_project_authority_summary(v_project);
  ASSERT (v_summary->>'furnishingsDepositPercent')::numeric = 30,
    'the client reads the same standing deposit term';
  PERFORM pg_temp.assume_user('d7000000-0000-4000-8000-000000000001');

  -- An engagement that never named one reads NULL, and the release falls to 50.
  v_summary := public.get_project_authority_summary(
    (SELECT value FROM sched_ids WHERE key = 'project_b'));
  ASSERT v_summary ? 'furnishingsDepositPercent'
     AND v_summary->>'furnishingsDepositPercent' IS NULL,
    'an engagement with no standing term must read NULL, not a guess';
END $$;

ROLLBACK;

SELECT 'authorized_schedule_test: all assertions passed' AS result;
