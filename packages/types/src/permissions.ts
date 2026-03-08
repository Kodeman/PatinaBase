/**
 * Permission Type System - Auto-generated from Permission Catalog
 * DO NOT EDIT MANUALLY - Generated from services/user-management/prisma/seed.ts
 *
 * This file provides type-safe permission codes for the Patina platform.
 * All 71 permissions across 9 domains.
 *
 * @see PERMISSION_MATRIX.md for complete documentation
 */

/**
 * Permission Code Enum - All 71 permission codes
 *
 * Pattern: <domain>.<resource>.<action>
 *
 * Domains:
 * - identity: User management, roles, profiles
 * - session: Session management
 * - privacy: GDPR/CCPA compliance
 * - designer: Designer verification
 * - catalog: Product catalog
 * - project: Project management
 * - order: Order management
 * - comms: Communications
 * - manufacturer: Manufacturer operations
 */
export enum PermissionCode {
  // Domain 1: Identity Management - User Management (15)
  IDENTITY_USER_READ_SELF = 'identity.user.read_self',
  IDENTITY_USER_UPDATE_SELF = 'identity.user.update_self',
  IDENTITY_USER_READ = 'identity.user.read',
  IDENTITY_USER_CREATE = 'identity.user.create',
  IDENTITY_USER_UPDATE = 'identity.user.update',
  IDENTITY_USER_DELETE = 'identity.user.delete',
  IDENTITY_USER_SUSPEND = 'identity.user.suspend',
  IDENTITY_USER_BAN = 'identity.user.ban',
  IDENTITY_USER_ACTIVATE = 'identity.user.activate',
  IDENTITY_USER_IMPERSONATE = 'identity.user.impersonate',
  IDENTITY_USER_MANAGE_SESSIONS = 'identity.user.manage_sessions',
  IDENTITY_PROFILE_READ_SELF = 'identity.profile.read_self',
  IDENTITY_PROFILE_UPDATE_SELF = 'identity.profile.update_self',
  IDENTITY_PROFILE_READ = 'identity.profile.read',
  IDENTITY_PROFILE_UPDATE = 'identity.profile.update',

  // Domain 1: Identity Management - Role Management (7)
  IDENTITY_ROLE_READ = 'identity.role.read',
  IDENTITY_ROLE_CREATE = 'identity.role.create',
  IDENTITY_ROLE_UPDATE = 'identity.role.update',
  IDENTITY_ROLE_DELETE = 'identity.role.delete',
  IDENTITY_ROLE_ASSIGN = 'identity.role.assign',
  IDENTITY_ROLE_REVOKE = 'identity.role.revoke',
  IDENTITY_PERMISSION_READ = 'identity.permission.read',

  // Domain 2: Session Management (6)
  IDENTITY_SESSION_READ_SELF = 'identity.session.read_self',
  IDENTITY_SESSION_REVOKE_SELF = 'identity.session.revoke_self',
  IDENTITY_SESSION_READ = 'identity.session.read',
  IDENTITY_SESSION_REVOKE = 'identity.session.revoke',
  IDENTITY_SESSION_READ_ALL = 'identity.session.read_all',
  IDENTITY_SESSION_REVOKE_ALL = 'identity.session.revoke_all',

  // Domain 3: Privacy & Compliance - Consent (4)
  PRIVACY_CONSENT_READ_SELF = 'privacy.consent.read_self',
  PRIVACY_CONSENT_CREATE_SELF = 'privacy.consent.create_self',
  PRIVACY_CONSENT_READ = 'privacy.consent.read',
  PRIVACY_CONSENT_UPDATE = 'privacy.consent.update',

  // Domain 3: Privacy & Compliance - Data Export (3)
  PRIVACY_EXPORT_REQUEST_SELF = 'privacy.export.request_self',
  PRIVACY_EXPORT_DOWNLOAD_SELF = 'privacy.export.download_self',
  PRIVACY_EXPORT_REQUEST = 'privacy.export.request',

  // Domain 3: Privacy & Compliance - Right to Deletion (2)
  PRIVACY_DELETE_REQUEST_SELF = 'privacy.delete.request_self',
  PRIVACY_DELETE_APPROVE = 'privacy.delete.approve',

