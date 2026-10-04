-- Bring in a Deck — schema, RLS and RPCs (00676, US-15 W2).
--   1. cross-studio isolation (read, register, attach, keep)
--   2. a non-manager cannot keep
--   3. re-registering the same sha resumes
--   4. keep run twice → one product and one capture
--   5. keep returns a pin patch and leaves proposal_board_items untouched
--   6. more than 5 candidates are rejected
--   7. claim hands out a lease, skips leased rows, and expires stale leases
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/schema.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.act_as_service()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as_service() TO PUBLIC;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- 01 lead (studio A owner) · 02 junior (studio A member) · 03 foreign designer
-- (studio B owner) · 04 client on the project (never a co-member).

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6760000-0000-4000-8000-000000000001', 'deck-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6760000-0000-4000-8000-000000000002', 'deck-junior@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6760000-0000-4000-8000-000000000003', 'deck-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6760000-0000-4000-8000-000000000004', 'deck-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6760000-0000-4000-8000-000000000001', 'deck-lead@test.invalid', 'Deck Lead', now(), now()),
  ('d6760000-0000-4000-8000-000000000002', 'deck-junior@test.invalid', 'Deck Junior', now(), now()),
  ('d6760000-0000-4000-8000-000000000003', 'deck-foreign@test.invalid', 'Deck Foreign', now(), now()),
  ('d6760000-0000-4000-8000-000000000004', 'deck-client@test.invalid', 'Deck Client', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6761000-0000-4000-8000-000000000001', 'design_studio', 'Deck Studio', 'deck-studio-test', 'active'),
  ('d6761000-0000-4000-8000-000000000002', 'design_studio', 'Deck Foreign Studio', 'deck-foreign-studio-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6760000-0000-4000-8000-000000000001', 'd6761000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d6760000-0000-4000-8000-000000000002', 'd6761000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('d6760000-0000-4000-8000-000000000003', 'd6761000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES
  ('d6762000-0000-4000-8000-000000000001', 'd6760000-0000-4000-8000-000000000001',
   'd6760000-0000-4000-8000-000000000004', 'd6760000-0000-4000-8000-000000000001',
   'Deck project', 'active'),
  ('d6762000-0000-4000-8000-000000000002', 'd6760000-0000-4000-8000-000000000003',
   NULL, 'd6760000-0000-4000-8000-000000000003',
   'Foreign deck project', 'active');

INSERT INTO public.proposals (id, designer_id, title)
VALUES ('d6762100-0000-4000-8000-000000000001', 'd6760000-0000-4000-8000-000000000001', 'Deck proposal');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6763000-0000-4000-8000-000000000001', NULL, 'd6762000-0000-4000-8000-000000000001',
   'Project deck board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6763000-0000-4000-8000-000000000002', NULL, 'd6762000-0000-4000-8000-000000000002',
   'Foreign deck board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6763000-0000-4000-8000-000000000003', 'd6762100-0000-4000-8000-000000000001', NULL,
   'Proposal deck board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES
  ('d6764000-0000-4000-8000-000000000001', 'd6763000-0000-4000-8000-000000000001',
   'capture', 10, 10, 200, 200, 0, 0, NULL,
   '{"provenance":"imported_deck","deck_import":{"state":"to_confirm"}}'::jsonb),
  ('d6764000-0000-4000-8000-000000000002', 'd6763000-0000-4000-8000-000000000001',
   'capture', 220, 10, 200, 200, 1, 0, NULL,
   '{"provenance":"imported_deck","deck_import":{"state":"to_confirm"}}'::jsonb),
  ('d6764000-0000-4000-8000-000000000003', 'd6763000-0000-4000-8000-000000000001',
   'image', 430, 10, 200, 200, 2, 0, NULL,
   '{"provenance":"imported_deck","deck_import":{"state":"reference"}}'::jsonb),
  ('d6764000-0000-4000-8000-000000000004', 'd6763000-0000-4000-8000-000000000002',
   'image', 10, 10, 200, 200, 0, 0, NULL, '{}'::jsonb),
  ('d6764000-0000-4000-8000-000000000005', 'd6763000-0000-4000-8000-000000000003',
   'image', 10, 10, 200, 200, 0, 0, NULL, '{}'::jsonb);

-- A catalog product the resolver can point at.
INSERT INTO public.vendors (id, name, website)
VALUES ('d6765000-0000-4000-8000-000000000001', 'Deck Catalog Maker', 'https://cataloguehouse.example');

INSERT INTO public.products (
  id, name, layer, price_retail, source_url, images, vendor_id, captured_at
) VALUES (
  'd6766000-0000-4000-8000-000000000001', 'Cove sofa', 'catalog', 450000,
  'https://cataloguehouse.example/cove', ARRAY['https://cataloguehouse.example/cove.jpg'],
  'd6765000-0000-4000-8000-000000000001', now()
);

CREATE TEMP TABLE deck_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON deck_ctx TO PUBLIC;

-- ── 1. Register (lead) and resume (junior) ──────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000001');

INSERT INTO deck_ctx
SELECT 'first', public.register_board_deck_import(
  'd6763000-0000-4000-8000-000000000001',
  repeat('ab', 32),
  'Leah living room.pptx',
  jsonb_build_object(
    'slide_count', 2,
    'options', jsonb_build_object('target', 'this_board'),
    'items', jsonb_build_array(
      jsonb_build_object('element_key', 's1:pic4', 'slide_index', 0, 'slide_title', 'Living',
        'role', 'product',
        'extracted', jsonb_build_object('caption', 'Cove sofa',
          'links', jsonb_build_array(jsonb_build_object('url', 'https://maker.example/sofa', 'origin', 'picture')))),
      jsonb_build_object('element_key', 's1:pic5', 'slide_index', 0, 'slide_title', 'Living',
        'role', 'product', 'extracted', '{}'::jsonb),
      jsonb_build_object('element_key', 's2:pic2', 'slide_index', 1, 'slide_title', 'Mood',
        'role', 'reference')
    ),
    'deck_links', jsonb_build_array(
      jsonb_build_object('url', 'https://maker.example/lookbook', 'text_context', 'Lookbook', 'source', 'notes'),
      jsonb_build_object('url', 'ppaction://hlinkshowjump', 'source', 'text')
    ),
    'slides', jsonb_build_array(
      jsonb_build_object('slide_index', 0, 'unpaired_links', jsonb_build_array(
        jsonb_build_object('url', 'https://maker.example/rug', 'text_context', 'Rug', 'source', 'legend'))),
      jsonb_build_object('slide_index', 1)
    )
  )
);

DO $$
DECLARE r jsonb := (SELECT v FROM deck_ctx WHERE k = 'first');
BEGIN
  ASSERT (r->>'resumed')::boolean = false, 'a first registration is not a resume';
  ASSERT jsonb_array_length(r->'items') = 3, 'register must create one item per manifest element';
  ASSERT r->>'status' = 'laying_out', 'a new import starts laying_out';
  ASSERT (SELECT count(*) FROM public.board_deck_import_items
          WHERE import_id = (r->>'import_id')::uuid AND state = 'pending') = 2,
    'product-role pieces start pending';
  ASSERT (SELECT state FROM public.board_deck_import_items
          WHERE import_id = (r->>'import_id')::uuid AND element_key = 's2:pic2') = 'reference',
    'reference-role pieces start as reference';
  ASSERT (SELECT links FROM public.board_deck_imports WHERE id = (r->>'import_id')::uuid)
    = '{"deck_links":[{"url":"https://maker.example/lookbook","source":"notes","text_context":"Lookbook"}],
        "slide_links":[{"slide_index":0,"unpaired_links":[{"url":"https://maker.example/rug","source":"legend","text_context":"Rug"}]}]}'::jsonb,
    'deck and unpaired slide links are stored; a non-http link is dropped';
END;
$$;

-- The 500-link cap holds across deck and slide links.
RESET ROLE;
DO $$
DECLARE v_links jsonb;
BEGIN
  v_links := public._board_deck_import_manifest_links(jsonb_build_object(
    'deck_links', (SELECT jsonb_agg(jsonb_build_object('url', 'https://a.example/' || n))
                   FROM generate_series(1, 300) AS n),
    'slides', jsonb_build_array(jsonb_build_object('unpaired_links',
      (SELECT jsonb_agg(jsonb_build_object('url', 'https://b.example/' || n))
       FROM generate_series(1, 300) AS n)))
  ));
  ASSERT jsonb_array_length(v_links->'deck_links') = 300, 'deck links come first';
  ASSERT jsonb_array_length(v_links->'slide_links'->0->'unpaired_links') = 200,
    'links are capped at 500 in all';
END;
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000001');

SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000002');
INSERT INTO deck_ctx
SELECT 'again', public.register_board_deck_import(
  'd6763000-0000-4000-8000-000000000001', repeat('AB', 32), 'renamed.pptx',
  '{"items":[{"element_key":"other","slide_index":0,"role":"product"}]}'::jsonb
);

DO $$
DECLARE
  r1 jsonb := (SELECT v FROM deck_ctx WHERE k = 'first');
  r2 jsonb := (SELECT v FROM deck_ctx WHERE k = 'again');
BEGIN
  ASSERT (r2->>'resumed')::boolean, 're-registering the same sha must resume';
  ASSERT r2->>'import_id' = r1->>'import_id', 'resume returns the existing import';
  ASSERT jsonb_array_length(r2->'items') = 3, 'resume returns the existing items, not the new manifest';
  ASSERT (SELECT count(*) FROM public.board_deck_imports
          WHERE board_id = 'd6763000-0000-4000-8000-000000000001') = 1,
    'resume must not create a second import';
END;
$$;

-- A proposal-owned board works the same way.
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000001');
INSERT INTO deck_ctx
SELECT 'proposal', public.register_board_deck_import(
  'd6763000-0000-4000-8000-000000000003', repeat('cd', 32), 'proposal.pptx',
  '{"items":[{"element_key":"s1:pic1","slide_index":0,"role":"product"},
             {"element_key":"link:1","slide_index":0,"role":"product"}]}'::jsonb);
