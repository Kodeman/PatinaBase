-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-55a — W5 review fixes (migration 00758; SQ-691, from SQ-661)
--
-- Anchors: supersede_project_selection (base 00750:51);
-- set_project_ffe_line_build_fields (base 00737:337); the products BEFORE
-- DELETE guard (00758, new); record_project_ffe_receipt_batch (base 00754:99);
-- set_line_placements (base 00754:381); triage_project_ffe_items (base
-- 00755:263); set_line_group (base 00751:107); the working budget rollup
-- (base 00757:42 and 00757:180).
--
-- Studio owner O, client C. Project 1 rooms: Hall, Living, Dining (budgeted).
--   S, S2  shower valve and trim, Hall, grouped "Primary shower"; S carries
--          com_spec, an N/A declaration, a source verification and its own
--          spec-book settings
--   D1, D2 Dining lamps, each on its own draft release (D1 on the older one)
--   R      runner, 10 each, on a confirmed PO, placed Hall 6 / Living 4
--   G1, G2 Hall console and lamp, grouped "Console wall"
--   X      a chair line on catalog product PX
-- Project 2 (Kitchen, Lighting): a live, a removed, a not-selected and a
-- superseded line.
--
-- Named cases, one DO block each, every one with a named ASSERT:
--   F1_F2_supersede_carries     group, spec facts and spec-book settings carry
--   F3_F17_any_draft_locks      quantity, unit, rooms and the allowance refuse
--                               a line on an OLDER draft; the name still edits
--   F5_catalog_delete_guard     postgres and service_role cannot delete a
--                               product on a line, merged, or on an issued
--                               board item; an unreferenced product deletes
--   F11_rooms_name_the_delivery a short room list refuses; an exact one takes
--   F12_received_rooms_stay     dropping or lowering a received room refuses
--   F14_rollup_live_lines       derive and publish count the live line only
--   F15_group_follows_room      Move and set_line_placements leave the group;
--                               an emptied group is deleted
--   F16_auth_before_existence   an unknown line reads like an unreachable one
--
-- How to run (local stack, after applying 00758):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_w5_review_fixes_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t55a_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Runs p_sql and returns 'code|message' for the error it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.t55a_refusal(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || v_message;
END;
$$;

-- ─── fixtures (as postgres) ────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('75800000-0000-4000-8000-0000000000a1', 't55a-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('75800000-0000-4000-8000-0000000000a2', 't55a-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75800000-0000-4000-8000-0000000000a1', 't55a-owner@test.invalid', 'T55a Owner', true, NOW(), NOW()),
  ('75800000-0000-4000-8000-0000000000a2', 't55a-client@test.invalid', 'T55a Client', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('75800000-0000-4000-8000-0000000000f1', 'design_studio', 'T55a Studio', 't55a-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('75800000-0000-4000-8000-0000000000e1', '75800000-0000-4000-8000-0000000000a1',
        '75800000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES
  ('75800000-0000-4000-8000-000000000001', 'T55a Main Level', '75800000-0000-4000-8000-0000000000a1',
   '75800000-0000-4000-8000-0000000000a2', '75800000-0000-4000-8000-0000000000a1',
   '75800000-0000-4000-8000-0000000000f1'),
  ('75800000-0000-4000-8000-000000000002', 'T55a Kitchen', '75800000-0000-4000-8000-0000000000a1',
   '75800000-0000-4000-8000-0000000000a2', '75800000-0000-4000-8000-0000000000a1',
   '75800000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('75800000-0000-4000-8000-0000000000c1', '75800000-0000-4000-8000-000000000001', 'Hall',    0),
  ('75800000-0000-4000-8000-0000000000c2', '75800000-0000-4000-8000-000000000001', 'Living',  1),
  ('75800000-0000-4000-8000-0000000000c3', '75800000-0000-4000-8000-000000000001', 'Dining',  2),
  ('75800000-0000-4000-8000-0000000000c9', '75800000-0000-4000-8000-000000000002', 'Kitchen', 0);

INSERT INTO vendors (id, name)
VALUES ('75800000-0000-4000-8000-000000000011', 'T55a Workroom');

-- The executed design-services origins the release and the publish stand on.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES
  ('75800000-0000-4000-8000-000000000500', '75800000-0000-4000-8000-000000000001',
   '75800000-0000-4000-8000-0000000000a1', 'T55a Design services', 'accepted', 'design_services', 'executed'),
  ('75800000-0000-4000-8000-000000000501', '75800000-0000-4000-8000-000000000002',
   '75800000-0000-4000-8000-0000000000a1', 'T55a Kitchen services', 'accepted', 'design_services', 'executed');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, executed_at, created_by)
VALUES
  ('75800000-0000-4000-8000-000000000600', '75800000-0000-4000-8000-000000000001',
   '75800000-0000-4000-8000-000000000500', 'design_services', true, now(), now(),
   '75800000-0000-4000-8000-0000000000a1'),
  ('75800000-0000-4000-8000-000000000601', '75800000-0000-4000-8000-000000000002',
   '75800000-0000-4000-8000-000000000501', 'design_services', true, now(), now(),
   '75800000-0000-4000-8000-0000000000a1');

INSERT INTO project_budget_versions (id, project_id, version, created_by)
VALUES ('75800000-0000-4000-8000-000000000700', '75800000-0000-4000-8000-000000000001', 1,
        '75800000-0000-4000-8000-0000000000a1');
INSERT INTO project_budget_lines (budget_version_id, project_room_id, room_name, category, low_cents, target_cents, high_cents)
VALUES
  ('75800000-0000-4000-8000-000000000700', '75800000-0000-4000-8000-0000000000c1', 'Hall',   'Furniture', 100000, 900000, 1900000),
  ('75800000-0000-4000-8000-000000000700', '75800000-0000-4000-8000-0000000000c2', 'Living', 'Furniture', 100000, 900000, 1900000),
  ('75800000-0000-4000-8000-000000000700', '75800000-0000-4000-8000-0000000000c3', 'Dining', 'Furniture', 100000, 900000, 1900000);

-- The book exists first, so every line below gets its working item setting.
INSERT INTO spec_books (id, project_id, title, template_id, created_by)
VALUES ('75800000-0000-4000-8000-000000000800', '75800000-0000-4000-8000-000000000001',
        'T55a Book', '8f6e2600-6f25-4f20-a63d-d68d49c35a01', '75800000-0000-4000-8000-0000000000a1');

-- Catalog products (studio layer, 00152 metadata).
INSERT INTO products (id, name, captured_at, layer, studio_id, vendor_contact, lead_time_weeks,
                      payment_terms, category, usage_notes)
SELECT p.id, p.name, now(), 'studio', '75800000-0000-4000-8000-0000000000f1',
       '{}'::jsonb, 6, 'net_30', 'seating', 'test'
FROM (VALUES
  ('75800000-0000-4000-8000-000000000021'::uuid, 'T55a Chair (on a line)'),     -- PX
  ('75800000-0000-4000-8000-000000000022'::uuid, 'T55a Chair (merged)'),        -- PM
  ('75800000-0000-4000-8000-000000000023'::uuid, 'T55a Lamp (issued board)'),   -- PB
  ('75800000-0000-4000-8000-000000000024'::uuid, 'T55a Stool (unused)')         -- PU
) AS p(id, name);
UPDATE products SET merged_into_id = '75800000-0000-4000-8000-000000000021', deleted_at = now()
 WHERE id = '75800000-0000-4000-8000-000000000022';

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, trade_price_cents, line_total_cents,
                               vendor_id, vendor_name, design_disposition, sort_order, product_id, ffe_category)
VALUES
  ('75800000-0000-4000-8000-000000000201', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c1', 'room',
   'S Shower valve', 'specified', 'fixed', 1, 'each', 90000, 60000, 90000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 0, NULL, NULL),
  ('75800000-0000-4000-8000-000000000202', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c1', 'room',
   'S2 Shower trim', 'specified', 'fixed', 1, 'each', 40000, 25000, 40000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 1, NULL, NULL),
  ('75800000-0000-4000-8000-000000000211', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c3', 'room',
   'D1 Dining lamp', 'specified', 'fixed', 2, 'each', 30000, 20000, 60000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 2, NULL, NULL),
  ('75800000-0000-4000-8000-000000000212', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c3', 'room',
   'D2 Dining sconce', 'specified', 'fixed', 2, 'each', 20000, 12000, 40000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 3, NULL, NULL),
  ('75800000-0000-4000-8000-000000000221', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c1', 'room',
   'R Runner', 'specified', 'fixed', 10, 'each', 10000, 7000, 100000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 4, NULL, NULL),
  ('75800000-0000-4000-8000-000000000231', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c1', 'room',
   'G1 Console', 'specified', 'fixed', 1, 'each', 70000, 50000, 70000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 5, NULL, NULL),
  ('75800000-0000-4000-8000-000000000232', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c1', 'room',
   'G2 Console lamp', 'specified', 'fixed', 1, 'each', 20000, 12000, 20000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 6, NULL, NULL),
  ('75800000-0000-4000-8000-000000000241', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-0000000000c2', 'room',
   'X Chair', 'specified', 'fixed', 1, 'each', 50000, 30000, 50000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'candidate', 7,
   '75800000-0000-4000-8000-000000000021', NULL),
  -- Project 2, Kitchen · Lighting: live, removed, not selected, superseded.
  ('75800000-0000-4000-8000-000000000251', '75800000-0000-4000-8000-000000000002', '75800000-0000-4000-8000-0000000000c9', 'room',
   'K1 Pendant (live)', 'specified', 'fixed', 1, 'each', 100000, 60000, 100000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 0, NULL, 'Lighting'),
  ('75800000-0000-4000-8000-000000000252', '75800000-0000-4000-8000-000000000002', '75800000-0000-4000-8000-0000000000c9', 'room',
   'K2 Pendant (removed)', 'specified', 'fixed', 1, 'each', 50000, 30000, 50000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'selected', 1, NULL, 'Lighting'),
  ('75800000-0000-4000-8000-000000000253', '75800000-0000-4000-8000-000000000002', '75800000-0000-4000-8000-0000000000c9', 'room',
   'K3 Pendant (not selected)', 'specified', 'fixed', 1, 'each', 30000, 20000, 30000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'not_selected', 2, NULL, 'Lighting'),
  ('75800000-0000-4000-8000-000000000254', '75800000-0000-4000-8000-000000000002', '75800000-0000-4000-8000-0000000000c9', 'room',
   'K4 Pendant (superseded)', 'specified', 'fixed', 1, 'each', 20000, 12000, 20000,
   '75800000-0000-4000-8000-000000000011', 'T55a Workroom', 'superseded', 3, NULL, 'Lighting');
UPDATE project_ffe_items
   SET removed_at = now(), removed_by = '75800000-0000-4000-8000-0000000000a1',
       removal_reason = 'removed while building', removed_disposition = 'selected',
       design_disposition = 'not_selected'
 WHERE id = '75800000-0000-4000-8000-000000000252';
-- The book's template asks a released line for a code, a product and an image.
UPDATE project_ffe_items
   SET doc_code = CASE id WHEN '75800000-0000-4000-8000-000000000211' THEN 'L-1' ELSE 'L-2' END,
       product_id = '75800000-0000-4000-8000-000000000021'
 WHERE id IN ('75800000-0000-4000-8000-000000000211', '75800000-0000-4000-8000-000000000212');
SELECT set_config('app.ffe_mutation_rpc', '', true);
UPDATE project_ffe_specs SET selected_media = '[{"url":"https://example.invalid/lamp.jpg"}]'::jsonb
 WHERE ffe_item_id IN ('75800000-0000-4000-8000-000000000211', '75800000-0000-4000-8000-000000000212');

-- S's designer-authored spec facts and spec-book settings.
UPDATE project_ffe_specs
   SET com_spec = '{"fabricName":"Brass mesh","mill":"T55a Mill","yardage":2}'::jsonb,
       na_declarations = '{"finish":{"na":true,"reason":"Unlacquered brass ages in place"}}'::jsonb,
       source_verifications = '{"sku":{"verifiedBy":"T55a Owner","source":"vendor sheet"}}'::jsonb
 WHERE ffe_item_id = '75800000-0000-4000-8000-000000000201';
UPDATE spec_book_item_settings
   SET included = false, page_template = 'spread', publication_overrides = '{"hidePrice":true}'::jsonb
 WHERE ffe_item_id = '75800000-0000-4000-8000-000000000201';

-- An issued proposal board carries PB.
INSERT INTO proposals (id, designer_id, client_id, title, status)
VALUES ('75800000-0000-4000-8000-000000000520', '75800000-0000-4000-8000-0000000000a1',
        '75800000-0000-4000-8000-0000000000a2', 'T55a Proposal', 'draft');
INSERT INTO proposal_boards (id, name, project_id, proposal_id)
VALUES ('75800000-0000-4000-8000-000000000081', 'T55a Proposal board', NULL, '75800000-0000-4000-8000-000000000520');
INSERT INTO proposal_board_items (id, board_id, type, product_id)
VALUES ('75800000-0000-4000-8000-000000000082', '75800000-0000-4000-8000-000000000081', 'product',
        '75800000-0000-4000-8000-000000000023');
SELECT set_config('app.proposal_send_id', '75800000-0000-4000-8000-000000000520', true);
UPDATE proposals SET status = 'sent' WHERE id = '75800000-0000-4000-8000-000000000520';
SELECT set_config('app.proposal_send_id', '', true);

-- R's confirmed PO.
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES ('75800000-0000-4000-8000-000000000901', '75800000-0000-4000-8000-0000000000a1',
        '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-000000000011',
        'net_30', 70000, 'confirmed', false);

-- Groups, placements, the checkpoint and the two draft releases, as the studio.
DO $$
DECLARE
  v_group jsonb;
  v_published jsonb;
  v_wave jsonb;
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');

  v_group := public.set_line_group(ARRAY['75800000-0000-4000-8000-000000000201',
                                         '75800000-0000-4000-8000-000000000202']::uuid[],
    '{"name":"Primary shower","roomId":"75800000-0000-4000-8000-0000000000c1"}'::jsonb);
  PERFORM set_config('t55a.shower', v_group->>'groupId', true);
  v_group := public.set_line_group(ARRAY['75800000-0000-4000-8000-000000000231',
                                         '75800000-0000-4000-8000-000000000232']::uuid[],
    '{"name":"Console wall","roomId":"75800000-0000-4000-8000-0000000000c1"}'::jsonb);
  PERFORM set_config('t55a.console', v_group->>'groupId', true);

  PERFORM public.set_line_placements('75800000-0000-4000-8000-000000000221', '[
    {"roomId":"75800000-0000-4000-8000-0000000000c1","quantity":6},
    {"roomId":"75800000-0000-4000-8000-0000000000c2","quantity":4}]'::jsonb);

  v_published := public.publish_budget_checkpoint('75800000-0000-4000-8000-000000000001',
                                                  '75800000-0000-4000-8000-000000000700');
  PERFORM public.override_budget_checkpoint((v_published->>'checkpointId')::uuid,
    'Client travelling; proceeding on the reviewed budget.');

  v_wave := public.create_furnishings_authorization_from_schedule('75800000-0000-4000-8000-000000000001',
    'Release No. 1', ARRAY['75800000-0000-4000-8000-000000000211'::uuid], NULL);
  ASSERT v_wave->>'commercialState' = 'draft', format('setup: release 1 is a draft: %s', v_wave);
  PERFORM set_config('t55a.older_document', v_wave->>'documentId', true);
  UPDATE public.proposals SET created_at = now() - interval '1 hour' WHERE id = (v_wave->>'proposalId')::uuid;
  v_wave := public.create_furnishings_authorization_from_schedule('75800000-0000-4000-8000-000000000001',
    'Release No. 2', ARRAY['75800000-0000-4000-8000-000000000212'::uuid], NULL);
  ASSERT v_wave->>'commercialState' = 'draft', format('setup: release 2 is a draft: %s', v_wave);
  PERFORM set_config('t55a.newer_document', v_wave->>'documentId', true);
END $$;

-- R is covered by an executed authorization, then ordered.
INSERT INTO proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state,
                       total_amount, subtotal, sent_at)
VALUES ('75800000-0000-4000-8000-000000000510', '75800000-0000-4000-8000-000000000001',
        '75800000-0000-4000-8000-0000000000a1', '75800000-0000-4000-8000-0000000000a2',
        'T55a Authorization No. 0', 'accepted', 'furnishings_authorization', 'executed', 100000, 100000, now());
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin,
                                          bound_at, executed_at, created_by)
VALUES ('75800000-0000-4000-8000-000000000610', '75800000-0000-4000-8000-000000000001',
        '75800000-0000-4000-8000-000000000510', 'furnishings_authorization', 'Authorization No. 0', false,
        now(), now(), '75800000-0000-4000-8000-0000000000a1');
INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, project_room_id,
                                            name, room_name, category, item_type, quantity,
                                            client_unit_price_cents, client_line_total_cents, snapshot, sort_order)
