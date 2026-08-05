import { middleware } from '../middleware';

const mockGetUser = jest.fn();
const mockGetAssuranceLevel = jest.fn();
const mockCreateClient = jest.fn();

let mockAdminRoles: Array<{ role_id: string; roles: { domain: string } }> = [
  { role_id: 'admin-role', roles: { domain: 'admin' } },
];
let mockProfile: { mfa_enforced?: boolean } | null = { mfa_enforced: false };
let mockRoleError: Error | null = null;
let mockProfileError: Error | null = null;

jest.mock('@patina/supabase/client', () => ({
  createMiddlewareClient: () => ({
    auth: {
      getUser: mockGetUser,
      mfa: { getAuthenticatorAssuranceLevel: mockGetAssuranceLevel },
    },
  }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

jest.mock('next/server', () => {
  class HeaderBag {
    private values = new Map<string, string>();

    constructor(location?: string) {
      if (location) this.values.set('location', location);
    }

    get(name: string) {
      return this.values.get(name.toLowerCase()) ?? null;
    }
  }

  class MockNextResponse {
    status: number;
    headers: HeaderBag;
    cookies = {
      getAll: () => [],
      set: jest.fn(),
    };

    constructor(status: number, location?: string) {
      this.status = status;
      this.headers = new HeaderBag(location);
    }

    static next() {
      return new MockNextResponse(200);
    }

    static redirect(url: URL) {
      return new MockNextResponse(307, url.toString());
    }
  }

  return { NextResponse: MockNextResponse };
});

function request(url: string, headerValues: Record<string, string> = {}) {
  return {
    nextUrl: new URL(url),
    headers: {
      get: (name: string) => headerValues[name.toLowerCase()] ?? null,
    },
  } as never;
}

function redirectedTo(response: {
  headers: { get(name: string): string | null };
}): URL | null {
  const location = response.headers.get('location');
  return location ? new URL(location) : null;
}

describe('Admin auth middleware', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    mockAdminRoles = [{ role_id: 'admin-role', roles: { domain: 'admin' } }];
    mockProfile = { mfa_enforced: false };
    mockRoleError = null;
    mockProfileError = null;
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    mockCreateClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'user_roles') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: mockAdminRoles,
                  error: mockRoleError,
                }),
              }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: mockProfile,
                  error: mockProfileError,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('preserves pathname and query when sending an anonymous user to sign in', async () => {
    const response = await middleware(
      request('https://admin.patina.cloud/orders?state=late&page=2'),
    );
    const location = redirectedTo(response);

    expect(response.status).toBe(307);
    expect(location?.pathname).toBe('/auth/signin');
    expect(location?.searchParams.get('callbackUrl')).toBe(
      '/orders?state=late&page=2',
    );
  });

  it('does not let RSC or prefetch headers bypass authentication and roles', async () => {
    const anonymous = await middleware(
      request('https://admin.patina.cloud/orders', { rsc: '1' }),
    );
    expect(redirectedTo(anonymous)?.pathname).toBe('/auth/signin');

    mockGetUser.mockResolvedValue({ data: { user: { id: 'not-admin' } } });
    mockAdminRoles = [];
    const nonAdmin = await middleware(
      request('https://admin.patina.cloud/orders', {
        'next-router-prefetch': '1',
      }),
    );
    expect(redirectedTo(nonAdmin)?.pathname).toBe('/unauthorized');
  });

  it('rejects an external callback for an already authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    const response = await middleware(
      request(
        'https://admin.patina.cloud/auth/signin?callbackUrl=https%3A%2F%2Fattacker.example%2Fsteal',
      ),
    );
    const location = redirectedTo(response);

    expect(location?.origin).toBe('https://admin.patina.cloud');
    expect(location?.pathname).toBe('/dashboard');
  });

  it('allows an authenticated recovery callback and reset form to finish', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin' } } });

    const callback = await middleware(
      request(
        'https://admin.patina.cloud/auth/callback?type=recovery&code=pkce',
      ),
    );
    const reset = await middleware(
      request(
        'https://admin.patina.cloud/auth/reset-password?callbackUrl=%2Forders',
      ),
    );

    expect(callback.status).toBe(200);
    expect(callback.headers.get('location')).toBeNull();
    expect(reset.status).toBe(200);
    expect(reset.headers.get('location')).toBeNull();
  });

  it('preserves admin-domain role enforcement', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'not-admin' } } });
    mockAdminRoles = [];

    const response = await middleware(
      request('https://admin.patina.cloud/orders'),
    );

    expect(redirectedTo(response)?.pathname).toBe('/unauthorized');
  });

  it('preserves MFA enforcement and its complete return query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mockProfile = { mfa_enforced: true };

    const response = await middleware(
      request('https://admin.patina.cloud/orders?state=late&page=2'),
    );
    const location = redirectedTo(response);

    expect(location?.pathname).toBe('/auth/mfa-enroll');
    expect(location?.searchParams.get('callbackUrl')).toBe(
      '/orders?state=late&page=2',
    );
  });

  it('allows an enforced-MFA admin who is already at AAL2', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mockProfile = { mfa_enforced: true };
    mockGetAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });

    const response = await middleware(
      request('https://admin.patina.cloud/orders?state=late'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('fails closed when role-check configuration or queries are unavailable', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missingConfig = await middleware(
      request('https://admin.patina.cloud/orders'),
    );
    expect(redirectedTo(missingConfig)?.href).toContain(
      '/auth/error?error=Configuration',
    );

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    mockRoleError = new Error('role lookup unavailable');
    const roleFailure = await middleware(
      request('https://admin.patina.cloud/orders'),
    );
    expect(redirectedTo(roleFailure)?.href).toContain(
      '/auth/error?error=Configuration',
    );
  });

  it('fails closed when MFA profile or assurance checks fail', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
    mockProfileError = new Error('profile unavailable');
    const profileFailure = await middleware(
      request('https://admin.patina.cloud/orders'),
    );
    expect(redirectedTo(profileFailure)?.href).toContain(
      '/auth/error?error=Configuration',
    );

    mockProfileError = null;
    mockProfile = { mfa_enforced: true };
    mockGetAssuranceLevel.mockResolvedValue({
      data: null,
      error: new Error('aal unavailable'),
    });
    const aalFailure = await middleware(
      request('https://admin.patina.cloud/orders'),
    );
    expect(redirectedTo(aalFailure)?.href).toContain(
      '/auth/error?error=Configuration',
    );
  });
});
