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

// useUserRoles reads through useQuery; the mock answers the user-roles key
// from `state.roles`, and useOrganizations (the System B seat read, R-PB6)
// from `state.organizations`, so useIsStudioOwner runs as a plain function.
const state = vi.hoisted(() => ({
  roles: { data: undefined as unknown, isLoading: true },
  organizations: { data: undefined as unknown, isLoading: true },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: { queryKey: unknown[] }) =>
    config.queryKey[0] === 'user-roles' ? state.roles : config,
}));

vi.mock('../use-organizations', () => ({
  useOrganizations: () => state.organizations,
}));

// Import AFTER mocks.
import {
  isStudioOwnerFromRoles,
  useIsStudioOwner,
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

// ─────────────────────────────────────────────────────────────────────────────
// useIsStudioOwner — the studio_owner role OR an owner seat (R-PB6)
// ─────────────────────────────────────────────────────────────────────────────

function seat(role: string, type = 'design_studio', status = 'active') {
  return {
    id: `org-${role}-${type}-${status}`,
    type,
    membership: { id: `m-${role}`, role, status, joined_at: null },
  };
}

function answer(roles: unknown, organizations: unknown) {
  state.roles = { data: roles, isLoading: false };
  state.organizations = { data: organizations, isLoading: false };
}

describe('useIsStudioOwner', () => {
  it('is true for a transferred owner: an owner seat without the studio_owner role', () => {
    answer([makeRoleAssignment('studio_designer')], [seat('owner')]);
    expect(useIsStudioOwner()).toEqual({ isStudioOwner: true, isLoading: false });
  });

  it('is true for the studio_owner role with no owner seat', () => {
    answer([makeRoleAssignment('studio_owner')], []);
    expect(useIsStudioOwner()).toEqual({ isStudioOwner: true, isLoading: false });
  });

  it('answers yes from the seat while the role read is still loading', () => {
    state.roles = { data: undefined, isLoading: true };
    state.organizations = { data: [seat('owner')], isLoading: false };
    expect(useIsStudioOwner()).toEqual({ isStudioOwner: true, isLoading: false });
  });

  it('is false for an admin or member seat', () => {
    answer([makeRoleAssignment('studio_designer')], [seat('admin'), seat('member')]);
    expect(useIsStudioOwner()).toEqual({ isStudioOwner: false, isLoading: false });
  });

  it('ignores an owner seat outside a design studio, or one that is not active', () => {
    answer([], [seat('owner', 'manufacturer'), seat('owner', 'design_studio', 'suspended')]);
    expect(useIsStudioOwner()).toEqual({ isStudioOwner: false, isLoading: false });
  });

  it('reports loading while the seat read has not answered and the role says no', () => {
    state.roles = { data: [], isLoading: false };
    state.organizations = { data: undefined, isLoading: true };
    expect(useIsStudioOwner()).toEqual({ isStudioOwner: false, isLoading: true });
  });
});
