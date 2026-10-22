-- ═══════════════════════════════════════════════════════════════════════════
-- 00846 — get_client_project_edition + client_can_read_plate v2 (US-49 W3)
--
-- Named cases:
--   grants      anon cannot call the reader or the plate check; authenticated
--               can
--   no edition  the client reads NULL until an edition is approved
--   refusal     a stranger gets 42501
--   envelope    the 00842 keys plus composition, images, edition; edition
--               {id, seq, approvedAt, approvedBy auto|studio, notice}
--   overrides   chapter headline and caption when overrides applied; the
--               composer's sourceHash and hero rationale stay inside
--   allowlist   no service-only key (studio id, perception version, focal
--               origin), no price or SKU; a plate of another project named in
--               the facts is left out; descriptionAsSigned cut to 280
--   live        showMakers is today's: off → no maker, caption whose = the
--               studio, every alt rebuilt from the caption shown (an edition
--               image's and a frozen-facts-only alt alike); on → the maker
--               and the stored alts; plate bytes facts are the asset row
--               now; a concept plate reads concept and is never the hero
--   hero        a flagged plate is never the hero, by override neither; a
--               null headline/standing override restores the composed text;
--               an override hero the edition never named is projected (a
--               bare upload worded from the studio and its kind; a board
--               ingested after compose and approved, from the board record);
--               a concept-seen one is neither shown nor the hero
--   plate scope an approved edition id scopes its project for its client and
--               studio; a superseded edition id, a stranger who is the
--               client of another project holding the same bytes, and
--               unknown bytes read NULL; the project id path is unchanged
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00846_client_edition_reader.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(34);

-- ─── grants ────────────────────────────────────────────────────────────────

SELECT ok(NOT has_function_privilege('anon', 'public.get_client_project_edition(uuid)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.get_client_project_edition(uuid)', 'EXECUTE'),
          'grants: the reader is for authenticated callers, never anon');
SELECT ok(NOT has_function_privilege('anon', 'public.client_can_read_plate(uuid, text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.client_can_read_plate(uuid, text)', 'EXECUTE'),
          'grants: client_can_read_plate keeps its grants');

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C client of P · Z client of Q (a stranger to P)

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84600000-0000-4000-8000-0000000000a1', 'us49-846-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84600000-0000-4000-8000-0000000000a2', 'us49-846-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84600000-0000-4000-8000-0000000000a3', 'us49-846-other@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84600000-0000-4000-8000-0000000000a1', 'us49-846-owner@test.invalid',  'US49 846 Owner',  true,  now(), now()),
  ('84600000-0000-4000-8000-0000000000a2', 'us49-846-client@test.invalid', 'US49 846 Client', false, now(), now()),
  ('84600000-0000-4000-8000-0000000000a3', 'us49-846-other@test.invalid',  'US49 846 Other',  false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84600000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 846 Studio', 'us49-846-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84600000-0000-4000-8000-0000000000e1', '84600000-0000-4000-8000-0000000000a1',
        '84600000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('84600000-0000-4000-8000-000000000001', 'US49 846 House',
   '84600000-0000-4000-8000-0000000000a1', '84600000-0000-4000-8000-0000000000a2',
   '84600000-0000-4000-8000-0000000000a1', '84600000-0000-4000-8000-0000000000f1', 'active'),
  ('84600000-0000-4000-8000-000000000002', 'US49 846 Other House',
   '84600000-0000-4000-8000-0000000000a1', '84600000-0000-4000-8000-0000000000a3',
   '84600000-0000-4000-8000-0000000000a1', '84600000-0000-4000-8000-0000000000f1', 'active');

-- A1 a maker plate and A2 a concept render in P; QA the same bytes as A1 in Q.
INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height, crops)
VALUES
  ('84600000-0000-4000-8000-000000000501', '84600000-0000-4000-8000-000000000001', repeat('e', 64), 'maker',
   '{"table": "project_ffe_item_images", "id": "84600000-0000-4000-8000-000000000291"}'::jsonb,
   'plates/846/e/original.jpg', 2400, 1600, '{"wide": {"rect": [0, 0, 2400, 1350], "widths": [800, 1600]}}'::jsonb),
  ('84600000-0000-4000-8000-000000000502', '84600000-0000-4000-8000-000000000001', repeat('f', 64), 'upload',
   '{"table": "project_rooms", "id": "84600000-0000-4000-8000-000000000011"}'::jsonb,
   'plates/846/f/original.jpg', 1600, 1200, '{}'::jsonb),
  ('84600000-0000-4000-8000-000000000509', '84600000-0000-4000-8000-000000000002', repeat('e', 64), 'maker',
   '{"table": "project_ffe_item_images", "id": "84600000-0000-4000-8000-000000000299"}'::jsonb,
   'plates/846q/e/original.jpg', 2400, 1600, '{}'::jsonb),
  ('84600000-0000-4000-8000-000000000503', '84600000-0000-4000-8000-000000000001', repeat('a', 64), 'maker',
   '{"table": "project_ffe_item_images", "id": "84600000-0000-4000-8000-000000000293"}'::jsonb,
   'plates/846/a/original.jpg', 1200, 1200, '{}'::jsonb);
