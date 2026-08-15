-- Retained Containers: authoritative object-scope relationships and permissions.
--
-- Supabase JWTs identify the caller. Orders, projects, and media resolve these
-- permissions and current membership rows over their Prisma/Supavisor connection
-- for every protected request. No JWT metadata or JSON ownership field is part of
-- this contract.

BEGIN;

-- Consumer-owned orders need a distinct write permission. Organization and
-- all-scope order permissions already exist from 00022.
INSERT INTO public.permissions (name, resource, action, scope, description)
VALUES
  ('order.manage.own', 'order', 'manage', 'own', 'Manage eligible operations on own orders'),
  ('project.read.org', 'project', 'read', 'org', 'View projects linked to an active organization'),
  ('project.manage.org', 'project', 'manage', 'org', 'Manage projects linked to an active organization'),
  ('project.admin.all', 'project', 'admin', 'all', 'Administer all retained-service projects'),
  ('media.read.own', 'media', 'read', 'own', 'View personally owned media'),
  ('media.manage.own', 'media', 'manage', 'own', 'Manage personally owned media'),
  ('media.read.org', 'media', 'read', 'org', 'View media linked to an active organization'),
  ('media.admin.all', 'media', 'admin', 'all', 'Administer all retained-service media operations')
ON CONFLICT (name) DO UPDATE
SET resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    scope = EXCLUDED.scope,
    description = EXCLUDED.description;

-- A role grant only makes a scope eligible. Object access still requires the
-- request-time subject/ownership/membership predicate in the retained service.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'order.manage.own'
WHERE role_row.name IN (
  'app_user',
  'client',
  'independent_designer',
  'studio_designer',
  'studio_admin',
  'studio_owner',
  'super_admin'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'project.read.assigned'
WHERE role_row.name IN (
  'independent_designer',
  'studio_designer',
  'studio_admin',
  'studio_owner'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'project.read.org'
WHERE role_row.name IN ('studio_designer', 'studio_admin', 'studio_owner', 'super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'project.manage.org'
WHERE role_row.name IN ('studio_admin', 'studio_owner', 'super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'project.admin.all'
WHERE role_row.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name IN ('media.read.own', 'media.manage.own')
WHERE role_row.name IN (
  'app_user',
  'client',
  'independent_designer',
  'studio_designer',
  'studio_admin',
  'studio_owner',
  'super_admin'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'media.read.org'
WHERE role_row.name IN (
  'studio_designer',
  'studio_admin',
  'studio_owner',
  'brand_admin',
  'catalog_manager',
  'super_admin'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'media.manage.org'
WHERE role_row.name IN ('studio_admin', 'studio_owner', 'super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles AS role_row
JOIN public.permissions AS permission_row
  ON permission_row.name = 'media.admin.all'
WHERE role_row.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Orders did not previously have an authoritative organization relationship.
-- Existing rows intentionally remain NULL: snapshots and metadata are not a safe
-- source for backfill. New associations are accepted only after the service has
-- verified the subject's current active membership.
ALTER TABLE svc_orders.orders
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_organization_created
  ON svc_orders.orders (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN svc_orders.orders.organization_id IS
  'Authoritative organization scope for retained-service authorization. NULL means no organization access; never infer this value from order JSON.';

-- The service project and the canonical public project were previously separate.
-- A nullable, unique FK is the smallest safe bridge for current team/studio scope.
-- Existing rows intentionally remain unlinked rather than guessing from IDs,
-- proposal IDs, or metadata; direct client/designer scope remains available.
ALTER TABLE svc_projects.projects
  ADD COLUMN IF NOT EXISTS public_project_id UUID
    REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_svc_projects_public_project
  ON svc_projects.projects (public_project_id)
  WHERE public_project_id IS NOT NULL;

COMMENT ON COLUMN svc_projects.projects.public_project_id IS
  'Authoritative bridge to public.projects for current client, designer, team, and studio scope. Never infer this value from service metadata.';

-- No GRANT is added here. Existing Container login privileges cover their
-- service schemas; widening PUBLIC, anon, or authenticated is out of scope and
-- would weaken the separate database ACL boundary.

COMMIT;
