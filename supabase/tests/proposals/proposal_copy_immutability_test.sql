-- Immutable proposal-edition regression (00390)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/proposals/proposal_copy_immutability_test.sql

BEGIN;

SET LOCAL statement_timeout = '15s';

-- All business fixtures live inside this transaction. In particular, issued
-- proposals are never removed as test cleanup: their DELETE guard is part of
-- the contract and ROLLBACK is the only cleanup mechanism.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('e8000000-0000-4000-8000-000000000001', 'copy-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8000000-0000-4000-8000-000000000002', 'copy-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8000000-0000-4000-8000-000000000003', 'copy-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8000000-0000-4000-8000-000000000004', 'copy-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8000000-0000-4000-8000-000000000005', 'copy-support@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('e8000000-0000-4000-8000-000000000001', 'copy-owner@test.invalid', 'Copy Owner', now(), now()),
  ('e8000000-0000-4000-8000-000000000002', 'copy-client@test.invalid', 'Copy Client', now(), now()),
  ('e8000000-0000-4000-8000-000000000003', 'copy-peer@test.invalid', 'Copy Peer', now(), now()),
  ('e8000000-0000-4000-8000-000000000004', 'copy-foreign@test.invalid', 'Copy Foreign', now(), now()),
  ('e8000000-0000-4000-8000-000000000005', 'copy-support@test.invalid', 'Copy Support', now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.organizations (id, type, name, slug)
VALUES (
  'e8100000-0000-4000-8000-000000000001',
  'design_studio', 'Copy Studio', 'copy-studio'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('e8110000-0000-4000-8000-000000000001',
   'e8000000-0000-4000-8000-000000000001',
   'e8100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('e8110000-0000-4000-8000-000000000002',
   'e8000000-0000-4000-8000-000000000003',
   'e8100000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'e8200000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000002',
  'Copy Client', 'proposal', 'direct'
);

INSERT INTO public.rooms (id, user_id, name, type)
VALUES
  ('e8210000-0000-4000-8000-000000000001',
   'e8000000-0000-4000-8000-000000000001', 'Living Room', 'living_room'),
  ('e8210000-0000-4000-8000-000000000002',
   'e8000000-0000-4000-8000-000000000001', 'Library', 'other');

INSERT INTO public.vendors (id, name)
VALUES ('e8220000-0000-4000-8000-000000000001', 'Snapshot Vendor');

INSERT INTO public.products (
  id, name, description, price_retail, price_trade, dimensions, materials,
  source_url, images, captured_by, captured_at, brand, layer, owner_user_id
)
VALUES
  ('e8230000-0000-4000-8000-000000000001', 'Association-time chair', 'Original copy',
   120000, 80000, '{"width":"30 in"}', ARRAY['oak'],
   'https://example.invalid/original-chair', ARRAY['https://example.invalid/chair.jpg'],
   'e8000000-0000-4000-8000-000000000001', now(), 'Original Brand', 'personal',
   'e8000000-0000-4000-8000-000000000001'),
  ('e8230000-0000-4000-8000-000000000002', 'Second association table', 'Second copy',
   240000, 160000, '{"width":"60 in"}', ARRAY['walnut'],
   'https://example.invalid/second-table', ARRAY['https://example.invalid/table.jpg'],
   'e8000000-0000-4000-8000-000000000001', now(), 'Second Brand', 'personal',
   'e8000000-0000-4000-8000-000000000001'),
  ('e8230000-0000-4000-8000-000000000003', 'Foreign private product', 'Must stay private',
   99900, 55500, '{"width":"20 in"}', ARRAY['steel'],
   'https://foreign.invalid/private', ARRAY['https://foreign.invalid/private.jpg'],
   'e8000000-0000-4000-8000-000000000004', now(), 'Foreign Brand', 'personal',
   'e8000000-0000-4000-8000-000000000004');

INSERT INTO public.paint_colors (id, brand, code, name, hex, family)
VALUES (
  'e8250000-0000-4000-8000-000000000001',
  'benjamin_moore', 'SP-101', 'Lichen', '#A8B5A6', 'green'
);

INSERT INTO public.proposal_captures (
  id, designer_id, source_url, raw_payload, thumbnail_url, status
)
VALUES (
  'e8260000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'https://example.invalid/capture',
  '{"name":"Captured lamp"}',
  'https://example.invalid/capture.jpg',
  'inbox'
);

-- Product two is already style-taught when it is associated. Product one is
-- taught only later, which proves teaching membership is sampled, not live.
INSERT INTO public.product_styles (
  id, product_id, style_id, assigned_by, is_primary, source
)
SELECT
  'e8240000-0000-4000-8000-000000000002',
  'e8230000-0000-4000-8000-000000000002',
  style.id,
  'e8000000-0000-4000-8000-000000000001',
  true,
  'manual'
FROM public.styles AS style
ORDER BY style.id
LIMIT 1;

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  project_address, total_amount, status, valid_until, client_visibility_tier
)
VALUES (
  'e8300000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'e8200000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000002',
  'Immutable edition fixture', 'The exact client-reviewed copy',
  '1 Snapshot Way', 500000, 'draft', now() + interval '30 days', 'full'
);

INSERT INTO public.proposal_scope_rooms (
  id, proposal_id, room_id, name, room_type, dimensions, floor_area_sqft,
  budget_cents, ffe_categories, notes, sort_order
)
VALUES (
  'e8310000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'e8210000-0000-4000-8000-000000000001',
  'Living Room', 'living_room', '20 x 15', 300, 500000,
  ARRAY['seating'], 'Original room notes', 10
);

INSERT INTO public.proposal_sections (
  id, proposal_id, type, title, body, metadata, sort_order
)
VALUES
(
  'e8320000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'design_vision', 'A quiet direction', 'Original narrative',
  '{"moodImages":["https://example.invalid/mood.jpg"],"colors":["#A8B5A6"]}', 10
),
(
  'e8320000-0000-4000-8000-000000000002',
  'e8300000-0000-4000-8000-000000000001',
  'concept', 'Material palette', 'A collected concept',
  '{"mood_board_urls":["https://example.invalid/concept.jpg",42],"color_palette":[{"hex":"#D8C9B8","private_formula":"secret"},{"hex":42}],"internal_notes":"private"}',
  20
);

INSERT INTO public.proposal_items (
  id, proposal_id, product_id, name, description, image_url, room, category,
  quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
  vendor_name, lead_time_weeks, notes, internal_notes, position, item_type,
  scope_room_id, budget_min_cents, budget_max_cents, ffe_category, doc_code,
  custom_fields
)
VALUES (
  'e8330000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'e8230000-0000-4000-8000-000000000001',
  'Client chair', 'Proposal-owned description', 'https://example.invalid/item.jpg',
  'Living Room', 'Seating', 1, 80000, 50, 120000, 120000,
  'Original Vendor', 8, 'Visible note', 'Cost note', 10, 'fixed',
  'e8310000-0000-4000-8000-000000000001', 100000, 140000,
  'seating', 'LR-01', '{"finish":"natural"}'
);

INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_weeks, fee_cents,
  revision_limit, gate_condition, deliverables, sort_order, duration_days,
  anchor_date, lane
)
VALUES (
  'e8340000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'Direction', 'direction', 2, 100000, 2, 'Client signoff',
  '["Concept board"]', 10, 14, current_date + 7, 'main'
);

INSERT INTO public.proposal_phase_deliverables (
  id, phase_id, label, description, is_required, sort_order
)
VALUES (
  'e8350000-0000-4000-8000-000000000001',
  'e8340000-0000-4000-8000-000000000001',
  'Concept board', 'One composed direction', true, 10
);

INSERT INTO public.proposal_phase_gates (
  id, phase_id, gate_kind, payload, sort_order
)
VALUES (
  'e8360000-0000-4000-8000-000000000001',
  'e8340000-0000-4000-8000-000000000001',
  'client_signature', '{"label":"Approve direction"}', 10
);

INSERT INTO public.proposal_schedule_milestones (
  id, phase_id, name, kind, anchor_date, sort_order
)
VALUES (
  'e8370000-0000-4000-8000-000000000001',
  'e8340000-0000-4000-8000-000000000001',
  'Direction review', 'signoff', current_date + 14, 10
);

INSERT INTO public.proposal_exclusions (
  id, proposal_id, description, category, sort_order
)
VALUES (
  'e8380000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'Structural engineering', 'services', 10
);

INSERT INTO public.proposal_change_order_terms (
  id, proposal_id, process_description, hourly_rate_cents,
  minimum_fee_cents, approval_required
)
VALUES (
  'e8390000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'Written approval before additional work', 17500, 35000, true
);

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, phase_id, label, percentage, amount_cents,
  trigger_condition, sort_order
)
VALUES (
  'e83a0000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'e8340000-0000-4000-8000-000000000001',
  'Design retainer', 100, 500000, 'Upon acceptance', 10
);

INSERT INTO public.proposal_palettes (
  id, proposal_id, name, scope_room_id, is_primary, source_image_url, notes,
  sort_order
)
VALUES (
  'e83b0000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'Quiet oak', 'e8310000-0000-4000-8000-000000000001', true,
  'https://example.invalid/palette.jpg', 'Warm and restrained', 10
);

INSERT INTO public.palette_swatches (
  id, palette_id, hex, name, role, paint_color_id, brand, brand_code,
  source_pixel, sort_order
)
VALUES (
  'e83c0000-0000-4000-8000-000000000001',
  'e83b0000-0000-4000-8000-000000000001',
  '#A8B5A6', 'Lichen', 'wall', 'e8250000-0000-4000-8000-000000000001',
  'Snapshot Paint', 'SP-101',
  '{"x":10,"y":20}', 10
);

