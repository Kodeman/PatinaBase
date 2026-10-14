/**
 * @jest-environment node
 */
// Runs the real middleware through the real @supabase/ssr + auth-js stack.
// Only the network (global fetch) and the service-role role query are faked,
// so getClaims() really refreshes, really verifies ES256 signatures with
// WebCrypto and really caches the JWKS. Each test re-imports the modules for a
// fresh auth-js JWKS cache.
import type { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

const ORIGIN = 'http://localhost:3000';
const SUPABASE_URL = 'http://supabase.test';
const SUB = '6c1f3a52-0d0c-4a7e-9b41-1f2d3e4c5b6a';
// Pinned to @supabase/auth-js 2.98.0 dist/main/lib/constants.js:30. If an SDK
// upgrade changes the window, the revoked-key test fails and this bound (and
// the comment on getVerifiedUserId) must be re-derived.
const JWKS_TTL_MS = 10 * 60 * 1000;

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

jest.mock('@patina/supabase/client', () => ({
  ...jest.requireActual('@patina/supabase/client'),
  createAdminClient: jest.fn(),
}));

type SigningKey = { kid: string; privateKey: CryptoKey; jwk: JsonWebKey };

const b64url = (input: string | Uint8Array) => Buffer.from(input).toString('base64url');

async function makeSigningKey(kid: string): Promise<SigningKey> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return { kid, privateKey, jwk: { ...jwk, kid, alg: 'ES256', use: 'sig' } as JsonWebKey };
}

