/**
 * Development test account configuration
 * These accounts are seeded in the user-management database with bcrypt password hashes
 * Used for one-click login in dev mode
 */

export interface DevAccount {
  /** Unique identifier for the account */
  id: string;
  /** Email address (used as login) */
  email: string;
  /** Password (plain text - only for dev UI display) */
  password: string;
  /** Display name */
  name: string;
  /** User roles */
  roles: string[];
  /** Brief description of access level */
  description: string;
}

/**
 * Standard set of 6 dev test accounts
 * All use the same password for simplicity
 */
export const DEV_ACCOUNTS: DevAccount[] = [
  {
    id: 'super_admin',
    email: 'superadmin@patina.dev',
    password: 'password123',
    name: 'Super Admin',
    roles: ['super_admin', 'admin'],
    description: 'Full system access',
  },
  {
    id: 'admin',
    email: 'admin@patina.dev',
    password: 'password123',
    name: 'Admin User',
    roles: ['admin'],
    description: 'Full admin access',
  },
  {
    id: 'studio_manager',
    email: 'studio_manager@patina.dev',
    password: 'password123',
    name: 'Studio Manager',
    roles: ['studio_manager'],
    description: 'Team lead access',
  },
  {
    id: 'designer',
    email: 'designer@patina.dev',
    password: 'password123',
    name: 'Designer User',
    roles: ['designer'],
    description: 'Verified designer',
  },
  {
    id: 'client',
    email: 'client@patina.dev',
    password: 'password123',
    name: 'Client User',
    roles: ['client'],
    description: 'Standard client',
  },
  {
    id: 'manufacturer',
    email: 'manufacturer@patina.dev',
    password: 'password123',
    name: 'Manufacturer User',
    roles: ['manufacturer'],
    description: 'Manufacturing partner',
  },
  {
    id: 'support',
    email: 'support@patina.dev',
    password: 'password123',
    name: 'Support Agent',
    roles: ['support'],
    description: 'Customer support',
  },
];

export type PortalType = 'admin' | 'designer' | 'client';

/**
 * Role mapping for each portal type
 * Determines which accounts are shown on each portal's signin page
 */
const PORTAL_ROLE_MAPPING: Record<PortalType, string[]> = {
  admin: ['super_admin', 'admin', 'support'],
  designer: ['super_admin', 'admin', 'designer', 'studio_manager', 'manufacturer'],
  client: ['client'],
};

/**
 * Get dev accounts filtered for a specific portal
 * @param portal - The portal type (admin, designer, or client)
 * @returns Array of dev accounts relevant to that portal
 */
export function getAccountsForPortal(portal: PortalType): DevAccount[] {
  const allowedRoles = PORTAL_ROLE_MAPPING[portal];
  return DEV_ACCOUNTS.filter((account) =>
    account.roles.some((role) => allowedRoles.includes(role))
  );
}

/**
 * Check if dev mode is active (based on NODE_ENV)
 * @returns true if in development mode
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development';
}