UPDATE public.client_plate_assets SET concept_seen = true WHERE id = '84600000-0000-4000-8000-000000000502';

-- ─── no edition yet ────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(public.get_client_project_edition('84600000-0000-4000-8000-000000000001'), NULL,
          'no edition: the client reads NULL until an edition is approved');
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT throws_ok($$SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001')$$,
                 '42501', 'project not found or not accessible', 'refusal: a stranger is refused');
RESET ROLE;

-- ─── an approved edition (seq 2) over a superseded one (seq 1) ─────────────

INSERT INTO public.client_editions (id, project_id, seq, status, kind, composition, facts, overrides,
                                    auto_published, approved_at, source_hash)
VALUES
  ('84600000-0000-4000-8000-000000000902', '84600000-0000-4000-8000-000000000001', 2, 'approved', 'plates_only',
   $j${"sourceHash": "h2", "voice": "model",
       "hero": {"assetId": "84600000-0000-4000-8000-000000000501", "why": "the strongest picture"},
       "held": ["84600000-0000-4000-8000-000000000502"],
       "chapters": [{"key": "cover", "headline": "The house, so far", "standing": "Two rooms are set."}],
       "doorstep": {"standing": "Nothing waits on you."}, "notice": "Two new photographs."}$j$::jsonb,
   jsonb_set($j${"project": {"id": "84600000-0000-4000-8000-000000000001", "name": "US49 846 House", "phase": "install",
                 "targetDate": "2026-12-01", "showMakers": true,
                 "studio": {"id": "84600000-0000-4000-8000-0000000000f1", "name": "US49 846 Studio", "town": "Hudson"}},
     "rooms": [{"id": "84600000-0000-4000-8000-000000000011", "name": "Living room",
                "anchor": "room-84600000-0000-4000-8000-000000000011",
                "conceptAssetId": "84600000-0000-4000-8000-000000000502", "scanAssetIds": [],
                "items": [{"id": "84600000-0000-4000-8000-000000000101", "nameAsSigned": "Lounge chair",
                           "category": "seating", "status": "ordered", "makerName": "Atelier Nord", "madeIn": "Portugal",
                           "material": null, "finish": null, "dimensions": null, "descriptionAsSigned": null,
                           "assetIds": ["84600000-0000-4000-8000-000000000501"], "silhouetteKind": "seating",
                           "unitPriceCents": 120000}]}],
     "assets": [{"id": "84600000-0000-4000-8000-000000000501", "sha256": "stale", "sourceKind": "maker",
                 "caption": {"what": "Lounge chair", "whose": "Atelier Nord", "when": "21 October 2026"},
                 "alt": "Lounge chair · Atelier Nord · product photograph",
                 "perceivedPromptVersion": "e1", "focalOrigin": "model"},
                {"id": "84600000-0000-4000-8000-000000000502", "sourceKind": "upload",
                 "caption": {"what": "Living room", "whose": "US49 846 Studio", "when": "1 October 2026"},
                 "alt": "Living room · US49 846 Studio · studio photograph"},
                {"id": "84600000-0000-4000-8000-000000000509", "sourceKind": "maker",
                 "caption": {"what": "Elsewhere", "whose": "Elsewhere", "when": "1 October 2026"}, "alt": "Elsewhere"},
                {"id": "84600000-0000-4000-8000-000000000503", "sourceKind": "maker",
                 "caption": {"what": "Side table", "whose": "Atelier Nord", "when": "1 October 2026"},
                 "alt": "Side table · Atelier Nord · product photograph"}],
     "palette": [{"hex": "#d9d2c5", "brand": "Farrow", "name": "Plaster", "sku": "FB-1"}],
     "boards": [], "sheets": []}$j$::jsonb,
     '{rooms,0,items,0,descriptionAsSigned}', to_jsonb(repeat('x', 300))),
   $j${"chapters": {"cover": {"headline": "Override headline"}},
       "captions": {"84600000-0000-4000-8000-000000000501": {"when": "Autumn 2026"}}}$j$::jsonb,
   true, now(), 'h2'),
  ('84600000-0000-4000-8000-000000000901', '84600000-0000-4000-8000-000000000001', 1, 'superseded', 'full',
   '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, false, now() - interval '1 day', 'h1');
UPDATE public.client_editions SET superseded_by = '84600000-0000-4000-8000-000000000902', superseded_at = now()
 WHERE id = '84600000-0000-4000-8000-000000000901';
INSERT INTO public.client_edition_images (edition_id, asset_id, plate_role, crop_key, rank, chapter_key, alt,
                                          caption_what, caption_whose, caption_when)
VALUES
  ('84600000-0000-4000-8000-000000000902', '84600000-0000-4000-8000-000000000501', 'hero', 'none', 1, 'cover',
   'Atelier Nord lounge chair in the window', 'Lounge chair', 'Atelier Nord', '21 October 2026'),
  ('84600000-0000-4000-8000-000000000902', '84600000-0000-4000-8000-000000000502', 'held', 'none', 2, 'cover',
   'Living room, concept render', 'Living room', 'US49 846 Studio', '1 October 2026');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT 'read' AS us49 FROM (SELECT set_config('us49.edition_off',
  public.get_client_project_edition('84600000-0000-4000-8000-000000000001')::text, true)) AS stash;
RESET ROLE;

-- ─── envelope ──────────────────────────────────────────────────────────────

SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read,
          jsonb_object_keys(envelope) AS key),
  ARRAY['assets', 'boards', 'composition', 'edition', 'images', 'palette', 'project', 'rooms', 'sheets'],
  'envelope: the 00842 keys plus composition, images and edition');
