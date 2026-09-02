import { studiosService } from '../studios';

// studios.ts calls the global `fetch` directly via its local `apiFetch`
// helper (same convention as services/__tests__/users.test.ts) — mock
// fetch itself.
const fetchMock = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = fetchMock as any;

function okJson(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('studiosService', () => {
  describe('getStudios', () => {
    it('fetches studios without parameters', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await studiosService.getStudios();

      expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/studios');
    });

    it('fetches studios with query parameters', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await studiosService.getStudios({
        query: 'acme',
        status: 'active',
        tier: 'professional',
        page: 2,
        pageSize: 20,
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/admin/studios?query=acme&status=active&tier=professional&page=2&pageSize=20',
      );
    });
  });

  describe('getStudio', () => {
    it('fetches a specific studio', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: 'studio-1' }));

      await studiosService.getStudio('studio-1');

      expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/studios/studio-1');
    });
  });

  describe('createStudio', () => {
    it('POSTs the owner and name', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ studioId: 'studio-1' }));

      await studiosService.createStudio({ ownerUserId: 'user-1', name: 'Acme Studio' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ ownerUserId: 'user-1', name: 'Acme Studio' });
    });
  });

  describe('updateStudio', () => {
    it('PATCHes the studio with the update payload', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: 'studio-1', name: 'New Name' }));

      await studiosService.updateStudio('studio-1', { name: 'New Name' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ name: 'New Name' });
    });
  });

  describe('setStudioStatus', () => {
    it('POSTs status and reason', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await studiosService.setStudioStatus('studio-1', 'suspended', 'ToS violation');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1/status');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ status: 'suspended', reason: 'ToS violation' });
    });
  });

  describe('getStudioMembers', () => {
    it('fetches the roster', async () => {
      fetchMock.mockResolvedValueOnce(okJson([]));

      await studiosService.getStudioMembers('studio-1');

      expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/studios/studio-1/members');
    });
  });

  describe('addStudioMember', () => {
    it('POSTs the member payload', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: 'member-1' }));

      await studiosService.addStudioMember('studio-1', { userId: 'user-2', role: 'member' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1/members');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ userId: 'user-2', role: 'member' });
    });
  });

  describe('updateStudioMember', () => {
    it('PATCHes the member', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ id: 'member-1' }));

      await studiosService.updateStudioMember('studio-1', 'member-1', { role: 'admin' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1/members/member-1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ role: 'admin' });
    });
  });

  describe('removeStudioMember', () => {
    it('DELETEs the member', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await studiosService.removeStudioMember('studio-1', 'member-1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1/members/member-1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('inviteStudioMember', () => {
    it('POSTs the invite payload', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await studiosService.inviteStudioMember('studio-1', {
        email: 'new@example.com',
        role: 'member',
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1/invites');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ email: 'new@example.com', role: 'member' });
    });
  });

  describe('transferOwnership', () => {
    it('POSTs the new owner id', async () => {
      fetchMock.mockResolvedValueOnce(okJson(undefined));

      await studiosService.transferOwnership('studio-1', 'user-3');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/admin/studios/studio-1/transfer-ownership');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ newOwnerUserId: 'user-3' });
    });
  });

  describe('getStudioProjects', () => {
    it('fetches paginated projects', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await studiosService.getStudioProjects('studio-1', { page: 2, pageSize: 10 });

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/admin/studios/studio-1/projects?page=2&pageSize=10',
      );
    });
  });

  describe('getStudioActivity', () => {
    it('fetches paginated activity', async () => {
      fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));

      await studiosService.getStudioActivity('studio-1', { limit: 10, offset: 5 });

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/admin/studios/studio-1/activity?limit=10&offset=5',
      );
    });
  });

  describe('searchUsers', () => {
    it('fetches matching users excluding a studio', async () => {
      fetchMock.mockResolvedValueOnce(okJson([]));

      await studiosService.searchUsers({ q: 'john', excludeStudioId: 'studio-1' });

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/admin/studios/user-search?q=john&excludeStudioId=studio-1',
      );
    });
  });

  describe('getUserStudios', () => {
    it('fetches a user’s studio memberships', async () => {
      fetchMock.mockResolvedValueOnce(okJson([]));

      await studiosService.getUserStudios('user-1');

      expect(fetchMock.mock.calls[0][0]).toBe('/api/users/user-1/studios');
    });
  });
});
