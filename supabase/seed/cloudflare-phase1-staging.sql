-- Deterministic synthetic fixtures for the Cloudflare Phase 1 staging branch.
-- No production data, customer URLs, signed URLs, or credentials are copied.

DO $$
DECLARE
  alice_id uuid := 'cf100000-0000-4000-8000-000000000001';
  bob_id   uuid := 'cf100000-0000-4000-8000-000000000002';
  fixture_time timestamptz := '2026-01-15 12:00:00+00';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, banned_until
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', alice_id,
      'authenticated', 'authenticated', 'cf-phase1-alice@patina.invalid', NULL,
      NULL, '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Phase One Alice"}'::jsonb,
      fixture_time, fixture_time, '', '', '', '', 'infinity'
    ),
    (
      '00000000-0000-0000-0000-000000000000', bob_id,
      'authenticated', 'authenticated', 'cf-phase1-bob@patina.invalid', NULL,
      NULL, '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Phase One Bob"}'::jsonb,
      fixture_time, fixture_time, '', '', '', '', 'infinity'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (
      'cf110000-0000-4000-8000-000000000001', alice_id, alice_id::text,
      jsonb_build_object('sub', alice_id::text, 'email', 'cf-phase1-alice@patina.invalid'),
      'email', fixture_time, fixture_time, fixture_time
    ),
    (
      'cf110000-0000-4000-8000-000000000002', bob_id, bob_id::text,
      jsonb_build_object('sub', bob_id::text, 'email', 'cf-phase1-bob@patina.invalid'),
      'email', fixture_time, fixture_time, fixture_time
    )
  ON CONFLICT ON CONSTRAINT identities_provider_id_provider_unique DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, display_name, role, created_at, updated_at)
  VALUES
    (alice_id, 'cf-phase1-alice@patina.invalid', 'Phase One Alice', 'Phase One Alice', 'designer', fixture_time, fixture_time),
    (bob_id, 'cf-phase1-bob@patina.invalid', 'Phase One Bob', 'Phase One Bob', 'designer', fixture_time, fixture_time)
  ON CONFLICT (id) DO NOTHING;
END
$$;

INSERT INTO public.organizations (id, type, name, slug, settings, status, created_at, updated_at)
VALUES (
  'cf120000-0000-4000-8000-000000000001',
  'design_studio',
  'Phase One Synthetic Studio',
  'cf-phase1-synthetic-studio',
  '{"synthetic_fixture":true}'::jsonb,
  'active',
  '2026-01-15 12:00:00+00',
  '2026-01-15 12:00:00+00'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at, created_at, updated_at
)
SELECT
  'cf100000-0000-4000-8000-000000000001',
  'cf120000-0000-4000-8000-000000000001',
  'owner',
  'active',
  '2026-01-15 12:00:00+00',
  '2026-01-15 12:00:00+00',
  '2026-01-15 12:00:00+00'
WHERE NOT EXISTS (
  SELECT 1
    FROM public.organization_members
   WHERE user_id = 'cf100000-0000-4000-8000-000000000001'
     AND organization_id = 'cf120000-0000-4000-8000-000000000001'
)
ON CONFLICT (user_id, organization_id) DO NOTHING;