INSERT INTO public.proposal_boards (
  id, proposal_id, name, scope_room_id, cover_image_url, canvas_width,
  canvas_height, background_color, sort_order, sections, status
)
VALUES (
  'e83d0000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'Living Room direction', 'e8310000-0000-4000-8000-000000000001',
  'https://example.invalid/cover.jpg', 1200, 800, '#FAF8F5', 10,
  '[{"id":"hero","label":"Hero"}]', 'active'
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, locked,
  product_id, palette_id, image_url, content, data
)
VALUES (
  'e83e0000-0000-4000-8000-000000000001',
  'e83d0000-0000-4000-8000-000000000001',
  'note', 10, 20, 240, 120, 1, 0, false,
  NULL, NULL, NULL, 'Quiet material story', '{"section_id":"hero"}'
),
(
  'e83e0000-0000-4000-8000-000000000002',
  'e83d0000-0000-4000-8000-000000000001',
  'product', 260, 20, 240, 240, 2, 0, false,
  'e8230000-0000-4000-8000-000000000002', NULL,
  'https://example.invalid/board-product.jpg', NULL,
  '{"name":"Second association table","image_url":"https://example.invalid/board-product.jpg","price_cents":240000,"vendor_name":"Second Brand"}'
),
(
  'e83e0000-0000-4000-8000-000000000003',
  'e83d0000-0000-4000-8000-000000000001',
  'capture', 520, 20, 240, 240, 3, 0, false,
  NULL, NULL, 'https://example.invalid/capture.jpg', NULL,
  '{"name":"Captured lamp","image_url":"https://example.invalid/capture.jpg"}'
),
(
  'e83e0000-0000-4000-8000-000000000004',
  'e83d0000-0000-4000-8000-000000000001',
  'palette', 780, 20, 240, 240, 4, 0, false,
  NULL, 'e83b0000-0000-4000-8000-000000000001', NULL, NULL,
  '{"name":"Palette pin","swatches":[{"hex":"#A8B5A6","name":"Lichen","role":"wall","trade_secret":"private"}],"internal_notes":"private"}'
);

UPDATE public.proposal_board_items
SET capture_id = 'e8260000-0000-4000-8000-000000000001'
WHERE id = 'e83e0000-0000-4000-8000-000000000003';

INSERT INTO public.proposal_team_members (
  id, proposal_id, user_id, role, permissions, sort_order
)
VALUES
(
  'e83f0000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'lead_designer', '{"can_edit":true}', 10
),
(
  'e83f0000-0000-4000-8000-000000000002',
  'e8300000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000005',
  'support_designer', '{"can_edit":false}', 20
);

INSERT INTO public.spec_field_defs (
  id, proposal_id, field_key, name, kind, sort_order
)
VALUES (
  'e8400000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'finish', 'Finish', 'text', 10
);

INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id, studio_id
)
VALUES (
  'e8410000-0000-4000-8000-000000000001',
  'Operational project fixture',
  'e8000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000002',
  'e8100000-0000-4000-8000-000000000001'
);

INSERT INTO public.proposal_boards (id, project_id, name, sort_order)
VALUES (
  'e8420000-0000-4000-8000-000000000001',
  'e8410000-0000-4000-8000-000000000001',
  'Project-owned working board', 10
);

INSERT INTO public.spec_field_defs (
  id, project_id, field_key, name, kind, sort_order
)
VALUES (
  'e8430000-0000-4000-8000-000000000001',
  'e8410000-0000-4000-8000-000000000001',
  'installed_at', 'Installed at', 'text', 10
);