VALUES ('75800000-0000-4000-8000-000000000611', '75800000-0000-4000-8000-000000000610',
        '75800000-0000-4000-8000-000000000221', '75800000-0000-4000-8000-0000000000c1',
        'R Runner', 'Hall', 'Rugs', 'fixed', 10, 10000, 100000, '{}'::jsonb, 0);
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE project_ffe_items
   SET source_commercial_document_id = '75800000-0000-4000-8000-000000000610',
       source_authorization_item_id = '75800000-0000-4000-8000-000000000611'
 WHERE id = '75800000-0000-4000-8000-000000000221';
UPDATE project_ffe_items SET purchase_order_id = '75800000-0000-4000-8000-000000000901', status = 'ordered'
 WHERE id = '75800000-0000-4000-8000-000000000221';
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- ─── F1_F2_supersede_carries ───────────────────────────────────────────────

DO $F1_F2_supersede_carries$
DECLARE
  v_new uuid;
  v_item record;
  v_spec record;
  v_setting record;
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');
  v_new := (public.supersede_project_selection(jsonb_build_object(
    'selectionId', '75800000-0000-4000-8000-000000000201'))->>'selectionId')::uuid;

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_new;
  ASSERT v_item.line_group_id = current_setting('t55a.shower')::uuid,
    format('F1_supersede_keeps_group: the successor stays in "Primary shower", got %s', v_item.line_group_id);

  SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = v_new;
  ASSERT v_spec.com_spec = '{"fabricName":"Brass mesh","mill":"T55a Mill","yardage":2}'::jsonb
     AND v_spec.na_declarations = '{"finish":{"na":true,"reason":"Unlacquered brass ages in place"}}'::jsonb
     AND v_spec.source_verifications = '{"sku":{"verifiedBy":"T55a Owner","source":"vendor sheet"}}'::jsonb,
    format('F2_supersede_carries_spec_facts: com %s, n/a %s, verified %s',
           v_spec.com_spec, v_spec.na_declarations, v_spec.source_verifications);

  SELECT * INTO v_setting FROM public.spec_book_item_settings
   WHERE ffe_item_id = v_new AND spec_book_id = '75800000-0000-4000-8000-000000000800';
  ASSERT FOUND AND v_setting.included = false AND v_setting.page_template = 'spread'
     AND v_setting.publication_overrides = '{"hidePrice":true}'::jsonb,
    format('F2_supersede_carries_book_settings: got included %s, template %s, overrides %s',
           v_setting.included, v_setting.page_template, v_setting.publication_overrides);

  RAISE NOTICE 'PASS F1_F2_supersede_carries: group, COM, N/A, verification and book settings carried';