async function signEs256(key: SigningKey, payload: object): Promise<string> {
  const input = `${b64url(JSON.stringify({ alg: 'ES256', kid: key.kid, typ: 'JWT' }))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

let now = 0;
const nowSec = () => Math.floor(now / 1000);
const claims = (overrides: object = {}) => ({
  sub: SUB,
  aud: 'authenticated',
  role: 'authenticated',
  session_id: 'session-1',
  iat: nowSec(),
  exp: nowSec() + 3600,
  ...overrides,
});

// Fake Strata Auth: the JWKS it publishes, how /user answers a token, and how
// a refresh-token grant answers.
let published: JsonWebKey[];
let userEndpoint: (token: string) => Response;
let refreshGrant: () => Promise<Response>;
let calls: { jwks: number; user: number; refresh: number };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const rejectToken = () => json({ code: 'bad_jwt', msg: 'invalid JWT' }, 403);

let middlewareModule: typeof import('../middleware');
let NextRequestCtor: typeof NextRequest;
let createAdminClient: jest.Mock;
let storageKey: string;
let roleLookup: jest.Mock;

function grantRoles(rows: unknown[]) {
  roleLookup = jest.fn(() => ({ in: jest.fn(async () => ({ data: rows })) }));
  createAdminClient.mockReturnValue({ from: () => ({ select: () => ({ eq: roleLookup }) }) });
}

function sessionCookie(accessToken: string, expiresAt = nowSec() + 3600) {
  const session = {
    access_token: accessToken,
    refresh_token: 'refresh-token-1',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: SUB, aud: 'authenticated', role: 'authenticated' },
  };
  return `${storageKey}=base64-${b64url(JSON.stringify(session))}`;
}

function run(path: string, cookie?: string) {
  return middlewareModule.middleware(
    new NextRequestCtor(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }),
  );
}

function expectPassThrough(res: Response) {
  expect(res.headers.get('location')).toBeNull();
  expect(res.headers.get('x-middleware-next')).toBe('1');
}

function expectRedirect(res: Response, target: string) {
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe(`${ORIGIN}${target}`);
}

const expectSignIn = (res: Response, from = '/desk') =>
  expectRedirect(res, `/auth/signin?callbackUrl=${encodeURIComponent(from)}`);

let keyA: SigningKey;
let keyB: SigningKey;

beforeAll(async () => {
  keyA = await makeSigningKey('key-a');
  keyB = await makeSigningKey('key-b');
});

beforeEach(async () => {
  now = Date.UTC(2026, 9, 14, 12, 0, 0);
  jest.spyOn(Date, 'now').mockImplementation(() => now);

  published = [keyA.jwk];
  userEndpoint = rejectToken;
  refreshGrant = async () =>
    json({ code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400);
  calls = { jwks: 0, user: 0, refresh: 0 };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/.well-known/jwks.json') {
      calls.jwks += 1;
      return json({ keys: published });
    }
    if (url.pathname === '/auth/v1/user') {
      calls.user += 1;
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      return userEndpoint(auth.replace(/^Bearer /, ''));
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      calls.refresh += 1;
      return refreshGrant();
    }
    throw new Error(`unexpected fetch ${url.href}`);
  }) as typeof fetch;

  jest.resetModules();
  middlewareModule = await import('../middleware');
  ({ NextRequest: NextRequestCtor } = await import('next/server'));
  const client = await import('@patina/supabase/client');
  createAdminClient = client.createAdminClient as unknown as jest.Mock;
  storageKey = client.SUPABASE_AUTH_STORAGE_KEY;
  grantRoles([{ roles: { domain: 'designer' } }]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Designer auth middleware: getClaims session verification', () => {
  it('signed-out: a protected page redirects to sign-in without any Auth call', async () => {
    expectSignIn(await run('/desk?book=orders', undefined), '/desk?book=orders');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('verifies a valid ES256 session locally: one JWKS fetch, no /user round-trip, cached after', async () => {
    const cookie = sessionCookie(await signEs256(keyA, claims()));

    expectPassThrough(await run('/desk', cookie));
    now += 60_000;
    expectPassThrough(await run('/doc/abc', cookie));

    expect(calls).toEqual({ jwks: 1, user: 0, refresh: 0 });
    expect(roleLookup).toHaveBeenCalledWith('user_id', SUB);
  });

  it('expired: an expired session is refreshed and the refreshed cookie is written', async () => {
    const stale = sessionCookie(await signEs256(keyA, claims({ exp: nowSec() - 60 })), nowSec() - 60);
    refreshGrant = async () =>
      json({
        access_token: await signEs256(keyA, claims()),
        refresh_token: 'refresh-token-2',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: nowSec() + 3600,
        user: { id: SUB, aud: 'authenticated', role: 'authenticated' },
      });

    const res = await run('/desk', stale);

    expectPassThrough(res);
    expect(calls).toEqual({ jwks: 1, user: 0, refresh: 1 });
    expect(res.headers.get('set-cookie')).toContain(`${storageKey}=base64-`);
  });

  it('expired: a session whose refresh is rejected is signed out', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {}); // auth-js logs the rejected grant
    const stale = sessionCookie(await signEs256(keyA, claims({ exp: nowSec() - 60 })), nowSec() - 60);

    expectSignIn(await run('/desk', stale));
    expect(calls).toEqual({ jwks: 0, user: 0, refresh: 1 });
    expect(roleLookup).not.toHaveBeenCalled();
  });

  it('expired: an access token past its own exp is signed out, not a 500', async () => {
    // The cookie claims a fresh session, so nothing refreshes; the token's
    // own exp makes getClaims throw a plain Error.
    const lying = sessionCookie(await signEs256(keyA, claims({ exp: nowSec() - 60 })));

    expectSignIn(await run('/desk', lying));
    expect(calls.refresh).toBe(0);
  });

  it('tampered: a payload edited after signing fails local verification', async () => {
    const [header, , signature] = (await signEs256(keyA, claims())).split('.');
    const forged = `${header}.${b64url(JSON.stringify(claims({ sub: 'someone-else' })))}.${signature}`;

    expectSignIn(await run('/desk', sessionCookie(forged)));
    expect(calls).toEqual({ jwks: 1, user: 0, refresh: 0 });
    expect(roleLookup).not.toHaveBeenCalled();
  });

  it('revoked known key: trusted only inside the JWKS cache window, rejected once it refreshes', async () => {
    const cookie = sessionCookie(await signEs256(keyA, claims()));
    expectPassThrough(await run('/desk', cookie));
    expect(calls.jwks).toBe(1);

    // Strata revokes key A: it leaves the JWKS and Auth rejects its tokens.
    published = [keyB.jwk];
    userEndpoint = rejectToken;

    now += JWKS_TTL_MS - 1_000;
    expectPassThrough(await run('/desk', cookie));
    expect(calls).toEqual({ jwks: 1, user: 0, refresh: 0 });

    now += 2_000;
    expectSignIn(await run('/desk', cookie));
    expect(calls).toEqual({ jwks: 2, user: 1, refresh: 0 });
  });

  it('rotated new key: an unknown kid refetches the JWKS at once and verifies locally', async () => {
    expectPassThrough(await run('/desk', sessionCookie(await signEs256(keyA, claims()))));
    expect(calls.jwks).toBe(1);

    // Strata rotates: key B starts signing well inside key A's cache window.
    published = [keyB.jwk, keyA.jwk];
    now += 60_000;

    expectPassThrough(await run('/desk', sessionCookie(await signEs256(keyB, claims()))));
    expect(calls).toEqual({ jwks: 2, user: 0, refresh: 0 });
  });

  it('HS256: a symmetric token falls back to the Auth server', async () => {
    const hs256 = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
      JSON.stringify(claims()),
    )}.${b64url('not-checked-locally')}`;
    const cookie = sessionCookie(hs256);

    userEndpoint = (token) =>
      token === hs256 ? json({ id: SUB, aud: 'authenticated', role: 'authenticated' }) : rejectToken();
    expectPassThrough(await run('/desk', cookie));

    userEndpoint = rejectToken;
    expectSignIn(await run('/desk', cookie));

    expect(calls).toEqual({ jwks: 0, user: 2, refresh: 0 });
  });

  it('API routes pass through signed out: the handler decides, no Auth call or role query', async () => {
    expectPassThrough(await run('/api/orders'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(roleLookup).not.toHaveBeenCalled();
  });

  it('API routes still get an expired session cookie refreshed and handed to the handler', async () => {
    // proxyToBackend reads the cookie token as-is, so this refresh is what
    // keeps an expired session from turning into a 401.
    const stale = sessionCookie(await signEs256(keyA, claims({ exp: nowSec() - 60 })), nowSec() - 60);
    refreshGrant = async () =>
      json({
        access_token: await signEs256(keyA, claims()),
        refresh_token: 'refresh-token-2',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: nowSec() + 3600,
        user: { id: SUB, aud: 'authenticated', role: 'authenticated' },
      });

    const res = await run('/api/projects/abc/tasks', stale);

    expectPassThrough(res);
    expect(calls.refresh).toBe(1);
    expect(res.headers.get('x-middleware-set-cookie')).toContain(`${storageKey}=base64-`);
    expect(roleLookup).not.toHaveBeenCalled();
  });

  it('role still enforced: a verified user without a designer/admin role goes to /unauthorized', async () => {
    grantRoles([]);

    expectRedirect(await run('/desk', sessionCookie(await signEs256(keyA, claims()))), '/unauthorized');
    expect(roleLookup).toHaveBeenCalledWith('user_id', SUB);
  });
});

