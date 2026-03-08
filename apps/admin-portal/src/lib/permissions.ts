import type { UserRole } from '@patina/types';

/**
 * Permission utility functions for catalog operations
 *
 * These functions determine what actions users can perform based on their role.
 * Admin portal typically grants full access to all authenticated users.
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
export function getCatalogPermissions(role: UserRole | undefined): CatalogPermissions {
  // Admin portal: all authenticated users have full access
  // This is because the admin portal is restricted to admin users only
  const isAuthenticated = !!role;

  return {
    canCreateProducts: isAuthenticated,
    canEditProducts: isAuthenticated,
    canDeleteProducts: isAuthenticated,
    canPublishProducts: isAuthenticated,
    canManageCollections: isAuthenticated,
    canManageCategories: isAuthenticated,
    hasFullCatalogAccess: isAuthenticated,
  };
}

/**
 * Check if user can create products
 */
export function canCreateProducts(role: UserRole | undefined): boolean {
  return !!role; // All authenticated users in admin portal
}

/**
 * Check if user can edit products
 */
export function canEditProducts(role: UserRole | undefined): boolean {
  return !!role; // All authenticated users in admin portal
}

/**
 * Check if user can delete products
 */
export function canDeleteProducts(role: UserRole | undefined): boolean {
  return !!role; // All authenticated users in admin portal
}

/**
 * Check if user can publish/unpublish products
 */
export function canPublishProducts(role: UserRole | undefined): boolean {
  return !!role; // All authenticated users in admin portal
}

/**
 * Check if user has full catalog access
 */
export function hasFullCatalogAccess(role: UserRole | undefined): boolean {
  return !!role; // All authenticated users in admin portal
}

/**
 * Check if user can manage collections
 */
export function canManageCollections(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can create collections
 */
export function canCreateCollections(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can edit collections
 */
export function canEditCollection(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can delete collections
 */
export function canDeleteCollection(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can publish/unpublish collections
 */
export function canPublishCollection(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can manage categories (full CRUD)
 */
export function canManageCategories(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can create categories
 */
export function canCreateCategories(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can edit categories
 */
export function canEditCategories(role: UserRole | undefined): boolean {
  return !!role;
}

/**
 * Check if user can delete categories
 */
export function canDeleteCategories(role: UserRole | undefined): boolean {
  return !!role;
}