END
$F1_F2_supersede_carries$;

-- ─── F3_F17_any_draft_locks ────────────────────────────────────────────────

DO $F3_F17_any_draft_locks$
DECLARE
  v_err text;
  c_drafted CONSTANT text := '23514|This line is on a drafted release. Send it or void the draft first.';
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');

  -- Two open drafts: the guard must not test only the one the draft read names.
  ASSERT (SELECT count(*) FROM public.project_commercial_documents d
          JOIN public.proposals p ON p.id = d.proposal_id
          WHERE d.id IN (current_setting('t55a.older_document')::uuid, current_setting('t55a.newer_document')::uuid)
            AND COALESCE(p.commercial_state, 'draft') = 'draft') = 2,
    'F17_premise: both releases are open drafts';
  ASSERT public.draft_release_for_project('75800000-0000-4000-8000-000000000001')->>'documentId'
         = current_setting('t55a.newer_document'),
    'F17_premise: the draft read names the newer draft, not D1''s';

  v_err := pg_temp.t55a_refusal($q$SELECT public.set_project_ffe_line_build_fields(
    '75800000-0000-4000-8000-000000000211', '{"quantity":3}'::jsonb)$q$);
  ASSERT v_err = c_drafted, format('F3_quantity_refuses_on_older_draft: got %s', v_err);

  v_err := pg_temp.t55a_refusal($q$SELECT public.set_project_ffe_line_build_fields(
    '75800000-0000-4000-8000-000000000211', '{"unit":"box"}'::jsonb)$q$);
  ASSERT v_err = c_drafted, format('F3_unit_refuses_on_older_draft: got %s', v_err);

  v_err := pg_temp.t55a_refusal($q$SELECT public.set_line_placements(
    '75800000-0000-4000-8000-000000000211',
    '[{"roomId":"75800000-0000-4000-8000-0000000000c3","quantity":1}]'::jsonb)$q$);
  ASSERT v_err = c_drafted, format('F3_placements_refuse_on_older_draft: got %s', v_err);

  v_err := pg_temp.t55a_refusal($q$SELECT public.make_ffe_line_allowance(
    '75800000-0000-4000-8000-000000000211', 80000)$q$);
  ASSERT v_err = c_drafted, format('F17_allowance_refuses_on_older_draft: got %s', v_err);

  -- A name is not the count: it still edits.
  PERFORM public.set_project_ffe_line_build_fields('75800000-0000-4000-8000-000000000211',
    '{"name":"D1 Dining pendant"}'::jsonb);
  ASSERT (SELECT name = 'D1 Dining pendant' AND quantity = 2 FROM public.project_ffe_items
          WHERE id = '75800000-0000-4000-8000-000000000211'),
    'F3_name_still_edits: a drafted line takes a new name and keeps its quantity';

  RAISE NOTICE 'PASS F3_F17_any_draft_locks: quantity, unit, rooms and allowance refuse on an older draft';