INSERT INTO public.products (
  id, name, brand, category, price_retail, images, short_description,
  source_url, captured_by, captured_at, layer, status, patina_managed,
  owner_user_id, embedding, created_at, updated_at
)
VALUES
  (
    'cf130000-0000-4000-8000-000000000001',
    'Phase One Published Catalog Chair', 'Synthetic Atelier', 'chair', 125000,
    ARRAY['https://fixtures.invalid/catalog-chair.jpg'],
    'Synthetic published catalog fixture.', 'https://fixtures.invalid/catalog-chair',
    'cf100000-0000-4000-8000-000000000001', '2026-01-15 12:00:00+00',
    'catalog', 'published', true, NULL,
    array_fill(1::real, ARRAY[768])::vector,
    '2026-01-15 12:00:00+00', '2026-01-15 12:00:00+00'
  ),
  (
    'cf130000-0000-4000-8000-000000000002',
    'Phase One Draft Catalog Table', 'Synthetic Atelier', 'table', 225000,
    ARRAY['https://fixtures.invalid/catalog-table-draft.jpg'],
    'Synthetic draft catalog fixture.', 'https://fixtures.invalid/catalog-table-draft',
    'cf100000-0000-4000-8000-000000000001', '2026-01-15 12:00:00+00',
    'catalog', 'draft', true, NULL, NULL,
    '2026-01-15 12:00:00+00', '2026-01-15 12:00:00+00'
  ),
  (
    'cf130000-0000-4000-8000-000000000005',
    'Phase One Published Catalog Stool', 'Synthetic Atelier', 'stool', 65000,
    ARRAY['https://fixtures.invalid/catalog-stool.jpg'],
    'Synthetic published catalog fixture.', 'https://fixtures.invalid/catalog-stool',
    'cf100000-0000-4000-8000-000000000001', '2026-01-15 12:00:00+00',
    'catalog', 'published', true, NULL, NULL,
    '2026-01-15 12:00:00+00', '2026-01-15 12:00:00+00'
  ),
  (
    'cf130000-0000-4000-8000-000000000003',
    'Phase One Personal Lamp', 'Synthetic Atelier', 'lighting', 45000,
    ARRAY['https://fixtures.invalid/personal-lamp.jpg'],
    'Synthetic personal fixture.', 'https://fixtures.invalid/personal-lamp',
    'cf100000-0000-4000-8000-000000000001', '2026-01-15 12:00:00+00',
    'personal', 'published', false, 'cf100000-0000-4000-8000-000000000001', NULL,
    '2026-01-15 12:00:00+00', '2026-01-15 12:00:00+00'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (
  id, name, brand, category, price_retail, images, short_description,
  source_url, captured_by, captured_at, layer, status, patina_managed,
  studio_id, vendor_contact, lead_time_weeks, payment_terms, usage_notes,
  created_at, updated_at
)
VALUES (
  'cf130000-0000-4000-8000-000000000004',
  'Phase One Studio Sofa', 'Synthetic Atelier', 'sofa', 325000,
  ARRAY['https://fixtures.invalid/studio-sofa.jpg'],
  'Synthetic studio fixture.', 'https://fixtures.invalid/studio-sofa',
  'cf100000-0000-4000-8000-000000000001', '2026-01-15 12:00:00+00',
  'studio', 'published', false,
  'cf120000-0000-4000-8000-000000000001',
  '{"name":"Synthetic Representative","email":"rep@patina.invalid"}'::jsonb,
  8, 'net_30', 'Synthetic staging fixture only.',
  '2026-01-15 12:00:00+00', '2026-01-15 12:00:00+00'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO svc_media.media_assets (
  id, kind, product_id, role, raw_key, processed, status,
  width, height, format, size_bytes, mime_type, is_public,
  uploaded_by, created_at, updated_at
)
VALUES (
  'cf140000-0000-4000-8000-000000000001',
  'IMAGE',
  'cf130000-0000-4000-8000-000000000001',
  'HERO',
  'phase1/catalog-published/original.jpg',
  true,
  'READY',
  1200,
  900,
  'jpeg',
  1024,
  'image/jpeg',
  false,
  'cf100000-0000-4000-8000-000000000001',
  '2026-01-15 12:00:00+00',
  '2026-01-15 12:00:00+00'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.proposal_captures (
  id, designer_id, product_id, source_url, raw_payload,
  thumbnail_url, status, captured_at
)
VALUES (
  'cf150000-0000-4000-8000-000000000001',
  'cf100000-0000-4000-8000-000000000001',
  'cf130000-0000-4000-8000-000000000003',
  'https://fixtures.invalid/proposal-capture',
  '{"synthetic":true,"source":"extension"}'::jsonb,
  NULL,
  'inbox',
  '2026-01-15 12:00:00+00'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.field_captures (
  id, client_capture_id, designer_id, organization_id, status, destination,
  title, notes, photos, primary_photo_path, provenance, raw_payload,
  captured_at, synced_at, created_at, updated_at
)
VALUES (
  'cf160000-0000-4000-8000-000000000001',
  'cf160000-0000-4000-8000-000000000002',
  'cf100000-0000-4000-8000-000000000001',
  'cf120000-0000-4000-8000-000000000001',
  'inbox',
  'inbox',
  'Phase One Field Capture',
  'Synthetic staging fixture only.',
  '[{"path":"phase1/field-capture/photo.jpg","sha256":"synthetic"}]'::jsonb,
  'phase1/field-capture/photo.jpg',
  '{"synthetic":true,"source":"patina_field"}'::jsonb,
  '{"synthetic":true}'::jsonb,
  '2026-01-15 12:00:00+00',
  '2026-01-15 12:01:00+00',
  '2026-01-15 12:00:00+00',
  '2026-01-15 12:01:00+00'
)
ON CONFLICT (id) DO NOTHING;
