-- ═══════════════════════════════════════════════════════════════════════════
-- 00842 — get_client_project_editorial + set_project_show_makers (US-49 W1)
--
-- Named cases:
--   grants      anon cannot call either function; authenticated can
--   envelope    exactly project, rooms, assets, palette, boards, sheets at the
--               top; project carries id, name, phase, targetDate, showMakers,
--               studio{name,town}; the signed line sits in its room under its
--               signed name, with its plate
--   privacy     no key anywhere matches price|amount|sku|cents; no storage
--               path, original key or source address in the envelope
--   makers off  makerName and madeIn are null, caption whose = the studio
--   caption     what = name as signed, when = DD Month YYYY, alt =
--               what · whose · product photograph (never "image of")
--   no column   material, finish, dimensions, descriptionAsSigned are null
--   refusals    a stranger gets 42501 from the reader; the client gets 42501
--               from set_project_show_makers
--   makers on   the studio owner turns show_makers on; the client then reads
--               the maker, where it is made, and the maker as caption whose
--   concept dedupe  the line's picture and the room's concept render share
--               one asset: sourceKind is concept, the room and the line both
--               name it, the caption stays the line's
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00842_client_editorial_reader.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(29);

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C the client · Z a stranger with no seat

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84200000-0000-4000-8000-0000000000a1', 'us49-owner@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84200000-0000-4000-8000-0000000000a2', 'us49-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84200000-0000-4000-8000-0000000000a3', 'us49-stranger@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84200000-0000-4000-8000-0000000000a1', 'us49-owner@test.invalid',    'US49 Owner',    true,  now(), now()),
  ('84200000-0000-4000-8000-0000000000a2', 'us49-client@test.invalid',   'US49 Client',   false, now(), now()),
  ('84200000-0000-4000-8000-0000000000a3', 'us49-stranger@test.invalid', 'US49 Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84200000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 Studio', 'us49-studio-test',
        '{"city": "Hudson"}'::jsonb);

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84200000-0000-4000-8000-0000000000e1', '84200000-0000-4000-8000-0000000000a1',
        '84200000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.vendors (id, name, made_in)
VALUES ('84200000-0000-4000-8000-000000000031', 'Atelier Nord', 'Portugal');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('84200000-0000-4000-8000-000000000001', 'US49 Whole Home',
        '84200000-0000-4000-8000-0000000000a1', '84200000-0000-4000-8000-0000000000a2',
        '84200000-0000-4000-8000-0000000000a1', '84200000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84200000-0000-4000-8000-000000000011', '84200000-0000-4000-8000-000000000001', 'Living room', 0);

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images) VALUES
  ('84200000-0000-4000-8000-000000000021', 'US49 Lounge chair', now(), 'personal',
   '84200000-0000-4000-8000-0000000000a1', 'draft',
   ARRAY['https://img.test/us49-chair.jpg']);

-- The line's live name has moved on since she signed "Lounge chair".
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, status, item_type, product_id, vendor_id, ffe_category,
  quantity, unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES ('84200000-0000-4000-8000-000000000101', '84200000-0000-4000-8000-000000000001',
          '84200000-0000-4000-8000-000000000011', 'Lounge chair, revised', 'specified', 'fixed',
          '84200000-0000-4000-8000-000000000021', '84200000-0000-4000-8000-000000000031', 'seating',
          1, 120000, 120000, 'selected', 'room', 0);

INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84200000-0000-4000-8000-000000000401', '84200000-0000-4000-8000-000000000001', '84200000-0000-4000-8000-0000000000a1',
        'US49 Authorization No. 1', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('84200000-0000-4000-8000-000000000402', '84200000-0000-4000-8000-000000000001', '84200000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '84200000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order, snapshot
) VALUES ('84200000-0000-4000-8000-000000000403', '84200000-0000-4000-8000-000000000402', '84200000-0000-4000-8000-000000000101',
          '84200000-0000-4000-8000-000000000021', 'Lounge chair', 'Living room', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0,
          '{"clientName": "Lounge chair"}'::jsonb);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '84200000-0000-4000-8000-000000000402',
       source_authorization_item_id = '84200000-0000-4000-8000-000000000403'
 WHERE id = '84200000-0000-4000-8000-000000000101';
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- The chair's library picture was snapshotted onto the line and queued
-- (00807 snapshot, 00843 trigger); its copy has landed.
INSERT INTO public.client_plate_assets
  (id, project_id, sha256, source_kind, source_ref, original_key, width, height, ground, dominant_hex, lqip, crops)
SELECT '84200000-0000-4000-8000-000000000501', picture.project_id, repeat('a', 64), 'maker',
       jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id),
       'plates/84200000-0000-4000-8000-000000000001/' || repeat('a', 64) || '/original.jpg',
       1600, 1200, 'white', '#efe9e0', 'data:image/webp;base64,AAAA',
       '{"wide": {"rect": [0, 0, 1600, 900], "widths": [800, 1600]}}'::jsonb