CREATE OR REPLACE FUNCTION pg_temp.assume_copy_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', p_role)::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.copy_proposal_signed_ip(
  p_proposal_id uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT proposal.signed_ip
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fingerprint_change(
  p_label text,
  p_sql text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_before text;
  v_after text;
BEGIN
  v_before := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  EXECUTE p_sql;
  v_after := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  ASSERT v_after <> v_before,
    format('%s must change the reviewed-copy fingerprint', p_label);
END;
$$;

-- The guard census is deliberately exact. Adding another proposal-owned copy
-- table requires an explicit classification here and in the serializer.
DO $$
DECLARE
  v_actual text[];
  v_expected constant text[] := ARRAY[
    'palette_swatches',
    'proposal_board_items',
    'proposal_boards',
    'proposal_change_order_terms',
    'proposal_exclusions',
    'proposal_items',
    'proposal_palettes',
    'proposal_payment_milestones',
    'proposal_phase_deliverables',
    'proposal_phase_gates',
    'proposal_phases',
    'proposal_schedule_milestones',
    'proposal_scope_rooms',
    'proposal_sections',
    'proposal_team_members',
    'spec_field_defs'
  ];
  v_table text;
  v_definition text;
BEGIN
  SELECT array_agg(class.relname ORDER BY class.relname)
  INTO v_actual
  FROM pg_trigger AS trigger
  JOIN pg_class AS class ON class.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
  JOIN pg_proc AS function ON function.oid = trigger.tgfoid
  JOIN pg_namespace AS function_namespace
    ON function_namespace.oid = function.pronamespace
  WHERE namespace.nspname = 'public'
    AND NOT trigger.tgisinternal
    AND function_namespace.nspname = 'public'
    AND function.proname = 'guard_proposal_child_draft_only';

  ASSERT v_actual = v_expected,
    format('proposal child guard census drifted: expected %s, got %s', v_expected, v_actual);

  FOREACH v_table IN ARRAY v_expected LOOP
    SELECT pg_get_triggerdef(trigger.oid)
    INTO STRICT v_definition
    FROM pg_trigger AS trigger
    WHERE trigger.tgrelid = format('public.%I', v_table)::regclass
      AND trigger.tgname = 'z_guard_proposal_copy_draft_only_trg'
      AND NOT trigger.tgisinternal;

    ASSERT v_definition LIKE 'CREATE TRIGGER % BEFORE INSERT OR DELETE OR UPDATE ON %',
      format('%s guard must cover BEFORE INSERT/UPDATE/DELETE: %s', v_table, v_definition);
  END LOOP;
END;
$$;

-- Every column in every authored source is classified as included or
-- intentionally excluded. Included alias.column tokens must occur in the
-- canonical serializer; excluded tokens must not. A schema addition therefore
-- fails until its copy semantics are decided, rather than silently escaping the
-- review token.
CREATE TEMP TABLE fingerprint_column_contract (
  table_name text PRIMARY KEY,
  table_alias text NOT NULL,
  included text[] NOT NULL,
  excluded text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO fingerprint_column_contract VALUES
  ('proposals', 'proposal',
   ARRAY['id','designer_id','client_id','designer_client_id','title','description',
         'project_address','cover_image','subtotal','discount_amount','discount_percent',
         'tax_rate','tax_amount','total_amount','deposit_percent','payment_terms',
         'payment_notes','valid_until','version','parent_proposal_id','template_id',
         'revision_summary','personal_message','cc_email','client_visibility_tier',
         'feedback_enabled','created_at'],
   -- 00412's commercial columns are lifecycle/edition state, not authored
   -- payload: document_kind and commercial_state are set by the authoring and
   -- signature RPCs, and superseded_*/replacement_proposal_id record the
   -- cut-over of an edition. A copy re-derives all five, so the review
   -- fingerprint must not carry them.
   ARRAY['project_id','status','sent_at','viewed_at','accepted_at','declined_at',
         'decline_reason','updated_at','client_feedback','signed_at','signed_by_name',
         'signed_ip','last_nudged_at','nudge_count','proposal_send_dispatch_id',
         'document_kind','commercial_state','superseded_at','superseded_reason',
         'replacement_proposal_id']),
  ('proposal_sections', 'section',
   ARRAY['id','proposal_id','type','title','body','metadata','sort_order'],
   ARRAY['created_at','updated_at']),
  ('proposal_scope_rooms', 'room',
   ARRAY['id','proposal_id','room_id','name','room_type','dimensions','floor_area_sqft',
         'budget_cents','ffe_categories','notes','sort_order'],
   ARRAY['created_at','updated_at']),
  ('proposal_items', 'item',
   ARRAY['id','proposal_id','product_id','name','description','image_url','room','category',
         'quantity','unit_price','markup_percent','unit_sell_price','line_total_cents',
         'vendor_id','vendor_name','lead_time_weeks','notes','internal_notes','position',
         'item_type','scope_room_id','budget_min_cents','budget_max_cents','ffe_category',
         'doc_code','custom_fields','client_product_snapshot'],
   ARRAY['created_at','updated_at']),
  ('proposal_palettes', 'palette',
   ARRAY['id','proposal_id','name','scope_room_id','is_primary','source_image_url','notes',
         'sort_order'],
   ARRAY['created_at','updated_at']),
  ('palette_swatches', 'swatch',
   ARRAY['id','palette_id','hex','name','role','paint_color_id','brand','brand_code',
         'source_pixel','sort_order'],
   ARRAY['created_at']),
  ('proposal_boards', 'board',
   ARRAY['id','proposal_id','name','scope_room_id','cover_image_url','canvas_width',
         'canvas_height','background_color','sort_order','sections','status'],
   ARRAY['created_at','updated_at','project_id','source_project_board_id','project_room_id',
         'cover_review_media_asset_id']),
  ('proposal_board_items', 'board_item',
   ARRAY['id','board_id','type','x','y','width','height','z_index','rotation','locked',
         'product_id','capture_id','palette_id','image_url','content','data'],
   ARRAY['created_at','updated_at','project_ffe_item_id','review_media_asset_id']),
  ('proposal_phases', 'phase',
   ARRAY['id','proposal_id','name','phase_key','duration_weeks','fee_cents',
         'revision_limit','gate_condition','deliverables','sort_order','duration_days',
         'follows_phase_id','anchor_date','lane'],
   ARRAY['created_at','updated_at']),
  ('proposal_phase_deliverables', 'deliverable',
   ARRAY['id','phase_id','label','description','is_required','completed_at','completed_by',
         'sort_order'],
   ARRAY['created_at','updated_at']),
  ('proposal_phase_gates', 'gate',
   ARRAY['id','phase_id','gate_kind','payload','satisfied_at','satisfied_by',
         'override_reason','sort_order'],
   ARRAY['created_at','updated_at']),
  ('proposal_schedule_milestones', 'milestone',
   ARRAY['id','phase_id','name','kind','anchor_date','sort_order'],
   ARRAY['created_at','updated_at']),
  ('proposal_exclusions', 'exclusion',
   ARRAY['id','proposal_id','description','category','sort_order'],
   ARRAY['created_at']),
  ('proposal_change_order_terms', 'terms',
   ARRAY['id','proposal_id','process_description','hourly_rate_cents','minimum_fee_cents',
         'approval_required'],
   ARRAY['created_at','updated_at']),
  ('proposal_payment_milestones', 'milestone',
   ARRAY['id','proposal_id','phase_id','label','percentage','trigger_condition','sort_order'],
   ARRAY['amount_cents','created_at']),
  ('proposal_team_members', 'member',
   ARRAY['id','proposal_id','user_id','role','permissions','sort_order','created_at'],
   ARRAY['updated_at']),
  ('spec_field_defs', 'definition',
   ARRAY['id','proposal_id','field_key','name','kind','sort_order'],
   ARRAY['project_id','created_at','updated_at']);

DO $$
DECLARE
  v_source text := pg_get_functiondef(
    'public._proposal_review_fingerprint(uuid)'::regprocedure
  );
  v_contract record;
  v_actual text[];
  v_classified text[];
  v_column text;
BEGIN
  FOR v_contract IN SELECT * FROM fingerprint_column_contract ORDER BY table_name LOOP
    SELECT array_agg(column_name ORDER BY column_name)
    INTO v_actual
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_contract.table_name;

    SELECT array_agg(column_name ORDER BY column_name)
    INTO v_classified
    FROM unnest(v_contract.included || v_contract.excluded) AS classified(column_name);

    ASSERT cardinality(v_contract.included || v_contract.excluded)
           = cardinality(ARRAY(
               SELECT DISTINCT column_name
               FROM unnest(v_contract.included || v_contract.excluded) AS value(column_name)
             )),
      format('%s fingerprint contract classifies a column twice', v_contract.table_name);
    ASSERT v_actual = v_classified,
      format('%s column census drifted: actual %s, classified %s',
             v_contract.table_name, v_actual, v_classified);
    ASSERT position(v_contract.table_name IN v_source) > 0,
      format('fingerprint is missing table %s', v_contract.table_name);

    FOREACH v_column IN ARRAY v_contract.included LOOP
      ASSERT position(format('%s.%s', v_contract.table_alias, v_column) IN v_source) > 0,
        format('fingerprint is missing included column %s.%s',
               v_contract.table_alias, v_column);
    END LOOP;
    FOREACH v_column IN ARRAY v_contract.excluded LOOP
      ASSERT position(format('%s.%s', v_contract.table_alias, v_column) IN v_source) = 0,
        format('fingerprint unexpectedly includes excluded column %s.%s',
               v_contract.table_alias, v_column);
    END LOOP;
  END LOOP;
END;
$$;

-- The full policy catalog for the three legacy exposure points is checked by
-- command and semantics, not merely by policy name.
DO $$
DECLARE
  v_policy record;
  v_role text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'proposals' AND policyname = 'Clients can update proposal status')
        OR (tablename = 'proposal_items' AND policyname = 'Inherit proposal access')
        OR (tablename = 'proposal_sections' AND policyname = 'Inherit proposal access for sections')
      )
  ), 'legacy client mutation policies must be absent';

  ASSERT (
    SELECT array_agg(format('%s:%s', policyname, cmd) ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'proposal_items'
  ) = ARRAY[
    'proposal_items_design_studio_delete:DELETE',
    'proposal_items_design_studio_insert:INSERT',
    'proposal_items_design_studio_select:SELECT',
    'proposal_items_design_studio_update:UPDATE',
    'proposal_items_legacy_ios_client_select:SELECT'
  ],
    'proposal_items policy catalog drifted';

  ASSERT (
    SELECT array_agg(format('%s:%s', policyname, cmd) ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'proposal_sections'
  ) = ARRAY[
    'proposal_sections_design_studio_delete:DELETE',
    'proposal_sections_design_studio_insert:INSERT',
    'proposal_sections_design_studio_select:SELECT',
    'proposal_sections_design_studio_update:UPDATE',
    'proposal_sections_legacy_ios_client_select:SELECT'
  ],
    'proposal_sections policy catalog drifted';

  ASSERT (
    SELECT array_agg(format('%s:%s', policyname, cmd) ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'proposals'
  ) = ARRAY[
    'proposals_design_studio_delete:DELETE',
    'proposals_design_studio_insert:INSERT',
    'proposals_design_studio_select:SELECT',
    'proposals_design_studio_update:UPDATE',
    'proposals_legacy_ios_client_select:SELECT'
  ], 'proposals policy catalog drifted';

  FOR v_policy IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('proposals', 'proposal_items', 'proposal_sections')
      AND cmd <> 'SELECT'
  LOOP
    ASSERT position('client_id = auth.uid()' IN
                    COALESCE(v_policy.qual, '') || COALESCE(v_policy.with_check, '')) = 0
       AND position('auth.uid() = client_id' IN
                    COALESCE(v_policy.qual, '') || COALESCE(v_policy.with_check, '')) = 0,
      format('client mutation leaked through %s.%s', v_policy.tablename, v_policy.policyname);
  END LOOP;

  ASSERT has_function_privilege(
           'authenticated', 'public.list_client_proposals()', 'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated',
           'public.get_client_proposal_bundle(uuid)',
           'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated',
           'public.get_client_proposal_feedback(uuid,boolean)',
           'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated', 'public.mark_proposal_viewed(uuid)', 'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated', 'public.decline_proposal(uuid,text)', 'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated',
           'public.sign_proposal(uuid,text)',
           'EXECUTE'
         ), 'authenticated clients require only safe proposal RPC surfaces';

  ASSERT pg_get_function_result(
           'public.mark_proposal_viewed(uuid)'::regprocedure
         ) = 'jsonb'
     AND pg_get_function_result(
           'public.decline_proposal(uuid,text)'::regprocedure
         ) = 'jsonb'
     AND pg_get_function_result(
           'public.sign_proposal(uuid,text)'::regprocedure
         ) = 'jsonb',
    'client lifecycle RPCs must return explicit JSON receipts, never table rows';

  ASSERT to_regprocedure(
           'public.sign_proposal(uuid,text,text,boolean,date)'
         ) IS NULL
     AND has_function_privilege(
           'authenticated',
           'public.sign_proposal(uuid,text,text)',
           'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated',
           'public.sign_proposal(uuid,text,text,boolean)',
           'EXECUTE'
         ),
    'exact rollback wrappers must avoid the defaulted five-argument surface';
  ASSERT has_function_privilege(
           'service_role',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         )
     AND NOT has_function_privilege(
           'authenticated',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         ),
    'trusted IP signature authority must be exact to service_role';

  FOREACH v_role IN ARRAY ARRAY['anon', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(
                 v_role, 'public.list_client_proposals()', 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role, 'public.get_client_proposal_bundle(uuid)', 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role, 'public.get_client_proposal_feedback(uuid,boolean)', 'EXECUTE'
               ), format('%s must not receive client DTO authority', v_role);
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(
                 v_role,
                 'public._activate_proposal_as_project_impl(uuid,date)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public._activate_proposal_as_project_authorized(uuid,date)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public._sign_proposal_authorized_00400(uuid,text,uuid,text)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public._send_proposal_with_dispatch(uuid,timestamptz,integer,text,text,text,timestamptz)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public._mark_proposal_viewed_impl(uuid)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public._decline_proposal_impl(uuid,text)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public._item_feedback_gate_impl(uuid,uuid,uuid)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public.item_feedback_gate(uuid,uuid,uuid)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public.notify_item_feedback(uuid)',
                 'EXECUTE'
               ), format('%s must not execute private lifecycle helpers', v_role);
  END LOOP;

  ASSERT has_function_privilege(
           'authenticated',
           'public.can_access_item_feedback_anchor(uuid,uuid,uuid)',
           'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated',
           'public.can_submit_item_feedback_anchor(uuid,uuid,uuid)',
           'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated', 'public.nudge_proposal(uuid)', 'EXECUTE'
         )
     AND has_function_privilege(
           'authenticated',
           'public.request_proposal_change(uuid,text)',
           'EXECUTE'
         ), 'authenticated receives only boolean feedback gates and guarded client actions';

  FOREACH v_role IN ARRAY ARRAY['anon', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(
                 v_role,
                 'public.can_access_item_feedback_anchor(uuid,uuid,uuid)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public.can_submit_item_feedback_anchor(uuid,uuid,uuid)',
                 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role, 'public.nudge_proposal(uuid)', 'EXECUTE'
               )
       AND NOT has_function_privilege(
                 v_role,
                 'public.request_proposal_change(uuid,text)',
                 'EXECUTE'
               ), format('%s must not receive feedback/client-action authority', v_role);
  END LOOP;

  ASSERT has_function_privilege(
           'authenticated',
           'public.activate_proposal_as_project(uuid,date)',
           'EXECUTE'
         )
     AND NOT has_function_privilege(
           'anon',
           'public.activate_proposal_as_project(uuid,date)',
           'EXECUTE'
         )
     AND NOT has_function_privilege(
           'service_role',
           'public.activate_proposal_as_project(uuid,date)',
           'EXECUTE'
         ), 'only authenticated callers may enter public activation authority';

  ASSERT has_function_privilege(
           'service_role', 'public.resolve_document_share(text)', 'EXECUTE'
         )
     AND NOT has_function_privilege(
           'anon', 'public.resolve_document_share(text)', 'EXECUTE'
         ), 'guest route service authority must resolve shares without anon RPC access';
END;
$$;

-- Association-time product provenance is populated before any send.
DO $$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT client_product_snapshot INTO STRICT v_snapshot
  FROM public.proposal_items
  WHERE id = 'e8330000-0000-4000-8000-000000000001';

  ASSERT v_snapshot->>'product_id' = 'e8230000-0000-4000-8000-000000000001'
     AND v_snapshot->>'name' = 'Association-time chair'
     AND v_snapshot->>'brand' = 'Original Brand'
     AND (v_snapshot->>'price_retail')::integer = 120000
     AND (v_snapshot->>'has_teaching')::boolean = false,
    format('association snapshot was incomplete: %s', v_snapshot);
END;
$$;

-- Header, every top-level authored child, and every nested authored child
-- independently invalidate a reviewed token while the proposal is a draft.
SELECT pg_temp.expect_fingerprint_change(
  'proposal title',
  $$UPDATE public.proposals SET title = 'Immutable edition fixture v2'
    WHERE id = 'e8300000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'section title',
  $$UPDATE public.proposal_sections SET title = 'A collected direction'
    WHERE id = 'e8320000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'section body',
  $$UPDATE public.proposal_sections SET body = 'Revised narrative'
    WHERE id = 'e8320000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'section metadata',
  $$UPDATE public.proposal_sections SET metadata = metadata || '{"colors":["#7D8A78"]}'
    WHERE id = 'e8320000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'section order',
  $$UPDATE public.proposal_sections SET sort_order = 11
    WHERE id = 'e8320000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'scope room and room association',
  $$UPDATE public.proposal_scope_rooms
    SET room_id = 'e8210000-0000-4000-8000-000000000002', notes = 'Library-facing plan'
    WHERE id = 'e8310000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'item pricing, vendor, and private authored fields',
  $$UPDATE public.proposal_items
    SET unit_price = 81000, unit_sell_price = 125000, markup_percent = 54.32,
        line_total_cents = 125000,
        vendor_id = 'e8220000-0000-4000-8000-000000000001',
        internal_notes = 'Requoted cost', notes = 'Visible revised note'
    WHERE id = 'e8330000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'palette',
  $$UPDATE public.proposal_palettes SET notes = 'Warmer and restrained'
    WHERE id = 'e83b0000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'nested palette swatch',
  $$UPDATE public.palette_swatches SET hex = '#7D8A78'
    WHERE id = 'e83c0000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'board',
  $$UPDATE public.proposal_boards SET background_color = '#F0ECE5'
    WHERE id = 'e83d0000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'nested board item',
  $$UPDATE public.proposal_board_items SET content = 'Layered material story'
    WHERE id = 'e83e0000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'phase',
  $$UPDATE public.proposal_phases SET duration_days = 15
    WHERE id = 'e8340000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'nested phase deliverable',
  $$UPDATE public.proposal_phase_deliverables SET description = 'Two composed directions'
    WHERE id = 'e8350000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'nested phase gate',
  $$UPDATE public.proposal_phase_gates SET payload = '{"label":"Approve final direction"}'
    WHERE id = 'e8360000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'nested schedule milestone',
  $$UPDATE public.proposal_schedule_milestones SET anchor_date = anchor_date + 1
    WHERE id = 'e8370000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'exclusion',
  $$UPDATE public.proposal_exclusions SET description = 'Engineering and permitting'
    WHERE id = 'e8380000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'change-order terms',
  $$UPDATE public.proposal_change_order_terms SET minimum_fee_cents = 40000
    WHERE id = 'e8390000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'payment schedule',
  $$UPDATE public.proposal_payment_milestones SET trigger_condition = 'At written acceptance'
    WHERE id = 'e83a0000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'proposal team',
  $$UPDATE public.proposal_team_members SET permissions = '{"can_edit":true,"can_send":true}'
    WHERE id = 'e83f0000-0000-4000-8000-000000000001'$$
);
SELECT pg_temp.expect_fingerprint_change(
  'proposal spec definition',
  $$UPDATE public.spec_field_defs SET name = 'Selected finish'
    WHERE id = 'e8400000-0000-4000-8000-000000000001'$$
);

-- Derived payment amounts and operational proposal/audit fields are not part
-- of the authored review token.
DO $$
DECLARE
  v_before text;
  v_after text;
BEGIN
  v_before := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  UPDATE public.proposal_payment_milestones
  SET amount_cents = amount_cents + 1
  WHERE id = 'e83a0000-0000-4000-8000-000000000001';
  PERFORM set_config(
    'app.proposal_feedback_id',
    'e8300000-0000-4000-8000-000000000001',
    true
  );
  PERFORM set_config(
    'app.proposal_nudge_id',
    'e8300000-0000-4000-8000-000000000001',
    true
  );
  UPDATE public.proposals
  SET client_feedback = 'Operational feedback',
      last_nudged_at = now() - interval '10 days',
      nudge_count = 2
  WHERE id = 'e8300000-0000-4000-8000-000000000001';
  PERFORM set_config('app.proposal_feedback_id', '', true);
  PERFORM set_config('app.proposal_nudge_id', '', true);
  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    'e8300000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'section_viewed', '{"section":"design_vision"}'
  );
  v_after := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  ASSERT v_after = v_before,
    'derived amounts and operational feedback/nudge/engagement must not change copy';
END;
$$;

-- Live catalog and teaching edits never flow into the proposal edition. A new
-- product association is the only act that refreshes the system-owned copy.
DO $$
DECLARE
  v_before text;
  v_after text;
  v_snapshot jsonb;
  v_error text;
BEGIN
  v_before := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  UPDATE public.products
  SET name = 'Mutable catalog chair', brand = 'Changed Brand', price_retail = 999999
  WHERE id = 'e8230000-0000-4000-8000-000000000001';
  INSERT INTO public.product_styles (
    id, product_id, style_id, assigned_by, is_primary, source
  )
  SELECT
    'e8240000-0000-4000-8000-000000000001',
    'e8230000-0000-4000-8000-000000000001',
    style.id,
    'e8000000-0000-4000-8000-000000000001',
    true,
    'manual'
  FROM public.styles AS style
  ORDER BY style.id
  LIMIT 1;
  v_after := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  SELECT client_product_snapshot INTO STRICT v_snapshot
  FROM public.proposal_items
  WHERE id = 'e8330000-0000-4000-8000-000000000001';

  ASSERT v_after = v_before,
    'live product/style edits must not change the proposal fingerprint';
  ASSERT v_snapshot->>'name' = 'Association-time chair'
     AND v_snapshot->>'brand' = 'Original Brand'
     AND (v_snapshot->>'price_retail')::integer = 120000
     AND (v_snapshot->>'has_teaching')::boolean = false,
    format('live catalog edits leaked into proposal snapshot: %s', v_snapshot);

  v_before := v_after;
  UPDATE public.proposal_items
  SET product_id = 'e8230000-0000-4000-8000-000000000002'
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  v_after := public._proposal_review_fingerprint(
    'e8300000-0000-4000-8000-000000000001'
  );
  SELECT client_product_snapshot INTO STRICT v_snapshot
  FROM public.proposal_items
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  ASSERT v_after <> v_before, 'changing product_id must invalidate the review token';
  ASSERT v_snapshot->>'product_id' = 'e8230000-0000-4000-8000-000000000002'
     AND v_snapshot->>'name' = 'Second association table'
     AND (v_snapshot->>'has_teaching')::boolean = true,
    format('new association did not capture its exact catalog state: %s', v_snapshot);

  BEGIN
    UPDATE public.proposal_items
    SET client_product_snapshot = '{"name":"forged"}'
    WHERE id = 'e8330000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'client product snapshots are system-managed',
    format('direct snapshot edit should reject in draft, got %L', v_error);
END;
$$;

-- The SECURITY DEFINER snapshot trigger is not a private-product UUID oracle.
-- A studio author may edit the draft item, but cannot associate another
-- user's personal catalog row or learn its copied fields through the trigger.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_product_before uuid;
  v_snapshot_before jsonb;
  v_error text;
BEGIN
  SELECT product_id, client_product_snapshot
  INTO STRICT v_product_before, v_snapshot_before
  FROM public.proposal_items
  WHERE id = 'e8330000-0000-4000-8000-000000000001';

  BEGIN
    UPDATE public.proposal_items
    SET product_id = 'e8230000-0000-4000-8000-000000000003'
    WHERE id = 'e8330000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error =
    'proposal item product e8230000-0000-4000-8000-000000000003 is not visible to the caller',
    format('cross-owner snapshot association should fail closed, got %L', v_error);
  ASSERT (SELECT product_id = v_product_before
                 AND client_product_snapshot = v_snapshot_before
          FROM public.proposal_items
          WHERE id = 'e8330000-0000-4000-8000-000000000001'),
    'rejected private-product association must preserve pointer and snapshot';
END;
$$;
RESET ROLE;

-- Issue through the canonical optimistic-concurrency RPC.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_snapshot record;
  v_sent public.proposals;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'e8300000-0000-4000-8000-000000000001'
  );
  v_sent := public.send_proposal(
    'e8300000-0000-4000-8000-000000000001',
    v_snapshot.proposal_updated_at,
    v_snapshot.proposal_total_amount,
    v_snapshot.schedule_fingerprint
  );
  ASSERT v_sent.status = 'sent' AND v_sent.sent_at IS NOT NULL,
    'canonical send must issue the reviewed edition';
END;
$$;

-- Operational nudge remains available to the owner without changing the copy.
RESET ROLE;
CREATE TEMP TABLE operational_fingerprint_before (
  value text NOT NULL
) ON COMMIT DROP;
INSERT INTO operational_fingerprint_before
SELECT public._proposal_review_fingerprint(
  'e8300000-0000-4000-8000-000000000001'
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_stamp timestamptz;
BEGIN
  v_stamp := public.nudge_proposal('e8300000-0000-4000-8000-000000000001');
  ASSERT v_stamp IS NOT NULL,
    'canonical nudge must remain operational';
END;
$$;
RESET ROLE;
DO $$
BEGIN
  ASSERT public._proposal_review_fingerprint(
           'e8300000-0000-4000-8000-000000000001'
         ) = (SELECT value FROM operational_fingerprint_before),
    'canonical nudge must not change authored copy';
END;
$$;

-- The client retains issued read access and canonical view authority, but no
-- direct mutation or delete route to parent/items/sections.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_bundle jsonb;
  v_list jsonb;
  v_forbidden text;
  v_rows integer;
  v_error text;
  v_viewed jsonb;
BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.proposals
          WHERE id = 'e8300000-0000-4000-8000-000000000001'),
    'installed iOS must retain scoped issued-proposal read compatibility';
  ASSERT (SELECT count(*) = 1 FROM public.proposal_items
          WHERE proposal_id = 'e8300000-0000-4000-8000-000000000001'),
    'installed iOS must retain scoped proposal-item read compatibility';
  ASSERT (SELECT count(*) = 2 FROM public.proposal_sections
          WHERE proposal_id = 'e8300000-0000-4000-8000-000000000001'),
    'installed iOS must retain scoped proposal-section read compatibility';

  v_list := public.list_client_proposals();
  v_bundle := public.get_client_proposal_bundle(
    'e8300000-0000-4000-8000-000000000001'
  );
  ASSERT jsonb_array_length(v_list) = 1
     AND v_list->0->>'id' = 'e8300000-0000-4000-8000-000000000001',
    format('client list DTO must return only the issued proposal: %s', v_list);
  ASSERT v_bundle->'proposal'->>'title' = 'Immutable edition fixture v2'
     AND v_bundle->'proposal'->'items'->0->>'name' = 'Client chair'
     AND (v_bundle->'proposal'->'items'->0->>'unit_sell_price')::integer = 125000
     AND v_bundle->'proposal'->'items'->0->'client_product_snapshot'->>'name'
         = 'Second association table'
     AND v_bundle #>> '{boards,0,items,3,data,swatches,0,hex}' = '#A8B5A6'
     AND v_bundle #>> '{sections,1,metadata,color_palette,0,hex}' = '#D8C9B8'
     AND v_bundle #>> '{sections,1,metadata,mood_board_urls,0}'
         = 'https://example.invalid/concept.jpg'
     AND jsonb_array_length(v_bundle->'sections') = 2,
    format('safe detail DTO lost client rendering fields: %s', v_bundle);

  FOREACH v_forbidden IN ARRAY ARRAY[
    'cc_email', 'signed_ip', 'client_feedback', 'proposal_send_dispatch_id',
    'client_id', 'product_id', 'price_trade', 'unit_price', 'markup_percent',
    'internal_notes', 'vendor_id', 'custom_fields', 'trade_secret',
    'private_formula'
  ] LOOP
    ASSERT position(format('"%s"', v_forbidden) IN v_list::text) = 0,
      format('client list leaked forbidden key %s: %s', v_forbidden, v_list);
    ASSERT position(format('"%s"', v_forbidden) IN v_bundle::text) = 0,
      format('client detail leaked forbidden key %s: %s', v_forbidden, v_bundle);
  END LOOP;
  ASSERT position('e8230000-0000-4000-8000-000000000002' IN v_list::text) = 0,
    format('client list leaked a linkable catalog UUID: %s', v_list);
  ASSERT position('e8230000-0000-4000-8000-000000000002' IN v_bundle::text) = 0,
    format('client detail leaked a linkable catalog UUID: %s', v_bundle);

  UPDATE public.proposals SET title = 'Client-forged parent'
  WHERE id = 'e8300000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, format('client parent UPDATE affected %s rows', v_rows);

  UPDATE public.proposal_items SET name = 'Client-forged item'
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, format('client item UPDATE affected %s rows', v_rows);

  DELETE FROM public.proposal_sections
  WHERE id = 'e8320000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, format('client section DELETE affected %s rows', v_rows);

  DELETE FROM public.proposals
  WHERE id = 'e8300000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, format('client proposal DELETE affected %s rows', v_rows);

  BEGIN
    INSERT INTO public.proposal_items (
      proposal_id, name, quantity, unit_price, unit_sell_price, line_total_cents
    ) VALUES (
      'e8300000-0000-4000-8000-000000000001',
      'Client-forged insertion', 1, 1, 1, 1
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'client proposal-item INSERT must be rejected';

  v_viewed := public.mark_proposal_viewed(
    'e8300000-0000-4000-8000-000000000001'
  );
  ASSERT v_viewed->>'status' = 'viewed'
     AND v_viewed->>'viewed_at' IS NOT NULL,
    'canonical client view must remain functional';
  ASSERT (
    SELECT array_agg(key ORDER BY key)
    FROM jsonb_object_keys(v_viewed) AS receipt(key)
  ) = ARRAY['id', 'status', 'viewed_at'],
    format('view receipt must be an exact allowlist: %s', v_viewed);
END;
$$;

-- Feedback routing keeps anchor identity private. The exact client can submit
-- and read; the owning designer can operate; an outsider who already knows the
-- proposal-item UUID receives only false/zero rows and cannot invoke internals.
INSERT INTO public.item_feedback (
  id, proposal_item_id, client_id, verdict, body
)
VALUES (
  'e8490000-0000-4000-8000-000000000001',
  'e8330000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000002',
  'comment',
  'Please confirm the finish.'
);

DO $$
DECLARE
  v_reply public.item_feedback_events;
BEGIN
  ASSERT public.can_access_item_feedback_anchor(
           'e8330000-0000-4000-8000-000000000001', NULL, NULL
         )
     AND public.can_submit_item_feedback_anchor(
           'e8330000-0000-4000-8000-000000000001', NULL, NULL
         ), 'exact client must pass feedback access/submit predicates';
  ASSERT (SELECT count(*) = 1
          FROM public.item_feedback
          WHERE id = 'e8490000-0000-4000-8000-000000000001'),
    'exact client must read its feedback';
  ASSERT (SELECT count(*) = 1
          FROM public.item_feedback_events
          WHERE feedback_id = 'e8490000-0000-4000-8000-000000000001'),
    'exact client must read the trigger-created feedback event';

  v_reply := public.reply_to_item_feedback(
    'e8490000-0000-4000-8000-000000000001',
    'Client follow-up'
  );
  ASSERT v_reply.kind = 'replied' AND v_reply.actor = auth.uid(),
    'trusted feedback operations must retain private routing access';
END;
$$;

SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_resolved public.item_feedback;
BEGIN
  ASSERT public.can_access_item_feedback_anchor(
           'e8330000-0000-4000-8000-000000000001', NULL, NULL
         ), 'proposal author must pass the boolean feedback access predicate';
  v_resolved := public.resolve_item_feedback(
    'e8490000-0000-4000-8000-000000000001'
  );
  ASSERT v_resolved.resolved_at IS NOT NULL,
    'owning designer feedback operation must retain private routing access';
END;
$$;

SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000003');
DO $$
BEGIN
  ASSERT NOT public.can_access_item_feedback_anchor(
               'e8330000-0000-4000-8000-000000000001', NULL, NULL
             ),
    'studio peer must not gain feedback-body access beyond the exact owner';
  ASSERT (SELECT count(*) = 0
          FROM public.item_feedback
          WHERE id = 'e8490000-0000-4000-8000-000000000001'),
    'studio peer must remain unable to read the owner-only feedback thread';
END;
$$;

SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_error text;
BEGIN
  ASSERT NOT public.can_access_item_feedback_anchor(
               'e8330000-0000-4000-8000-000000000001', NULL, NULL
             )
     AND NOT public.can_submit_item_feedback_anchor(
               'e8330000-0000-4000-8000-000000000001', NULL, NULL
             ), 'outsider with a known anchor must receive only false';
  ASSERT (SELECT count(*) = 0
          FROM public.item_feedback
          WHERE id = 'e8490000-0000-4000-8000-000000000001'),
    'outsider must not read foreign feedback';
  ASSERT (SELECT count(*) = 0
          FROM public.item_feedback_events
          WHERE feedback_id = 'e8490000-0000-4000-8000-000000000001'),
    'outsider must not read foreign feedback events';

  BEGIN
    PERFORM 1
    FROM public.item_feedback_gate(
      'e8330000-0000-4000-8000-000000000001', NULL, NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'outsider must not execute the full-record feedback router';

  v_error := NULL;
  BEGIN
    INSERT INTO public.item_feedback (
      proposal_item_id, client_id, verdict
    ) VALUES (
      'e8330000-0000-4000-8000-000000000001',
      'e8000000-0000-4000-8000-000000000004',
      'approved'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'outsider must not insert feedback on a known foreign anchor';

  v_error := NULL;
  BEGIN
    PERFORM public.notify_item_feedback(
      'e8490000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'outsider must not invoke feedback notification internals';
END;
$$;

-- Direct pointer clearing is still an authored edit. The only post-issue
-- detach exception is the nested FK action from deleting an external source.
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.proposal_items
  SET product_id = NULL
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
         AND (SELECT product_id IS NOT NULL
              FROM public.proposal_items
              WHERE id = 'e8330000-0000-4000-8000-000000000001'),
    'terminal product detach must be hidden by draft-only write policy';

  UPDATE public.proposal_board_items
  SET capture_id = NULL
  WHERE id = 'e83e0000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
         AND (SELECT capture_id IS NOT NULL
              FROM public.proposal_board_items
              WHERE id = 'e83e0000-0000-4000-8000-000000000003'),
    'terminal capture detach must be hidden by draft-only write policy';
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_snapshot jsonb;
  v_board_product_data jsonb;
  v_board_capture_data jsonb;
  v_error text;
BEGIN
  SELECT client_product_snapshot INTO STRICT v_snapshot
  FROM public.proposal_items
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  SELECT data INTO STRICT v_board_product_data
  FROM public.proposal_board_items
  WHERE id = 'e83e0000-0000-4000-8000-000000000002';
  SELECT data INTO STRICT v_board_capture_data
  FROM public.proposal_board_items
  WHERE id = 'e83e0000-0000-4000-8000-000000000003';

  DELETE FROM public.products
  WHERE id = 'e8230000-0000-4000-8000-000000000002';
  ASSERT (SELECT product_id IS NULL
                 AND client_product_snapshot = v_snapshot
          FROM public.proposal_items
          WHERE id = 'e8330000-0000-4000-8000-000000000001'),
    'catalog deletion must detach the live item pointer and preserve its copy';
  ASSERT (SELECT product_id IS NULL AND data = v_board_product_data
          FROM public.proposal_board_items
          WHERE id = 'e83e0000-0000-4000-8000-000000000002'),
    'catalog deletion must preserve issued board product data';

  DELETE FROM public.vendors
  WHERE id = 'e8220000-0000-4000-8000-000000000001';
  ASSERT (SELECT vendor_id IS NULL AND vendor_name = 'Original Vendor'
          FROM public.proposal_items
          WHERE id = 'e8330000-0000-4000-8000-000000000001'),
    'vendor deletion must preserve the issued vendor display copy';

  DELETE FROM public.rooms
  WHERE id = 'e8210000-0000-4000-8000-000000000002';
  ASSERT (SELECT room_id IS NULL
                 AND name = 'Living Room'
                 AND notes = 'Library-facing plan'
          FROM public.proposal_scope_rooms
          WHERE id = 'e8310000-0000-4000-8000-000000000001'),
    'room deletion must preserve the issued scope-room copy';

  DELETE FROM public.proposal_captures
  WHERE id = 'e8260000-0000-4000-8000-000000000001';
  ASSERT (SELECT capture_id IS NULL AND data = v_board_capture_data
          FROM public.proposal_board_items
          WHERE id = 'e83e0000-0000-4000-8000-000000000003'),
    'capture deletion must preserve the issued board capture data';

  DELETE FROM public.paint_colors
  WHERE id = 'e8250000-0000-4000-8000-000000000001';
  ASSERT (SELECT paint_color_id IS NULL
                 AND hex = '#7D8A78'
                 AND name = 'Lichen'
                 AND brand = 'Snapshot Paint'
          FROM public.palette_swatches
          WHERE id = 'e83c0000-0000-4000-8000-000000000001'),
    'paint deletion must preserve the issued swatch display copy';

  BEGIN
    DELETE FROM public.profiles
    WHERE id = 'e8000000-0000-4000-8000-000000000005';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'proposal % is viewed, so its authored copy is immutable',
    format('team-member profile cascade must be blocked to preserve the issued copy, got %L',
           v_error);
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_team_members
    WHERE id = 'e83f0000-0000-4000-8000-000000000002'
      AND user_id = 'e8000000-0000-4000-8000-000000000005'
  ), 'blocked profile deletion must preserve the issued team member';
END;
$$;

-- Safe client DTOs apply the same tier/status law in list and detail. A
-- curated edition carries no itemized boards or payment schedule, and a
-- superseded revised edition is unavailable even by exact UUID.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status,
  client_visibility_tier
)
VALUES
  (
    'e8460000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Curated client copy', 200000, 'draft', 'curated'
  ),
  (
    'e8460000-0000-4000-8000-000000000004',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Milestone client copy', 300000, 'draft', 'milestone'
  );

INSERT INTO public.proposal_items (
  id, proposal_id, product_id, name, quantity, unit_price, unit_sell_price,
  line_total_cents, vendor_name, position, item_type
)
VALUES (
  'e8470000-0000-4000-8000-000000000002',
  'e8460000-0000-4000-8000-000000000004',
  'e8230000-0000-4000-8000-000000000001',
  'Milestone chair', 1, 80000, 120000, 120000,
  'Hidden milestone vendor', 10, 'fixed'
);

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, label, percentage, amount_cents, trigger_condition, sort_order
)
VALUES
  (
    'e8470000-0000-4000-8000-000000000001',
    'e8460000-0000-4000-8000-000000000001',
    'Hidden curated retainer', 100, 200000, 'Upon acceptance', 10
  ),
  (
    'e8470000-0000-4000-8000-000000000003',
    'e8460000-0000-4000-8000-000000000004',
    'Visible milestone retainer', 100, 300000, 'Upon acceptance', 10
  );

SELECT set_config(
  'app.proposal_send_id',
  'e8460000-0000-4000-8000-000000000001',
  true
);
UPDATE public.proposals
SET status = 'sent', sent_at = now()
WHERE id = 'e8460000-0000-4000-8000-000000000001';
SELECT set_config('app.proposal_send_id', '', true);

SELECT set_config(
  'app.proposal_send_id',
  'e8460000-0000-4000-8000-000000000004',
  true
);
UPDATE public.proposals
SET status = 'sent', sent_at = now()
WHERE id = 'e8460000-0000-4000-8000-000000000004';
SELECT set_config('app.proposal_send_id', '', true);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status
)
VALUES
  (
    'e8460000-0000-4000-8000-000000000002',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Superseded client copy', 100000, 'revised'
  ),
  (
    'e8460000-0000-4000-8000-000000000003',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Draft guest preview', 100000, 'draft'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_list jsonb;
  v_curated jsonb;
  v_milestone jsonb;
  v_error text;
BEGIN
  v_list := public.list_client_proposals();
  v_curated := public.get_client_proposal_bundle(
    'e8460000-0000-4000-8000-000000000001'
  );
  v_milestone := public.get_client_proposal_bundle(
    'e8460000-0000-4000-8000-000000000004'
  );

  ASSERT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_list) AS listed(value)
    WHERE listed.value->>'id' = 'e8460000-0000-4000-8000-000000000001'
      AND listed.value->'payment_milestones' = '[]'::jsonb
  ), format('curated list DTO must omit its payment schedule: %s', v_list);
  ASSERT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_list) AS listed(value)
    WHERE listed.value->>'id' = 'e8460000-0000-4000-8000-000000000002'
  ), format('revised proposals must not appear in client list DTO: %s', v_list);
  ASSERT v_curated->'proposal'->'items' = '[]'::jsonb
     AND v_curated->'boards' = '[]'::jsonb
     AND v_curated->'payment_milestones' = '[]'::jsonb,
    format('curated detail DTO violated hidden item/schedule law: %s', v_curated);

  ASSERT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_list) AS listed(value)
    WHERE listed.value->>'id' = 'e8460000-0000-4000-8000-000000000004'
      AND (listed.value #>> '{payment_milestones,0,amount_cents}')::integer = 300000
  ), format('milestone list DTO must retain canonical payment amounts: %s', v_list);
  ASSERT (v_milestone #>> '{payment_milestones,0,amount_cents}')::integer = 300000
     AND (v_milestone #>>
          '{proposal,items,0,client_product_snapshot,record_completeness_hidden}')::boolean
     AND NOT ((v_milestone #> '{proposal,items,0,client_product_snapshot}') ? 'brand')
     AND NOT ((v_milestone #> '{proposal,items,0,client_product_snapshot}') ? 'source_url')
     AND NOT ((v_milestone #> '{proposal,items,0,client_product_snapshot}') ? 'price_retail'),
    format('milestone detail DTO violated payment/completeness redaction law: %s',
           v_milestone);

  BEGIN
    PERFORM public.get_client_proposal_bundle(
      'e8460000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal e8460000-0000-4000-8000-000000000002 not found or access denied',
    format('revised exact-id detail must fail closed, got %L', v_error);
END;
$$;

-- Draft share preview is an explicit product contract. Revised editions are
-- the only lifecycle state that is superseded: creation and resolution fail
-- closed, and a rejected resolve never increments the token's view count.
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
CREATE TEMP TABLE draft_share_token (token text NOT NULL) ON COMMIT DROP;
INSERT INTO draft_share_token
SELECT token
FROM public.create_document_share(
  'e8460000-0000-4000-8000-000000000003',
  'Draft preview',
  '{"itemDetails":true}'::jsonb,
  now() + interval '1 day'
);
GRANT SELECT ON draft_share_token TO service_role;

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.create_document_share(
      'e8460000-0000-4000-8000-000000000002',
      'Superseded preview',
      '{"itemDetails":true}'::jsonb,
      now() + interval '1 day'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal e8460000-0000-4000-8000-000000000002 is superseded or is not owned',
    format('revised share creation must fail closed, got %L', v_error);
END;
$$;

RESET ROLE;
INSERT INTO public.document_shares (
  id, proposal_id, token_hash, label, visibility, created_by
)
VALUES (
  'e8480000-0000-4000-8000-000000000001',
  'e8460000-0000-4000-8000-000000000002',
  encode(extensions.digest(repeat('b', 64), 'sha256'), 'hex'),
  'Legacy revised link', '{"itemDetails":true}'::jsonb,
  'e8000000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE service_role;
SELECT pg_temp.assume_copy_actor(NULL, 'service_role');
DO $$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows
  FROM public.resolve_document_share((SELECT token FROM draft_share_token));
  ASSERT v_rows = 1,
    'guest route service role must resolve an intentional draft preview';

  SELECT count(*) INTO v_rows
  FROM public.resolve_document_share(repeat('b', 64));
  ASSERT v_rows = 0,
    'guest route must not resolve a superseded revised edition';
  ASSERT (SELECT view_count = 0 FROM public.document_shares
          WHERE id = 'e8480000-0000-4000-8000-000000000001'),
    'failed revised resolution must not increment guest view stats';
END;
$$;

RESET ROLE;

-- proposals_studio_rw must not turn project_id into a second activation path.
-- Even an exact, caller-forged token plus a matching source project is inert;
-- the SECURITY DEFINER wrapper is the only path that can supply both halves of
-- the authority proof. Once linked, the proposal can never be cleared/relinked.
RESET ROLE;
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status,
  sent_at, valid_until
)
VALUES
  (
    'e8440000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Direct-link attack fixture', 1, 'accepted', now(), now() + interval '30 days'
  ),
  (
    'e8440000-0000-4000-8000-000000000002',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Canonical activation fixture', 1, 'draft', now(), now() + interval '30 days'
  ),
  (
    'e8440000-0000-4000-8000-000000000003',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Client signature activation fixture', 1, 'sent', now(), now() + interval '30 days'
  ),
  (
    'e8440000-0000-4000-8000-000000000004',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Studio peer activation fixture', 1, 'accepted', now(), now() + interval '30 days'
  );

-- Materialize an authored two-phase chain while its proposal is still draft,
-- then use the same exact acceptance capability as the canonical signature
-- boundary. Activation must copy roots then rewire them under 00398's scoped
-- project-phase batch capability.
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_weeks, duration_days,
  fee_cents, revision_limit, deliverables, sort_order, lane, follows_phase_id
)
VALUES
  (
    'e84a0000-0000-4000-8000-000000000001',
    'e8440000-0000-4000-8000-000000000002',
    'Activation discovery', 'activation-discovery', 1, 7,
    0, 2, '[]'::jsonb, 0, 'main', NULL
  ),
  (
    'e84a0000-0000-4000-8000-000000000002',
    'e8440000-0000-4000-8000-000000000002',
    'Activation design', 'activation-design', 2, 14,
    0, 2, '[]'::jsonb, 1, 'main',
    'e84a0000-0000-4000-8000-000000000001'
  );

SELECT set_config(
  'app.proposal_accept_id',
  'e8440000-0000-4000-8000-000000000002',
  true
);
UPDATE public.proposals
SET status = 'accepted',
    accepted_at = now(),
    signed_at = now(),
    signed_by_name = 'Fixture Client',
    updated_at = now()
WHERE id = 'e8440000-0000-4000-8000-000000000002';
SELECT set_config('app.proposal_accept_id', '', true);

INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id, studio_id
)
VALUES (
  'e8450000-0000-4000-8000-000000000001',
  'Matching forged-link target',
  'e8000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000002',
  'e8100000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE anon;
SELECT pg_temp.assume_copy_actor(NULL, 'anon');
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.activate_proposal_as_project(
      'e8440000-0000-4000-8000-000000000002', current_date
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'anon must not execute the proposal activation RPC';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.activate_proposal_as_project(
      'e8440000-0000-4000-8000-000000000002', current_date
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'activate_proposal_as_project: proposal e8440000-0000-4000-8000-000000000002 not found or access denied',
    format('unrelated caller activation should fail closed, got %L', v_error);
END;
$$;

SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.activate_proposal_as_project(
      'e8440000-0000-4000-8000-000000000002', current_date
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'activate_proposal_as_project: proposal e8440000-0000-4000-8000-000000000002 not found or access denied',
    format('owning client must activate only through sign_proposal, got %L', v_error);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_activated_project_id uuid;
  v_error text;
  v_phase_ids uuid[];
  v_predecessor_ids uuid[];
BEGIN
  ASSERT has_function_privilege(
           'authenticated',
           'public.activate_proposal_as_project(uuid,date)',
           'EXECUTE'
         ), 'authenticated callers must retain canonical activation RPC access';
  ASSERT NOT has_function_privilege(
               'authenticated',
               'public._activate_proposal_as_project_impl(uuid,date)',
               'EXECUTE'
             ), 'the activation implementation must remain private';
  ASSERT NOT has_function_privilege(
               'authenticated',
               'public._activate_proposal_as_project_authorized(uuid,date)',
               'EXECUTE'
             ), 'the row-scoped activation bridge must remain private';

  BEGIN
    INSERT INTO public.projects (
      id, name, created_by, proposal_id, designer_id, client_id, studio_id
    ) VALUES (
      'e8450000-0000-4000-8000-000000000002',
      'Forged reciprocal source',
      'e8000000-0000-4000-8000-000000000001',
      'e8440000-0000-4000-8000-000000000001',
      'e8000000-0000-4000-8000-000000000001',
      'e8000000-0000-4000-8000-000000000002',
      'e8100000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'project proposal provenance may only be created by activate_proposal_as_project',
    format('forged project-side proposal link should reject, got %L', v_error);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = 'e8450000-0000-4000-8000-000000000002'
  ), 'rejected project-side provenance insert must leave no row';

  -- Custom GUCs are caller-settable by design. current_user must still prove
  -- execution inside the canonical SECURITY DEFINER authority.
  PERFORM set_config(
    'app.proposal_activation_id',
    'e8440000-0000-4000-8000-000000000001',
    true
  );
  BEGIN
    UPDATE public.proposals
    SET project_id = 'e8450000-0000-4000-8000-000000000001'
    WHERE id = 'e8440000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_activation_id', '', true);
  ASSERT v_error =
    'proposal project linkage may only be set once through activate_proposal_as_project',
    format('direct matching project set should reject, got %L', v_error);
  ASSERT (SELECT project_id IS NULL FROM public.proposals
          WHERE id = 'e8440000-0000-4000-8000-000000000001'),
    'rejected direct project set must leave the proposal unlinked';

  v_activated_project_id := public.activate_proposal_as_project(
    'e8440000-0000-4000-8000-000000000002',
    current_date
  );
  ASSERT v_activated_project_id IS NOT NULL,
    'canonical activation must return its new project';
  ASSERT (SELECT proposal.project_id = v_activated_project_id
          FROM public.proposals AS proposal
          WHERE proposal.id = 'e8440000-0000-4000-8000-000000000002'),
    'canonical activation must set the proposal project link';
  ASSERT (SELECT project.proposal_id =
                 'e8440000-0000-4000-8000-000000000002'
          FROM public.projects AS project
          WHERE project.id = v_activated_project_id),
    'canonical activation target must point back to its source proposal';
  SELECT array_agg(phase.id ORDER BY phase.sort_order, phase.id),
         array_agg(phase.follows_phase_id ORDER BY phase.sort_order, phase.id)
  INTO v_phase_ids, v_predecessor_ids
  FROM public.project_phases AS phase
  WHERE phase.project_id = v_activated_project_id;
  ASSERT cardinality(v_phase_ids) = 2
     AND v_predecessor_ids[1] IS NULL
     AND v_predecessor_ids[2] = v_phase_ids[1],
    format(
      'proposal activation must insert then rewire its exact phase chain: %s / %s',
      v_phase_ids,
      v_predecessor_ids
    );
  ASSERT (SELECT count(*) = 1
          FROM public.project_phases AS phase
          WHERE phase.project_id = v_activated_project_id
            AND phase.status = 'in_progress')
     AND (SELECT count(*) = 1
          FROM public.project_phases AS phase
          WHERE phase.project_id = v_activated_project_id
            AND phase.status = 'pending'),
    'proposal activation must preserve one live root and one pending successor';
  ASSERT NULLIF(
           current_setting('app.proposal_activation_id', true),
           ''
         ) IS NULL,
    'canonical activation must clear its scoped authority token';
  ASSERT NULLIF(
           current_setting('app.project_phase_batch_token', true),
           ''
         ) IS NULL,
    'canonical activation must clear its scoped phase batch token';

  v_error := NULL;
  BEGIN
    UPDATE public.proposals
    SET project_id = NULL
    WHERE id = 'e8440000-0000-4000-8000-000000000002';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal project linkage may only be set once through activate_proposal_as_project',
    format('direct project clear should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.proposals
    SET project_id = 'e8450000-0000-4000-8000-000000000001'
    WHERE id = 'e8440000-0000-4000-8000-000000000002';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal project linkage may only be set once through activate_proposal_as_project',
    format('direct project relink should reject, got %L', v_error);
  ASSERT (SELECT project_id = v_activated_project_id
          FROM public.proposals
          WHERE id = 'e8440000-0000-4000-8000-000000000002'),
    'rejected clear/relink attempts must preserve the canonical project link';

  v_error := NULL;
  BEGIN
    UPDATE public.projects
    SET proposal_id = NULL
    WHERE id = v_activated_project_id;
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'project proposal provenance is immutable after activation',
    format('project-side source clear should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.projects
    SET proposal_id = 'e8440000-0000-4000-8000-000000000001'
    WHERE id = v_activated_project_id;
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'project proposal provenance is immutable after activation',
    format('project-side source relink should reject, got %L', v_error);
END;
$$;

-- A client signature owns exactly one accepted transition and may auto-open
-- only that proposal's reciprocal project. It does not grant the client the
-- general activation RPC authority tested above.
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_signed jsonb;
  v_project_id uuid;
BEGIN
  v_signed := public.sign_proposal(
    'e8440000-0000-4000-8000-000000000003',
    'Copy Client'
  );
  v_project_id := (v_signed->>'project_id')::uuid;

  ASSERT v_signed->>'status' = 'accepted'
     AND v_signed->>'newly_signed' = 'true'
     AND v_project_id IS NOT NULL,
    'client signature must accept and auto-activate its exact proposal once';
  ASSERT (
    SELECT array_agg(key ORDER BY key)
    FROM jsonb_object_keys(v_signed) AS receipt(key)
  ) = ARRAY[
    'accepted_at', 'id', 'newly_signed', 'project_id', 'signed_at', 'status'
  ],
    format('signature receipt must be an exact allowlist: %s', v_signed);
  ASSERT (SELECT proposal_id = 'e8440000-0000-4000-8000-000000000003'
                 AND designer_id = 'e8000000-0000-4000-8000-000000000001'
                 AND client_id = 'e8000000-0000-4000-8000-000000000002'
          FROM public.projects
          WHERE id = v_project_id),
    'signature activation must create the exact reciprocal designer/client pair';
  ASSERT pg_temp.copy_proposal_signed_ip(
    'e8440000-0000-4000-8000-000000000003'
  ) IS NULL,
    'browser signature surface must never write caller-supplied IP evidence';
END;
$$;

-- An active co-member of the proposal owner's design studio is an authorized
-- studio author and can use the public wrapper.
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.activate_proposal_as_project(
    'e8440000-0000-4000-8000-000000000004', current_date
  );
  ASSERT (SELECT project_id = v_project_id
          FROM public.proposals
          WHERE id = 'e8440000-0000-4000-8000-000000000004'),
    'active studio co-member must retain canonical activation authority';
END;
$$;

-- Draft-only child write policies make stale issued-edition UPDATE/DELETE tabs
-- harmless zero-row operations. Parent writes and INSERTs still fail loudly.
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_error text;
  v_rows integer;
BEGIN
  UPDATE public.proposal_items SET name = 'Owner stale write'
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
         AND (SELECT name <> 'Owner stale write'
              FROM public.proposal_items
              WHERE id = 'e8330000-0000-4000-8000-000000000001'),
    'owner stale item update must be a draft-policy no-op';

  DELETE FROM public.proposal_items
  WHERE id = 'e8330000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
         AND EXISTS (
           SELECT 1 FROM public.proposal_items
           WHERE id = 'e8330000-0000-4000-8000-000000000001'
         ),
    'owner stale item delete must be a draft-policy no-op';

  v_error := NULL;
  BEGIN
    INSERT INTO public.proposal_items (
      proposal_id, name, quantity, unit_price, unit_sell_price, line_total_cents
    ) VALUES (
      'e8300000-0000-4000-8000-000000000001', 'Owner stale insertion', 1, 1, 1, 1
    );
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.proposal_items
           WHERE proposal_id = 'e8300000-0000-4000-8000-000000000001'
             AND name = 'Owner stale insertion'
         ),
    format('owner stale item insert must fail closed, got %L', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.proposals SET title = 'Owner stale parent'
    WHERE id = 'e8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'non-draft proposal authored payload is immutable; create a revision draft',
    format('owner parent update should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    DELETE FROM public.proposals
    WHERE id = 'e8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'non-draft proposals are immutable editions and cannot be deleted',
    format('owner issued delete should reject, got %L', v_error);
END;
$$;

SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_error text;
  v_rows integer;
BEGIN
  UPDATE public.proposal_sections SET body = 'Peer stale write'
  WHERE id = 'e8320000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
         AND (SELECT body <> 'Peer stale write'
              FROM public.proposal_sections
              WHERE id = 'e8320000-0000-4000-8000-000000000001'),
    'studio peer stale section update must be a draft-policy no-op';

  v_error := NULL;
  BEGIN
    DELETE FROM public.proposals
    WHERE id = 'e8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'non-draft proposals are immutable editions and cannot be deleted',
    format('studio peer issued delete should reject, got %L', v_error);
END;
$$;

-- service_role and postgres bypass RLS, but neither bypasses edition guards.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_copy_actor(NULL, 'service_role');
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.palette_swatches SET hex = '#111111'
    WHERE id = 'e83c0000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'proposal % is viewed, so its authored copy is immutable',
    format('service-role nested swatch update should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    DELETE FROM public.proposals
    WHERE id = 'e8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'non-draft proposals are immutable editions and cannot be deleted',
    format('service-role issued delete should reject, got %L', v_error);
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.proposal_board_items SET content = 'Postgres stale write'
    WHERE id = 'e83e0000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'proposal % is viewed, so its authored copy is immutable',
    format('postgres nested board update should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.proposals SET id = 'e8300000-0000-4000-8000-000000000099'
    WHERE id = 'e8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'non-draft proposal authored payload is immutable; create a revision draft',
    format('postgres parent identity rewrite should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    DELETE FROM public.proposals
    WHERE id = 'e8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'non-draft proposals are immutable editions and cannot be deleted',
    format('postgres issued delete should reject, got %L', v_error);

  -- Project-owned authoring rows deliberately remain editable after the linked
  -- proposal is issued; they are ongoing project workspace, not proposal copy.
  UPDATE public.proposal_boards
  SET name = 'Project-owned working board v2'
  WHERE id = 'e8420000-0000-4000-8000-000000000001';
  UPDATE public.spec_field_defs
  SET name = 'Installation timestamp'
  WHERE id = 'e8430000-0000-4000-8000-000000000001';
  ASSERT (SELECT name = 'Project-owned working board v2'
          FROM public.proposal_boards
          WHERE id = 'e8420000-0000-4000-8000-000000000001'),
    'project-owned board must remain editable';
  ASSERT (SELECT name = 'Installation timestamp'
          FROM public.spec_field_defs
          WHERE id = 'e8430000-0000-4000-8000-000000000001'),
    'project-owned spec definition must remain editable';
END;
$$;

-- A draft is still disposable, and a revision clone is a fresh editable
-- workspace while its issued source remains intact.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_copy_actor('e8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_rows integer;
  v_revision_id uuid;
  v_source_sections integer;
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, total_amount
  ) VALUES (
    'e8500000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002',
    'Disposable draft', 1
  );
  DELETE FROM public.proposals
  WHERE id = 'e8500000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'authenticated owner must retain draft DELETE';

  SELECT count(*) INTO v_source_sections
  FROM public.proposal_sections
  WHERE proposal_id = 'e8300000-0000-4000-8000-000000000001';
  v_revision_id := public.clone_proposal(
    'e8300000-0000-4000-8000-000000000001',
    'revision',
    'Client requested a warmer option'
  );
  ASSERT (SELECT status = 'draft'
                 AND parent_proposal_id = 'e8300000-0000-4000-8000-000000000001'
          FROM public.proposals WHERE id = v_revision_id),
    'revision clone must be a linked draft';
  UPDATE public.proposal_sections
  SET body = 'Editable revision narrative'
  WHERE proposal_id = v_revision_id;
  ASSERT (SELECT count(*) = v_source_sections
          FROM public.proposal_sections
          WHERE proposal_id = 'e8300000-0000-4000-8000-000000000001'),
    'editing revision draft must leave issued source sections intact';
  ASSERT (SELECT status = 'viewed'
          FROM public.proposals
          WHERE id = 'e8300000-0000-4000-8000-000000000001'),
    'revision workflow must preserve the issued source lifecycle state';
END;
$$;

RESET ROLE;

-- Practical two-session proof of the parent-lock protocol. A stale child
-- writer queues behind a held parent lock, then wakes and re-reads the committed
-- sent state before rejecting. The committed seed row is used because dblink
-- sessions cannot see this transaction's fixtures.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

DO $$
DECLARE
  v_section_id uuid;
  v_busy integer;
  v_error text;
  v_body_before text;
  v_body_after text;
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
BEGIN
  SELECT id, body INTO STRICT v_section_id, v_body_before
  FROM public.proposal_sections
  WHERE proposal_id = 'b0000000-0000-0000-0000-000000000002'
  ORDER BY id
  LIMIT 1;

  PERFORM extensions.dblink_connect(
    'copy_locker',
    v_conninfo
  );
  PERFORM extensions.dblink_connect(
    'copy_writer',
    v_conninfo
  );
  PERFORM extensions.dblink_exec('copy_locker', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'copy_locker',
    $remote$SELECT id::text
      FROM public.proposals
      WHERE id = 'b0000000-0000-0000-0000-000000000002'
      FOR UPDATE$remote$
  ) AS locked(id text);

  PERFORM extensions.dblink_send_query(
    'copy_writer',
    format(
      'UPDATE public.proposal_sections SET body = body || %L WHERE id = %L',
      ' stale-tab-write', v_section_id
    )
  );
  PERFORM pg_sleep(0.2);
  SELECT extensions.dblink_is_busy('copy_writer') INTO v_busy;
  ASSERT v_busy = 1,
    'child writer must wait while the proposal parent row is locked';

  PERFORM extensions.dblink_exec('copy_locker', 'COMMIT');
  PERFORM result.status
  FROM extensions.dblink_get_result('copy_writer', false) AS result(status text);
  v_error := extensions.dblink_error_message('copy_writer');
  ASSERT position(
           'proposal b0000000-0000-0000-0000-000000000002 is sent, so its authored copy is immutable'
           IN v_error
         ) > 0,
    format('queued stale writer should wake into sent-state rejection, got %L', v_error);

  SELECT body INTO STRICT v_body_after
  FROM public.proposal_sections
  WHERE id = v_section_id;
  ASSERT v_body_after IS NOT DISTINCT FROM v_body_before,
    'rejected queued writer must leave the committed section unchanged';

  PERFORM extensions.dblink_disconnect('copy_writer');
  PERFORM extensions.dblink_disconnect('copy_locker');
END;
$$;

-- Phase topology is now mutated only through checked SECURITY DEFINER RPCs.
-- An authenticated browser session cannot move a phase directly, so the old
-- cross-proposal phase-move race is eliminated at the privilege boundary.
DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_mover_error text;
  v_phase_owner uuid;
BEGIN
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_phases', 'UPDATE'
  ) AND has_column_privilege(
    'authenticated', 'public.proposal_phases', 'name', 'UPDATE'
  ) AND NOT has_column_privilege(
    'authenticated', 'public.proposal_phases', 'proposal_id', 'UPDATE'
  ), 'expand phase must retain only column-limited draft edit privilege';

  PERFORM extensions.dblink_connect('phase_mover', v_conninfo);
  PERFORM extensions.dblink_exec('phase_mover', 'BEGIN');
  PERFORM extensions.dblink_exec('phase_mover', 'SET LOCAL ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'phase_mover',
    $sql$SET LOCAL request.jwt.claims =
      '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}'$sql$
  );
  BEGIN
    PERFORM extensions.dblink_exec(
      'phase_mover',
      $sql$UPDATE public.proposal_phases
        SET proposal_id = 'b3900000-0000-4000-8000-000000000002'
        WHERE id = 'b3900000-0000-4000-8000-000000000003'$sql$
    );
    ASSERT false, 'direct authenticated phase move must fail';
  EXCEPTION WHEN OTHERS THEN
    v_mover_error := SQLERRM;
  END;

  ASSERT v_mover_error IS NOT NULL,
    'direct phase move must fail at the column ACL or topology guard';
  PERFORM extensions.dblink_exec('phase_mover', 'ROLLBACK');
  PERFORM extensions.dblink_disconnect('phase_mover');

  SELECT proposal_id INTO STRICT v_phase_owner
  FROM public.proposal_phases
  WHERE id = 'b3900000-0000-4000-8000-000000000003';
  ASSERT v_phase_owner = 'b3900000-0000-4000-8000-000000000001',
    'rejected direct move must leave the phase attached to its source proposal';
END;
$$;

ROLLBACK;
