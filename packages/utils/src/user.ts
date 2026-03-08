/**
 * User Utility Functions
 *
 * Shared utilities for user display and formatting across portals.
 * @module utils/user
 */

import type { UserPresenceStatus } from '@patina/types';

/**
 * Generate initials from a name string.
 * Handles single names, multiple names, and empty strings.
 *
 * @param name - The full name to extract initials from
 * @returns 1-2 uppercase characters representing the initials
 *
 * @example
 * getInitials('John Doe');
 * // Returns: 'JD'
 *
 * @example
 * getInitials('Madonna');
 * // Returns: 'MA'
 *
 * @example
 * getInitials('');
 * // Returns: '?'
 */
export function getInitials(name: string): string {
  if (!name || !name.trim()) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format a role name for display.
 * Capitalizes the first letter and handles special cases.
 *
 * @param role - The role identifier (e.g., 'designer', 'admin')
 * @returns The formatted role label (e.g., 'Designer', 'Admin')
 *
 * @example
 * formatRoleLabel('designer');
 * // Returns: 'Designer'
 *
 * @example
 * formatRoleLabel('');
 * // Returns: 'User'
 */
export function formatRoleLabel(role: string): string {
  if (!role) return 'User';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/**
 * Presence status style configuration
 */
export interface PresenceStatusStyle {
  /** Tailwind background color class */
  bg: string;
  /** Tailwind text color class */
  text: string;
  /** Human-readable label */
  label: string;
}

/**
 * Get the appropriate styling for a presence status.
 * Returns consistent styling metadata for use in components.
 *
 * @param status - The presence status
 * @returns Object with background color, text color, and label
 *
 * @example
 * getPresenceStatusStyle('online');
 * // Returns: { bg: 'bg-green-500', text: 'text-green-700', label: 'Online' }
 */
export function getPresenceStatusStyle(
  status: UserPresenceStatus
): PresenceStatusStyle {
  const statusMap: Record<UserPresenceStatus, PresenceStatusStyle> = {
    online: { bg: 'bg-green-500', text: 'text-green-700', label: 'Online' },
    offline: { bg: 'bg-gray-400', text: 'text-gray-600', label: 'Offline' },
    busy: { bg: 'bg-red-500', text: 'text-red-700', label: 'Busy' },
    away: { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'Away' },
  };
  return statusMap[status] || statusMap.offline;
}

/**
 * Role badge color configuration
 */
export interface RoleBadgeStyle {
  /** Variant for Badge component */
  variant: 'solid' | 'subtle' | 'outline';
  /** Color for Badge component */
  color: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

/**
 * Get the appropriate badge styling for a user role.
 * Maps role names to semantic colors for visual differentiation.
 *
 * @param role - The role identifier
 * @returns Object with Badge variant and color
 *
 * @example
 * getRoleBadgeStyle('admin');
 * // Returns: { variant: 'subtle', color: 'error' }
 */
export function getRoleBadgeStyle(role: string): RoleBadgeStyle {
  const normalizedRole = role?.toLowerCase() || '';

  const roleStyleMap: Record<string, RoleBadgeStyle> = {
    admin: { variant: 'subtle', color: 'error' },
    designer: { variant: 'subtle', color: 'primary' },
    manufacturer: { variant: 'subtle', color: 'info' },
    customer: { variant: 'subtle', color: 'neutral' },
  };

  return roleStyleMap[normalizedRole] || { variant: 'subtle', color: 'neutral' };
}