  // Domain 4: Designer Verification (6)
  DESIGNER_VERIFY_SUBMIT = 'designer.verify.submit',
  DESIGNER_VERIFY_READ_SELF = 'designer.verify.read_self',
  DESIGNER_VERIFY_READ = 'designer.verify.read',
  DESIGNER_VERIFY_REVIEW = 'designer.verify.review',
  DESIGNER_VERIFY_APPROVE = 'designer.verify.approve',
  DESIGNER_VERIFY_REJECT = 'designer.verify.reject',

  // Domain 5: Catalog - Products (6)
  CATALOG_PRODUCT_READ = 'catalog.product.read',
  CATALOG_PRODUCT_CREATE = 'catalog.product.create',
  CATALOG_PRODUCT_UPDATE = 'catalog.product.update',
  CATALOG_PRODUCT_DELETE = 'catalog.product.delete',
  CATALOG_PRODUCT_PUBLISH = 'catalog.product.publish',
  CATALOG_PRODUCT_UNPUBLISH = 'catalog.product.unpublish',

  // Domain 5: Catalog - Collections (4)
  CATALOG_COLLECTION_READ = 'catalog.collection.read',
  CATALOG_COLLECTION_CREATE = 'catalog.collection.create',
  CATALOG_COLLECTION_UPDATE = 'catalog.collection.update',
  CATALOG_COLLECTION_DELETE = 'catalog.collection.delete',

  // Domain 5: Catalog - Vendors (3)
  CATALOG_VENDOR_READ = 'catalog.vendor.read',
  CATALOG_VENDOR_CREATE = 'catalog.vendor.create',
  CATALOG_VENDOR_UPDATE = 'catalog.vendor.update',

  // Domain 6: Projects - Project Operations (6)
  PROJECT_READ_OWN = 'project.read_own',
  PROJECT_READ = 'project.read',
  PROJECT_CREATE = 'project.create',
  PROJECT_UPDATE_OWN = 'project.update_own',
  PROJECT_UPDATE = 'project.update',
  PROJECT_DELETE = 'project.delete',

  // Domain 6: Projects - Tasks (2)
  PROJECT_TASK_CREATE = 'project.task.create',
  PROJECT_TASK_UPDATE = 'project.task.update',

  // Domain 6: Projects - Milestones (2)
  PROJECT_MILESTONE_CREATE = 'project.milestone.create',
  PROJECT_MILESTONE_APPROVE = 'project.milestone.approve',

  // Domain 6: Projects - RFIs (2)
  PROJECT_RFI_CREATE = 'project.rfi.create',
  PROJECT_RFI_RESPOND = 'project.rfi.respond',

  // Domain 7: Orders (9)
  ORDER_READ_OWN = 'order.read_own',
  ORDER_READ = 'order.read',
  ORDER_CREATE = 'order.create',
  ORDER_UPDATE_OWN = 'order.update_own',
  ORDER_UPDATE = 'order.update',
  ORDER_CANCEL_OWN = 'order.cancel_own',
  ORDER_CANCEL = 'order.cancel',
  ORDER_FULFILL = 'order.fulfill',
  ORDER_REFUND = 'order.refund',

  // Domain 8: Communications - Threads (3)
  COMMS_THREAD_READ_OWN = 'comms.thread.read_own',
  COMMS_THREAD_READ = 'comms.thread.read',
  COMMS_THREAD_CREATE = 'comms.thread.create',

  // Domain 8: Communications - Messages (4)
  COMMS_MESSAGE_SEND = 'comms.message.send',
  COMMS_MESSAGE_READ = 'comms.message.read',
  COMMS_MESSAGE_DELETE_OWN = 'comms.message.delete_own',
  COMMS_MESSAGE_DELETE = 'comms.message.delete',

  // Domain 9: Manufacturer (4)
  MANUFACTURER_CATALOG_READ = 'manufacturer.catalog.read',
  MANUFACTURER_ORDER_READ = 'manufacturer.order.read',
  MANUFACTURER_ORDER_UPDATE = 'manufacturer.order.update',
  MANUFACTURER_INVENTORY_MANAGE = 'manufacturer.inventory.manage',

