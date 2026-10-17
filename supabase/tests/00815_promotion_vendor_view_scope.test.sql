-- ═══════════════════════════════════════════════════════════════════════════
-- 00815 — v_promotion_candidates and v_vendor_studio_stats are scoped to the
-- caller (Astra SQ-1257).
--
--   anon     holds no privilege on either view, and a read is refused (42501)
--   X        sees her own promotion candidate, not designer Y's, and the
--            stats of studio S (her seat), not studio T (no seat)
--   Y        the mirror image: her own candidate, studio T only
--   hooks    the exact queries usePromotionCandidates and
--            useVendorStudioStats(vendorId, studioId) issue return the full
--            figures, counted across every job:
--              * X's piece is on job PX1 (FF&E line, ordered) and on job PX2
--                (project_products only). PX2 was created by O, so X cannot
--                read that project_products row herself.
--              * Studio S's job PS2 is led by D, who holds no seat in S, so X
--                cannot read the projects row herself.
--            A security_invoker view would drop both, so these assertions
--            fail on one, as they do on the pre-00815 owner-rights views.
--
-- Run: cd supabase && supabase test db tests/00815_promotion_vendor_view_scope.test.sql
--  or: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--        -v ON_ERROR_STOP=1 -f supabase/tests/00815_promotion_vendor_view_scope.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- X is a member of studio S, O owns S, Y owns studio T. D led a job in S and
-- holds no seat anywhere.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('81500000-0000-4000-8000-0000000000a1', 'us37-scope-x@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81500000-0000-4000-8000-0000000000a2', 'us37-scope-y@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81500000-0000-4000-8000-0000000000a3', 'us37-scope-o@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81500000-0000-4000-8000-0000000000a4', 'us37-scope-d@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('81500000-0000-4000-8000-0000000000a1', 'us37-scope-x@test.invalid', 'Scope X', true, now(), now()),
  ('81500000-0000-4000-8000-0000000000a2', 'us37-scope-y@test.invalid', 'Scope Y', true, now(), now()),
  ('81500000-0000-4000-8000-0000000000a3', 'us37-scope-o@test.invalid', 'Scope O', true, now(), now()),
  ('81500000-0000-4000-8000-0000000000a4', 'us37-scope-d@test.invalid', 'Scope D', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('81500000-0000-4000-8000-0000000000f1', 'design_studio', 'Scope Studio S', 'us37-scope-studio-s-test'),
  ('81500000-0000-4000-8000-0000000000f2', 'design_studio', 'Scope Studio T', 'us37-scope-studio-t-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81500000-0000-4000-8000-0000000000e2', '81500000-0000-4000-8000-0000000000a3', '81500000-0000-4000-8000-0000000000f1', 'owner',  'active', now()),
  ('81500000-0000-4000-8000-0000000000e3', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-0000000000f2', 'owner',  'active', now()),
  ('81500000-0000-4000-8000-0000000000e1', '81500000-0000-4000-8000-0000000000a1', '81500000-0000-4000-8000-0000000000f1', 'member', 'active', now());

INSERT INTO public.vendors (id, name)
VALUES ('81500000-0000-4000-8000-000000000011', 'Scope Vendor');

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, vendor_id)
VALUES
  ('81500000-0000-4000-8000-000000000021', 'Scope X lamp', now(), 'personal', '81500000-0000-4000-8000-0000000000a1', '81500000-0000-4000-8000-000000000011'),
  ('81500000-0000-4000-8000-000000000022', 'Scope Y lamp', now(), 'personal', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-000000000011');

INSERT INTO public.products
  (id, name, captured_at, layer, studio_id, vendor_id, vendor_contact, lead_time_weeks,
   payment_terms, category, usage_notes)
VALUES
  ('81500000-0000-4000-8000-000000000023', 'Scope S sofa',  now(), 'studio', '81500000-0000-4000-8000-0000000000f1', '81500000-0000-4000-8000-000000000011',
   '{"email": "rep@test.invalid"}'::jsonb, 8, 'net_30', 'seating', 'Studio S favourite'),
  ('81500000-0000-4000-8000-000000000024', 'Scope S chair', now(), 'studio', '81500000-0000-4000-8000-0000000000f1', '81500000-0000-4000-8000-000000000011',
   '{"email": "rep@test.invalid"}'::jsonb, 8, 'net_30', 'seating', 'Studio S favourite'),
  ('81500000-0000-4000-8000-000000000025', 'Scope T table', now(), 'studio', '81500000-0000-4000-8000-0000000000f2', '81500000-0000-4000-8000-000000000011',
   '{"email": "rep@test.invalid"}'::jsonb, 8, 'net_30', 'tables', 'Studio T favourite');

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('81500000-0000-4000-8000-000000000001', 'Scope job PX1', '81500000-0000-4000-8000-0000000000a1', '81500000-0000-4000-8000-0000000000a1', '81500000-0000-4000-8000-0000000000f1'),
  ('81500000-0000-4000-8000-000000000002', 'Scope job PX2', '81500000-0000-4000-8000-0000000000a1', '81500000-0000-4000-8000-0000000000a3', '81500000-0000-4000-8000-0000000000f1'),
  ('81500000-0000-4000-8000-000000000003', 'Scope job PS2', '81500000-0000-4000-8000-0000000000a4', '81500000-0000-4000-8000-0000000000a4', '81500000-0000-4000-8000-0000000000f1'),
  ('81500000-0000-4000-8000-000000000004', 'Scope job PT1', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-0000000000f2'),
  ('81500000-0000-4000-8000-000000000005', 'Scope job PT2', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-0000000000f2');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.projects
           WHERE id IN ('81500000-0000-4000-8000-000000000001', '81500000-0000-4000-8000-000000000002',
                        '81500000-0000-4000-8000-000000000003')
             AND studio_id = '81500000-0000-4000-8000-0000000000f1') = 3,
         'SETUP: PX1, PX2 and PS2 must carry studio S';
  ASSERT (SELECT count(*) FROM public.projects
           WHERE id IN ('81500000-0000-4000-8000-000000000004', '81500000-0000-4000-8000-000000000005')
             AND studio_id = '81500000-0000-4000-8000-0000000000f2') = 2,
         'SETUP: PT1 and PT2 must carry studio T';
END $$;

INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES
  ('81500000-0000-4000-8000-000000000101', '81500000-0000-4000-8000-0000000000a1', '81500000-0000-4000-8000-000000000001', '81500000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', false),
  ('81500000-0000-4000-8000-000000000102', '81500000-0000-4000-8000-0000000000a4', '81500000-0000-4000-8000-000000000003', '81500000-0000-4000-8000-000000000011', 'net_30', 25000, 'confirmed', false),
  ('81500000-0000-4000-8000-000000000103', '81500000-0000-4000-8000-0000000000a2', '81500000-0000-4000-8000-000000000004', '81500000-0000-4000-8000-000000000011', 'net_30', 99900, 'confirmed', false);

INSERT INTO public.project_ffe_items (id, project_id, name, status, quantity, purchase_order_id, vendor_id, product_id)
VALUES
  ('81500000-0000-4000-8000-000000000201', '81500000-0000-4000-8000-000000000001', 'X lamp',  'ordered',   1, '81500000-0000-4000-8000-000000000101', '81500000-0000-4000-8000-000000000011', '81500000-0000-4000-8000-000000000021'),
  ('81500000-0000-4000-8000-000000000202', '81500000-0000-4000-8000-000000000001', 'S sofa',  'ordered',   1, '81500000-0000-4000-8000-000000000101', '81500000-0000-4000-8000-000000000011', '81500000-0000-4000-8000-000000000023'),
  ('81500000-0000-4000-8000-000000000203', '81500000-0000-4000-8000-000000000003', 'S chair', 'ordered',   1, '81500000-0000-4000-8000-000000000102', '81500000-0000-4000-8000-000000000011', '81500000-0000-4000-8000-000000000024'),
  ('81500000-0000-4000-8000-000000000204', '81500000-0000-4000-8000-000000000004', 'Y lamp',  'ordered',   1, '81500000-0000-4000-8000-000000000103', '81500000-0000-4000-8000-000000000011', '81500000-0000-4000-8000-000000000022'),
  ('81500000-0000-4000-8000-000000000205', '81500000-0000-4000-8000-000000000004', 'T table', 'ordered',   1, '81500000-0000-4000-8000-000000000103', '81500000-0000-4000-8000-000000000011', '81500000-0000-4000-8000-000000000025'),
  ('81500000-0000-4000-8000-000000000206', '81500000-0000-4000-8000-000000000005', 'Y lamp',  'specified', 1, NULL,                                   '81500000-0000-4000-8000-000000000011', '81500000-0000-4000-8000-000000000022');

-- X's piece reaches PX2 only through project_products; O created PX2.
INSERT INTO public.project_products (id, project_id, product_id)
VALUES ('81500000-0000-4000-8000-000000000301', '81500000-0000-4000-8000-000000000002', '81500000-0000-4000-8000-000000000021');

INSERT INTO public.receiving_inspections (id, purchase_order_id, inspected_by, outcome)
VALUES ('81500000-0000-4000-8000-000000000401', '81500000-0000-4000-8000-000000000102', '81500000-0000-4000-8000-0000000000a4', 'clean');

INSERT INTO public.damage_claims (id, receiving_inspection_id, description)
VALUES ('81500000-0000-4000-8000-000000000501', '81500000-0000-4000-8000-000000000401', 'Scope claim on PS2');

-- ─── anon ──────────────────────────────────────────────────────────────────

SELECT ok(NOT has_table_privilege('anon', 'public.v_promotion_candidates', 'SELECT'),
  'anon holds no SELECT on v_promotion_candidates');
SELECT ok(NOT has_table_privilege('anon', 'public.v_vendor_studio_stats', 'SELECT'),
  'anon holds no SELECT on v_vendor_studio_stats');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

SELECT throws_ok('SELECT 1 FROM public.v_promotion_candidates', '42501', NULL,
  'anon: reading v_promotion_candidates is refused');
SELECT throws_ok('SELECT 1 FROM public.v_vendor_studio_stats', '42501', NULL,
  'anon: reading v_vendor_studio_stats is refused');

RESET ROLE;

-- ─── designer X (seat in S) ────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81500000-0000-4000-8000-0000000000a1","role":"authenticated"}';

-- usePromotionCandidates({ limit: 50 })
SELECT results_eq(
  $$SELECT product_id, name, owner_user_id, vendor_id, project_count, has_order_history
      FROM public.v_promotion_candidates
     ORDER BY project_count DESC
     LIMIT 50$$,
  $$VALUES ('81500000-0000-4000-8000-000000000021'::uuid, 'Scope X lamp'::text,
            '81500000-0000-4000-8000-0000000000a1'::uuid, '81500000-0000-4000-8000-000000000011'::uuid,
            2::bigint, true)$$,
  'X: the usePromotionCandidates query returns exactly her own piece, counted across PX1 and PX2');
SELECT is((SELECT count(*)::int FROM public.v_promotion_candidates
            WHERE owner_user_id IS DISTINCT FROM '81500000-0000-4000-8000-0000000000a1'),
  0, 'X: no candidate owned by anyone else');
SELECT is((SELECT count(*)::int FROM public.v_promotion_candidates
            WHERE product_id = '81500000-0000-4000-8000-000000000022'),
  0, 'X: designer Y''s candidate is not visible');

-- useVendorStudioStats(vendorId, studioId)
SELECT results_eq(
  $$SELECT vendor_id, studio_id, studio_item_count, projects_used_count, lifetime_value_cents, unresolved_damage_count
      FROM public.v_vendor_studio_stats
     WHERE vendor_id = '81500000-0000-4000-8000-000000000011'
       AND studio_id = '81500000-0000-4000-8000-0000000000f1'$$,
  $$VALUES ('81500000-0000-4000-8000-000000000011'::uuid, '81500000-0000-4000-8000-0000000000f1'::uuid,
            2, 2, 35000::bigint, 1)$$,
  'X: the useVendorStudioStats query returns studio S''s full figures, including PS2 whose lead holds no seat');
SELECT is((SELECT count(*)::int FROM public.v_vendor_studio_stats
            WHERE vendor_id = '81500000-0000-4000-8000-000000000011'
              AND studio_id = '81500000-0000-4000-8000-0000000000f2'),
  0, 'X: no stats for studio T, where she holds no seat');
SELECT is((SELECT count(*)::int FROM public.v_vendor_studio_stats
            WHERE studio_id IS DISTINCT FROM '81500000-0000-4000-8000-0000000000f1'),
  0, 'X: every stats row she reads is for studio S');

RESET ROLE;

-- ─── designer Y (seat in T) ────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81500000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT results_eq(
  $$SELECT product_id, name, owner_user_id, vendor_id, project_count, has_order_history
      FROM public.v_promotion_candidates
     ORDER BY project_count DESC
     LIMIT 50$$,
  $$VALUES ('81500000-0000-4000-8000-000000000022'::uuid, 'Scope Y lamp'::text,
            '81500000-0000-4000-8000-0000000000a2'::uuid, '81500000-0000-4000-8000-000000000011'::uuid,
            2::bigint, true)$$,
  'Y: the usePromotionCandidates query returns exactly her own piece');
SELECT is((SELECT count(*)::int FROM public.v_promotion_candidates
            WHERE product_id = '81500000-0000-4000-8000-000000000021'),
  0, 'Y: designer X''s candidate is not visible');
SELECT results_eq(
  $$SELECT vendor_id, studio_id, studio_item_count, projects_used_count, lifetime_value_cents, unresolved_damage_count
      FROM public.v_vendor_studio_stats
     WHERE vendor_id = '81500000-0000-4000-8000-000000000011'
       AND studio_id = '81500000-0000-4000-8000-0000000000f2'$$,
  $$VALUES ('81500000-0000-4000-8000-000000000011'::uuid, '81500000-0000-4000-8000-0000000000f2'::uuid,
            1, 1, 99900::bigint, 0)$$,
  'Y: the useVendorStudioStats query returns studio T''s figures');
SELECT is((SELECT count(*)::int FROM public.v_vendor_studio_stats
            WHERE vendor_id = '81500000-0000-4000-8000-000000000011'
              AND studio_id = '81500000-0000-4000-8000-0000000000f1'),
  0, 'Y: no stats for studio S, where she holds no seat');

RESET ROLE;

-- ─── D (no seat anywhere) ──────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81500000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT is((SELECT count(*)::int FROM public.v_vendor_studio_stats),
  0, 'D: a designer with no seat reads no studio stats, not even for the studio of a job she led');
SELECT is((SELECT count(*)::int FROM public.v_promotion_candidates),
  0, 'D: a designer with no qualifying piece reads no candidates');

RESET ROLE;

-- ─── the views keep owner rights on purpose ────────────────────────────────

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.oid IN ('public.v_promotion_candidates'::regclass, 'public.v_vendor_studio_stats'::regclass)
       AND NOT ('security_barrier=true' = ANY (coalesce(c.reloptions, '{}')))
  ),
  'both views are security_barrier, so a caller''s filter cannot run ahead of the caller predicate');

SELECT * FROM finish();
ROLLBACK;
