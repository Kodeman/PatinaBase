-- ═══════════════════════════════════════════════════════════════════════════
-- 00806 — lead time is optional on library items (pgTAP, US-37 #5, SQ-1098)
--
-- A Studio Library piece saves with no lead time: inserted directly, cleared
-- on an existing studio piece, and promoted from the personal layer with no
-- lead time (by omission and by explicit NULL). A typed lead time still lands.
-- The rest of the Layer 2 bundle stays required.
--
-- Run: supabase test db supabase/tests/library/lead_time_optional_test.sql
--  or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/library/lead_time_optional_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

-- ── fixtures (as postgres) ─────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('80600000-0000-4000-8000-0000000000a1', 'p806-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('80600000-0000-4000-8000-0000000000a1', 'p806-designer@test.invalid', 'P806 Designer', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('80600000-0000-4000-8000-0000000000f1', 'design_studio', 'P806 Studio', 'p806-studio-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('80600000-0000-4000-8000-0000000000e1', '80600000-0000-4000-8000-0000000000a1',
        '80600000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status)
VALUES
  ('80600000-0000-4000-8000-000000000011', 'P806 Personal lamp',  now(), 'personal', '80600000-0000-4000-8000-0000000000a1', 'draft'),
  ('80600000-0000-4000-8000-000000000012', 'P806 Personal chair', now(), 'personal', '80600000-0000-4000-8000-0000000000a1', 'draft'),
  ('80600000-0000-4000-8000-000000000013', 'P806 Personal sofa',  now(), 'personal', '80600000-0000-4000-8000-0000000000a1', 'draft');

-- ── the table: a studio piece without a lead time ──────────────────────────
SELECT lives_ok(
  $$INSERT INTO public.products (id, name, captured_at, layer, studio_id,
                                 vendor_contact, lead_time_weeks, payment_terms, category, usage_notes)
    VALUES ('80600000-0000-4000-8000-000000000021', 'P806 Studio table', now(), 'studio',
            '80600000-0000-4000-8000-0000000000f1', '{}'::jsonb, NULL, 'net_30', 'tables', 'test')$$,
  'a studio-layer library item inserts with no lead time'
);

UPDATE public.products SET lead_time_weeks = 6 WHERE id = '80600000-0000-4000-8000-000000000021';
SELECT lives_ok(
  $$UPDATE public.products SET lead_time_weeks = NULL
     WHERE id = '80600000-0000-4000-8000-000000000021'$$,
  'clearing the lead time on a studio library item saves'
);

SELECT throws_ok(
  $$INSERT INTO public.products (id, name, captured_at, layer, studio_id,
                                 vendor_contact, lead_time_weeks, payment_terms, category, usage_notes)
    VALUES ('80600000-0000-4000-8000-000000000022', 'P806 No notes', now(), 'studio',
            '80600000-0000-4000-8000-0000000000f1', '{}'::jsonb, 4, 'net_30', 'tables', NULL)$$,
  '23514',
  NULL,
  'the rest of the Layer 2 bundle is still required (usage notes)'
);

-- ── promote_to_studio as the designer ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80600000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT lives_ok(
  $$SELECT public.promote_to_studio(
      p_product_id     => '80600000-0000-4000-8000-000000000011',
      p_studio_id      => '80600000-0000-4000-8000-0000000000f1',
      p_vendor_contact => '{"name":"Rae","email":"rae@maker.test"}'::jsonb,
      p_payment_terms  => 'net_30',
      p_category       => 'lighting',
      p_usage_notes    => 'Ships blanket-wrapped.')$$,
  'promote_to_studio saves with the lead time omitted'
);

SELECT lives_ok(
  $$SELECT public.promote_to_studio(
      '80600000-0000-4000-8000-000000000012', '80600000-0000-4000-8000-0000000000f1',
      '{"name":"Rae","email":"rae@maker.test"}'::jsonb, 'net_30', 'seating',
      'Ships blanket-wrapped.', NULL)$$,
  'promote_to_studio saves with an explicit NULL lead time'
);

SELECT lives_ok(
  $$SELECT public.promote_to_studio(
      '80600000-0000-4000-8000-000000000013', '80600000-0000-4000-8000-0000000000f1',
      '{"name":"Rae","email":"rae@maker.test"}'::jsonb, 'net_30', 'seating',
      'Ships blanket-wrapped.', 8)$$,
  'promote_to_studio still takes a typed lead time'
);

RESET ROLE;

SELECT results_eq(
  $$SELECT layer, lead_time_weeks FROM public.products
     WHERE id IN ('80600000-0000-4000-8000-000000000011', '80600000-0000-4000-8000-000000000012')
     ORDER BY id$$,
  $$VALUES ('studio'::text, NULL::integer), ('studio'::text, NULL::integer)$$,
  'both pieces promoted without a lead time are studio pieces with no lead time'
);

SELECT is(
  (SELECT lead_time_weeks FROM public.products WHERE id = '80600000-0000-4000-8000-000000000013'),
  8,
  'the typed lead time lands on the promoted piece'
);

SELECT ok(
  has_function_privilege('authenticated',
    'public.promote_to_studio(uuid, uuid, jsonb, text, text, text, integer, text)', 'EXECUTE'),
  'authenticated can still call promote_to_studio'
);

SELECT * FROM finish();
ROLLBACK;