DO $$
DECLARE r jsonb := (SELECT v FROM deck_ctx WHERE k = 'proposal');
BEGIN
  ASSERT (r->>'resumed')::boolean = false, 'a proposal board registers';
  ASSERT (SELECT count(*) FROM public.board_deck_imports) >= 2,
    'the lead reads imports on both project- and proposal-owned boards';
END;
$$;

-- ── 2. Cross-studio isolation ───────────────────────────────────────────────
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000003');
INSERT INTO deck_ctx
SELECT 'foreign', public.register_board_deck_import(
  'd6763000-0000-4000-8000-000000000002', repeat('ef', 32), 'foreign.pptx',
  '{"items":[{"element_key":"s1:pic1","slide_index":0,"role":"product"}]}'::jsonb
);

DO $$
DECLARE v_state text;
BEGIN
  ASSERT (SELECT count(*) FROM public.board_deck_imports) = 1,
    'the foreign designer sees only her own studio import';
  ASSERT NOT EXISTS (SELECT 1 FROM public.board_deck_import_items AS item
                     JOIN public.board_deck_imports AS imp ON imp.id = item.import_id
                     WHERE imp.board_id <> 'd6763000-0000-4000-8000-000000000002'),
    'the foreign designer must not read another studio''s items';

  BEGIN
    PERFORM public.register_board_deck_import(
      'd6763000-0000-4000-8000-000000000001', repeat('12', 32), 'x.pptx', '{}'::jsonb);
    RAISE EXCEPTION 'foreign register on another studio board must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.attach_board_deck_import_pins(
      ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid,
      '[{"element_key":"s1:pic4","board_item_id":"d6764000-0000-4000-8000-000000000004"}]'::jsonb);
    RAISE EXCEPTION 'foreign attach on another studio import must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000001');
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.board_deck_imports
                     WHERE board_id = 'd6763000-0000-4000-8000-000000000002'),
    'the lead must not read the foreign studio import';
  ASSERT NOT EXISTS (SELECT 1 FROM public.board_deck_import_items
                     WHERE import_id = ((SELECT v FROM deck_ctx WHERE k = 'foreign')->>'import_id')::uuid),
    'the lead must not read the foreign studio items';
