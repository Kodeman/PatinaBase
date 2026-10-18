-- 00820 — v_vendor_studio_stats counts only live studio catalog items.
-- Run after 00820_vendor_studio_stats_live_items.sql with psql -v ON_ERROR_STOP=1.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('82000000-0000-4000-8000-000000000001', 'us37-stats-live@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('82000000-0000-4000-8000-000000000001', 'us37-stats-live@test.invalid', 'Live Stats', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('82000000-0000-4000-8000-000000000010', 'design_studio', 'Live Stats Studio', 'us37-stats-live-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000001',
        '82000000-0000-4000-8000-000000000010', 'owner', 'active', now());

INSERT INTO public.vendors (id, name)
VALUES ('82000000-0000-4000-8000-000000000020', 'Live Stats Vendor');

INSERT INTO public.products
  (id, name, captured_at, layer, studio_id, vendor_id, vendor_contact, payment_terms,
   category, usage_notes, deleted_at)
VALUES
  ('82000000-0000-4000-8000-000000000030', 'Live studio item', now(), 'studio',
   '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000020',
   '{}'::jsonb, 'net_30', 'seating', 'Live fixture', NULL),
  ('82000000-0000-4000-8000-000000000031', 'Deleted studio item', now(), 'studio',
   '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000020',
   '{}'::jsonb, 'net_30', 'seating', 'Deleted fixture', now());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';

SELECT is((SELECT studio_item_count
             FROM public.v_vendor_studio_stats
            WHERE vendor_id = '82000000-0000-4000-8000-000000000020'
              AND studio_id = '82000000-0000-4000-8000-000000000010'),
          1, 'studio_item_count excludes deleted studio products');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
