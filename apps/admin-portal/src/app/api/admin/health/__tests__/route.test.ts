/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';
import { GET } from '../route';

jest.mock('@/lib/supabase-admin', () => ({
  getAuthenticatedAdmin: jest.fn(),
  serverError: (message: string) => NextResponse.json({ error: message }, { status: 500 }),
}));

const mockAuth = getAuthenticatedAdmin as jest.Mock;
const mockFetch = global.fetch as jest.Mock;
const request = () => new NextRequest('http://localhost:3001/api/admin/health');

describe('GET /api/admin/health cache policy', () => {
  beforeEach(() => {
    const limit = jest.fn().mockResolvedValue({ error: null });
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1' },
      adminClient: {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ limit }),
        }),
      },
    });
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
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
});
