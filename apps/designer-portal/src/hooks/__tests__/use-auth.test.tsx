import { renderHook, waitFor } from '@testing-library/react';
import { useAuth, usePermissions, useRequireAuth } from '../use-auth';
import { Permission, Role } from '@/lib/rbac';

// Mock @patina/supabase
const mockUseSession = jest.fn();
jest.mock('@patina/supabase', () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
  createBrowserClient: jest.fn(() => ({
    auth: {
      signOut: jest.fn().mockResolvedValue({}),
    },
  })),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

describe('useAuth', () => {
  // Supabase session shape matching what useSession() from @patina/supabase returns
  const mockSupabaseSession = {
    user: {
      id: '1',
      email: 'test@example.com',
      user_metadata: {
        displayName: 'Test User',
        roles: ['designer'],
      },
      app_metadata: {
        roles: ['designer'],
      },
      identities: [],
    },
    access_token: 'token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return authenticated user when session exists', () => {
    mockUseSession.mockReturnValue({
      session: mockSupabaseSession,
      isLoading: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('1');
    expect(result.current.user?.email).toBe('test@example.com');
    expect(result.current.user?.roles).toEqual(['designer']);
    expect(result.current.isLoading).toBe(false);
  });

  it('should return loading state when session is loading', () => {
    mockUseSession.mockReturnValue({
      session: null,
      isLoading: true,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should return hasSessionError as false (Supabase handles refresh internally)', () => {
    mockUseSession.mockReturnValue({
      session: mockSupabaseSession,
      isLoading: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.hasSessionError).toBe(false);
  });
});

describe('usePermissions', () => {
  const mockSupabaseSession = {
    user: {
      id: '1',
      email: 'designer@example.com',
      user_metadata: {
        displayName: 'Designer',
        roles: ['designer'],
      },
      app_metadata: {
        roles: ['designer'],
      },
      identities: [],
    },
    access_token: 'token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => {
    mockUseSession.mockReturnValue({
      session: mockSupabaseSession,
      isLoading: false,
    });
  });

  it('should check permissions correctly', () => {
    const { result } = renderHook(() => usePermissions());

    expect(result.current.checkPermission(Permission.CREATE_CLIENT)).toBe(true);
    expect(result.current.checkPermission(Permission.MANAGE_USERS)).toBe(false);
  });

  it('should check roles correctly', () => {
    const { result } = renderHook(() => usePermissions());

    expect(result.current.checkRole(Role.DESIGNER)).toBe(true);
    expect(result.current.checkRole(Role.ADMIN)).toBe(false);
  });

  it('should check any permissions', () => {
    const { result } = renderHook(() => usePermissions());

    expect(
      result.current.checkAnyPermission([Permission.CREATE_CLIENT, Permission.MANAGE_USERS])
    ).toBe(true);
    expect(
      result.current.checkAnyPermission([Permission.MANAGE_USERS, Permission.VIEW_ANALYTICS])
    ).toBe(false);
  });

  it('should check all permissions', () => {
    const { result } = renderHook(() => usePermissions());

    expect(
      result.current.checkAllPermissions([Permission.CREATE_CLIENT, Permission.VIEW_CLIENT])
    ).toBe(true);
    expect(
      result.current.checkAllPermissions([Permission.CREATE_CLIENT, Permission.MANAGE_USERS])
    ).toBe(false);
  });
});