  // Legacy/Special (1)
  ADMIN_ACCESS = 'admin.access',

  // Domain 10: Proposals (7) - NEW
  PROPOSAL_READ_OWN = 'proposal.read_own',
  PROPOSAL_READ = 'proposal.read',
  PROPOSAL_CREATE = 'proposal.create',
  PROPOSAL_UPDATE_OWN = 'proposal.update_own',
  PROPOSAL_UPDATE = 'proposal.update',
  PROPOSAL_DELETE = 'proposal.delete',
  PROPOSAL_SEND = 'proposal.send',
}

/**
 * Permission string union type for strict type checking
 */
export type PermissionString =
  | 'identity.user.read_self'
  | 'identity.user.update_self'
  | 'identity.user.read'
  | 'identity.user.create'
  | 'identity.user.update'
  | 'identity.user.delete'
  | 'identity.user.suspend'
  | 'identity.user.ban'
  | 'identity.user.activate'
  | 'identity.user.impersonate'
  | 'identity.user.manage_sessions'
  | 'identity.profile.read_self'
  | 'identity.profile.update_self'
  | 'identity.profile.read'
  | 'identity.profile.update'
  | 'identity.role.read'
  | 'identity.role.create'
  | 'identity.role.update'
  | 'identity.role.delete'
  | 'identity.role.assign'
  | 'identity.role.revoke'
  | 'identity.permission.read'
  | 'identity.session.read_self'
  | 'identity.session.revoke_self'
  | 'identity.session.read'
  | 'identity.session.revoke'
  | 'identity.session.read_all'
  | 'identity.session.revoke_all'
  | 'privacy.consent.read_self'
  | 'privacy.consent.create_self'
  | 'privacy.consent.read'
  | 'privacy.consent.update'
  | 'privacy.export.request_self'
  | 'privacy.export.download_self'
  | 'privacy.export.request'
  | 'privacy.delete.request_self'
  | 'privacy.delete.approve'
  | 'designer.verify.submit'
  | 'designer.verify.read_self'
  | 'designer.verify.read'
  | 'designer.verify.review'
  | 'designer.verify.approve'
  | 'designer.verify.reject'
  | 'catalog.product.read'
  | 'catalog.product.create'
  | 'catalog.product.update'
  | 'catalog.product.delete'
  | 'catalog.product.publish'
  | 'catalog.product.unpublish'
  | 'catalog.collection.read'
  | 'catalog.collection.create'
  | 'catalog.collection.update'
  | 'catalog.collection.delete'
  | 'catalog.vendor.read'
  | 'catalog.vendor.create'
  | 'catalog.vendor.update'
  | 'project.read_own'
  | 'project.read'
  | 'project.create'
  | 'project.update_own'
  | 'project.update'
  | 'project.delete'
  | 'project.task.create'
  | 'project.task.update'
  | 'project.milestone.create'
  | 'project.milestone.approve'
  | 'project.rfi.create'
  | 'project.rfi.respond'
  | 'order.read_own'
  | 'order.read'
  | 'order.create'
  | 'order.update_own'
  | 'order.update'
  | 'order.cancel_own'
  | 'order.cancel'
  | 'order.fulfill'
  | 'order.refund'
  | 'comms.thread.read_own'
  | 'comms.thread.read'
  | 'comms.thread.create'
  | 'comms.message.send'
  | 'comms.message.read'
  | 'comms.message.delete_own'
  | 'comms.message.delete'
  | 'manufacturer.catalog.read'
  | 'manufacturer.order.read'
  | 'manufacturer.order.update'
  | 'manufacturer.inventory.manage'
  | 'admin.access'
  // Proposal permissions
  | 'proposal.read_own'
  | 'proposal.read'
  | 'proposal.create'
  | 'proposal.update_own'
  | 'proposal.update'
  | 'proposal.delete'
  | 'proposal.send';

/**
 * Permission domains
 */
export enum PermissionDomain {
  IDENTITY = 'identity',
  SESSION = 'session',
  PRIVACY = 'privacy',
  DESIGNER = 'designer',
  CATALOG = 'catalog',
  PROJECT = 'project',
  ORDER = 'order',
  COMMS = 'comms',
  MANUFACTURER = 'manufacturer',
  PROPOSAL = 'proposal',
  ADMIN = 'admin',
}

