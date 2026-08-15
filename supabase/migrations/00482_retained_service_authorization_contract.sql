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

-- Stripe webhook delivery claims are durable and unique before any effect.
-- A token-fenced state transition lets retries recover failed or stale claims
-- without allowing concurrent deliveries to execute the same event twice.
CREATE TABLE IF NOT EXISTS svc_orders.stripe_webhook_receipts (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  claim_token UUID NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  processing_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stripe_webhook_receipts_status_check
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  CONSTRAINT stripe_webhook_receipts_attempts_check
    CHECK (attempts > 0),
  CONSTRAINT stripe_webhook_receipts_state_time_check
    CHECK (
      (status = 'processing' AND succeeded_at IS NULL AND failed_at IS NULL)
      OR (status = 'succeeded' AND succeeded_at IS NOT NULL AND failed_at IS NULL)
      OR (status = 'failed' AND succeeded_at IS NULL AND failed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_receipts_status_started
  ON svc_orders.stripe_webhook_receipts (status, processing_started_at);

DROP TRIGGER IF EXISTS set_stripe_webhook_receipts_updated_at
  ON svc_orders.stripe_webhook_receipts;
CREATE TRIGGER set_stripe_webhook_receipts_updated_at
  BEFORE UPDATE ON svc_orders.stripe_webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION svc_orders.set_updated_at();

COMMENT ON TABLE svc_orders.stripe_webhook_receipts IS
  'Private retained-Container ledger for Stripe signature-verified delivery claims. It is intentionally not an RLS/PostgREST surface: broad API roles have no table privileges, and event identity and claim tokens are provider-derived.';

REVOKE ALL ON TABLE svc_orders.stripe_webhook_receipts
  FROM PUBLIC, anon, authenticated;

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

-- Project documents need a canonical Media relationship that can be checked
-- for the current client, designer, team, and organization. Uploader identity
-- and JSON metadata cannot represent shared project authority.
ALTER TYPE svc_media.asset_kind
  ADD VALUE IF NOT EXISTS 'DOCUMENT';

ALTER TABLE svc_media.media_assets
  ADD COLUMN IF NOT EXISTS project_id UUID
    REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_media_assets_project_created
  ON svc_media.media_assets (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN svc_media.media_assets.project_id IS
  'Authoritative public.projects scope for project documents. Never infer project access from asset metadata or caller input.';

-- No GRANT is added here. Existing Container login privileges cover their
-- service schemas; widening PUBLIC, anon, or authenticated is out of scope and
-- would weaken the separate database ACL boundary.

COMMIT;
