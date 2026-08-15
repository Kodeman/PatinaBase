/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';
import { GET } from '../route';

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
}));
jest.mock('@/lib/supabase-admin', () => ({
  getAuthenticatedAdmin: jest.fn(),
  serverError: (message: string) => NextResponse.json({ error: message }, { status: 500 }),
}));

const mockAuth = getAuthenticatedAdmin as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;
const mockFetch = global.fetch as jest.Mock;
const request = () =>
  new NextRequest('http://localhost:3001/api/admin/media-assets?limit=10');

describe('GET /api/admin/media-assets cache policy', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1' }, adminClient: {} });
    mockCreateServerClient.mockResolvedValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { access_token: 'access-token' } },
        }),
      },
    });
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('marks a successful authenticated response private and non-cacheable', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each([401, 403])('marks an auth %s response private and non-cacheable', async (status) => {
    mockAuth.mockResolvedValue({
      error: NextResponse.json({ error: 'denied' }, { status }),
    });
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('marks a missing-session response private and non-cacheable', async () => {
    mockCreateServerClient.mockResolvedValue({
      auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
    });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('marks an upstream failure private and non-cacheable', async () => {
    mockFetch.mockRejectedValue(new Error('connection reset'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
