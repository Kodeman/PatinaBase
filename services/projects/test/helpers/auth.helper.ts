import { sign } from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-minimum-32-characters-long';

export interface TestUser {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
}

/**
 * Test users with different permission sets for authorization testing
 */
export const testUsers = {
  designer: {
    userId: 'designer-test-uuid-1',
    email: 'designer@test.com',
    roles: ['designer'],
    permissions: [
      // Projects permissions
      'projects.project.create',
      'projects.project.read',
      'projects.project.update',
      'projects.project.delete',
      'projects.milestone.create',
      'projects.milestone.read',
      'projects.milestone.update',
      'projects.milestone.delete',
      'projects.task.create',
      'projects.task.read',
      'projects.task.update',
      'projects.task.delete',
      'projects.rfi.create',
      'projects.rfi.read',
      'projects.rfi.update',
      'projects.rfi.respond',
      'projects.change_order.create',
      'projects.change_order.read',
      'projects.change_order.approve',
    ],
    sessionId: 'designer-session-1',
  },
  client: {
    userId: 'client-test-uuid-1',
    email: 'client@test.com',
    roles: ['client'],
    permissions: [
      // Clients can read projects but not modify them
      'projects.project.read',
      'projects.milestone.read',
      'projects.task.read',
      'projects.rfi.read',
      'projects.rfi.create', // Clients can create RFIs
      'projects.change_order.read',
      'projects.change_order.approve', // Clients can approve change orders
    ],
    sessionId: 'client-session-1',
  },
  admin: {
    userId: 'admin-test-uuid-1',
    email: 'admin@test.com',
    roles: ['admin'],
    permissions: [
      // Admins have all project permissions
      'projects.project.create',
      'projects.project.read',
      'projects.project.update',
      'projects.project.delete',
      'projects.milestone.create',
      'projects.milestone.read',
      'projects.milestone.update',
      'projects.milestone.delete',
      'projects.task.create',
      'projects.task.read',
      'projects.task.update',
      'projects.task.delete',
      'projects.rfi.create',
      'projects.rfi.read',
      'projects.rfi.update',
      'projects.rfi.respond',
      'projects.change_order.create',
      'projects.change_order.read',
      'projects.change_order.approve',
      'projects.daily_log.create',
      'projects.daily_log.read',
      'projects.issue.create',
      'projects.issue.read',
      'projects.issue.update',
      'projects.issue.resolve',
    ],
    sessionId: 'admin-session-1',
  },
  noPermissions: {
    userId: 'no-perm-test-uuid-1',
    email: 'noperm@test.com',
    roles: ['user'],
    permissions: [],
    sessionId: 'no-perm-session-1',
  },
};

/**
 * Generate a valid JWT token for a test user
 */
export function generateJWT(user: TestUser): string {
  return sign(
    {
      sub: user.userId,
      userId: user.userId,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      sessionId: user.sessionId || 'default-session',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
    },
    JWT_SECRET,
    {
      issuer: 'patina-user-management',
      audience: 'patina-api',
    },
  );
}

/**
 * Generate an expired JWT token for testing token expiry
 */
export function generateExpiredJWT(user: TestUser): string {
  return sign(
    {
      sub: user.userId,
      userId: user.userId,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      sessionId: user.sessionId || 'default-session',
      iat: Math.floor(Date.now() / 1000) - 7200, // Issued 2 hours ago
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    },
    JWT_SECRET,
    {
      issuer: 'patina-user-management',
      audience: 'patina-api',
    },
  );
}

/**
 * Generate a JWT token with invalid signature
 */
export function generateInvalidSignatureJWT(user: TestUser): string {
  return sign(
    {
      sub: user.userId,
      userId: user.userId,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      sessionId: user.sessionId || 'default-session',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'wrong-secret-key-that-will-cause-signature-verification-failure',
    {
      issuer: 'patina-user-management',
      audience: 'patina-api',
    },
  );
}
