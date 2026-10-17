-- ═══════════════════════════════════════════════════════════════════════════
-- 00818 — a spec book issued after a typed round client price keeps a
-- checksum the renderer reproduces (pgTAP, US-37 release C F7, SQ-1292)
--
-- Studio A, lead D, job P with one room. Three library lines:
--   drapery  cost $1,800, client typed $2,400 → markup 33.3333…% (repeating)
--   sheers   cost $700, client typed $1,000, qty 3 → markup 42.857142…%
--   rod      cost $800 at the 35% default → markup exactly 35
-- The lead issues the book for the client and internal editions.
--
-- The renderer reads render_snapshot through JSON.parse, so it holds every
-- number as a double and canonicalStringify prints the shortest digits that
-- round-trip. pg_temp.js_round_trip does the same in SQL: each number goes
-- through float8 with extra_float_digits = 1, which prints those same
-- shortest digits. That holds for magnitudes from 1e-6 up to 1e21, where
-- JavaScript does not switch to exponent form; every number here is in range.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--        -v ON_ERROR_STOP=1 -f supabase/tests/spec_books/00818_snapshot_numeric_canonical_test.sql
-- Everything is rolled back. finish(true) raises on any failed assertion.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL extra_float_digits = 1;
SELECT plan(8);

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('81800000-0000-4000-8000-0000000000a1', 'f7-lead@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81800000-0000-4000-8000-0000000000a2', 'f7-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('81800000-0000-4000-8000-0000000000a1', 'f7-lead@test.invalid',   'F7 Lead',   now(), now()),
  ('81800000-0000-4000-8000-0000000000a2', 'f7-client@test.invalid', 'F7 Client', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('81800000-0000-4000-8000-0000000000f1', 'design_studio', 'F7 Studio', 'f7-studio-test');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('81800000-0000-4000-8000-0000000000a1', '81800000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('81800000-0000-4000-8000-000000000001', 'F7 Residence',
        '81800000-0000-4000-8000-0000000000a1', '81800000-0000-4000-8000-0000000000a2',
        '81800000-0000-4000-8000-0000000000a1', '81800000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('81800000-0000-4000-8000-000000000201', '81800000-0000-4000-8000-000000000001', 'Living Room', 0);

INSERT INTO public.vendors (id, name)
VALUES ('81800000-0000-4000-8000-000000000301', 'F7 Workroom');

-- Cost (price_trade), integer cents.
INSERT INTO public.products (
  id, name, captured_at, layer, owner_user_id, vendor_id, price_trade, finish, images
)
VALUES
  ('81800000-0000-4000-8000-000000000401', 'F7 Drapery', now(), 'personal',
   '81800000-0000-4000-8000-0000000000a1', '81800000-0000-4000-8000-000000000301', 180000,
   'Linen', ARRAY['https://example.invalid/f7-drapery.jpg']),
  ('81800000-0000-4000-8000-000000000402', 'F7 Sheers', now(), 'personal',
   '81800000-0000-4000-8000-0000000000a1', '81800000-0000-4000-8000-000000000301', 70000,
   'Voile', ARRAY['https://example.invalid/f7-sheers.jpg']),
  ('81800000-0000-4000-8000-000000000403', 'F7 Rod', now(), 'personal',
   '81800000-0000-4000-8000-0000000000a1', '81800000-0000-4000-8000-000000000301', 80000,
   'Bronze', ARRAY['https://example.invalid/f7-rod.jpg']);

-- What the renderer sees: every number as JSON.parse holds it.
CREATE FUNCTION pg_temp.js_round_trip(p jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT CASE jsonb_typeof(p)
    WHEN 'object' THEN COALESCE((
      SELECT jsonb_object_agg(e.key, pg_temp.js_round_trip(e.value)) FROM jsonb_each(p) AS e
    ), '{}'::jsonb)
    WHEN 'array' THEN COALESCE((
      SELECT jsonb_agg(pg_temp.js_round_trip(e.value) ORDER BY e.ordinality)
      FROM jsonb_array_elements(p) WITH ORDINALITY AS e(value, ordinality)
    ), '[]'::jsonb)
    WHEN 'number' THEN to_jsonb((p #>> '{}')::float8)
    ELSE p
  END;
$$;

-- ─── the lead places three lines and types two round client prices ─────────
SELECT set_config('request.jwt.claims',
  '{"sub":"81800000-0000-4000-8000-0000000000a1","role":"authenticated"}', true) IS NOT NULL
  AS lead_signed_in;

DO $$
BEGIN
  PERFORM public.place_product_in_project(
    '81800000-0000-4000-8000-000000000001', product_id,
    '81800000-0000-4000-8000-000000000201', NULL, 'window_treatments', '{}'::jsonb)
  FROM unnest(ARRAY[
    '81800000-0000-4000-8000-000000000401', '81800000-0000-4000-8000-000000000402',
    '81800000-0000-4000-8000-000000000403']::uuid[]) AS product_id;
END;
$$;

CREATE TEMP TABLE f7_line ON COMMIT DROP AS
SELECT item.product_id, item.id
FROM public.project_ffe_items AS item
WHERE item.project_id = '81800000-0000-4000-8000-000000000001';

DO $$
BEGIN
  PERFORM public.set_ffe_line_pricing(
    (SELECT id FROM f7_line WHERE product_id = '81800000-0000-4000-8000-000000000401'),
    'unit_client_price_cents', 240000);
  PERFORM public.set_ffe_line_pricing(
    (SELECT id FROM f7_line WHERE product_id = '81800000-0000-4000-8000-000000000402'),
    'unit_client_price_cents', 100000);
  PERFORM public.set_ffe_line_pricing(
    (SELECT id FROM f7_line WHERE product_id = '81800000-0000-4000-8000-000000000402'),
    'quantity', 3);
END;
$$;

SELECT is(
  (SELECT string_agg(item.markup_percent::text, '|' ORDER BY item.product_id)
   FROM public.project_ffe_items AS item JOIN f7_line USING (id)),
  concat_ws('|', trim_scale(60000::numeric * 100 / 180000),
                 trim_scale(30000::numeric * 100 / 70000), 35),
  'premise: a typed round client price stores its repeating markup at full precision (00809 D4)'
);

-- ─── the lead issues the book ──────────────────────────────────────────────
UPDATE public.project_ffe_specs
SET client_notes = 'Approved selection.', readiness_status = 'ready'
WHERE ffe_item_id IN (SELECT id FROM f7_line);

DO $$
BEGIN
  PERFORM public.ensure_project_spec_book('81800000-0000-4000-8000-000000000001');
END;
$$;

CREATE TEMP TABLE f7_issue ON COMMIT DROP AS
SELECT public.prepare_spec_book_issue(
  (SELECT id FROM public.spec_books WHERE project_id = '81800000-0000-4000-8000-000000000001'),
  ARRAY['client', 'internal'], 'full', NULL, NULL, 'f7-issue-1', '[]'::jsonb) AS result;

CREATE TEMP TABLE f7_revision ON COMMIT DROP AS
SELECT revision.*
FROM public.spec_book_revisions AS revision
WHERE revision.id = (SELECT (result#>>'{revision,id}')::uuid FROM f7_issue);

CREATE TEMP TABLE f7_frozen ON COMMIT DROP AS
SELECT f7_line.product_id, entry AS item
FROM f7_revision
CROSS JOIN LATERAL jsonb_array_elements(f7_revision.render_snapshot->'items') AS entry
JOIN f7_line ON f7_line.id = (entry->>'ffeItemId')::uuid;

SELECT is(
  (SELECT count(*)::int FROM f7_frozen),
  3,
  'the issue freezes all three lines'
);

SELECT is(
  (SELECT item#>>'{pricing,markupPercent}' FROM f7_frozen
   WHERE product_id = '81800000-0000-4000-8000-000000000401'),
  '33.3333',
  'F7: the frozen drapery markup is rounded to four places'
);

SELECT is(
  (SELECT item#>>'{pricing,markupPercent}' FROM f7_frozen
   WHERE product_id = '81800000-0000-4000-8000-000000000402'),
  '42.8571',
  'F7: the frozen sheers markup is rounded to four places'
);

SELECT is(
  (SELECT item#>>'{pricing,markupPercent}' FROM f7_frozen
   WHERE product_id = '81800000-0000-4000-8000-000000000403'),
  '35',
  'an exact markup is frozen unchanged'
);

SELECT is(
  (SELECT encode(extensions.digest(
     public._spec_book_canonical_json(pg_temp.js_round_trip(render_snapshot)), 'sha256'), 'hex')
   FROM f7_revision),
  (SELECT snapshot_checksum FROM f7_revision),
  'F7: the snapshot after the renderer''s JSON round trip hashes to the checksum SQL stored'
);

SELECT is(
  (SELECT count(*)::int
   FROM f7_revision
   CROSS JOIN LATERAL jsonb_path_query(render_snapshot, 'strict $.** ? (@.type() == "number")') AS num
   WHERE public._spec_book_canonical_json(num)
         IS DISTINCT FROM public._spec_book_canonical_json(pg_temp.js_round_trip(num))),
  0,
  'F7: every number in the snapshot prints the same after the JSON round trip'
);

SELECT is(
  (SELECT string_agg(DISTINCT keys.list, ' / ')
   FROM f7_frozen
   CROSS JOIN LATERAL (
     SELECT string_agg(key, ',' ORDER BY key) AS list
     FROM jsonb_object_keys(item->'pricing') AS key
   ) AS keys),
  'clientPriceCents,currency,markupPercent,tradePriceCents',
  'the frozen pricing object keeps its four keys (nothing new reaches any edition)'
);

SELECT * FROM finish(true);
ROLLBACK;