END;
$$;

-- No direct writes for a client role.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.board_deck_imports (board_id, file_name, file_sha256)
    VALUES ('d6763000-0000-4000-8000-000000000001', 'direct.pptx', repeat('99', 32));
    RAISE EXCEPTION 'a direct insert must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.board_deck_import_items SET state = 'kept';
    RAISE EXCEPTION 'a direct update must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.claim_board_deck_import_items(5);
    RAISE EXCEPTION 'claim is service_role only';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ── 3. Attach pins (board check) ────────────────────────────────────────────
DO $$
DECLARE
  v_import uuid := ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid;
  r jsonb;
BEGIN
  BEGIN
    PERFORM public.attach_board_deck_import_pins(v_import,
      '[{"element_key":"s1:pic4","board_item_id":"d6764000-0000-4000-8000-000000000005"}]'::jsonb);
    RAISE EXCEPTION 'a pin from another board must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  r := public.attach_board_deck_import_pins(v_import, jsonb_build_array(
    jsonb_build_object('element_key', 's1:pic4', 'board_item_id', 'd6764000-0000-4000-8000-000000000001'),
    jsonb_build_object('element_key', 's1:pic5', 'board_item_id', 'd6764000-0000-4000-8000-000000000002'),
    jsonb_build_object('element_key', 's2:pic2', 'board_item_id', 'd6764000-0000-4000-8000-000000000003')
  ));
  ASSERT (r->>'attached')::int = 3, 'three pins attach';
  ASSERT r->>'status' = 'resolving', 'attaching pins starts resolution';
