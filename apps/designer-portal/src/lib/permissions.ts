import type { UserRoleName } from '@patina/types';

/**
 * Permission utility functions for catalog operations
 *
 * These functions determine what actions users can perform based on their role.
 * Designer portal has role-based restrictions:
 * - Admin: Full access (create, edit, delete, publish)
 * - Designer: Limited access (create, edit, NO delete)
 * - Customer/Manufacturer: Read-only access
 */

export interface CatalogPermissions {
  canCreateProducts: boolean;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
  canPublishProducts: boolean;
  canManageCollections: boolean;
  canManageCategories: boolean;
  hasFullCatalogAccess: boolean;
}

/**
 * Get catalog permissions for a user role
 */
export function getCatalogPermissions(role: UserRoleName | undefined): CatalogPermissions {
  if (!role) {
    return {
      canCreateProducts: false,
      canEditProducts: false,
      canDeleteProducts: false,
      canPublishProducts: false,
      canManageCollections: false,
      canManageCategories: false,
      hasFullCatalogAccess: false,
    };
  }

  switch (role) {
    case 'admin':
      return {
        canCreateProducts: true,
        canEditProducts: true,
        canDeleteProducts: true,
        canPublishProducts: true,
        canManageCollections: true,
        canManageCategories: true,
        hasFullCatalogAccess: true,
      };

    case 'designer':
      return {
        canCreateProducts: true,
        canEditProducts: true,
        canDeleteProducts: false, // Designers cannot delete
        canPublishProducts: false, // Designers cannot publish (only admin)
        canManageCollections: true,
        canManageCategories: false, // View-only for categories
        hasFullCatalogAccess: false,
      };

    case 'manufacturer':
    case 'customer':
    default:
      return {
        canCreateProducts: false,
        canEditProducts: false,
        canDeleteProducts: false,
        canPublishProducts: false,
        canManageCollections: false,
        canManageCategories: false,
        hasFullCatalogAccess: false,
      };
  }
}

/**
 * Check if user can create products
 */
export function canCreateProducts(role: UserRoleName | undefined): boolean {
  return role === 'admin' || role === 'designer';
}

/**
 * Check if user can edit products
 */
export function canEditProducts(role: UserRoleName | undefined): boolean {
  return role === 'admin' || role === 'designer';
}

/**
 * Check if user can delete products
 */
export function canDeleteProducts(role: UserRoleName | undefined): boolean {
  return role === 'admin'; // Only admins can delete
}

/**
 * Check if user can publish/unpublish products
 */
export function canPublishProducts(role: UserRoleName | undefined): boolean {
  return role === 'admin'; // Only admins can publish
}

/**
 * Check if user has full catalog access
 */
export function hasFullCatalogAccess(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user can manage collections
 */
export function canManageCollections(role: UserRoleName | undefined): boolean {
  return role === 'admin' || role === 'designer';
}

/**
 * Check if user can create collections
 */
export function canCreateCollections(role: UserRoleName | undefined): boolean {
  return role === 'admin' || role === 'designer';
}

/**
 * Check if user can edit a collection
 * Designers can only edit draft collections, admins can edit any
 */
export function canEditCollection(role: UserRoleName | undefined, collectionStatus?: string): boolean {
  if (role === 'admin') return true;
  return role === 'designer' && (collectionStatus === 'draft' || !collectionStatus);
}

/**
 * Check if user can delete collections
 */
export function canDeleteCollection(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user can publish/unpublish collections
 */
export function canPublishCollection(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user can manage categories (full CRUD)
 */
export function canManageCategories(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user can create categories
 */
export function canCreateCategories(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user can edit categories
 */
export function canEditCategories(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user can delete categories
 */
export function canDeleteCategories(role: UserRoleName | undefined): boolean {
  return role === 'admin';
}
