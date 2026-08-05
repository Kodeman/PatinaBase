import { middleware } from '../middleware';
import { createMiddlewareClient } from '@patina/supabase/client';
import { NextResponse } from 'next/server';

jest.mock('@patina/supabase/client', () => ({
  createMiddlewareClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(() => ({
      cookies: { getAll: () => [] },
    })),
    redirect: jest.fn((url: URL) => ({
      url,
      cookies: { set: jest.fn() },
    })),
  },
}));

function request(pathname: string, query = '') {
  return {
    nextUrl: {
      origin: 'http://localhost:3000',
      pathname,
      search: query ? `?${query}` : '',
      searchParams: new URLSearchParams(query),
    },
  } as never;
}

describe('Designer auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (NextResponse.next as jest.Mock).mockReturnValue({
      cookies: { getAll: () => [] },
    });
    (NextResponse.redirect as jest.Mock).mockImplementation((url: URL) => ({
      url,
      cookies: { set: jest.fn() },
    }));
    (createMiddlewareClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'designer-1' } },
        }),
      },
    });
  });

  it.each([
    ['/auth/callback', 'type=recovery&callbackUrl=%2Fauth%2Freset-password'],
    ['/auth/reset-password', 'callbackUrl=%2Fdesk'],
  ])(
    'allows an authenticated recovery session through %s',
    async (pathname, query) => {
      const response = await middleware(request(pathname, query));

      expect(NextResponse.redirect).not.toHaveBeenCalled();
      expect(response).toBeDefined();
    },
  );

  it('keeps the callback exemption limited to password recovery', async () => {
    await middleware(request('/auth/callback', 'callbackUrl=%2Fdesk'));

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL('http://localhost:3000/desk'),
    );
  });
});
