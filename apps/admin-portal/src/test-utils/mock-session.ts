/**
 * Mock Auth Session
 *
 * Utilities for mocking authentication sessions in tests.
 * Compatible with the Supabase-based useAuth() hook shape.
 */

import type { Session } from '@/lib/rbac';

export interface MockSessionOptions {
  userId?: string;
  email?: string;
  name?: string;
  role?: 'admin' | 'designer' | 'client';
  authenticated?: boolean;
}

/**
 * Create a mock session compatible with useAuth() return shape
 */
export function createMockSession(options: MockSessionOptions = {}): Session | null {
  if (options.authenticated === false) {
    return null;
  }

  return {
    user: {
      id: options.userId || 'user-123',
      email: options.email || 'admin@patina.com',
      name: options.name || 'Admin User',
      roles: [options.role || 'admin'],
      permissions: [],
    },
    accessToken: 'mock-access-token',
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Create a mock useAuth() return value
 */
export function mockUseAuth(options: MockSessionOptions = {}) {
  const session = createMockSession(options);

  return {
    session,
    user: session?.user ?? undefined,
    status: session ? 'authenticated' : 'unauthenticated',
    isLoading: false,
    isAuthenticated: !!session,
    hasSessionError: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
  };
}

/**
 * @deprecated Use mockUseAuth instead
 * Mock useSession hook - kept for backward compatibility
 */
export function mockUseSession(options: MockSessionOptions = {}) {
  const session = createMockSession(options);

  return {
    data: session,
    status: session ? 'authenticated' : 'unauthenticated',
    update: jest.fn(),
  };
}

/**
 * @deprecated Use createMockSession instead
 * Mock getServerSession for server components
 */
export function mockGetServerSession(options: MockSessionOptions = {}) {
  return jest.fn().mockResolvedValue(createMockSession(options));
}