SELECT is(
  (SELECT (envelope -> 'edition') - 'approvedAt' FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read),
  '{"id": "84600000-0000-4000-8000-000000000902", "seq": 2, "approvedBy": "auto", "notice": "Two new photographs."}'::jsonb,
  'envelope: edition id, seq, approvedBy auto, notice');
SELECT ok(
  (SELECT envelope -> 'edition' ->> 'approvedAt' IS NOT NULL FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read),
  'envelope: edition approvedAt present');
SELECT is(
  (SELECT envelope -> 'project' FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read),
  '{"id": "84600000-0000-4000-8000-000000000001", "name": "US49 846 House", "phase": "install", "targetDate": "2026-12-01",
    "showMakers": false, "studio": {"name": "US49 846 Studio", "town": "Hudson"}}'::jsonb,
  'allowlist: project from the frozen facts, showMakers today''s, no studio id');

-- ─── overrides + composition ───────────────────────────────────────────────

SELECT is(
  (SELECT envelope -> 'composition' FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read),
  '{"voice": "model", "hero": {"assetId": "84600000-0000-4000-8000-000000000501"},
    "held": ["84600000-0000-4000-8000-000000000502"],
    "chapters": [{"key": "cover", "headline": "Override headline", "standing": "Two rooms are set."}],
    "doorstep": {"standing": "Nothing waits on you."}, "notice": "Two new photographs."}'::jsonb,
  'overrides: the headline override applied; no sourceHash, no hero rationale');
SELECT is(
  (SELECT envelope -> 'images' FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read),
  '[{"assetId": "84600000-0000-4000-8000-000000000501", "plateRole": "hero", "cropKey": "none", "rank": 1, "chapterKey": "cover"},
    {"assetId": "84600000-0000-4000-8000-000000000502", "plateRole": "held", "cropKey": "none", "rank": 2, "chapterKey": "cover"}]'::jsonb,
  'envelope: images by rank');