END
$F3_F17_any_draft_locks$;

-- ─── F5_catalog_delete_guard ───────────────────────────────────────────────
-- As postgres (no RLS), then as service_role: the guard binds every caller.

DO $F5_catalog_delete_guard$
DECLARE
  v_err text;
  c_merge CONSTANT text := '23514|A product on a line can''t be deleted. Merge it into the one you keep.';
BEGIN
  v_err := pg_temp.t55a_refusal($q$DELETE FROM public.products WHERE id = '75800000-0000-4000-8000-000000000021'$q$);
  ASSERT v_err = c_merge, format('F5_line_product_refused: got %s', v_err);
  v_err := pg_temp.t55a_refusal($q$DELETE FROM public.products WHERE id = '75800000-0000-4000-8000-000000000022'$q$);
  ASSERT v_err = c_merge, format('F5_merged_product_refused: got %s', v_err);
  v_err := pg_temp.t55a_refusal($q$DELETE FROM public.products WHERE id = '75800000-0000-4000-8000-000000000023'$q$);
  ASSERT v_err = c_merge, format('F5_issued_board_product_refused: got %s', v_err);
  ASSERT (SELECT product_id FROM public.project_ffe_items WHERE id = '75800000-0000-4000-8000-000000000241')
         = '75800000-0000-4000-8000-000000000021'
     AND (SELECT product_id FROM public.proposal_board_items WHERE id = '75800000-0000-4000-8000-000000000082')
         = '75800000-0000-4000-8000-000000000023',
    'F5_nothing_unfilled: the line and the issued board item keep their products';
