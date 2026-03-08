-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: User Management Foundation
-- Description: Organizations, roles, permissions system for multi-tenant platform
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE organization_type AS ENUM (
  'design_studio', 'manufacturer', 'contractor', 'admin_team'
);

CREATE TYPE organization_status AS ENUM (
  'active', 'suspended', 'pending_approval', 'deactivated'
);

CREATE TYPE subscription_tier AS ENUM (
  'free', 'professional', 'enterprise'
);

CREATE TYPE member_role AS ENUM (
  'owner', 'admin', 'member', 'guest'
);

CREATE TYPE member_status AS ENUM (
  'active', 'invited', 'suspended', 'removed'
);

CREATE TYPE role_domain AS ENUM (
  'consumer', 'designer', 'manufacturer', 'admin'
);

CREATE TYPE api_key_environment AS ENUM ('live', 'test');

CREATE TYPE api_key_status AS ENUM ('active', 'revoked');

CREATE TYPE audit_status AS ENUM ('success', 'failure', 'denied');

CREATE TYPE oauth_provider AS ENUM ('apple', 'google');

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLES TABLE
-- System and custom roles for RBAC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  domain role_domain NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_assignable BOOLEAN NOT NULL DEFAULT TRUE,
  parent_role_id UUID REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roles_domain ON roles(domain);
CREATE INDEX idx_roles_is_system ON roles(is_system);

-- ═══════════════════════════════════════════════════════════════════════════
-- PERMISSIONS TABLE
-- Granular permissions in resource.action.scope format
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(20), -- own, org, assigned, all
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE_PERMISSIONS JUNCTION TABLE
-- Maps roles to their permissions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATIONS TABLE
-- Design studios, manufacturers, contractors, admin teams
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type organization_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  logo_url TEXT,
  website VARCHAR(255),
  description TEXT,
  email VARCHAR(255),
  phone VARCHAR(20),
  address JSONB,
  settings JSONB NOT NULL DEFAULT '{}',
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  business_verified BOOLEAN NOT NULL DEFAULT FALSE,
  business_verified_at TIMESTAMPTZ,
  tax_id VARCHAR(50),
  status organization_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_status ON organizations(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATION_MEMBERS TABLE
-- Links users to organizations with roles
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role member_role NOT NULL,
  permissions_override JSONB, -- { "grant": [...], "revoke": [...] }
  invited_by UUID REFERENCES profiles(id),
  invitation_token VARCHAR(64) UNIQUE,
  invitation_expires_at TIMESTAMPTZ,
  status member_status NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_role ON organization_members(role);
CREATE INDEX idx_org_members_invitation ON organization_members(invitation_token)
  WHERE invitation_token IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- USER_ROLES TABLE
-- Assigns system/custom roles directly to users
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES profiles(id),
  UNIQUE (user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- OAUTH_ACCOUNTS TABLE
-- Links OAuth providers (Apple, Google) to users
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider oauth_provider NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  provider_email VARCHAR(255),
  provider_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- API_KEYS TABLE
-- API keys for manufacturer integrations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL, -- pk_live_ or pk_test_
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  rate_limit INTEGER NOT NULL DEFAULT 1000, -- per hour
  environment api_key_environment NOT NULL DEFAULT 'live',
  status api_key_status NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id),
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT_LOGS TABLE
-- Tracks security-relevant events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id),
  ip_address INET,
  user_agent TEXT,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  status audit_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Roles/Permissions: Read-only for authenticated users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Roles readable by authenticated" ON roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permissions readable by authenticated" ON permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Role permissions readable by authenticated" ON role_permissions
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Organizations: Members can view, owners/admins can update
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Org members can view organization" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
      AND organization_members.user_id = auth.uid()
      AND organization_members.status = 'active'
    )
  );

CREATE POLICY "Authenticated can create organization" ON organizations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Org admins can update organization" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
      AND organization_members.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Organization Members: Users can view their memberships, admins can manage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view their org memberships" ON organization_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Org admins can view all members" ON organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

CREATE POLICY "Org owners can insert members" ON organization_members
  FOR INSERT WITH CHECK (
    -- Either creating self as owner (during org creation)
    (user_id = auth.uid() AND role = 'owner')
    OR
    -- Or admin adding members
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

CREATE POLICY "Org admins can update members" ON organization_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

CREATE POLICY "Org admins can delete members" ON organization_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- User Roles: Users can view their own roles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view their roles" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- OAuth Accounts: Users can manage their own
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view their oauth accounts" ON oauth_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their oauth accounts" ON oauth_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their oauth accounts" ON oauth_accounts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their oauth accounts" ON oauth_accounts
  FOR DELETE USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- API Keys: Org admins can manage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Org admins can view api keys" ON api_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = api_keys.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

CREATE POLICY "Org admins can create api keys" ON api_keys
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = api_keys.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

CREATE POLICY "Org admins can update api keys" ON api_keys
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = api_keys.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Logs: Users can view their own, org admins can view org logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view their audit logs" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Org admins can view org audit logs" ON audit_logs
  FOR SELECT USING (
    organization_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = audit_logs.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS: Updated_at timestamps
-- ═══════════════════════════════════════════════════════════════════════════

-- Generic updated_at function (may already exist)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_oauth_accounts_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION user_has_role(p_user_id UUID, p_role_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND r.name = p_role_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is member of organization with role
CREATE OR REPLACE FUNCTION user_is_org_member(
  p_user_id UUID,
  p_org_id UUID,
  p_min_role member_role DEFAULT 'guest'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role_rank INTEGER;
  v_min_rank INTEGER;
BEGIN
  -- Define role hierarchy: owner > admin > member > guest
  SELECT CASE role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'member' THEN 2
    WHEN 'guest' THEN 1
    ELSE 0
  END INTO v_role_rank
  FROM organization_members
  WHERE user_id = p_user_id
    AND organization_id = p_org_id
    AND status = 'active';

  SELECT CASE p_min_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'member' THEN 2
    WHEN 'guest' THEN 1
    ELSE 0
  END INTO v_min_rank;

  RETURN COALESCE(v_role_rank >= v_min_rank, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's permissions as array
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_permissions TEXT[];
BEGIN
  -- Get permissions from direct roles
  SELECT ARRAY_AGG(DISTINCT p.name) INTO v_permissions
  FROM user_roles ur
  JOIN role_permissions rp ON ur.role_id = rp.role_id
  JOIN permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = p_user_id;

  RETURN COALESCE(v_permissions, '{}'::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