-- ─── allowlist + live readings (makers off) ────────────────────────────────

SELECT is(
  (SELECT jsonb_build_array(item -> 'makerName', item -> 'madeIn', length(item ->> 'descriptionAsSigned'), item ? 'unitPriceCents')
   FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read,
        LATERAL (SELECT envelope -> 'rooms' -> 0 -> 'items' -> 0 AS item) AS line),
  '[null, null, 280, false]'::jsonb,
  'live: makers off → no maker or origin; description cut to 280; no price');
SELECT ok(
  (SELECT current_setting('us49.edition_off') !~* '"(sku|unitPriceCents|perceivedPromptVersion|focalOrigin|sourceHash|why)"'),
  'allowlist: no SKU, price, perception, focal origin, sourceHash or rationale key anywhere');
SELECT is(
  (SELECT jsonb_agg(asset ->> 'id' ORDER BY asset ->> 'id')
   FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read,
        jsonb_array_elements(envelope -> 'assets') AS asset),
  '["84600000-0000-4000-8000-000000000501", "84600000-0000-4000-8000-000000000502",
    "84600000-0000-4000-8000-000000000503"]'::jsonb,
  'allowlist: a plate of another project named in the facts is left out');
SELECT is(
  (SELECT jsonb_build_object('sha256', asset -> 'sha256', 'width', asset -> 'width', 'sourceKind', asset -> 'sourceKind',
                             'caption', asset -> 'caption', 'alt', asset -> 'alt', 'crops', asset -> 'crops')
   FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read,
        jsonb_array_elements(envelope -> 'assets') AS asset
   WHERE asset ->> 'id' = '84600000-0000-4000-8000-000000000501'),
  jsonb_build_object('sha256', repeat('e', 64), 'width', 2400, 'sourceKind', 'maker',
                     'caption', '{"what": "Lounge chair", "whose": "US49 846 Studio", "when": "Autumn 2026"}'::jsonb,
                     'alt', 'Lounge chair · US49 846 Studio · product photograph',
                     'crops', '{"wide": {"rect": [0, 0, 2400, 1350], "widths": [800, 1600]}}'::jsonb),
  'live: bytes facts from the asset row; caption from the edition image, whose = studio (makers off), when override; alt rebuilt from that caption');
SELECT is(
  (SELECT asset ->> 'sourceKind'
   FROM (SELECT current_setting('us49.edition_off')::jsonb AS envelope) AS read,
        jsonb_array_elements(envelope -> 'assets') AS asset
   WHERE asset ->> 'id' = '84600000-0000-4000-8000-000000000502'),
  'concept',
  'live: a plate a concept render produced reads concept');

-- ─── makers on; studio reads; concept hero dropped ─────────────────────────

UPDATE public.projects SET show_makers = true WHERE id = '84600000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT jsonb_build_array(envelope -> 'project' -> 'showMakers', envelope -> 'rooms' -> 0 -> 'items' -> 0 -> 'makerName',
                            envelope -> 'assets' -> 0 -> 'caption' -> 'whose')
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read),
  '[true, "Atelier Nord", "Atelier Nord"]'::jsonb,
  'live: makers on → the maker on the line and in the caption');
SELECT is(
  (SELECT jsonb_object_agg(asset ->> 'id', asset -> 'alt')
   FROM jsonb_array_elements(
     public.get_client_project_edition('84600000-0000-4000-8000-000000000001') -> 'assets') AS asset
   WHERE asset ->> 'id' IN ('84600000-0000-4000-8000-000000000501', '84600000-0000-4000-8000-000000000503')),
  jsonb_build_object('84600000-0000-4000-8000-000000000501', 'Atelier Nord lounge chair in the window',
                     '84600000-0000-4000-8000-000000000503', 'Side table · Atelier Nord · product photograph'),
  'live: makers on → the edition image''s alt, else the frozen facts'' alt');
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT is(
  (SELECT envelope -> 'edition' ->> 'id'
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read),
  '84600000-0000-4000-8000-000000000902',
  'envelope: the studio reads the approved edition too');
RESET ROLE;