END;
$$;

-- ── 4. Claim: lease, skip, expiry ───────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.act_as_service();

INSERT INTO deck_ctx SELECT 'claim1', public.claim_board_deck_import_items(10);
INSERT INTO deck_ctx SELECT 'claim2', public.claim_board_deck_import_items(10);

DO $$
DECLARE
  c1 jsonb := (SELECT v FROM deck_ctx WHERE k = 'claim1');
  c2 jsonb := (SELECT v FROM deck_ctx WHERE k = 'claim2');
  v_import uuid := ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid;
BEGIN
  ASSERT jsonb_array_length(c1->'items') = 2,
    'claim hands out the two pending product pieces of the resolving import';
  ASSERT (SELECT bool_and(lease_owner = c1->>'lease_owner' AND lease_until > now())
          FROM public.board_deck_import_items
          WHERE import_id = v_import AND state = 'pending'),
    'claimed pieces carry the lease';
  ASSERT jsonb_array_length(c2->'items') = 0, 'a leased piece is not handed out twice';
END;
$$;

RESET ROLE;
-- Age the lease past its expiry (as the owner) and claim again.
UPDATE public.board_deck_import_items
SET lease_until = now() - interval '1 second'
WHERE import_id = ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid
  AND state = 'pending';
SET LOCAL ROLE service_role;
SELECT pg_temp.act_as_service();
INSERT INTO deck_ctx SELECT 'claim3', public.claim_board_deck_import_items(10);

DO $$
DECLARE c3 jsonb := (SELECT v FROM deck_ctx WHERE k = 'claim3');
BEGIN
  ASSERT jsonb_array_length(c3->'items') = 2, 'an expired lease is claimable again';
  ASSERT (SELECT bool_and((item->>'attempts')::int = 2) FROM jsonb_array_elements(c3->'items') AS item),
    'each claim counts an attempt';
END;
$$;

-- ── 5. Record resolution; more than 5 candidates rejected ───────────────────
DO $$
DECLARE
  v_import uuid := ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid;
  v_item uuid;
  v_six jsonb;
  r jsonb;
BEGIN
  SELECT id INTO v_item FROM public.board_deck_import_items
  WHERE import_id = v_import AND element_key = 's1:pic4';

  SELECT jsonb_agg(jsonb_build_object(
    'source', 'words', 'product_id', 'd6766000-0000-4000-8000-000000000001',
    'band', 'possible', 'rank', n, 'evidence', '{}'::jsonb))
  INTO v_six FROM generate_series(1, 6) AS n;

  BEGIN
    PERFORM public.record_board_deck_import_resolution(v_item, 'found', 'words', v_six);
    RAISE EXCEPTION 'six candidates must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  r := public.record_board_deck_import_resolution(v_item, 'found', 'link', jsonb_build_array(
    jsonb_build_object('source', 'link', 'band', 'strong', 'rank', 1,
      'evidence', jsonb_build_object('from', 'picture link'),
      'extracted', jsonb_build_object('name', 'Arlo lounge chair', 'brand', 'Maker Co',
        'price_cents', 129900, 'images', jsonb_build_array('https://maker.example/arlo.jpg'),
        'source_url', 'https://www.maker.example/arlo')),
    jsonb_build_object('source', 'words', 'band', 'likely', 'rank', 2,
      'product_id', 'd6766000-0000-4000-8000-000000000001', 'evidence', '{}'::jsonb)
  ));
  ASSERT (r->>'applied')::boolean AND r->>'state' = 'found', 'a resolution records';
  ASSERT (SELECT lease_owner IS NULL FROM public.board_deck_import_items WHERE id = v_item),
    'recording a resolution releases the lease';
