-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Development Accounts
-- Creates 7 dev accounts in auth.users, auth.identities, profiles,
-- and assigns appropriate user_roles for each account.
-- All passwords: password123
-- Idempotent: uses ON CONFLICT DO NOTHING throughout.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_superadmin    UUID := 'a0000000-0000-0000-0000-000000000001';
  uid_admin         UUID := 'a0000000-0000-0000-0000-000000000002';
  uid_studio_mgr    UUID := 'a0000000-0000-0000-0000-000000000003';
  uid_designer      UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client        UUID := 'a0000000-0000-0000-0000-000000000005';
  uid_manufacturer  UUID := 'a0000000-0000-0000-0000-000000000006';
  uid_support       UUID := 'a0000000-0000-0000-0000-000000000007';
  -- Generate bcrypt hash of 'password123' at seed time
  pw_hash TEXT := crypt('password123', gen_salt('bf'));
  ts TIMESTAMPTZ := NOW();
BEGIN

  -- ─────────────────────────────────────────────────────────────────────────
  -- 1. Create auth.users entries
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', uid_superadmin, 'authenticated', 'authenticated',
     'superadmin@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Super Admin"}'::jsonb,
     ts, ts, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_admin, 'authenticated', 'authenticated',
     'admin@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Admin User"}'::jsonb,
     ts, ts, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_studio_mgr, 'authenticated', 'authenticated',
     'studio_manager@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Studio Manager"}'::jsonb,
     ts, ts, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_designer, 'authenticated', 'authenticated',
     'designer@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Designer User"}'::jsonb,
     ts, ts, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_client, 'authenticated', 'authenticated',
     'client@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Client User"}'::jsonb,
     ts, ts, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_manufacturer, 'authenticated', 'authenticated',
     'manufacturer@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Manufacturer User"}'::jsonb,
     ts, ts, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_support, 'authenticated', 'authenticated',
     'support@patina.dev', pw_hash, ts,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Support Agent"}'::jsonb,
     ts, ts, '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2. Create auth.identities entries
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), uid_superadmin, uid_superadmin::text,
     jsonb_build_object('sub', uid_superadmin::text, 'email', 'superadmin@patina.dev'),
     'email', ts, ts, ts),
    (gen_random_uuid(), uid_admin, uid_admin::text,
     jsonb_build_object('sub', uid_admin::text, 'email', 'admin@patina.dev'),
     'email', ts, ts, ts),
    (gen_random_uuid(), uid_studio_mgr, uid_studio_mgr::text,
     jsonb_build_object('sub', uid_studio_mgr::text, 'email', 'studio_manager@patina.dev'),
     'email', ts, ts, ts),
    (gen_random_uuid(), uid_designer, uid_designer::text,
     jsonb_build_object('sub', uid_designer::text, 'email', 'designer@patina.dev'),
     'email', ts, ts, ts),
    (gen_random_uuid(), uid_client, uid_client::text,
     jsonb_build_object('sub', uid_client::text, 'email', 'client@patina.dev'),
     'email', ts, ts, ts),
    (gen_random_uuid(), uid_manufacturer, uid_manufacturer::text,
     jsonb_build_object('sub', uid_manufacturer::text, 'email', 'manufacturer@patina.dev'),
     'email', ts, ts, ts),
    (gen_random_uuid(), uid_support, uid_support::text,
     jsonb_build_object('sub', uid_support::text, 'email', 'support@patina.dev'),
     'email', ts, ts, ts)
  ON CONFLICT ON CONSTRAINT identities_provider_id_provider_unique DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 3. Create profiles entries (if handle_new_user trigger didn't fire)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO public.profiles (id, email, display_name, role, created_at, updated_at) VALUES
    (uid_superadmin, 'superadmin@patina.dev', 'Super Admin', 'admin', ts, ts),
    (uid_admin, 'admin@patina.dev', 'Admin User', 'admin', ts, ts),
    (uid_studio_mgr, 'studio_manager@patina.dev', 'Studio Manager', 'designer', ts, ts),
    (uid_designer, 'designer@patina.dev', 'Designer User', 'designer', ts, ts),
    (uid_client, 'client@patina.dev', 'Client User', 'homeowner', ts, ts),
    (uid_manufacturer, 'manufacturer@patina.dev', 'Manufacturer User', 'designer', ts, ts),
    (uid_support, 'support@patina.dev', 'Support Agent', 'admin', ts, ts)
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4. Assign user_roles (look up role IDs by name)
  -- ─────────────────────────────────────────────────────────────────────────

  -- superadmin@patina.dev → super_admin + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_superadmin, id FROM public.roles WHERE name = 'super_admin'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_superadmin, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- admin@patina.dev → super_admin + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_admin, id FROM public.roles WHERE name = 'super_admin'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_admin, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- studio_manager@patina.dev → studio_admin + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_studio_mgr, id FROM public.roles WHERE name = 'studio_admin'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_studio_mgr, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- designer@patina.dev → independent_designer + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_designer, id FROM public.roles WHERE name = 'independent_designer'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_designer, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- client@patina.dev → client + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_client, id FROM public.roles WHERE name = 'client'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_client, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- manufacturer@patina.dev → brand_admin + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_manufacturer, id FROM public.roles WHERE name = 'brand_admin'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_manufacturer, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- support@patina.dev → support_agent + app_user
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_support, id FROM public.roles WHERE name = 'support_agent'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_support, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

END $$;