-- Makers on → off: no alt keeps the maker, a frozen-facts-only alt included.
UPDATE public.projects SET show_makers = false WHERE id = '84600000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT 'read' AS us49 FROM (SELECT set_config('us49.edition_off_again',
  public.get_client_project_edition('84600000-0000-4000-8000-000000000001')::text, true)) AS stash;
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM jsonb_array_elements(current_setting('us49.edition_off_again')::jsonb -> 'assets') AS asset
   WHERE asset ->> 'alt' ~* '(atelier|nord|portugal)'),
  0::bigint,
  'live: makers on → off, no alt names the maker or origin');
SELECT is(
  (SELECT asset ->> 'alt'
   FROM jsonb_array_elements(current_setting('us49.edition_off_again')::jsonb -> 'assets') AS asset
   WHERE asset ->> 'id' = '84600000-0000-4000-8000-000000000503'),
  'Side table · US49 846 Studio · product photograph',
  'live: a frozen-facts alt is rebuilt from the caption shown once makers are off');

UPDATE public.client_editions
   SET overrides = overrides || '{"heroAssetId": "84600000-0000-4000-8000-000000000502"}'::jsonb, auto_published = false
 WHERE id = '84600000-0000-4000-8000-000000000902';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT jsonb_build_array(envelope -> 'composition' -> 'hero', envelope -> 'edition' -> 'approvedBy')
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read),
  '[null, "studio"]'::jsonb,
  'live: a concept plate is never the hero, even by override; approvedBy studio');

-- ─── plate scope ───────────────────────────────────────────────────────────

SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000902', repeat('e', 64)),
          '84600000-0000-4000-8000-000000000001'::uuid,
          'plate scope: an approved edition id scopes its project for the client');
SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000001', repeat('e', 64)),
          '84600000-0000-4000-8000-000000000001'::uuid,
          'plate scope: the project id path is unchanged');
SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000901', repeat('e', 64)), NULL,
          'plate scope: a superseded edition id scopes nothing');
SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000902', repeat('0', 64)), NULL,
          'plate scope: bytes the project does not hold read NULL');
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000902', repeat('f', 64)),
          '84600000-0000-4000-8000-000000000001'::uuid,
          'plate scope: the studio reads through the edition scope');
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000902', repeat('e', 64)), NULL,
          'plate scope: the client of another project holding the same bytes is refused');
SELECT is(public.client_can_read_plate('84600000-0000-4000-8000-000000000002', repeat('e', 64)),
          '84600000-0000-4000-8000-000000000002'::uuid,
          'plate scope: that client still reads her own project');
RESET ROLE;

-- ─── hero eligibility, null resets, an override hero never named ───────────

UPDATE public.client_editions
   SET overrides = overrides || '{"heroAssetId": "84600000-0000-4000-8000-000000000501"}'::jsonb
 WHERE id = '84600000-0000-4000-8000-000000000902';
UPDATE public.client_plate_assets SET flags = '{people}' WHERE id = '84600000-0000-4000-8000-000000000501';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  public.get_client_project_edition('84600000-0000-4000-8000-000000000001') -> 'composition' -> 'hero',
  'null'::jsonb,
  'hero: a plate perception flagged (people) is never the hero, a studio override included');
RESET ROLE;
UPDATE public.client_plate_assets SET flags = '{}' WHERE id = '84600000-0000-4000-8000-000000000501';

UPDATE public.client_editions
   SET overrides = jsonb_set(overrides, '{chapters,cover}', '{"headline": null, "standing": null}'::jsonb)
 WHERE id = '84600000-0000-4000-8000-000000000902';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT jsonb_build_array(envelope -> 'composition' -> 'chapters', envelope -> 'composition' -> 'hero')
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read),
  '[[{"key": "cover", "headline": "The house, so far", "standing": "Two rooms are set."}],
    {"assetId": "84600000-0000-4000-8000-000000000501"}]'::jsonb,
  'overrides: a null headline or standing restores the composed text; the unflagged plate is the hero again');
RESET ROLE;

-- A plate of the job the edition never named: the studio's hero still.
INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height,
                                        concept_seen)
