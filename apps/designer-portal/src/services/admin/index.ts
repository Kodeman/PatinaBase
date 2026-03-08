/**
 * Admin Services Barrel Export
 *
 * Exports all admin-specific service modules for interacting with
 * backend APIs through Next.js API routes (/api/admin/*).
 */

// Roles Service
export {
  rolesService,
  type Permission,
  type PermissionGroup,
  type GroupedPermissionsResponse,
  type Role,
  type RoleUser,
  type BulkOperationResult,
  type CreateRoleRequest,
  type UpdateRoleRequest,
  type CloneRoleRequest,
} from './roles';

// Users Service
export { usersService } from './users';

// Catalog Service
export { catalogService } from './catalog';

// Orders Service
export { ordersService } from './orders';

// Media Service
export {
  mediaService,
  type UploadIntent,
  type UploadResponse,
  type ReorderAssetsPayload,
} from './media';

// System Service
export { systemService } from './system';
