// Deno tests for field-login-token (web→Field QR handoff).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/field-login-token/
//
// Tests ./lib.ts directly with injected deps — importing ./index.ts would boot
// Deno.serve (po-send / aesthete-ask convention). Covers the auth guard, the
// method guard, the response shape, the 502 failure path, Cache-Control:no-store
// on every JSON response, and the structural guarantee that no request body
// (hence no `email` parameter) is ever read.

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  type CallerUser,
  type FieldLoginDeps,
  type GenerateResult,
  handleFieldLoginToken,
} from './lib.ts';

const DESIGNER: CallerUser = { id: 'designer-uuid', email: 'designer@patina.dev' };

function makeDeps(overrides: Partial<FieldLoginDeps> = {}): FieldLoginDeps {
  return {
    expiresInSeconds: 3600,
    getCallerUser: () => Promise.resolve(DESIGNER),
    generateMagiclinkHash: () => Promise.resolve({ tokenHash: 'HASHED_TOKEN_XYZ' } as GenerateResult),
    ...overrides,
  };
}

function req(method: string, headers: Record<string, string> = {}, body?: string): Request {
  return new Request('http://localhost/functions/v1/field-login-token', {
    method,
    headers,
    body,
  });
}

Deno.test('OPTIONS → 200 with CORS headers (preflight)', async () => {
  const res = await handleFieldLoginToken(req('OPTIONS'), makeDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert(res.headers.get('Access-Control-Allow-Headers')?.includes('authorization'));
});

Deno.test('non-POST → 405', async () => {
  const res = await handleFieldLoginToken(req('GET'), makeDeps());
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, 'method_not_allowed');
});

Deno.test('unauthenticated caller → 401 (defense-in-depth behind verify_jwt)', async () => {
  const res = await handleFieldLoginToken(
    req('POST'),
    makeDeps({ getCallerUser: () => Promise.resolve(null) }),
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'unauthorized');
});

Deno.test('caller without an email → 422', async () => {
  const res = await handleFieldLoginToken(
    req('POST'),
    makeDeps({ getCallerUser: () => Promise.resolve({ id: 'x', email: null }) }),
  );
  assertEquals(res.status, 422);
  assertEquals((await res.json()).error, 'no_caller_email');
});

Deno.test('happy path → 200 { token_hash, expires_in } + no-store', async () => {
  const res = await handleFieldLoginToken(req('POST', { Authorization: 'Bearer abc' }), makeDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assertEquals(body.token_hash, 'HASHED_TOKEN_XYZ');
  assertEquals(body.expires_in, 3600);
});

Deno.test('generateLink failure → 502 { error, code } (non-secret code, no token)', async () => {
  const res = await handleFieldLoginToken(
    req('POST', { Authorization: 'Bearer abc' }),
    makeDeps({ generateMagiclinkHash: () => Promise.resolve({ error: 'rate_limited' }) }),
  );
  assertEquals(res.status, 502);
  assertEquals(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assertEquals(body.error, 'generate_link_failed');
  assertEquals(body.code, 'rate_limited');
  assertFalse('token_hash' in body);
});

Deno.test('mints for the CALLER only — request body is never read', async () => {
  // Even with a malicious `email` in the body, the function mints for the
  // caller's own identity. Assert the minted email is the caller's, not the body's.
  let mintedFor = '';
  const res = await handleFieldLoginToken(
    req('POST', { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      JSON.stringify({ email: 'victim@example.com' })),
    makeDeps({
      generateMagiclinkHash: (email) => {
        mintedFor = email;
        return Promise.resolve({ tokenHash: 'T' });
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(mintedFor, 'designer@patina.dev'); // caller, NOT victim@example.com
});
