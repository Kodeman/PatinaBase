-- 00828 / SQ-1158: configured fills must not evaluate unused catalog totals.
-- All fixtures and writes roll back; run with `supabase test db <this file>`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('82800000-0000-4000-8000-000000000001', 'sq1158@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name)
VALUES ('82800000-0000-4000-8000-000000000001', 'sq1158@test.invalid', 'SQ1158 Designer')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
VALUES ('82800000-0000-4000-8000-000000000002', 'design_studio', 'SQ1158 Studio', 'sq1158-studio');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('82800000-0000-4000-8000-000000000003', '82800000-0000-4000-8000-000000000001',
        '82800000-0000-4000-8000-000000000002', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES ('82800000-0000-4000-8000-000000000004', 'SQ1158 House',
        '82800000-0000-4000-8000-000000000001', '82800000-0000-4000-8000-000000000001',
        '82800000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.project_pricing_settings (project_id, markup_target_percent)
VALUES ('82800000-0000-4000-8000-000000000004', 35);
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, price_trade, price_retail)
VALUES
  ('82800000-0000-4000-8000-000000000011', 'SQ1158 Catalog 1.2B', now(), 'personal',
   '82800000-0000-4000-8000-000000000001', 800000000, 1200000000),
  ('82800000-0000-4000-8000-000000000012', 'SQ1158 Ordinary', now(), 'personal',
   '82800000-0000-4000-8000-000000000001', 10000, 18000);
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, studio_id, project_id, version, schema_revision,
  evaluation, snapshot, snapshot_hash, is_complete, is_valid, retail_price_cents,
  trade_price_cents, status, approved_at, approved_by
)
SELECT id, '82800000-0000-4000-8000-000000000011',
       '82800000-0000-4000-8000-000000000001', '82800000-0000-4000-8000-000000000002',
       '82800000-0000-4000-8000-000000000004', 1, 1, '{}'::jsonb,
       '{"selections": []}'::jsonb, repeat('b', 64), true, true, retail,
       800000000, 'approved', now(), '82800000-0000-4000-8000-000000000001'
FROM (VALUES
  ('82800000-0000-4000-8000-000000000021'::uuid, 1000000000),
  ('82800000-0000-4000-8000-000000000022'::uuid, 1100000000)
) AS configs(id, retail);
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, unit_price_cents,
  line_total_cents, design_disposition
)
SELECT id, '82800000-0000-4000-8000-000000000004', 'Pair', 'specified', 'fixed',
       2, 0, 0, 'candidate'
FROM (VALUES
  ('82800000-0000-4000-8000-000000000031'::uuid),
  ('82800000-0000-4000-8000-000000000032'::uuid),
  ('82800000-0000-4000-8000-000000000033'::uuid),
  ('82800000-0000-4000-8000-000000000034'::uuid)
) AS needs(id);
SELECT set_config('app.ffe_mutation_rpc', '', true);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82800000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.place_product_configuration_in_project(
    '82800000-0000-4000-8000-000000000004', '82800000-0000-4000-8000-000000000021',
    NULL, '82800000-0000-4000-8000-000000000031')$$,
  'SQ1158: approved 2 x 1B places despite unused 2 x 1.2B catalog total'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', quantity, unit_price_cents, line_total_cents,
                    trade_price_cents, price_basis, markup_percent)
   FROM public.project_ffe_items WHERE id = '82800000-0000-4000-8000-000000000031'),
  '2|1000000000|2000000000|800000000|client|25',
  'SQ1158: configured fill installs approved cents and true markup, never the temporary zero'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.project_ffe_specs AS spec
          JOIN public.product_configurations AS config ON config.id = spec.configuration_id
          JOIN public.project_ffe_items AS item ON item.id = spec.ffe_item_id
          WHERE item.id = '82800000-0000-4000-8000-000000000031'
            AND config.id = '82800000-0000-4000-8000-000000000021'
            AND config.ffe_item_id = item.id
            AND spec.configuration_locked_at IS NOT NULL
            AND item.pending_cost_changed_at IS NULL),
  'SQ1158: approved configuration stays bound and locked with no pending cost'
);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.place_product_in_project_v2('{
    "projectId":"82800000-0000-4000-8000-000000000004",
    "productId":"82800000-0000-4000-8000-000000000012",
    "placeholderSelectionId":"82800000-0000-4000-8000-000000000032",
    "idempotencyKey":"sq1158-ordinary"}'::jsonb)$$,
  'SQ1158: ordinary placeholder fill still places'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', quantity, unit_price_cents, line_total_cents, retail_unit_cents, price_basis)
   FROM public.project_ffe_items WHERE id = '82800000-0000-4000-8000-000000000032'),
  '2|13500|27000|18000|markup',
  'SQ1158: ordinary fill keeps the 35 percent default, quantity total, and catalog retail'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.place_product_configuration_in_project(
    '82800000-0000-4000-8000-000000000004', '82800000-0000-4000-8000-000000000022',
    NULL, '82800000-0000-4000-8000-000000000033')$$,
  '23514', 'That price is too large for one line.',
  'SQ1158: approved 2 x 1.1B total remains refused by configuration validation'
);
RESET ROLE;
SELECT ok(
  EXISTS (SELECT 1 FROM public.project_ffe_items
          WHERE id = '82800000-0000-4000-8000-000000000033'
            AND product_id IS NULL AND line_total_cents = 0)
  AND EXISTS (SELECT 1 FROM public.product_configurations
              WHERE id = '82800000-0000-4000-8000-000000000022' AND ffe_item_id IS NULL),
  'SQ1158: rejected configuration leaves no partial product or binding'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.place_product_in_project_v2('{
    "projectId":"82800000-0000-4000-8000-000000000004",
    "productId":"82800000-0000-4000-8000-000000000011",
    "placeholderSelectionId":"82800000-0000-4000-8000-000000000034",
    "idempotencyKey":"sq1158-ordinary-overflow"}'::jsonb)$$,
  '22003', 'integer out of range',
  'SQ1158: ordinary catalog overflow is not bypassed'
);
SELECT throws_ok(
  $$SELECT public.place_product_in_project_v2('{
    "projectId":"82800000-0000-4000-8000-000000000004",
    "productId":"82800000-0000-4000-8000-000000000011",
    "placeholderSelectionId":"82800000-0000-4000-8000-000000000034",
    "sourceMetadata":{"configurationId":"82800000-0000-4000-8000-000000000021"},
    "idempotencyKey":"sq1158-metadata-only"}'::jsonb)$$,
  '22003', 'integer out of range',
  'SQ1158: caller-supplied configuration metadata alone cannot bypass catalog totals'
);
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