/**
 * Role names
 */
export enum RoleName {
  CLIENT = 'client',
  DESIGNER = 'designer',
  MANUFACTURER = 'manufacturer',
  SUPPORT = 'support',
  STUDIO_MANAGER = 'studio_manager',
  ADMIN = 'admin',
}

/**
 * Role-Permission mapping type for role definitions
 */
export type RolePermissionMap = {
  [key in RoleName]: readonly PermissionString[];
};

/**
 * Complete role-permission mapping (read-only reference)
 *
 * This mapping defines which permissions each role has.
 * The source of truth is the database, but this provides
 * type-safe reference for frontend code.
 */
export const ROLE_PERMISSIONS: RolePermissionMap = {
  [RoleName.CLIENT]: [
    // Identity & Privacy (11)
    'identity.user.read_self',
    'identity.user.update_self',
    'identity.profile.read_self',
    'identity.profile.update_self',
    'identity.session.read_self',
    'identity.session.revoke_self',
    'privacy.consent.read_self',
    'privacy.consent.create_self',
    'privacy.export.request_self',
    'privacy.export.download_self',
    'privacy.delete.request_self',
    // Projects (4)
    'project.read_own',
    'project.task.update',
    'project.milestone.approve',
    'project.rfi.create',
    // Orders (4)
    'order.read_own',
    'order.create',
    'order.update_own',
    'order.cancel_own',
    // Communications (5)
    'comms.thread.read_own',
    'comms.thread.create',
    'comms.message.send',
    'comms.message.read',
    'comms.message.delete_own',
    // Proposals (1) - clients can view proposals
    'proposal.read_own',
  ] as const,

  [RoleName.DESIGNER]: [
    // All client permissions
    'identity.user.read_self',
    'identity.user.update_self',
    'identity.profile.read_self',
    'identity.profile.update_self',
    'identity.session.read_self',
    'identity.session.revoke_self',
    'privacy.consent.read_self',
    'privacy.consent.create_self',
    'privacy.export.request_self',
    'privacy.export.download_self',
    'privacy.delete.request_self',
    'project.read_own',
    'project.task.update',
    'project.milestone.approve',
    'project.rfi.create',
    'order.read_own',
    'order.create',
    'order.update_own',
    'order.cancel_own',
    'comms.thread.read_own',
    'comms.thread.create',
    'comms.message.send',
    'comms.message.read',
    'comms.message.delete_own',
    // Catalog (11)
    'catalog.product.read',
    'catalog.product.create',
    'catalog.product.update',
    'catalog.product.delete',
    'catalog.product.publish',
    'catalog.product.unpublish',
    'catalog.collection.read',
    'catalog.collection.create',
    'catalog.collection.update',
    'catalog.collection.delete',
    'catalog.vendor.read',
    // Projects (5)
    'project.create',
    'project.update_own',
    'project.task.create',
    'project.milestone.create',
    'project.rfi.respond',
    // Designer Verification (2)
    'designer.verify.submit',
    'designer.verify.read_self',
    // Proposals (7)
    'proposal.read_own',
    'proposal.read',
    'proposal.create',
    'proposal.update_own',
    'proposal.update',
    'proposal.delete',
    'proposal.send',
  ] as const,

  [RoleName.MANUFACTURER]: [
    // Identity (4)
    'identity.user.read_self',
    'identity.user.update_self',
    'identity.session.read_self',
    'identity.session.revoke_self',
    // Manufacturer (4)
    'manufacturer.catalog.read',
    'manufacturer.order.read',
    'manufacturer.order.update',
    'manufacturer.inventory.manage',
    // Catalog & Orders (3)
    'catalog.vendor.read',
    'order.read',
    'order.fulfill',
  ] as const,

  [RoleName.SUPPORT]: [
    // Identity (10)
    'identity.user.read',
    'identity.user.suspend',
    'identity.user.activate',
    'identity.profile.read',
    'identity.role.read',
    'identity.role.assign',
    'identity.role.revoke',
    'identity.session.read',
    'identity.session.revoke',
    'identity.user.manage_sessions',
    // Privacy (1)
    'privacy.consent.read',
    // Designer (2)
    'designer.verify.read',
    'designer.verify.review',
    // Projects (1)
    'project.read',
    // Orders (1)
    'order.read',
    // Communications (1)
    'comms.thread.read',
  ] as const,

  [RoleName.STUDIO_MANAGER]: [
    // All designer permissions
    'identity.user.read_self',
    'identity.user.update_self',
    'identity.profile.read_self',
    'identity.profile.update_self',
    'identity.session.read_self',
    'identity.session.revoke_self',
    'privacy.consent.read_self',
    'privacy.consent.create_self',
    'privacy.export.request_self',
    'privacy.export.download_self',
    'privacy.delete.request_self',
    'project.read_own',
    'project.task.update',
    'project.milestone.approve',
    'project.rfi.create',
    'order.read_own',
    'order.create',
    'order.update_own',
    'order.cancel_own',
    'comms.thread.read_own',
    'comms.thread.create',
    'comms.message.send',
    'comms.message.read',
    'comms.message.delete_own',
    'catalog.product.read',
    'catalog.product.create',
    'catalog.product.update',
    'catalog.product.delete',
    'catalog.product.publish',
    'catalog.product.unpublish',
    'catalog.collection.read',
    'catalog.collection.create',
    'catalog.collection.update',
    'catalog.collection.delete',
    'catalog.vendor.read',
    'project.create',
    'project.update_own',
    'project.task.create',
    'project.milestone.create',
    'project.rfi.respond',
    'designer.verify.submit',
    'designer.verify.read_self',
    // Proposals (7)
    'proposal.read_own',
    'proposal.read',
    'proposal.create',
    'proposal.update_own',
    'proposal.update',
    'proposal.delete',
    'proposal.send',
    // Team management (4)
    'identity.role.assign',
    'identity.role.revoke',
    'identity.user.read',
    'identity.user.suspend',
  ] as const,

  [RoleName.ADMIN]: [
    // ALL 71 permissions
    'identity.user.read_self',
    'identity.user.update_self',
    'identity.user.read',
    'identity.user.create',
    'identity.user.update',
    'identity.user.delete',
    'identity.user.suspend',
    'identity.user.ban',
    'identity.user.activate',
    'identity.user.impersonate',
    'identity.user.manage_sessions',
    'identity.profile.read_self',
    'identity.profile.update_self',
    'identity.profile.read',
    'identity.profile.update',
    'identity.role.read',
    'identity.role.create',
    'identity.role.update',
    'identity.role.delete',
    'identity.role.assign',
    'identity.role.revoke',
    'identity.permission.read',
    'identity.session.read_self',
    'identity.session.revoke_self',
    'identity.session.read',
    'identity.session.revoke',
    'identity.session.read_all',
    'identity.session.revoke_all',
    'privacy.consent.read_self',
    'privacy.consent.create_self',
    'privacy.consent.read',
    'privacy.consent.update',
    'privacy.export.request_self',
    'privacy.export.download_self',
    'privacy.export.request',
    'privacy.delete.request_self',
    'privacy.delete.approve',
    'designer.verify.submit',
    'designer.verify.read_self',
    'designer.verify.read',
    'designer.verify.review',
    'designer.verify.approve',
    'designer.verify.reject',
    'catalog.product.read',
    'catalog.product.create',
    'catalog.product.update',
    'catalog.product.delete',
    'catalog.product.publish',
    'catalog.product.unpublish',
    'catalog.collection.read',
    'catalog.collection.create',
    'catalog.collection.update',
    'catalog.collection.delete',
    'catalog.vendor.read',
    'catalog.vendor.create',
    'catalog.vendor.update',
    'project.read_own',
    'project.read',
    'project.create',
    'project.update_own',
    'project.update',
    'project.delete',
    'project.task.create',
    'project.task.update',
    'project.milestone.create',
    'project.milestone.approve',
    'project.rfi.create',
    'project.rfi.respond',
    'order.read_own',
    'order.read',
    'order.create',
    'order.update_own',
    'order.update',
    'order.cancel_own',
    'order.cancel',
    'order.fulfill',
    'order.refund',
    'comms.thread.read_own',
    'comms.thread.read',
    'comms.thread.create',
    'comms.message.send',
    'comms.message.read',
    'comms.message.delete_own',
    'comms.message.delete',
    'manufacturer.catalog.read',
    'manufacturer.order.read',
    'manufacturer.order.update',
    'manufacturer.inventory.manage',
    'admin.access',
    // Proposals (7)
    'proposal.read_own',
    'proposal.read',
    'proposal.create',
    'proposal.update_own',
    'proposal.update',
    'proposal.delete',
    'proposal.send',
  ] as const,
};

