import { middleware } from '../middleware';
import {
  createAdminClient,
  createMiddlewareClient,
} from '@patina/supabase/client';
import { NextResponse } from 'next/server';

jest.mock('@patina/supabase/client', () => ({
  createMiddlewareClient: jest.fn(),
  createAdminClient: jest.fn(),
}));
jest.mock('@/lib/env', () => ({ env: { isProduction: false } }));
jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(() => ({
      headers: new Map(),
      cookies: { getAll: () => [] },
    })),
    redirect: jest.fn(),
  },
}));

describe('client middleware Universal Link exemption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (NextResponse.next as jest.Mock).mockReturnValue({
      headers: new Map(),
      cookies: { getAll: () => [] },
    });
    (NextResponse.redirect as jest.Mock).mockImplementation((url: URL) => ({
      url,
      cookies: { set: jest.fn() },
    }));
    (createMiddlewareClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
  });

  it('passes the AASA document through before any auth lookup or redirect', async () => {
    const response = await middleware({
      headers: new Headers(),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/.well-known/apple-app-site-association',
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never);
    expect(response).toBeDefined();
    expect(createMiddlewareClient).not.toHaveBeenCalled();
  });

  it('stamps no-store + noindex headers on the /plans bearer surface', async () => {
    const response = (await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: `/plans/${'a'.repeat(64)}`,
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never)) as unknown as { headers: Map<string, string> };

    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('does not stamp bearer-surface cache headers on ordinary public pages', async () => {
    const response = (await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: `/share/${'a'.repeat(64)}`,
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never)) as unknown as { headers: Map<string, string> };

    expect(response.headers.get('Cache-Control')).toBeUndefined();
  });

  it('lets an unauthenticated guest through to /rfq/[token] without a sign-in redirect', async () => {
    const response = await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: `/rfq/${'a'.repeat(64)}`,
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never);
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(response).toBeDefined();
  });

  it('preserves pathname and query in the post-sign-in callback', async () => {
    await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/invoices/invoice-1',
        search: '?checkout=success&session_id=cs_1',
        searchParams: new URLSearchParams('checkout=success&session_id=cs_1'),
      },
    } as never);

    const redirectUrl = (NextResponse.redirect as jest.Mock).mock
      .calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/auth/signin');
    expect(redirectUrl.searchParams.get('callbackUrl')).toBe(
      '/invoices/invoice-1?checkout=success&session_id=cs_1',
    );
  });

  it.each([
    ['/auth/callback', 'type=recovery&code=pkce'],
    ['/auth/reset-password', ''],
  ])(
    'allows an authenticated recovery session through %s',
    async (pathname, query) => {
      (createMiddlewareClient as jest.Mock).mockReturnValue({
        auth: {
          getUser: jest
            .fn()
            .mockResolvedValue({ data: { user: { id: 'client-1' } } }),
        },
      });
      const response = await middleware({
        headers: new Headers({ host: 'localhost:3002' }),
        nextUrl: {
          origin: 'http://localhost:3002',
          pathname,
          search: query ? `?${query}` : '',
          searchParams: new URLSearchParams(query),
        },
      } as never);
      expect(NextResponse.redirect).not.toHaveBeenCalled();
      expect(response).toBeDefined();
    },
  );

  it('rejects an authenticated open redirect and falls back to projects', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    (createMiddlewareClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: { id: 'client-1' } } }),
      },
    });
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({
            data: [{ roles: { domain: 'consumer' } }],
            error: null,
          }),
        })),
      })),
    });
    await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/auth/signin',
        search: '?callbackUrl=https%3A%2F%2Fevil.test',
        searchParams: new URLSearchParams(
          'callbackUrl=https%3A%2F%2Fevil.test',
        ),
      },
    } as never);
    const redirectUrl = (NextResponse.redirect as jest.Mock).mock
      .calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/projects');
    expect(redirectUrl.host).toBe('localhost:3002');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('does not let RSC headers bypass anonymous authentication', async () => {
    await middleware({
      headers: new Headers({ host: 'localhost:3002', rsc: '1' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/projects',
        search: '?view=active',
        searchParams: new URLSearchParams('view=active'),
      },
    } as never);

    const redirectUrl = (NextResponse.redirect as jest.Mock).mock
      .calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/auth/signin');
    expect(redirectUrl.searchParams.get('callbackUrl')).toBe(
      '/projects?view=active',
    );
  });

  it('ignores a spoofed forwarded host when building auth redirects', async () => {
    await middleware({
      headers: new Headers({
        host: 'localhost:3002',
        'x-forwarded-host': 'evil.test',
        'x-forwarded-proto': 'https',
      }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/projects',
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never);

    const redirectUrl = (NextResponse.redirect as jest.Mock).mock
      .calls[0][0] as URL;
    expect(redirectUrl.origin).toBe('http://localhost:3002');
  });
});
