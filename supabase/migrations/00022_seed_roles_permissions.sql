-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Seed Roles and Permissions
-- Description: Initial system roles (14) and permissions (~50)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED SYSTEM ROLES (14 roles across 4 domains)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO roles (name, display_name, description, domain, is_system) VALUES
  -- Consumer Domain
  ('app_user', 'App User', 'End consumer using the iOS application', 'consumer', TRUE),
  ('client', 'Design Client', 'Consumer engaged with professional design services', 'consumer', TRUE),

  -- Designer Domain
  ('independent_designer', 'Independent Designer', 'Solo interior design practitioner', 'designer', TRUE),
  ('studio_owner', 'Studio Owner', 'Design firm principal/owner', 'designer', TRUE),
  ('studio_admin', 'Studio Admin', 'Delegated administrator for design studio', 'designer', TRUE),
  ('studio_designer', 'Studio Designer', 'Designer employed by a studio', 'designer', TRUE),

  -- Manufacturer Domain
  ('brand_admin', 'Brand Administrator', 'Primary account holder for manufacturer', 'manufacturer', TRUE),
  ('catalog_manager', 'Catalog Manager', 'Product data management specialist', 'manufacturer', TRUE),
  ('operations_lead', 'Operations Lead', 'Order fulfillment and logistics manager', 'manufacturer', TRUE),
  ('partner_manager', 'Partner Manager', 'B2B relationship manager', 'manufacturer', TRUE),

  -- Admin Domain
  ('super_admin', 'Super Administrator', 'Full system access for platform operations', 'admin', TRUE),
  ('ml_operator', 'ML Operator', 'Aesthete Engine management specialist', 'admin', TRUE),
  ('quality_control', 'Quality Control', 'Content and data quality specialist', 'admin', TRUE),
  ('support_agent', 'Support Agent', 'Customer support representative', 'admin', TRUE);

-- Set role hierarchy
UPDATE roles SET parent_role_id = (SELECT id FROM roles WHERE name = 'app_user') WHERE name = 'client';
UPDATE roles SET parent_role_id = (SELECT id FROM roles WHERE name = 'studio_admin') WHERE name = 'studio_owner';
UPDATE roles SET parent_role_id = (SELECT id FROM roles WHERE name = 'studio_designer') WHERE name = 'studio_admin';

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED PERMISSIONS (~50 granular permissions)
-- Format: resource.action.scope
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (name, resource, action, scope, description) VALUES
  -- User Management
  ('user.read.own', 'user', 'read', 'own', 'View own profile'),
  ('user.update.own', 'user', 'update', 'own', 'Update own profile'),
  ('user.read.org', 'user', 'read', 'org', 'View organization members'),
  ('user.manage.org', 'user', 'manage', 'org', 'Manage organization members'),
  ('user.admin.all', 'user', 'admin', 'all', 'Administer all users'),

  -- Organization
  ('org.read.own', 'org', 'read', 'own', 'View own organization'),
  ('org.update.own', 'org', 'update', 'own', 'Update organization settings'),
  ('org.billing.manage', 'org', 'billing', NULL, 'Manage billing and subscription'),
  ('org.api_keys.manage', 'org', 'api_keys', NULL, 'Create and revoke API keys'),

  -- Products
  ('product.read', 'product', 'read', NULL, 'Browse product catalog'),
  ('product.write.org', 'product', 'write', 'org', 'Create products for organization'),
  ('product.update.org', 'product', 'update', 'org', 'Update organization products'),
  ('product.delete.org', 'product', 'delete', 'org', 'Delete organization products'),
  ('product.admin.all', 'product', 'admin', 'all', 'Administer all products'),
  ('product.validate', 'product', 'validate', NULL, 'Validate product classifications'),

  -- Orders
  ('order.read.own', 'order', 'read', 'own', 'View own orders'),
  ('order.read.org', 'order', 'read', 'org', 'View organization orders'),
  ('order.manage.org', 'order', 'manage', 'org', 'Manage organization orders'),
  ('order.admin.all', 'order', 'admin', 'all', 'Administer all orders'),

  -- Leads
  ('lead.read.assigned', 'lead', 'read', 'assigned', 'View assigned leads'),
  ('lead.read.org', 'lead', 'read', 'org', 'View organization leads'),
  ('lead.manage.org', 'lead', 'manage', 'org', 'Manage lead distribution'),
  ('lead.manage.own', 'lead', 'manage', 'own', 'Manage own leads'),
  ('lead.chat.assigned', 'lead', 'chat', 'assigned', 'Chat with assigned leads'),

  -- Projects
  ('project.read.assigned', 'project', 'read', 'assigned', 'View assigned projects'),
  ('project.manage.own', 'project', 'manage', 'own', 'Manage own projects'),

  -- Proposals
  ('proposal.read.assigned', 'proposal', 'read', 'assigned', 'View assigned proposals'),
  ('proposal.write', 'proposal', 'write', NULL, 'Create proposals'),
  ('proposal.send', 'proposal', 'send', NULL, 'Send proposals to clients'),

  -- AR Features
  ('ar.scan', 'ar', 'scan', NULL, 'Create room scans'),
  ('ar.visualize', 'ar', 'visualize', NULL, 'Place products in AR'),

  -- Aesthete Engine / Teaching
  ('aesthete.teach', 'aesthete', 'teach', NULL, 'Submit teaching data'),
  ('aesthete.validate', 'aesthete', 'validate', NULL, 'Validate product classifications'),
  ('aesthete.admin', 'aesthete', 'admin', NULL, 'Manage ML models and rules'),

  -- Analytics
  ('analytics.read.own', 'analytics', 'read', 'own', 'View own performance'),
  ('analytics.read.org', 'analytics', 'read', 'org', 'View organization analytics'),
  ('analytics.admin.all', 'analytics', 'admin', 'all', 'Access all analytics'),

  -- Media
  ('media.manage.org', 'media', 'manage', 'org', 'Manage organization media library'),

  -- Inventory
  ('inventory.manage.org', 'inventory', 'manage', 'org', 'Manage inventory'),

  -- Designer Programs
  ('designer_program.manage.org', 'designer_program', 'manage', 'org', 'Manage designer program'),
  ('trade_account.manage.org', 'trade_account', 'manage', 'org', 'Manage trade accounts'),

  -- A/B Testing
  ('ab_test.manage', 'ab_test', 'manage', NULL, 'Manage A/B tests'),

  -- Anomaly Detection
  ('anomaly.review', 'anomaly', 'review', NULL, 'Review anomalies'),

  -- System Administration
  ('admin.users', 'admin', 'users', NULL, 'User administration'),
  ('admin.system', 'admin', 'system', NULL, 'System configuration'),
  ('admin.audit', 'admin', 'audit', NULL, 'View audit logs');

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED ROLE-PERMISSION MAPPINGS
-- ═══════════════════════════════════════════════════════════════════════════