/**
 * Helper function to check if a user has a specific permission
 *
 * @param userPermissions - Array of permission strings from user context
 * @param requiredPermission - Permission to check for
 * @returns true if user has the permission
 *
 * @example
 * ```typescript
 * const canCreateProduct = hasPermission(
 *   user.permissions,
 *   PermissionCode.CATALOG_PRODUCT_CREATE
 * );
 * ```
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: PermissionString
): boolean {
  return userPermissions.includes(requiredPermission);
}

/**
 * Helper function to check if a user has ALL of the specified permissions
 *
 * @param userPermissions - Array of permission strings from user context
 * @param requiredPermissions - Permissions to check for (requires ALL)
 * @returns true if user has all permissions
 *
 * @example
 * ```typescript
 * const canModifyProduct = hasAllPermissions(user.permissions, [
 *   PermissionCode.CATALOG_PRODUCT_UPDATE,
 *   PermissionCode.CATALOG_PRODUCT_DELETE,
 * ]);
 * ```
 */
export function hasAllPermissions(
  userPermissions: string[],
  requiredPermissions: PermissionString[]
): boolean {
  return requiredPermissions.every((perm) => hasPermission(userPermissions, perm));
}

/**
 * Helper function to check if a user has ANY of the specified permissions
 *
 * @param userPermissions - Array of permission strings from user context
 * @param requiredPermissions - Permissions to check for (requires ANY)
 * @returns true if user has at least one permission
 *
 * @example
 * ```typescript
 * const canViewProducts = hasAnyPermission(user.permissions, [
 *   PermissionCode.CATALOG_PRODUCT_READ,
 *   PermissionCode.ADMIN_ACCESS,
 * ]);
 * ```
 */