END
$F5_catalog_delete_guard$;

SET LOCAL ROLE service_role;
DO $F5_catalog_delete_guard_service_role$
DECLARE
  v_err text;
  v_n integer;
BEGIN
  BEGIN
    DELETE FROM public.products WHERE id = '75800000-0000-4000-8000-000000000021';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'A product on a line can''t be deleted. Merge it into the one you keep.',
    format('F5_service_role_refused: got %s', v_err);
  DELETE FROM public.products WHERE id = '75800000-0000-4000-8000-000000000024';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, format('F5_unreferenced_product_deletes: deleted %s rows', v_n);
  RAISE NOTICE 'PASS F5_catalog_delete_guard: line, merged and issued-board products refused for every caller; unused deletes';
END
$F5_catalog_delete_guard_service_role$;
RESET ROLE;

-- ─── F11_rooms_name_the_delivery ───────────────────────────────────────────

DO $F11_rooms_name_the_delivery$
DECLARE
  v_err text;
  v_hall uuid := (SELECT p.id FROM public.project_ffe_placements p
                  WHERE p.ffe_item_id = '75800000-0000-4000-8000-000000000221'
                    AND p.project_room_id = '75800000-0000-4000-8000-0000000000c1');
  v_living uuid := (SELECT p.id FROM public.project_ffe_placements p
                    WHERE p.ffe_item_id = '75800000-0000-4000-8000-000000000221'
                      AND p.project_room_id = '75800000-0000-4000-8000-0000000000c2');
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');
  PERFORM set_config('t55a.hall', v_hall::text, true);
  PERFORM set_config('t55a.living', v_living::text, true);

  -- 5 arrive; the rooms name only 3.
  v_err := pg_temp.t55a_refusal(format($q$SELECT public.record_project_ffe_receipt_batch(
    '75800000-0000-4000-8000-000000000901',
    jsonb_build_array(jsonb_build_object('selectionId', '75800000-0000-4000-8000-000000000221',
      'receivedQuantity', 5, 'placements', jsonb_build_array(
        jsonb_build_object('placementId', %L, 'quantity', 3)))),
    'partial', 'First boxes', '{}')$q$, v_hall));
  ASSERT v_err = '23514|The rooms add up to 3, but this delivery brought 5 to place.',
    format('F11_short_room_list_refused: got %s', v_err);
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_placement_receipts WHERE placement_id IN (v_hall, v_living))
     AND (SELECT COALESCE(received_quantity, 0) FROM public.project_ffe_items
          WHERE id = '75800000-0000-4000-8000-000000000221') = 0,
    'F11_refusal_writes_nothing';

  -- Hall 3 + Living 2 names all 5.
  PERFORM public.record_project_ffe_receipt_batch('75800000-0000-4000-8000-000000000901',
    jsonb_build_array(jsonb_build_object('selectionId', '75800000-0000-4000-8000-000000000221',
      'receivedQuantity', 5, 'placements', jsonb_build_array(
        jsonb_build_object('placementId', v_hall, 'quantity', 3),
        jsonb_build_object('placementId', v_living, 'quantity', 2)))),
    'partial', 'First boxes', '{}');
  ASSERT (SELECT sum(quantity) FROM public.project_ffe_placement_receipts WHERE placement_id = v_hall) = 3
     AND (SELECT sum(quantity) FROM public.project_ffe_placement_receipts WHERE placement_id = v_living) = 2,
    'F11_exact_room_list_allocates: Hall 3, Living 2';

  RAISE NOTICE 'PASS F11_rooms_name_the_delivery: a short list refuses; an exact one allocates';