-- app_user permissions (base consumer role)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'app_user' AND p.name IN (
  'user.read.own', 'user.update.own', 'product.read',
  'ar.scan', 'ar.visualize', 'order.read.own'
);

-- client permissions (extends app_user)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'client' AND p.name IN (
  'user.read.own', 'user.update.own', 'product.read',
  'ar.scan', 'ar.visualize', 'order.read.own',
  'project.read.assigned', 'proposal.read.assigned', 'lead.chat.assigned'
);

-- independent_designer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'independent_designer' AND p.name IN (
  'user.read.own', 'user.update.own', 'product.read',
  'ar.scan', 'ar.visualize', 'order.read.own',
  'lead.read.assigned', 'lead.manage.own', 'project.manage.own',
  'proposal.write', 'proposal.send', 'aesthete.teach', 'analytics.read.own'
);

-- studio_designer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'studio_designer' AND p.name IN (
  'user.read.own', 'user.update.own', 'product.read',
  'ar.scan', 'ar.visualize', 'order.read.own',
  'lead.read.assigned', 'project.manage.own', 'proposal.write',
  'aesthete.teach', 'org.read.own'
);

-- studio_admin permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'studio_admin' AND p.name IN (
  'user.read.own', 'user.update.own', 'product.read',
  'ar.scan', 'ar.visualize', 'order.read.own',
  'lead.read.assigned', 'project.manage.own', 'proposal.write',
  'aesthete.teach', 'org.read.own',
  'user.read.org', 'org.update.own', 'lead.read.org', 'analytics.read.org'
);

-- studio_owner permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'studio_owner' AND p.name IN (
  'user.read.own', 'user.update.own', 'product.read',
  'ar.scan', 'ar.visualize', 'order.read.own',
  'lead.read.assigned', 'project.manage.own', 'proposal.write',
  'aesthete.teach', 'org.read.own',
  'user.read.org', 'org.update.own', 'lead.read.org', 'analytics.read.org',
  'user.manage.org', 'org.billing.manage', 'lead.manage.org'
);

-- brand_admin permissions (manufacturer)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'brand_admin' AND p.name IN (
  'product.read', 'product.write.org', 'product.update.org', 'product.delete.org',
  'media.manage.org', 'analytics.read.org',
  'order.read.org', 'order.manage.org', 'inventory.manage.org',
  'designer_program.manage.org', 'trade_account.manage.org',
  'user.manage.org', 'org.billing.manage', 'org.api_keys.manage',
  'org.read.own', 'org.update.own'
);

-- catalog_manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'catalog_manager' AND p.name IN (
  'product.read', 'product.write.org', 'product.update.org',
  'media.manage.org', 'analytics.read.org', 'org.read.own'
);

-- operations_lead permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'operations_lead' AND p.name IN (
  'product.read', 'order.read.org', 'order.manage.org',
  'inventory.manage.org', 'org.read.own'
);

-- partner_manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'partner_manager' AND p.name IN (
  'product.read', 'designer_program.manage.org', 'trade_account.manage.org',
  'analytics.read.org', 'org.read.own'
);

-- super_admin gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin';

-- ml_operator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'ml_operator' AND p.name IN (
  'aesthete.admin', 'analytics.admin.all', 'ab_test.manage',
  'product.read', 'product.validate'
);

-- quality_control permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'quality_control' AND p.name IN (
  'product.read', 'product.validate', 'aesthete.validate', 'anomaly.review'
);

-- support_agent permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'support_agent' AND p.name IN (
  'user.read.org', 'order.read.org', 'product.read',
  'admin.audit'
);
