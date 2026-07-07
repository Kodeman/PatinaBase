import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';

// Snapshot the env once so each test can restore a clean slate. verifyJwtToken
// caches its secret/JWKS resolver at module scope (mirroring the existing
// `cachedSecret` pattern), so we force a fresh module instance per test via
// vi.resetModules() + a dynamic import — this resets both caches without
// adding a test-only reset seam to the production API.
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SUPABASE_JWT_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_JWKS_URL;
});

describe('verifyJwtToken — HS256 (self-hosted / local Supabase)', () => {
  it('verifies a token signed with the shared secret and returns its payload', async () => {
    const secretString = 'test-hs256-secret-at-least-32-characters-long';
    process.env.SUPABASE_JWT_SECRET = secretString;

    const token = await new SignJWT({
      sub: 'user-123',
      email: 'designer@example.com',
      role: 'authenticated',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secretString));

    const { verifyJwtToken } = await import('./index');
    const payload = await verifyJwtToken(token);

    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('designer@example.com');
    expect(payload.role).toBe('authenticated');
  });

  it('rejects a token signed with a different secret than SUPABASE_JWT_SECRET', async () => {
    process.env.SUPABASE_JWT_SECRET = 'the-correct-secret-that-is-long-enough-12345';

    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-wrong-secret-here'));

    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });

  it('does not require SUPABASE_URL for the HS256 path', async () => {
    const secretString = 'another-hs256-secret-at-least-32-chars-long';
    process.env.SUPABASE_JWT_SECRET = secretString;
    // SUPABASE_URL intentionally left unset.

    const token = await new SignJWT({ sub: 'user-789' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secretString));

    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).resolves.toMatchObject({ sub: 'user-789' });
  });
});

describe('verifyJwtToken — ES256/RS256 (Supabase Cloud, asymmetric)', () => {
  it('routes an ES256 token to the asymmetric branch and fails closed without SUPABASE_URL/SUPABASE_JWKS_URL', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ sub: 'user-456' })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    // Deliberately no SUPABASE_URL / SUPABASE_JWKS_URL set, and no
    // SUPABASE_JWT_SECRET either — proves the asymmetric branch doesn't
    // fall back to (or require) the HS256 secret.
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken(token)).rejects.toThrow(/SUPABASE_URL/);
  });
});

describe('verifyJwtToken — malformed input', () => {
  it('throws a clear error when the token cannot be decoded', async () => {
    const { verifyJwtToken } = await import('./index');
    await expect(verifyJwtToken('not-a-jwt')).rejects.toThrow(/malformed/i);
  });
});
