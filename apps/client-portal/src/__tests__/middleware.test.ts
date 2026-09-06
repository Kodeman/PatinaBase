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
    (NextResponse.redirect as jest.Mock).mockImplementation(
      (url: URL, status?: number) => ({
        url,
        status,
        headers: new Headers(),
        cookies: { set: jest.fn() },
      }),
    );
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

  it('rejects an authenticated open redirect and falls back to the house', async () => {
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
    expect(redirectUrl.pathname).toBe('/');
    expect(redirectUrl.host).toBe('localhost:3002');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // `/` used to be a bare redirect to `/projects`; it now renders the client's
  // house, so it must carry `/projects`' two gates — the signed-out redirect
  // and the portal-role check — or a designer holding the .patina.cloud SSO
  // cookie lands on the client shell instead of /wrong-portal.
  it('sends an unauthenticated visitor at the front door to sign-in', async () => {
    await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/',
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never);

    const redirectUrl = (NextResponse.redirect as jest.Mock).mock
      .calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/auth/signin');
    expect(redirectUrl.searchParams.get('callbackUrl')).toBe('/');
  });

  it('runs the portal-role gate at the front door and bounces a wrong-portal role', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    (createMiddlewareClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: { id: 'designer-1' } } }),
      },
    });
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({
            data: [{ roles: { domain: 'designer' } }],
            error: null,
          }),
        })),
      })),
    });

    await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/',
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never);

    const redirectUrl = (NextResponse.redirect as jest.Mock).mock
      .calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/wrong-portal');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('lets a consumer through the front door untouched', async () => {
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

    const response = (await middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname: '/',
        search: '',
        searchParams: new URLSearchParams(),
      },
    } as never)) as unknown as { headers: Map<string, string> };

    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(response.headers.get('x-patina-role-check')).toBeUndefined();
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

/**
 * The retirement map. Every authenticated address the old portal had is folded
 * onto a section of the one project page; these cases are the contract that
 * mail, SMS, cron and Universal Links sent before the cutover still land right.
 */