FROM public.project_ffe_item_images AS picture
WHERE picture.item_id = '84200000-0000-4000-8000-000000000101';

UPDATE public.client_plate_requests AS request
   SET status = 'done', asset_id = '84200000-0000-4000-8000-000000000501', updated_at = now()
  FROM public.project_ffe_item_images AS picture
 WHERE picture.item_id = '84200000-0000-4000-8000-000000000101'
   AND request.source_ref = jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id);

-- ─── grants ────────────────────────────────────────────────────────────────

SELECT ok(NOT has_function_privilege('anon', 'public.get_client_project_editorial(uuid)', 'EXECUTE'),
          'grants: anon cannot call get_client_project_editorial');
SELECT ok(has_function_privilege('authenticated', 'public.get_client_project_editorial(uuid)', 'EXECUTE'),
          'grants: authenticated can call get_client_project_editorial');
SELECT ok(NOT has_function_privilege('anon', 'public.set_project_show_makers(uuid, boolean)', 'EXECUTE'),
          'grants: anon cannot call set_project_show_makers');

-- ─── the client reads her page (show_makers off) ───────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84200000-0000-4000-8000-0000000000a2","role":"authenticated"}';

-- Each read is kept in a transaction-local setting, which survives the role
-- switches below (a temp table would sit in postgres's temp schema).
SELECT 'read' AS us49_makers_off
FROM (SELECT set_config('us49.editorial_off',
        public.get_client_project_editorial('84200000-0000-4000-8000-000000000001')::text, true)) AS stash;

SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read, jsonb_object_keys(envelope) AS key),
  ARRAY['assets', 'boards', 'palette', 'project', 'rooms', 'sheets'],
  'envelope: exactly the six top-level keys'
);
SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read, jsonb_object_keys(envelope -> 'project') AS key),
  ARRAY['id', 'name', 'phase', 'showMakers', 'studio', 'targetDate'],
  'envelope: project carries id, name, phase, targetDate, showMakers, studio'
);
SELECT is(
  (SELECT envelope -> 'project' -> 'studio' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  '{"name": "US49 Studio", "town": "Hudson"}'::jsonb,
  'envelope: studio name and town'
);
SELECT is(
  (SELECT envelope #>> '{rooms,0,items,0,nameAsSigned}' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'Lounge chair',
  'envelope: the line sits in its room under the name she signed'
);
SELECT is(
  (SELECT envelope #>> '{rooms,0,anchor}' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'room-84200000-0000-4000-8000-000000000011',
  'envelope: the room anchor is room-<id>'
);
SELECT is(
  (SELECT envelope #> '{rooms,0,items,0,assetIds}' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  '["84200000-0000-4000-8000-000000000501"]'::jsonb,
  'envelope: the line names its plate'
);
SELECT is(
  (SELECT envelope #>> '{rooms,0,items,0,silhouetteKind}' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'seating',
  'envelope: silhouetteKind is the category slug'
);
SELECT ok(
  NOT (SELECT jsonb_path_exists(envelope,
         'lax $.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "price|amount|sku|cents" flag "i")')
       FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'privacy: no price, amount, sku or cents key anywhere'
);
SELECT ok(
  (SELECT envelope::text NOT LIKE '%plates/%' AND envelope::text NOT LIKE '%img.test%'
     FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'privacy: no original key or source address in the envelope'
);
SELECT ok(
  (SELECT envelope #> '{rooms,0,items,0,makerName}' = 'null'::jsonb
      AND envelope #> '{rooms,0,items,0,madeIn}' = 'null'::jsonb
     FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'makers off: makerName and madeIn are null'
);
SELECT ok(
  (SELECT envelope #> '{rooms,0,items,0,material}' = 'null'::jsonb
      AND envelope #> '{rooms,0,items,0,finish}' = 'null'::jsonb
      AND envelope #> '{rooms,0,items,0,dimensions}' = 'null'::jsonb
      AND envelope #> '{rooms,0,items,0,descriptionAsSigned}' = 'null'::jsonb
     FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'no column: material, finish, dimensions, descriptionAsSigned are null'
);
SELECT is(
  (SELECT envelope #> '{assets,0,caption}' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  jsonb_build_object(
    'what', 'Lounge chair',
    'whose', 'US49 Studio',
    -- The picture row was written in this transaction (created_at = now()).
    'when', to_char(now(), 'DD FMMonth YYYY')),
  'caption: what as signed, whose the studio, when DD Month YYYY'
);
SELECT is(
  (SELECT envelope #>> '{assets,0,alt}' FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'Lounge chair · US49 Studio · product photograph',
  'caption: alt is what · whose · kind word'
);
SELECT ok(
  (SELECT envelope #>> '{assets,0,sourceKind}' = 'maker'
      AND envelope #>> '{assets,0,sha256}' = repeat('a', 64)
      AND (envelope #>> '{assets,0,width}')::int = 1600
      AND envelope #> '{assets,0,crops,wide}' IS NOT NULL
     FROM (SELECT current_setting('us49.editorial_off')::jsonb AS envelope) AS editorial_read),
  'envelope: the asset carries sha256, kind, size and crops'
);
SELECT throws_ok(
  $$SELECT public.set_project_show_makers('84200000-0000-4000-8000-000000000001', true)$$,
  '42501',
  'project not found or not accessible',
  'refusals: the client cannot turn makers on'
);

-- ─── a stranger ────────────────────────────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"84200000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.get_client_project_editorial('84200000-0000-4000-8000-000000000001')$$,
  '42501',
  'project not found or not accessible',
  'refusals: a stranger cannot read the page'
);

-- ─── the studio owner turns makers on; the client reads again ──────────────

SET LOCAL request.jwt.claims = '{"sub":"84200000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.set_project_show_makers('84200000-0000-4000-8000-000000000001', true)$$,
  'makers on: the studio owner can turn makers on'
);

SET LOCAL request.jwt.claims = '{"sub":"84200000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT 'read' AS us49_makers_on
FROM (SELECT set_config('us49.editorial_on',
        public.get_client_project_editorial('84200000-0000-4000-8000-000000000001')::text, true)) AS stash;

SELECT is(
  (SELECT envelope #>> '{project,showMakers}' FROM (SELECT current_setting('us49.editorial_on')::jsonb AS envelope) AS editorial_read),
  'true',
  'makers on: project.showMakers is true'
);
SELECT is(
  (SELECT envelope #>> '{rooms,0,items,0,makerName}' FROM (SELECT current_setting('us49.editorial_on')::jsonb AS envelope) AS editorial_read),
  'Atelier Nord',
  'makers on: makerName is the maker'
);
SELECT is(
  (SELECT envelope #>> '{rooms,0,items,0,madeIn}' FROM (SELECT current_setting('us49.editorial_on')::jsonb AS envelope) AS editorial_read),
  'Portugal',
  'makers on: madeIn is where it is made'
);
SELECT is(
  (SELECT envelope #>> '{assets,0,alt}' FROM (SELECT current_setting('us49.editorial_on')::jsonb AS envelope) AS editorial_read),
  'Lounge chair · Atelier Nord · product photograph',
  'makers on: the caption names the maker'
);

RESET ROLE;

SELECT ok(
  (SELECT show_makers FROM public.projects WHERE id = '84200000-0000-4000-8000-000000000001'),
  'makers on: projects.show_makers is stored'
);

-- ─── the same bytes as the room's concept render ───────────────────────────
-- The room's concept render copies to the chair picture's sha256, so both
-- sources share asset 501; its caption still comes from the line.

UPDATE public.project_rooms
   SET concept_render_url = '84200000-0000-4000-8000-000000000001/84200000-0000-4000-8000-000000000011/concept-v1.png',
       concept_render_uploaded_at = now()
 WHERE id = '84200000-0000-4000-8000-000000000011';
UPDATE public.client_plate_requests
   SET status = 'done', asset_id = '84200000-0000-4000-8000-000000000501', updated_at = now()
 WHERE source_ref = '{"table": "project_rooms", "id": "84200000-0000-4000-8000-000000000011"}';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84200000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT 'read' AS us49_concept
FROM (SELECT set_config('us49.editorial_concept',
        public.get_client_project_editorial('84200000-0000-4000-8000-000000000001')::text, true)) AS stash;
RESET ROLE;

SELECT is(
  (SELECT envelope #>> '{rooms,0,conceptAssetId}' FROM (SELECT current_setting('us49.editorial_concept')::jsonb AS envelope) AS editorial_read),
  '84200000-0000-4000-8000-000000000501',
  'concept dedupe: the room names the shared plate as its concept render'
);
SELECT is(
  (SELECT envelope #> '{rooms,0,items,0,assetIds}' FROM (SELECT current_setting('us49.editorial_concept')::jsonb AS envelope) AS editorial_read),
  '["84200000-0000-4000-8000-000000000501"]'::jsonb,
  'concept dedupe: the line still names the shared plate'
);
SELECT is(
  (SELECT string_agg(asset ->> 'sourceKind', ',')
     FROM (SELECT current_setting('us49.editorial_concept')::jsonb AS envelope) AS editorial_read,
          jsonb_array_elements(envelope -> 'assets') AS asset),
  'concept',
  'concept dedupe: one asset, and bytes any source produced as a concept stay concept'
);
SELECT is(
  (SELECT envelope #>> '{assets,0,alt}' FROM (SELECT current_setting('us49.editorial_concept')::jsonb AS envelope) AS editorial_read),
  'Lounge chair · Atelier Nord · concept render, not installed',
  'concept dedupe: the alt says concept render while the caption stays the line''s'
);

SELECT * FROM finish(true);
ROLLBACK;
