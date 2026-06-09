-- Dev organization seed.
--
-- Creates a single design_studio org with the three-layer Library pilot flag
-- (organizations.settings.three_layer_catalog_enabled) turned ON, and enrolls
-- the designer-facing dev accounts as active members. This makes the
-- /portal/library (Personal · Studio · Catalog) surface live on the local dev
-- server instead of the "Three-layer Library is in pilot" Coming-soon card.
--
-- Gate logic lives in packages/supabase/src/hooks/use-library-pilot-flag.ts:
-- useLibraryPilotEnabled() returns true when ANY of the signed-in user's
-- design_studio orgs has settings.three_layer_catalog_enabled === true.
--
-- Depends on dev-accounts.sql (the auth users / profiles must exist first), so
-- this file is ordered after it in supabase/config.toml [db.seed].sql_paths.
--
-- To turn the pilot OFF locally without removing the org:
--   UPDATE public.organizations
--      SET settings = settings - 'three_layer_catalog_enabled'
--    WHERE slug = 'local-dev-studio';

INSERT INTO public.organizations (id, type, name, slug, settings, status)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'design_studio',
  'Local Dev Studio',
  'local-dev-studio',
  '{"three_layer_catalog_enabled": true}'::jsonb,
  'active'
)
ON CONFLICT (id) DO UPDATE
  SET settings = public.organizations.settings || '{"three_layer_catalog_enabled": true}'::jsonb,
      type    = EXCLUDED.type,
      status  = 'active';

-- Enroll the designer-role dev accounts (designer + studio_manager) as active
-- members so the pilot flag resolves for whichever one you sign in as.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'owner', 'active', now()),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'admin', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE
  SET status = 'active',
      joined_at = COALESCE(public.organization_members.joined_at, now());
