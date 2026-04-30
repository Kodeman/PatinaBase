-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Seed media.asset.* permissions
-- Description: The media service's AssetsController guards endpoints with
--              @RequirePermissions('media.asset.read' / 'media.asset.update'),
--              but those permissions were never seeded in 00022. This migration
--              adds them and grants to the appropriate roles. Required before
--              the admin portal /media page can call /v1/media/search.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (name, resource, action, scope, description) VALUES
  ('media.asset.read', 'media', 'read', NULL, 'Browse media assets across the platform'),
  ('media.asset.update', 'media', 'update', NULL, 'Update media asset metadata, role, and license'),
  ('media.asset.delete', 'media', 'delete', NULL, 'Delete media assets'),
  ('media.asset.reprocess', 'media', 'reprocess', NULL, 'Trigger reprocessing of media assets')
ON CONFLICT (name) DO NOTHING;

-- super_admin gets all permissions including these.
-- The original super_admin grant in 00022 was a snapshot at migration time;
-- re-grant explicitly for these new permissions so existing super_admins keep parity.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'super_admin'
  AND p.name IN ('media.asset.read', 'media.asset.update', 'media.asset.delete', 'media.asset.reprocess')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- quality_control: read + update (for QC overrides) but not delete.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'quality_control'
  AND p.name IN ('media.asset.read', 'media.asset.update', 'media.asset.reprocess')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- catalog_manager: read only (already has media.manage.org for their own org).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'catalog_manager'
  AND p.name = 'media.asset.read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- brand_admin: read only across the platform (they already have media.manage.org for their own).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'brand_admin'
  AND p.name = 'media.asset.read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