VALUES
  ('84600000-0000-4000-8000-000000000505', '84600000-0000-4000-8000-000000000001', repeat('1', 64), 'upload',
   '{"table": "project_files", "id": "84600000-0000-4000-8000-000000000295"}'::jsonb,
   'plates/846/1/original.jpg', 1200, 800, false),
  ('84600000-0000-4000-8000-000000000506', '84600000-0000-4000-8000-000000000001', repeat('3', 64), 'scan',
   '{"table": "room_scans", "id": "84600000-0000-4000-8000-000000000296"}'::jsonb,
   'plates/846/3/original.jpg', 1200, 800, true);
UPDATE public.client_editions
   SET overrides = overrides || '{"heroAssetId": "84600000-0000-4000-8000-000000000505"}'::jsonb
 WHERE id = '84600000-0000-4000-8000-000000000902';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT jsonb_build_array(envelope -> 'composition' -> 'hero' -> 'assetId', asset -> 'sourceKind',
                            asset -> 'caption', asset -> 'alt')
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read,
        jsonb_array_elements(envelope -> 'assets') AS asset
   WHERE asset ->> 'id' = '84600000-0000-4000-8000-000000000505'),
  '["84600000-0000-4000-8000-000000000505", "upload",
    {"what": null, "whose": "US49 846 Studio", "when": null}, "US49 846 Studio · studio photograph"]'::jsonb,
  'override hero: a plate the edition never named is the hero, worded from the studio and its kind');
RESET ROLE;
UPDATE public.client_editions
   SET overrides = overrides || '{"heroAssetId": "84600000-0000-4000-8000-000000000506"}'::jsonb
 WHERE id = '84600000-0000-4000-8000-000000000902';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT jsonb_build_array(envelope -> 'composition' -> 'hero',
                            envelope -> 'assets' @> '[{"id": "84600000-0000-4000-8000-000000000506"}]'::jsonb)
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read),
  '[null, false]'::jsonb,
  'override hero: a concept-seen plate the edition never named is neither shown nor the hero');
RESET ROLE;

-- A board ingested after the compose, approved as the hero of the next edition.
INSERT INTO public.project_boards (id, project_id, name, cover_image_url)
VALUES ('84600000-0000-4000-8000-000000000601', '84600000-0000-4000-8000-000000000001', 'Kitchen scheme',
        'https://img.test/us49-846-board.jpg');
INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height)
VALUES ('84600000-0000-4000-8000-000000000504', '84600000-0000-4000-8000-000000000001', repeat('2', 64), 'board',
        jsonb_build_object('table', 'project_boards', 'id', '84600000-0000-4000-8000-000000000601'),
        'plates/846/2/original.jpg', 1600, 1000);
UPDATE public.client_plate_requests
   SET status = 'done', asset_id = '84600000-0000-4000-8000-000000000504'
 WHERE project_id = '84600000-0000-4000-8000-000000000001' AND source_kind = 'board'
   AND source_ref = jsonb_build_object('table', 'project_boards', 'id', '84600000-0000-4000-8000-000000000601');
INSERT INTO public.client_editions (id, project_id, seq, status, kind, composition, facts)
SELECT '84600000-0000-4000-8000-000000000903', project_id, 3, 'awaiting_review', 'full', composition, facts
FROM public.client_editions WHERE id = '84600000-0000-4000-8000-000000000902';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.approve_client_edition('84600000-0000-4000-8000-000000000903',
      '{"heroAssetId": "84600000-0000-4000-8000-000000000504"}')$$,
  'override hero: the studio approves a board ingested after the compose as the hero');
SET LOCAL request.jwt.claims = '{"sub":"84600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT jsonb_build_array(envelope -> 'edition' -> 'seq', envelope -> 'composition' -> 'hero' -> 'assetId',
                            asset -> 'sourceKind', asset -> 'caption' -> 'what')
   FROM (SELECT public.get_client_project_edition('84600000-0000-4000-8000-000000000001') AS envelope) AS read,
        jsonb_array_elements(envelope -> 'assets') AS asset
   WHERE asset ->> 'id' = '84600000-0000-4000-8000-000000000504'),
  '[3, "84600000-0000-4000-8000-000000000504", "board", "Kitchen scheme"]'::jsonb,
  'override hero: the reader projects it as the hero, captioned from the board record');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