export function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions: PermissionString[]
): boolean {
  return requiredPermissions.some((perm) => hasPermission(userPermissions, perm));
}

/**
 * Helper function to get all permissions for a specific role
 *
 * @param role - Role name
 * @returns Array of permission strings for the role
 *
 * @example
 * ```typescript
 * const designerPerms = getPermissionsForRole(RoleName.DESIGNER);
 * ```
 */
export function getPermissionsForRole(role: RoleName): readonly PermissionString[] {
  return ROLE_PERMISSIONS[role];
}

// =============================================================================
// LEGACY PERMISSION ALIAS SYSTEM
// =============================================================================
// Maps frontend legacy permission codes to canonical backend codes.
// This provides backward compatibility during migration.
// =============================================================================

/**
 * Legacy permission codes used in frontend applications.
 * Maps to canonical backend permission codes.
 *
 * @deprecated Use canonical PermissionCode values instead
 */
export const LegacyPermissionAlias = {
  // Client management -> identity.user.*
  'create:client': 'identity.user.create',
  'view:client': 'identity.user.read',
  'update:client': 'identity.user.update',
  'delete:client': 'identity.user.delete',

  // Proposal operations -> proposal.*
  'create:proposal': 'proposal.create',
  'view:proposal': 'proposal.read_own',
  'update:proposal': 'proposal.update_own',
  'delete:proposal': 'proposal.delete',
  'send:proposal': 'proposal.send',

  // Project operations -> project.*
  'create:project': 'project.create',
  'view:project': 'project.read_own',
  'update:project': 'project.update_own',

  // Teaching/Rules -> catalog.*
  'submit:teaching': 'catalog.product.create',
  'manage:rules': 'admin.access',

  // Admin operations
  'manage:users': 'identity.user.update',
  'view:analytics': 'admin.access',
} as const;

/**
 * Type for legacy permission codes
 */
