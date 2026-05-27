import { describe, it, expect, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
//
// useUserRoles internally calls createBrowserClient + useQuery, but the
// hook under test (useIsStudioOwner) and the pure helper
// (isStudioOwnerFromRoles) don't exercise those paths. We still install the
// minimal mocks so the module can load without an actual @supabase/ssr
// runtime in the Vitest env.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER mocks.
import {
  isStudioOwnerFromRoles,
  type UserRoleAssignment,
} from '../use-permissions';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRoleAssignment(roleName: string): UserRoleAssignment {
  return {
    id: `ur-${roleName}`,
    user_id: 'user-1',
    role_id: `role-${roleName}`,
    granted_at: '2026-05-01T00:00:00Z',
    granted_by: null,
    role: {
      id: `role-${roleName}`,
      name: roleName,
      display_name: roleName.replace(/_/g, ' '),
      description: null,
      domain: 'designer',
      is_system: false,
      is_assignable: true,
      parent_role_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// isStudioOwnerFromRoles — pure helper (Wave 3.3 promotion)
// ─────────────────────────────────────────────────────────────────────────────

describe('isStudioOwnerFromRoles', () => {
  it('returns true when the user holds the studio_owner role', () => {
    const roles = [makeRoleAssignment('studio_owner')];
    expect(isStudioOwnerFromRoles(roles)).toBe(true);
  });

  it('returns true when studio_owner is one of several assigned roles', () => {
    const roles = [
      makeRoleAssignment('designer'),
      makeRoleAssignment('studio_owner'),
    ];
    expect(isStudioOwnerFromRoles(roles)).toBe(true);
  });

  it('returns false when no assigned role is studio_owner', () => {
    const roles = [makeRoleAssignment('designer')];
    expect(isStudioOwnerFromRoles(roles)).toBe(false);
  });

  it('returns false when the role list is empty', () => {
    expect(isStudioOwnerFromRoles([])).toBe(false);
  });

  it('returns false when the role list is undefined (query still loading)', () => {
    expect(isStudioOwnerFromRoles(undefined)).toBe(false);
  });

  it('does not match a role whose name merely contains "studio_owner" as a substring', () => {
    const roles = [makeRoleAssignment('studio_owner_assistant')];
    expect(isStudioOwnerFromRoles(roles)).toBe(false);
  });
});
