-- 00820 — v_vendor_studio_stats counts only live studio catalog items.
-- Run after 00820_vendor_studio_stats_live_items.sql with psql -v ON_ERROR_STOP=1.
BEGIN;

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
VALUES ('82000000-0000-4000-8000-000000000020', 'Live Stats Vendor'),
       ('82000000-0000-4000-8000-000000000021', 'Merged Stats Vendor'),
       ('82000000-0000-4000-8000-000000000022', 'Historical Stats Vendor');

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES ('82000000-0000-4000-8000-000000000040', 'Historical Stats Job',
        '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
        '82000000-0000-4000-8000-000000000010', 'active');

INSERT INTO public.purchase_orders
  (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by)
VALUES ('82000000-0000-4000-8000-000000000050', '82000000-0000-4000-8000-000000000001',
        '82000000-0000-4000-8000-000000000040', '82000000-0000-4000-8000-000000000022',
        'net_30', 125000, 'draft', '82000000-0000-4000-8000-000000000001');

INSERT INTO public.products
  (id, name, captured_at, layer, studio_id, vendor_id, vendor_contact, payment_terms,
   category, usage_notes, deleted_at)
VALUES
  ('82000000-0000-4000-8000-000000000030', 'Live studio item', now(), 'studio',
   '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000020',
   '{}'::jsonb, 'net_30', 'seating', 'Live fixture', NULL),
  ('82000000-0000-4000-8000-000000000031', 'Deleted studio item', now(), 'studio',
   '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000020',
   '{}'::jsonb, 'net_30', 'seating', 'Deleted fixture', now()),
  ('82000000-0000-4000-8000-000000000032', 'Merged studio item', now(), 'studio',
   '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000021',
   '{}'::jsonb, 'net_30', 'seating', 'Merged fixture', NULL),
  ('82000000-0000-4000-8000-000000000033', 'Historical deleted item', now(), 'studio',
   '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000022',
   '{}'::jsonb, 'net_30', 'seating', 'Historical fixture', now());

UPDATE public.products SET merged_into_id = '82000000-0000-4000-8000-000000000030'
WHERE id = '82000000-0000-4000-8000-000000000032';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT studio_item_count FROM public.v_vendor_studio_stats
      WHERE vendor_id = '82000000-0000-4000-8000-000000000020'
        AND studio_id = '82000000-0000-4000-8000-000000000010') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'live plus tombstoned pair must count one live item';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.v_vendor_studio_stats
    WHERE vendor_id = '82000000-0000-4000-8000-000000000021'
      AND studio_id = '82000000-0000-4000-8000-000000000010'
      AND studio_item_count = 0
  ) THEN
    RAISE EXCEPTION 'merged-only pair must remain present with zero live items';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.v_vendor_studio_stats
    WHERE vendor_id = '82000000-0000-4000-8000-000000000022'
      AND studio_id = '82000000-0000-4000-8000-000000000010'
      AND studio_item_count = 0
      AND lifetime_value_cents = 125000
  ) THEN
    RAISE EXCEPTION 'zero-live pair must retain its non-cancelled PO lifetime value';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