describe('Designer auth middleware: page routing', () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = sessionCookie(await signEs256(keyA, claims()));
  });

  it.each([
    ['/auth/callback', 'type=recovery&callbackUrl=%2Fauth%2Freset-password'],
    ['/auth/reset-password', 'callbackUrl=%2Fdesk'],
  ])('allows an authenticated recovery session through %s', async (pathname, query) => {
    expectPassThrough(await run(`${pathname}?${query}`, cookie));
  });

  it('keeps the callback exemption limited to password recovery', async () => {
    expectRedirect(await run('/auth/callback?callbackUrl=%2Fdesk', cookie), '/desk');
  });

  describe('legal pages (/privacy, /terms, /pilot-terms)', () => {
    it.each(['/privacy', '/terms', '/pilot-terms'])(
      'passes a signed-out visitor through %s without a signin redirect',
      async (pathname) => {
        expectPassThrough(await run(pathname));
      },
    );

    it.each(['/privacy', '/terms', '/pilot-terms'])(
      'does not bounce a signed-in designer away from %s',
      async (pathname) => {
        expectPassThrough(await run(pathname, cookie));
      },
    );
  });
});

describe('Designer auth middleware: matcher', () => {
  const matches = (url: string, headers: Record<string, string> = {}) =>
    unstable_doesMiddlewareMatch({ config: middlewareModule.config, url, headers });

  it.each(['/api/orders', '/api/projects/abc/phases?x=1'])(
    'still runs for API route %s (cookie refresh)',
    (url) => {
      expect(matches(url)).toBe(true);
    },
  );

  it.each(['/desk', '/doc/abc', '/auth/signin', '/'])('runs for page %s', (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each(['1', '2'])('skips a router prefetch (next-router-prefetch: %s)', (value) => {
    expect(matches('/desk', { rsc: '1', 'next-router-prefetch': value })).toBe(false);
  });

  it('still runs for a non-prefetch RSC navigation', () => {
    expect(matches('/desk', { rsc: '1' })).toBe(true);
  });
});
