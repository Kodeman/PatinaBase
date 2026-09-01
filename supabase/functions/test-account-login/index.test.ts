// Deno tests for test-account-login (allowlisted static-OTP test-account sign-in).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/test-account-login/
//
// Tests ./lib.ts directly with injected deps — importing ./index.ts would boot
// Deno.serve (field-login-token / po-send / aesthete-ask convention). Covers:
// the method guard, missing/empty config (fail closed), allowlist miss, wrong
// code, rate limiting (before any comparison), the generic-403 shape being
// IDENTICAL across every failure mode (no allowlist-membership oracle), the
// happy path's response shape, generateLink failure, and constantTimeEqual.

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  constantTimeEqual,
  getClientIp,
  handleTestAccountLogin,
  type GenerateResult,
  type TestAccountLoginDeps,
  type TestLoginConfig,
} from './lib.ts';

const ALLOWED_EMAIL = 'tester@patina.cloud';
const CODE = '482913';

const DEFAULT_CONFIG: TestLoginConfig = {
  accounts: `${ALLOWED_EMAIL}, other-tester@patina.cloud`,
  code: CODE,
};

function makeDeps(overrides: Partial<TestAccountLoginDeps> = {}): TestAccountLoginDeps {
  return {
    getConfig: () => Promise.resolve(DEFAULT_CONFIG),
    recordAttempt: () => Promise.resolve(),
    isRateLimited: () => Promise.resolve(false),
    generateMagiclinkHash: () =>
      Promise.resolve({ tokenHash: 'HASHED_TOKEN_XYZ' } as GenerateResult),
    ...overrides,
  };
}

function req(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/functions/v1/test-account-login', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ── Method + CORS guards ─────────────────────────────────────────────────

Deno.test('OPTIONS -> 200 with CORS headers (preflight)', async () => {
  const res = await handleTestAccountLogin(req('OPTIONS'), makeDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert(res.headers.get('Access-Control-Allow-Headers')?.includes('authorization'));
});

Deno.test('non-POST -> 405', async () => {
  const res = await handleTestAccountLogin(req('GET'), makeDeps());
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, 'method_not_allowed');
});

// ── Rate limiting (before any comparison) ────────────────────────────────

Deno.test('rate limited -> 429 before config is ever read', async () => {
  let configRead = false;
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps({
      isRateLimited: () => Promise.resolve(true),
      getConfig: () => {
        configRead = true;
        return Promise.resolve(DEFAULT_CONFIG);
      },
    }),
  );
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, 'rate_limited');
  assertFalse(configRead, 'getConfig must not be called once rate-limited');
});

Deno.test('every attempt is recorded BEFORE the rate-limit check', async () => {
  const calls: string[] = [];
  await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps({
      recordAttempt: () => {
        calls.push('recordAttempt');
        return Promise.resolve();
      },
      isRateLimited: () => {
        calls.push('isRateLimited');
        return Promise.resolve(false);
      },
    }),
  );
  assertEquals(calls, ['recordAttempt', 'isRateLimited']);
});

Deno.test('recordAttempt receives the caller IP (first hop of X-Forwarded-For) and submitted email', async () => {
  let seenIp = '';
  let seenEmail: string | null = null;
  await handleTestAccountLogin(
    req(
      'POST',
      { email: ALLOWED_EMAIL, code: CODE },
      { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    ),
    makeDeps({
      recordAttempt: (ip, email) => {
        seenIp = ip;
        seenEmail = email;
        return Promise.resolve();
      },
    }),
  );
  assertEquals(seenIp, '203.0.113.7');
  assertEquals(seenEmail, ALLOWED_EMAIL);
});

Deno.test('getClientIp falls back to "unknown" with no X-Forwarded-For header', () => {
  assertEquals(getClientIp(req('POST')), 'unknown');
});

// ── Fail-closed config + generic denial shape ────────────────────────────

Deno.test('missing test_login_accounts -> 403 generic (fail closed)', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps({ getConfig: () => Promise.resolve({ accounts: null, code: CODE }) }),
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'invalid_credentials');
});

Deno.test('empty test_login_code -> 403 generic (fail closed)', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps({ getConfig: () => Promise.resolve({ accounts: ALLOWED_EMAIL, code: '' }) }),
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'invalid_credentials');
});

Deno.test('email not on the allowlist -> 403 generic', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: 'stranger@example.com', code: CODE }),
    makeDeps(),
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'invalid_credentials');
});

Deno.test('wrong code -> 403 generic', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: 'wrong-code' }),
    makeDeps(),
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'invalid_credentials');
});

Deno.test('allowlisted email but no code field -> 403 generic', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL }),
    makeDeps(),
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'invalid_credentials');
});

Deno.test('bad-email, bad-code, and missing-config bodies are byte-identical (no allowlist oracle)', async () => {
  const badEmail = await handleTestAccountLogin(
    req('POST', { email: 'stranger@example.com', code: CODE }),
    makeDeps(),
  );
  const badCode = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: 'nope' }),
    makeDeps(),
  );
  const missingConfig = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps({ getConfig: () => Promise.resolve({ accounts: null, code: null }) }),
  );
  const bodies = await Promise.all([badEmail.json(), badCode.json(), missingConfig.json()]);
  assertEquals(badEmail.status, 403);
  assertEquals(badCode.status, 403);
  assertEquals(missingConfig.status, 403);
  assertEquals(bodies[0], bodies[1]);
  assertEquals(bodies[1], bodies[2]);
});

Deno.test('email match is case-insensitive', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: 'TESTER@Patina.Cloud', code: CODE }),
    makeDeps(),
  );
  assertEquals(res.status, 200);
});

// ── Happy path + response shape ──────────────────────────────────────────

Deno.test('happy path -> 200 { token_hash } + no-store', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps(),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assertEquals(body.token_hash, 'HASHED_TOKEN_XYZ');
});

Deno.test('generateLink failure -> 403 generic (never leaks the internal error code)', async () => {
  const res = await handleTestAccountLogin(
    req('POST', { email: ALLOWED_EMAIL, code: CODE }),
    makeDeps({ generateMagiclinkHash: () => Promise.resolve({ error: 'rate_limited_upstream' }) }),
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, 'invalid_credentials');
  assertFalse('token_hash' in body);
  assertFalse('code' in body);
});

// ── constantTimeEqual ─────────────────────────────────────────────────────

Deno.test('constantTimeEqual: equal strings -> true', () => {
  assert(constantTimeEqual('482913', '482913'));
});

Deno.test('constantTimeEqual: different strings, same length -> false', () => {
  assertFalse(constantTimeEqual('482913', '482914'));
});

Deno.test('constantTimeEqual: different lengths -> false', () => {
  assertFalse(constantTimeEqual('482913', '4829130'));
  assertFalse(constantTimeEqual('short', ''));
});

Deno.test('constantTimeEqual: empty vs empty -> true', () => {
  assert(constantTimeEqual('', ''));
});