END
$F11_rooms_name_the_delivery$;

-- ─── F12_received_rooms_stay ───────────────────────────────────────────────

DO $F12_received_rooms_stay$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');

  -- Dropping Living (received 2).
  v_err := pg_temp.t55a_refusal($q$SELECT public.set_line_placements(
    '75800000-0000-4000-8000-000000000221',
    '[{"roomId":"75800000-0000-4000-8000-0000000000c1","quantity":6}]'::jsonb)$q$);
  ASSERT v_err = '23514|Living has already received 2. Record a change instead.',
    format('F12_drop_received_room_refused: got %s', v_err);

  -- Setting Hall (received 3) to 2.
  v_err := pg_temp.t55a_refusal($q$SELECT public.set_line_placements(
    '75800000-0000-4000-8000-000000000221', '[
      {"roomId":"75800000-0000-4000-8000-0000000000c1","quantity":2},
      {"roomId":"75800000-0000-4000-8000-0000000000c2","quantity":4}]'::jsonb)$q$);
  ASSERT v_err = '23514|Hall has already received 3. Record a change instead.',
    format('F12_lower_below_received_refused: got %s', v_err);

  ASSERT (SELECT count(*) FROM public.project_ffe_placement_receipts
          WHERE placement_id IN (current_setting('t55a.hall')::uuid, current_setting('t55a.living')::uuid)) = 2,
    'F12_receipts_survive: both receipt rows remain';

  -- Down to exactly what was received still edits.
  PERFORM public.set_line_placements('75800000-0000-4000-8000-000000000221', '[
    {"roomId":"75800000-0000-4000-8000-0000000000c1","quantity":3},
    {"roomId":"75800000-0000-4000-8000-0000000000c2","quantity":2}]'::jsonb);
  ASSERT (SELECT quantity FROM public.project_ffe_placements WHERE id = current_setting('t55a.hall')::uuid) = 3,
    'F12_down_to_received_allowed: Hall can be set to its 3 received';

  RAISE NOTICE 'PASS F12_received_rooms_stay: received rooms are neither dropped nor lowered below receipts';
END
$F12_received_rooms_stay$;

-- ─── F14_rollup_live_lines ─────────────────────────────────────────────────

DO $F14_rollup_live_lines$
DECLARE
  v_version uuid;
  v_line record;
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');
  PERFORM public.derive_working_budget_draft('75800000-0000-4000-8000-000000000002');
  SELECT id INTO v_version FROM public.project_budget_versions
   WHERE project_id = '75800000-0000-4000-8000-000000000002' ORDER BY version DESC LIMIT 1;

  SELECT * INTO v_line FROM public.project_budget_lines
   WHERE budget_version_id = v_version AND project_room_id = '75800000-0000-4000-8000-0000000000c9'
     AND category = 'Lighting';
  ASSERT v_line.target_cents = 100000,
    format('F14_derive_counts_live_lines: Kitchen · Lighting target %s, expected 100000 (live K1 only)', v_line.target_cents);

  PERFORM public.publish_budget_checkpoint('75800000-0000-4000-8000-000000000002', v_version);
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines WHERE id = v_line.id) = 100000,
    format('F14_publish_stamps_live_lines: scheduled %s, expected 100000',
           (SELECT scheduled_cents FROM public.project_budget_lines WHERE id = v_line.id));

  RAISE NOTICE 'PASS F14_rollup_live_lines: removed, not-selected and superseded lines are not scheduled';
