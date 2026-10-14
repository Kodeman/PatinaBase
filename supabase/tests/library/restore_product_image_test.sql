-- ═══════════════════════════════════════════════════════════════════════════
-- 00793 — restore_product_image (pgTAP, SQ-1004 / SQ-1001 #2)
--
-- Folio Undo puts only the removed image back into the CURRENT images list.
-- The main case: B was removed from [A, B, C]; a collaborator then added D,
-- which the Undo's browser never saw. Undo must give [A, B, C, D], not the
-- cached [A, B, C]. Also: idempotent, appends past the end, a NULL list, a
-- NULL image, and RLS (an outsider writes nothing).
--
-- Run: supabase test db supabase/tests/library/restore_product_image_test.sql
--  or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/library/restore_product_image_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

-- ── grants and security ────────────────────────────────────────────────────
SELECT ok(
  has_function_privilege('authenticated', 'public.restore_product_image(uuid, text, integer)', 'EXECUTE'),
  'authenticated can call restore_product_image'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.restore_product_image(uuid, text, integer)', 'EXECUTE'),
  'anon cannot call restore_product_image'
);
SELECT ok(
  NOT (SELECT p.prosecdef FROM pg_proc AS p
       WHERE p.oid = 'public.restore_product_image(uuid, text, integer)'::regprocedure),
  'restore_product_image is SECURITY INVOKER, so the products RLS policies decide'
);

-- ── fixtures (as postgres): two of Leah's personal pieces ──────────────────
-- Leah (owner)            a0000000-0000-0000-0000-000000000004
-- Outsider (other studio) cf100000-0000-4000-8000-000000000001
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images) VALUES
  ('d7930000-0000-4000-8000-000000000001', 'Folio piece', now(), 'personal',
   'a0000000-0000-0000-0000-000000000004', 'draft',
   -- B was removed from [A, B, C]; then a collaborator added D.
   ARRAY['https://img/a.jpg', 'https://img/c.jpg', 'https://img/d.jpg']),
  ('d7930000-0000-4000-8000-000000000002', 'Empty folio', now(), 'personal',
   'a0000000-0000-0000-0000-000000000004', 'draft', NULL);

-- ── the outsider writes nothing ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT is(
  public.restore_product_image('d7930000-0000-4000-8000-000000000001', 'https://img/x.jpg', 0),
  NULL::text[],
  'outsider: no row is written and nothing comes back'
);
RESET ROLE;
SELECT is(
  (SELECT p.images FROM public.products AS p WHERE p.id = 'd7930000-0000-4000-8000-000000000001'),
  ARRAY['https://img/a.jpg', 'https://img/c.jpg', 'https://img/d.jpg'],
  'outsider: the row is unchanged'
);

-- ── Leah ───────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT is(
  public.restore_product_image('d7930000-0000-4000-8000-000000000001', 'https://img/b.jpg', 1),
  ARRAY['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg', 'https://img/d.jpg'],
  'Undo returns the list it wrote: B at its old index'
);
SELECT is(
  (SELECT p.images FROM public.products AS p WHERE p.id = 'd7930000-0000-4000-8000-000000000001'),
  ARRAY['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg', 'https://img/d.jpg'],
  'an image added concurrently before Undo (D) survives the Undo'
);
SELECT is(
  public.restore_product_image('d7930000-0000-4000-8000-000000000001', 'https://img/b.jpg', 1),
  ARRAY['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg', 'https://img/d.jpg'],
  'a repeated Undo never duplicates the image'
);
SELECT is(
  public.restore_product_image('d7930000-0000-4000-8000-000000000001', 'https://img/e.jpg', 9),
  ARRAY['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg', 'https://img/d.jpg', 'https://img/e.jpg'],
  'an index past the end appends'
);
SELECT is(
  public.restore_product_image('d7930000-0000-4000-8000-000000000002', 'https://img/a.jpg', 3),
  ARRAY['https://img/a.jpg'],
  'a NULL images list takes the image as its only entry'
);
SELECT is(
  public.restore_product_image('d7930000-0000-4000-8000-000000000001', NULL, 0),
  NULL::text[],
  'a NULL image writes nothing'
);
RESET ROLE;
SELECT is(
  (SELECT p.images FROM public.products AS p WHERE p.id = 'd7930000-0000-4000-8000-000000000001'),
  ARRAY['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg', 'https://img/d.jpg', 'https://img/e.jpg'],
  'the NULL image left the row unchanged'
);

SELECT * FROM finish();
ROLLBACK;
