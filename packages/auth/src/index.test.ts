import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';

const ORIGINAL_ENV = { ...process.env };
const SUPABASE_URL = 'https://bkvcixdmuyejfzcijpdg.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const SECRET = 'test-hs256-secret-at-least-32-characters-long';

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_JWT_SECRET = SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_JWT_ISSUER;
  delete process.env.SUPABASE_JWT_AUDIENCE;
  delete process.env.SUPABASE_JWKS_URL;
});

async function signToken(
  payload: Record<string, unknown> = {},
  options: { issuer?: string; audience?: string; expires?: string | number; subject?: string } = {},
) {
  const signer = new SignJWT({ role: 'authenticated', ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? 'authenticated')
    .setIssuedAt();
  if (options.subject !== '') signer.setSubject(options.subject ?? 'user-123');
  if (options.expires !== '') signer.setExpirationTime(options.expires ?? '1h');
  return signer.sign(new TextEncoder().encode(SECRET));
}

describe('verifyJwtToken', () => {
  it('accepts a scoped authenticated Supabase user JWT', async () => {
    const token = await signToken({ email: 'designer@example.com' });
    const { verifyJwtToken } = await import('./index');

    await expect(verifyJwtToken(token)).resolves.toMatchObject({
      sub: 'user-123',
      role: 'authenticated',
      iss: ISSUER,
      aud: 'authenticated',
    });
  });

  it('rejects the Supabase anon-token claim shape even when correctly signed', async () => {
    const token = await signToken(
      { role: 'anon', ref: 'bkvcixdmuyejfzcijpdg' },
      { subject: '' },
    );
    const { verifyJwtToken } = await import('./index');

    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it.each([
    ['issuer', { issuer: 'https://foreign-project.supabase.co/auth/v1' }, {}],
    ['audience', { audience: 'service_role' }, {}],
    ['role', {}, { role: 'anon' }],
  ])('rejects a token with the wrong %s', async (_claim, options, payload) => {
    const token = await signToken(payload, options);
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it('rejects a token without a subject', async () => {
    const token = await signToken({}, { subject: '' });
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it('rejects a token without an expiration', async () => {
    const token = await signToken({}, { expires: '' });
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signToken({}, { expires: Math.floor(Date.now() / 1000) - 60 });
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject('user-123')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-wrong-secret-here'));
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it('rejects an unapproved algorithm before choosing a verifier', async () => {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS384' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject('user-123')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow(/unsupported jwt algorithm/i);
  });

  it('fails closed when no configured Supabase issuer can be derived', async () => {
    delete process.env.SUPABASE_URL;
    const token = await signToken();
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow(/issuer/i);
  });

  it('routes ES256 to JWKS verification and fails closed without a JWKS URL', async () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_JWT_ISSUER = ISSUER;
    const { privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject('user-456')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow(/SUPABASE_URL/);
  });

  it('rejects malformed input', async () => {
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken('not-a-jwt')).rejects.toThrow(/malformed/i);
  });
});

function executionContext(request: Record<string, unknown>, handler = () => undefined) {
  class Controller {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as any;
}

describe('JwtAuthGuard', () => {
  it('parses the Bearer scheme case-insensitively and trusts app_metadata permissions', async () => {
    const token = await signToken({
      app_metadata: { permissions: ['projects:read'] },
      user_metadata: { permissions: ['admin:all'] },
    });
    const { JwtAuthGuard } = await import('./index');
    const request = { headers: { authorization: `bEaReR ${token}` } };

    await expect(new JwtAuthGuard().canActivate(executionContext(request))).resolves.toBe(true);
    expect((request as any).user.permissions).toEqual(['projects:read']);
  });
});

describe('PermissionsGuard', () => {
  it('allows undecorated routes', async () => {
    const { PermissionsGuard } = await import('./index');
    expect(new PermissionsGuard().canActivate(executionContext({}))).toBe(true);
  });

  it('requires every permission from trusted app_metadata-derived request.user permissions', async () => {
    const { PermissionsGuard, PERMISSIONS_KEY } = await import('./index');
    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_KEY, ['projects:read', 'projects:write'], handler);

    expect(
      new PermissionsGuard().canActivate(
        executionContext(
          { user: { permissions: ['projects:read', 'projects:write'] } },
          handler,
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ['no authenticated user', {}],
    ['no permission claim', { user: {} }],
    ['only some permissions', { user: { permissions: ['projects:read'] } }],
  ])('denies a decorated route with %s', async (_case, request) => {
    const { PermissionsGuard, PERMISSIONS_KEY } = await import('./index');
    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_KEY, ['projects:read', 'projects:write'], handler);
    expect(new PermissionsGuard().canActivate(executionContext(request, handler))).toBe(false);
  });

  it('default-denies an empty permission decorator', async () => {
    const { PermissionsGuard, PERMISSIONS_KEY } = await import('./index');
    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_KEY, [], handler);
    expect(new PermissionsGuard().canActivate(executionContext({ user: {} }, handler))).toBe(false);
  });
});