END
$F14_rollup_live_lines$;

-- ─── F15_group_follows_room ────────────────────────────────────────────────

DO $F15_group_follows_room$
DECLARE
  v_group uuid := current_setting('t55a.console')::uuid;
BEGIN
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');

  -- Move G1 to Living: it leaves the Hall group; G2 keeps it.
  PERFORM public.triage_project_ffe_items(jsonb_build_object(
    'projectId', '75800000-0000-4000-8000-000000000001', 'assignmentScope', 'room',
    'roomId', '75800000-0000-4000-8000-0000000000c2',
    'selectionIds', jsonb_build_array('75800000-0000-4000-8000-000000000231')));
  ASSERT (SELECT line_group_id IS NULL FROM public.project_ffe_items WHERE id = '75800000-0000-4000-8000-000000000231')
     AND (SELECT line_group_id FROM public.project_ffe_items WHERE id = '75800000-0000-4000-8000-000000000232') = v_group
     AND EXISTS (SELECT 1 FROM public.project_line_groups WHERE id = v_group),
    'F15_move_leaves_group: G1 leaves "Console wall"; G2 and the group stay';

  -- Place G2 in Living: it leaves too, and the emptied group is deleted.
  PERFORM public.set_line_placements('75800000-0000-4000-8000-000000000232',
    '[{"roomId":"75800000-0000-4000-8000-0000000000c2","quantity":1}]'::jsonb);
  ASSERT (SELECT line_group_id IS NULL FROM public.project_ffe_items WHERE id = '75800000-0000-4000-8000-000000000232')
     AND NOT EXISTS (SELECT 1 FROM public.project_line_groups WHERE id = v_group),
    'F15_placements_leave_group: G2 leaves and the emptied group is deleted';

  -- A same-room placement keeps the group: S2 stays in "Primary shower".
  PERFORM public.set_line_placements('75800000-0000-4000-8000-000000000202',
    '[{"roomId":"75800000-0000-4000-8000-0000000000c1","quantity":1}]'::jsonb);
  ASSERT (SELECT line_group_id FROM public.project_ffe_items WHERE id = '75800000-0000-4000-8000-000000000202')
         = current_setting('t55a.shower')::uuid,
    'F15_same_room_keeps_group';

  RAISE NOTICE 'PASS F15_group_follows_room: Move and set_line_placements clear a group in another room';