END;
$$;

RESET ROLE;
-- The table CHECK holds even for the owner.
DO $$
BEGIN
  UPDATE public.board_deck_import_items
  SET candidates = (SELECT jsonb_agg(n) FROM generate_series(1, 6) AS n)
  WHERE element_key = 's1:pic5';
  RAISE EXCEPTION 'the candidates CHECK must reject six';
EXCEPTION WHEN check_violation THEN NULL;
END;
$$;

-- ── 6. Keep: non-manager refused; patch; idempotent; pins untouched ─────────
CREATE TEMP TABLE pins_before ON COMMIT DROP AS
SELECT id, type, product_id, capture_id, data, updated_at
FROM public.proposal_board_items
WHERE board_id = 'd6763000-0000-4000-8000-000000000001';
GRANT SELECT ON pins_before TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000004');
DO $$
DECLARE v_item uuid;
BEGIN
  -- The client cannot even read the item, and a guessed id is refused.
  SELECT id INTO v_item FROM public.board_deck_import_items WHERE element_key = 's1:pic4';
  ASSERT v_item IS NULL, 'the client must not read deck import items';
  BEGIN
    PERFORM public.keep_board_deck_import_item(
      (SELECT (item->>'item_id')::uuid
       FROM jsonb_array_elements((SELECT v FROM deck_ctx WHERE k = 'first')->'items') AS item
       WHERE item->>'element_key' = 's1:pic4'), 1, NULL);
    RAISE EXCEPTION 'a non-manager keep must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000003');
DO $$
BEGIN
  PERFORM public.keep_board_deck_import_item(
    (SELECT (item->>'item_id')::uuid
     FROM jsonb_array_elements((SELECT v FROM deck_ctx WHERE k = 'first')->'items') AS item
     WHERE item->>'element_key' = 's1:pic4'), 1, NULL);
  RAISE EXCEPTION 'a foreign-studio keep must fail';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$$;

SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000001');
INSERT INTO deck_ctx
SELECT 'keep1', public.keep_board_deck_import_item(
  (SELECT (item->>'item_id')::uuid
   FROM jsonb_array_elements((SELECT v FROM deck_ctx WHERE k = 'first')->'items') AS item
   WHERE item->>'element_key' = 's1:pic4'), 1, NULL);
INSERT INTO deck_ctx
SELECT 'keep2', public.keep_board_deck_import_item(
  (SELECT (item->>'item_id')::uuid
   FROM jsonb_array_elements((SELECT v FROM deck_ctx WHERE k = 'first')->'items') AS item
   WHERE item->>'element_key' = 's1:pic4'), 1, NULL);

DO $$
DECLARE
  k1 jsonb := (SELECT v FROM deck_ctx WHERE k = 'keep1');
  k2 jsonb := (SELECT v FROM deck_ctx WHERE k = 'keep2');