export type LegacyPermission = keyof typeof LegacyPermissionAlias;

/**
 * Union type accepting both legacy and canonical permission codes
 */
export type AnyPermission = PermissionString | LegacyPermission;

/**
 * Resolve any permission code to its canonical form.
 * Handles both legacy codes and canonical codes.
 *
 * @param permission - Legacy or canonical permission code
 * @returns Canonical permission code
 *
 * @example
 * ```typescript
 * resolvePermission('create:client')     // -> 'identity.user.create'
 * resolvePermission('identity.user.read') // -> 'identity.user.read' (unchanged)
 * ```
 */
export function resolvePermission(permission: AnyPermission): PermissionString {
  // Check if it's a legacy code
  if (permission in LegacyPermissionAlias) {
    return LegacyPermissionAlias[permission as LegacyPermission] as PermissionString;
  }
  // Return as-is (canonical code)
  return permission as PermissionString;
}

/**
 * Check if a permission code is a legacy format
 *
 * @param permission - Permission code to check
 * @returns true if the code is in legacy format
 */
export function isLegacyPermission(permission: string): permission is LegacyPermission {
  return permission in LegacyPermissionAlias;
}

/**
 * Enhanced permission check that accepts both legacy and canonical codes.
 *
 * @param userPermissions - Array of canonical permission strings from user context
 * @param requiredPermission - Permission to check (legacy or canonical)
 * @returns true if user has the permission
 *
 * @example
 * ```typescript
 * // Both of these work:
 * hasPermissionUnified(perms, 'create:client');         // Legacy
 * hasPermissionUnified(perms, 'identity.user.create');  // Canonical
 * ```
 */
export function hasPermissionUnified(
  userPermissions: string[],
  requiredPermission: AnyPermission
): boolean {
  const canonical = resolvePermission(requiredPermission);
  return userPermissions.includes(canonical);
}

/**
 * Enhanced check for ALL permissions (accepts legacy or canonical codes)
 */
export function hasAllPermissionsUnified(
  userPermissions: string[],
  requiredPermissions: AnyPermission[]
): boolean {
  return requiredPermissions.every((perm) => hasPermissionUnified(userPermissions, perm));
}

/**
 * Enhanced check for ANY permissions (accepts legacy or canonical codes)
 */
export function hasAnyPermissionUnified(
  userPermissions: string[],
  requiredPermissions: AnyPermission[]
): boolean {
  return requiredPermissions.some((perm) => hasPermissionUnified(userPermissions, perm));
}

/**
 * Domain display names for UI
 */
export const DOMAIN_DISPLAY_NAMES: Record<PermissionDomain, string> = {
  [PermissionDomain.IDENTITY]: 'Identity & Access Management',
  [PermissionDomain.SESSION]: 'Session Management',
  [PermissionDomain.PRIVACY]: 'Privacy & Compliance',
  [PermissionDomain.DESIGNER]: 'Designer Verification',
  [PermissionDomain.CATALOG]: 'Catalog Management',
  [PermissionDomain.PROJECT]: 'Project Management',
  [PermissionDomain.ORDER]: 'Order Management',
  [PermissionDomain.COMMS]: 'Communications',
  [PermissionDomain.MANUFACTURER]: 'Manufacturer Operations',
  [PermissionDomain.PROPOSAL]: 'Proposal Management',
  [PermissionDomain.ADMIN]: 'Admin Portal Access',
};

/**
 * Extract domain from a canonical permission code
 *
 * @param code - Canonical permission code (e.g., 'identity.user.read')
 * @returns Domain string (e.g., 'identity')
 */
export function extractDomain(code: PermissionString): string {
  return code.split('.')[0];
}

/**
 * Group permissions by domain
 *
 * @param permissions - Array of permission codes
 * @returns Map of domain to permissions
 */
export function groupPermissionsByDomain(
  permissions: PermissionString[]
): Map<string, PermissionString[]> {
  return permissions.reduce((acc, perm) => {
    const domain = extractDomain(perm);
    if (!acc.has(domain)) {
      acc.set(domain, []);
    }
    acc.get(domain)!.push(perm);
    return acc;
  }, new Map<string, PermissionString[]>());
}