describe('client middleware retired-route map', () => {
  const authenticatedConsumer = () => {
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
  };

  const visit = async (pathname: string, query = '') =>
    middleware({
      headers: new Headers({ host: 'localhost:3002' }),
      nextUrl: {
        origin: 'http://localhost:3002',
        pathname,
        search: query ? `?${query}` : '',
        searchParams: new URLSearchParams(query),
      },
    } as never);

  const lastRedirect = () => {
    const calls = (NextResponse.redirect as jest.Mock).mock.calls;
    const [url, status] = calls[calls.length - 1] as [URL, number | undefined];
    const results = (NextResponse.redirect as jest.Mock).mock.results;
    const response = results[results.length - 1]?.value as
      | { headers: Headers }
      | undefined;
    return { url, status, headers: response?.headers };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (NextResponse.next as jest.Mock).mockReturnValue({
      headers: new Map(),
      cookies: { getAll: () => [] },
    });
    (NextResponse.redirect as jest.Mock).mockImplementation(
      (url: URL, status?: number) => ({
        url,
        status,
        headers: new Headers(),
        cookies: { set: jest.fn() },
      }),
    );
    authenticatedConsumer();
  });

  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // Every mapped path without an id.
  it.each([
    ['/today', '/', '#doorstep'],
    ['/decisions', '/', '#doorstep'],
    ['/reviews', '/', '#doorstep'],
    ['/scans', '/', '#doorstep'],
    ['/proposals', '/', '#door'],
    ['/invoices', '/', '#letterbox'],
    ['/budget', '/', '#ledger'],
    ['/documents', '/', '#mat-papers'],
    ['/orders', '/', '#road'],
    ['/messages', '/', '#note'],
    ['/inbox', '/', '#note'],
    ['/account', '/', '#mat'],
    ['/preferences', '/', '#mat'],
    ['/settings/notifications', '/', '#mat'],
    ['/projects', '/', ''],
  ])('folds %s onto %s%s', async (pathname, expectedPath, expectedHash) => {
    await visit(pathname);
    const { url, status } = lastRedirect();
    expect(status).toBe(308);
    expect(url.pathname).toBe(expectedPath);
    expect(url.hash).toBe(expectedHash);
    expect(url.origin).toBe('http://localhost:3002');
  });

  // Every mapped path WITH an id.
  it.each([
    ['/decisions/dec-1', '/', '#approval-dec-1'],
    ['/proposals/prop-1', '/', '#door'],
    ['/proposals/prop-1/sign', '/', '#door'],
    ['/invoices/inv-1', '/', '#letterbox'],
    // W3b (00574): the printable sheet is retired; the old print URL now
    // folds exactly like `/invoices/<id>`.
    ['/invoices/inv-1/print', '/', '#letterbox'],
    ['/messages/thread-1', '/', '#note'],
    ['/scans/scan-1', '/', '#doorstep'],
    ['/settings/notifications/thread-1', '/', '#mat'],
  ])('folds %s onto %s%s', async (pathname, expectedPath, expectedHash) => {
    await visit(pathname);
    const { url, status } = lastRedirect();
    expect(status).toBe(308);
    expect(url.pathname).toBe(expectedPath);
    expect(url.hash).toBe(expectedHash);
  });

  it('names the invoice so the letterbox opens on the one the mail was about', async () => {
    await visit('/invoices/inv-1');
    const { url } = lastRedirect();
    expect(url.searchParams.get('invoice')).toBe('inv-1');
  });

  it('carries the project id when the old URL had one', async () => {
    await visit('/projects/proj-1/reviews/edition-1');
    const { url, status } = lastRedirect();
    expect(status).toBe(308);
    expect(url.pathname).toBe('/projects/proj-1');
    expect(url.hash).toBe('#doorstep');
  });

  // The edition id is the only way to the ask: the editions table is
  // studio-only by RLS, so the emailed link is the client's sole route in.
  // A 308 with no ceiling can be cached by a browser or an intermediary for
  // good; the anchors are a design decision and will move.
  // `private` matters as much as the ceiling: the fold copies the refreshed
  // Supabase auth cookies onto the redirect, so a response marked cacheable by
  // `max-age` alone invites an intermediary to hold one homeowner's session
  // and serve it to the next reader of the same URL.
  it('puts a private ceiling on how long a fold may be cached', async () => {
    await visit('/invoices');
    expect(lastRedirect().headers?.get('Cache-Control')).toBe('private, max-age=3600');
  });

  it('carries the edition id the review mail was sent about', async () => {
    await visit('/projects/proj-1/reviews/edition-1');
    const { url } = lastRedirect();
    expect(url.searchParams.get('review')).toBe('edition-1');
  });

  it('carries no review param when the old URL named no edition', async () => {
    await visit('/projects/proj-1/reviews');
    const { url } = lastRedirect();
    expect(url.searchParams.get('review')).toBeNull();
  });

  it('folds the scope-change tree onto its own house', async () => {
    await visit('/projects/proj-1/scope-change/new');
    const { url, status } = lastRedirect();
    expect(status).toBe(308);
    expect(url.pathname).toBe('/projects/proj-1');
    expect(url.hash).toBe('#doorstep');
  });

  it('carries the project id from the reviews index too', async () => {
    await visit('/projects/proj-1/reviews');
    const { url } = lastRedirect();
    expect(url.pathname).toBe('/projects/proj-1');
    expect(url.hash).toBe('#doorstep');
  });

  it("preserves the till's query when folding a Stripe return", async () => {
    await visit('/invoices/inv-1', 'checkout=success&session_id=cs_1');
    const { url } = lastRedirect();
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('checkout')).toBe('success');
    expect(url.searchParams.get('session_id')).toBe('cs_1');
    expect(url.searchParams.get('invoice')).toBe('inv-1');
    expect(url.hash).toBe('#letterbox');
  });

  it('preserves ?order= when folding a direct-order return', async () => {
    await visit('/orders', 'order=ord-1&checkout=success');
    const { url } = lastRedirect();
    expect(url.searchParams.get('order')).toBe('ord-1');
    expect(url.hash).toBe('#road');
  });

  it.each([
    '/projects/proj-1',
    '/piece/abc',
    '/quiz',
  ])('leaves %s alone', async (pathname) => {
    await visit(pathname);
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it('lands sign-in on the active project page, not the retired list', async () => {
    await visit('/auth/signin');
    const { url } = lastRedirect();
    expect(url.pathname).toBe('/');
    expect(url.origin).toBe('http://localhost:3002');
  });

  it('lets a signed-out recipient reach /preferences/unsubscribe without a sign-in wall', async () => {
    (createMiddlewareClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const response = await visit('/preferences/unsubscribe', 'token=abc');
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(response).toBeDefined();
  });

  it('does not fold /preferences/unsubscribe for a signed-in recipient either', async () => {
    await visit('/preferences/unsubscribe');
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to sign-in with the old path, so the anchor survives the round trip', async () => {
    (createMiddlewareClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
    await visit('/invoices/inv-1', 'checkout=success');
    const { url } = lastRedirect();
    expect(url.pathname).toBe('/auth/signin');
    expect(url.searchParams.get('callbackUrl')).toBe(
      '/invoices/inv-1?checkout=success',
    );
  });

  it('still sends a wrong-role user to the interstitial instead of folding', async () => {
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({
            data: [{ roles: { domain: 'designer' } }],
            error: null,
          }),
        })),
      })),
    });
    await visit('/invoices/inv-1');
    const { url } = lastRedirect();
    expect(url.pathname).toBe('/wrong-portal');
  });
});