BEGIN
  ASSERT k1->>'type' = 'capture', 'keeping an extracted page returns a capture patch';
  ASSERT k1->>'product_id' IS NOT NULL AND k1->>'capture_id' IS NOT NULL,
    'the patch carries the product and the capture';
  ASSERT k1->>'board_item_id' = 'd6764000-0000-4000-8000-000000000001',
    'the patch names its pin';
  ASSERT k1->'data'->>'name' = 'Arlo lounge chair', 'patch name';
  ASSERT k1->'data'->>'vendor_name' = 'Maker Co', 'patch vendor (stub named from the brand)';
  ASSERT (k1->'data'->>'price_cents')::int = 129900, 'patch price is the retail price';
  ASSERT k1->'data'->>'source_url' = 'https://www.maker.example/arlo', 'patch source_url';
  ASSERT k1->'data'->>'product_image_url' = 'https://maker.example/arlo.jpg', 'patch maker photo';
  ASSERT k1->'data'->'deck_import' = '{"state":"kept","found_by":"link"}'::jsonb,
    'patch deck_import state';

  ASSERT k2->>'product_id' = k1->>'product_id' AND k2->>'capture_id' = k1->>'capture_id',
    'keep run twice returns the same product and capture';
  ASSERT (SELECT count(*) FROM public.products
          WHERE source_url = 'https://www.maker.example/arlo') = 1,
    'keep run twice mints exactly one product';
  ASSERT (SELECT count(*) FROM public.proposal_captures
          WHERE source_url = 'https://www.maker.example/arlo') = 1,
    'keep run twice writes exactly one capture';
  ASSERT (SELECT layer = 'personal' AND owner_user_id = 'd6760000-0000-4000-8000-000000000001'
                 AND capture_source = 'import'
          FROM public.products WHERE id = (k1->>'product_id')::uuid),
    'the product is minted in the keeper''s personal library';
  ASSERT (SELECT count(*) FROM public.vendors WHERE website = 'https://maker.example') = 1,
    'one stub vendor, keyed by the page domain';
  ASSERT (SELECT state = 'kept' AND chosen_product_id = (k1->>'product_id')::uuid
          FROM public.board_deck_import_items
          WHERE id = (k1->>'item_id')::uuid),
    'the item records the keep';

  -- Keep never writes the pins: the client applies the patch.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_board_items AS pin
    JOIN pins_before AS before ON before.id = pin.id
    WHERE pin.type IS DISTINCT FROM before.type
       OR pin.product_id IS DISTINCT FROM before.product_id
       OR pin.capture_id IS DISTINCT FROM before.capture_id
       OR pin.data IS DISTINCT FROM before.data
       OR pin.updated_at IS DISTINCT FROM before.updated_at
  ), 'keep must leave proposal_board_items untouched';

  -- A different choice on a kept piece is a swap, not a keep.
  BEGIN
    PERFORM public.keep_board_deck_import_item((k1->>'item_id')::uuid, 2, NULL);
    RAISE EXCEPTION 'keep must refuse a different choice on a kept piece';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- ── 7. Swap / unkeep guard / unkeep / reference ─────────────────────────────
DO $$
DECLARE
  v_item uuid := ((SELECT v FROM deck_ctx WHERE k = 'keep1')->>'item_id')::uuid;
  r jsonb;
BEGIN
  r := public.swap_board_deck_import_item(v_item, 2, NULL);
  ASSERT r->>'type' = 'product', 'swapping to an existing product returns a product patch';
  ASSERT r->>'product_id' = 'd6766000-0000-4000-8000-000000000001', 'swap target';
  ASSERT r->>'capture_id' IS NULL, 'an existing product needs no capture';
  ASSERT r->'data'->>'vendor_name' = 'Deck Catalog Maker', 'swap patch vendor';
  ASSERT r->'data'->'deck_import'->>'found_by' = 'words', 'swap patch found_by';
END;
$$;

RESET ROLE;
-- The pin goes onto the schedule (as Wave 1 send-to-schedule stamps it).
UPDATE public.proposal_board_items
SET data = data || '{"proposalItemId":"d6767000-0000-4000-8000-000000000001"}'::jsonb
WHERE id = 'd6764000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000002');

DO $$
DECLARE
  v_item uuid := ((SELECT v FROM deck_ctx WHERE k = 'keep1')->>'item_id')::uuid;
  v_hint text;
BEGIN
  BEGIN
    PERFORM public.unkeep_board_deck_import_item(v_item);
    RAISE EXCEPTION 'unkeep must refuse a pin on the schedule';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    ASSERT v_hint = 'on_schedule', 'unkeep names its reason: ' || COALESCE(v_hint, '<null>');
  END;
END;
$$;

RESET ROLE;
UPDATE public.proposal_board_items
SET data = data - 'proposalItemId'
WHERE id = 'd6764000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000002');

DO $$
DECLARE
  v_item uuid := ((SELECT v FROM deck_ctx WHERE k = 'keep1')->>'item_id')::uuid;
  r jsonb;
