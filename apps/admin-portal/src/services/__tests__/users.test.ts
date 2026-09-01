import { usersService } from '../users';

// users.ts calls the global `fetch` directly via its local `apiFetch` helper
// (not `@/lib/api-client`) — mock fetch itself, following the pattern in
// services/__tests__/agent-tasks.test.ts.
const fetchMock = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = fetchMock as any;

function okJson(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('usersService', () => {
  describe('getUsers', () => {
    it('should fetch users without parameters', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await usersService.getUsers();

      expect(fetchMock.mock.calls[0][0]).toBe('/api/users');
    });

    it('should fetch users with query parameters', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await usersService.getUsers({
        query: 'john',
        status: 'active',
        role: 'admin',
        page: 2,
        pageSize: 20,
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/users?query=john&status=active&role=admin&page=2&pageSize=20',
      );
    });
  });

  describe('getUser', () => {
    it('should fetch a specific user', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: '123', email: 'user@example.com' }));

      await usersService.getUser('123');

      expect(fetchMock.mock.calls[0][0]).toBe('/api/users/123');
    });
  });

  describe('updateUser', () => {
    it('should PATCH the user with the update payload', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: '123', displayName: 'John Doe' }));

      await usersService.updateUser('123', { displayName: 'John Doe' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/123');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ displayName: 'John Doe' });
    });
  });

  describe('verifyEmail', () => {
    // Regression test: verifyEmail previously POSTed to a nonexistent
    // /api/users/[id]/verify-email route (404 in prod). It now reuses the
    // PATCH /api/users/[id] handler's existing emailVerified support.
    it('issues PATCH /api/users/{id} with { emailVerified: true }', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: '123', emailVerified: true }));

      await usersService.verifyEmail('123');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/123');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ emailVerified: true });
    });
  });

  describe('suspendUser', () => {
    it('should suspend a user without reason', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.suspendUser('123');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/123/suspend');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ reason: undefined });
    });

    it('should suspend a user with reason', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.suspendUser('123', 'Terms violation');

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ reason: 'Terms violation' });
    });
  });

  describe('banUser', () => {
    it('should ban a user with reason', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.banUser('123', 'Fraud detected');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/123/ban');
      expect(JSON.parse(init.body)).toEqual({ reason: 'Fraud detected' });
    });
  });

  describe('reactivateUser', () => {
    it('should POST to the activate endpoint', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.reactivateUser('123');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/123/activate');
      expect(init.method).toBe('POST');
    });
  });

  describe('Role Management', () => {
    it('should fetch all roles', async () => {
      fetchMock.mockResolvedValueOnce(okJson([{ id: '1', name: 'admin' }]));

      await usersService.getRoles();

      expect(fetchMock.mock.calls[0][0]).toBe('/api/roles');
    });

    it('should assign role to user', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.assignRole('user-123', 'role-456', 'Promoted to admin');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/user-123/roles');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ roleId: 'role-456', reason: 'Promoted to admin' });
    });

    it('should revoke role from user', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.revokeRole('user-123', 'role-456', 'Demotion');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/users/user-123/roles?roleId=role-456');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body)).toEqual({ reason: 'Demotion' });
    });
  });

  describe('Designer Verification', () => {
    it('should fetch verification queue', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await usersService.getVerificationQueue({
        status: 'submitted',
        page: 1,
        pageSize: 10,
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/admin/verification-queue?status=submitted&page=1&pageSize=10',
      );
    });

    it('should approve designer', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.approveDesigner('123', 'Verified credentials');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/designers/123/decision');
      expect(JSON.parse(init.body)).toEqual({
        status: 'approved',
        notes: 'Verified credentials',
      });
    });

    it('should reject designer', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await usersService.rejectDesigner('123', 'Invalid documents');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/designers/123/decision');
      expect(JSON.parse(init.body)).toEqual({
        status: 'rejected',
        notes: 'Invalid documents',
      });
    });
  });

  describe('Sessions Management', () => {
    it('should get user sessions', async () => {
      fetchMock.mockResolvedValueOnce(okJson([{ id: 'session-1' }]));

      await usersService.getUserSessions('123');

      expect(fetchMock.mock.calls[0][0]).toBe('/api/users/123/sessions');
    });

    // usersService.revokeSession (single-session revoke) was removed: its
    // API route (DELETE /sessions/[sessionId]) deleted the user's MFA
    // factor while claiming to revoke a "session" — the wrong object
    // entirely, per an adversarial review. There is no per-session revoke
    // action anymore; see the "sessions surface honesty" fix.

    // usersService.revokeAllSessions was removed too, along with the
    // "Revoke All" button in SessionList. It had no working backend: it
    // first wrote app_metadata.sessions_revoked_at (a field GoTrue never
    // reads — a fake success), then was pointed at a nonexistent
    // /sessions/revoke-all route so the failure would be visible, which
    // meant a 404 on every click. No admin-side, userId-scoped session
    // invalidation exists in the installed supabase-js
    // (@supabase/auth-js 2.98.0), so the sessions surface is read-only.
    it('exposes no session-revocation call at all', () => {
      expect('revokeAllSessions' in usersService).toBe(false);
      expect('revokeSession' in usersService).toBe(false);
    });
  });
});