END
$F15_group_follows_room$;

-- ─── F16_auth_before_existence ─────────────────────────────────────────────

DO $F16_auth_before_existence$
DECLARE
  v_known text;
  v_unknown text;
  v_mixed text;
  c_denied CONSTANT text := '42501|project not found or access denied';
BEGIN
  -- The client cannot buy for the project: a real line and an unknown one
  -- answer the same.
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a2');
  v_known := pg_temp.t55a_refusal($q$SELECT public.set_line_group(
    ARRAY['75800000-0000-4000-8000-000000000202']::uuid[], NULL)$q$);
  v_unknown := pg_temp.t55a_refusal($q$SELECT public.set_line_group(
    ARRAY['75800000-0000-4000-8000-0000000002ff']::uuid[], NULL)$q$);
  ASSERT v_known = c_denied AND v_unknown = c_denied,
    format('F16_unknown_reads_like_unreachable: known %s, unknown %s', v_known, v_unknown);

  -- The owner naming one of their lines plus an unknown one is denied too.
  PERFORM pg_temp.t55a_as('75800000-0000-4000-8000-0000000000a1');
  v_mixed := pg_temp.t55a_refusal($q$SELECT public.set_line_group(
    ARRAY['75800000-0000-4000-8000-000000000202', '75800000-0000-4000-8000-0000000002ff']::uuid[], NULL)$q$);
  ASSERT v_mixed = c_denied, format('F16_owner_unknown_line_denied: got %s', v_mixed);

  RAISE NOTICE 'PASS F16_auth_before_existence: set_line_group authorizes before any existence error';
END
$F16_auth_before_existence$;

ROLLBACK;