BEGIN
  r := public.unkeep_board_deck_import_item(v_item);
  ASSERT r->>'type' = 'capture' AND r->>'product_id' IS NULL, 'unkeep returns a to-confirm patch';
  ASSERT r->'data'->'deck_import'->>'state' = 'to_confirm', 'unkeep patch state';
  ASSERT r->'data'->>'source_url' = 'https://maker.example/sofa', 'unkeep restores the slide link';
  ASSERT (SELECT state = 'found' AND chosen_product_id IS NULL
          FROM public.board_deck_import_items WHERE id = v_item),
    'unkeep returns the piece to found';

  r := public.reference_board_deck_import_item(v_item);
  ASSERT r->>'type' = 'image' AND r->'data'->>'provenance' = 'imported_deck',
    'keep as reference returns an image patch';
  ASSERT (SELECT state FROM public.board_deck_import_items WHERE id = v_item) = 'reference',
    'the item is a reference';
END;
$$;

-- ── 8. Stale lease past the attempt budget settles as not_found ─────────────
RESET ROLE;
UPDATE public.board_deck_import_items
SET attempts = 5, lease_owner = 'stale', lease_until = now() - interval '1 second'
WHERE element_key = 's1:pic5'
  AND import_id = ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid;
SET LOCAL ROLE service_role;
SELECT pg_temp.act_as_service();
INSERT INTO deck_ctx SELECT 'claim4', public.claim_board_deck_import_items(10);

DO $$
DECLARE v_import uuid := ((SELECT v FROM deck_ctx WHERE k = 'first')->>'import_id')::uuid;
BEGIN
  ASSERT (SELECT state = 'not_found' AND lease_owner IS NULL
          FROM public.board_deck_import_items
          WHERE import_id = v_import AND element_key = 's1:pic5'),
    'an exhausted stale lease settles as not_found';
  ASSERT (SELECT status = 'ready' AND finished_at IS NOT NULL
          FROM public.board_deck_imports WHERE id = v_import),
    'an import with nothing pending is ready';
END;
$$;

-- ── 9. A link-only piece: keep pairs a picture, or keeps without one ───────
DO $$
DECLARE
  r jsonb := (SELECT v FROM deck_ctx WHERE k = 'proposal');
  v_item uuid;
BEGIN
  FOR v_item IN
    SELECT (item->>'item_id')::uuid FROM jsonb_array_elements(r->'items') AS item
  LOOP
    PERFORM public.record_board_deck_import_resolution(v_item, 'found', 'link', jsonb_build_array(
      jsonb_build_object('source', 'link_existing', 'band', 'strong', 'rank', 1,
        'product_id', 'd6766000-0000-4000-8000-000000000001', 'evidence', '{}'::jsonb)));
  END LOOP;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6760000-0000-4000-8000-000000000001');
DO $$
DECLARE
  r jsonb := (SELECT v FROM deck_ctx WHERE k = 'proposal');
  v_pic uuid;
  v_link uuid;
  p jsonb;
BEGIN
  SELECT (item->>'item_id')::uuid INTO v_pic FROM jsonb_array_elements(r->'items') AS item
  WHERE item->>'element_key' = 's1:pic1';
  SELECT (item->>'item_id')::uuid INTO v_link FROM jsonb_array_elements(r->'items') AS item
  WHERE item->>'element_key' = 'link:1';

  BEGIN
    PERFORM public.keep_board_deck_import_item(v_pic, 1, NULL, 'd6764000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'keep must refuse a picture from another board';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  p := public.keep_board_deck_import_item(v_pic, 1, NULL, 'd6764000-0000-4000-8000-000000000005');
  ASSERT p->>'board_item_id' = 'd6764000-0000-4000-8000-000000000005', 'keep pairs the chosen picture';
  ASSERT p->>'type' = 'product' AND p->>'product_id' = 'd6766000-0000-4000-8000-000000000001',
    'an existing catalog product is reused';
  ASSERT (SELECT board_item_id FROM public.board_deck_import_items WHERE id = v_pic)
    = 'd6764000-0000-4000-8000-000000000005', 'the item records its picture';

  p := public.keep_board_deck_import_item(v_link, 1, NULL, NULL);
  ASSERT p ? 'board_item_id' AND p->>'board_item_id' IS NULL,
    'keep without a picture returns a patch for a new pin';
  ASSERT (SELECT state = 'kept' AND board_item_id IS NULL
          FROM public.board_deck_import_items WHERE id = v_link),
    'a link-only piece is kept with no pin';
END;
$$;

RESET ROLE;
\echo 'deck_import schema tests passed'
ROLLBACK;
