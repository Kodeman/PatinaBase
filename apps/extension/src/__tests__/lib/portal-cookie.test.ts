import { describe, it, expect, beforeEach } from 'vitest';
import { readPortalSessionTokens, isSessionCookieName } from '../../lib/portal-cookie';

/**
 * Exercises readPortalSessionTokens against a fake chrome.cookies.getAll that
 * returns cookies shaped exactly the way `@supabase/ssr` writes them — base64url
 * encoded with the `base64-` prefix, optionally chunked across `<name>.0`,
 * `.1`, …. The global setup.ts attaches a `chrome` mock to globalThis but it
 * has no `cookies` namespace, so we install one per-test.
 *
 * Workstream D-B1 (docs/engineering/repoint-b0-audit.md §5): the cookie name
 * is now a pinned constant (`SUPABASE_AUTH_STORAGE_KEY` in `lib/supabase.ts`)
 * rather than derived from `PLASMO_PUBLIC_SUPABASE_URL`, so it no longer
 * varies with setup.ts's stubbed URL — see `lib/supabase.test.ts` for
 * coverage of the pin itself.
 */

const COOKIE_NAME = 'sb-bkvcixdmuyejfzcijpdg-auth-token';
const BASE64_PREFIX = 'base64-';

// ── encoder: port of @supabase/ssr stringToBase64URL (UTF-8 -> base64url, no padding) ──
const TO_BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

function stringToUTF8(str: string, emit: (byte: number) => void): void {
  for (let i = 0; i < str.length; i += 1) {
    let codepoint = str.charCodeAt(i);
    if (codepoint > 0xd7ff && codepoint <= 0xdbff) {
      const high = ((codepoint - 0xd800) * 0x400) & 0xffff;
      const low = (str.charCodeAt(i + 1) - 0xdc00) & 0xffff;
      codepoint = (low | high) + 0x10000;
      i += 1;
    }
    if (codepoint <= 0x7f) {
      emit(codepoint);
    } else if (codepoint <= 0x7ff) {
      emit(0xc0 | (codepoint >> 6));
      emit(0x80 | (codepoint & 0x3f));
    } else if (codepoint <= 0xffff) {
      emit(0xe0 | (codepoint >> 12));
      emit(0x80 | ((codepoint >> 6) & 0x3f));
      emit(0x80 | (codepoint & 0x3f));
    } else {
      emit(0xf0 | (codepoint >> 18));
      emit(0x80 | ((codepoint >> 12) & 0x3f));
      emit(0x80 | ((codepoint >> 6) & 0x3f));
      emit(0x80 | (codepoint & 0x3f));
    }
  }
}

function stringToBase64URL(str: string): string {
  const out: string[] = [];
  let queue = 0;
  let queuedBits = 0;
  stringToUTF8(str, (byte) => {
    queue = (queue << 8) | byte;
    queuedBits += 8;
    while (queuedBits >= 6) {
      out.push(TO_BASE64URL[(queue >> (queuedBits - 6)) & 63]);
      queuedBits -= 6;
    }
  });
  if (queuedBits > 0) {
    queue = queue << (6 - queuedBits);
    out.push(TO_BASE64URL[queue & 63]);
  }
  return out.join('');
}

// ── fake chrome.cookies ──
interface FakeCookie {
  name: string;
  value: string;
  domain: string;
}

function installCookies(cookies: FakeCookie[]): void {
  (globalThis as unknown as { chrome: { cookies: unknown } }).chrome.cookies = {
    getAll: () => Promise.resolve(cookies),
  };
}

const SESSION = {
  access_token: 'access-token-abc',
  refresh_token: 'refresh-token-xyz',
  expires_at: 1893456000,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'designer@example.com', name: 'Renée 😀 Désigner' },
};

function ssrCookieValue(session: unknown): string {
  return BASE64_PREFIX + stringToBase64URL(JSON.stringify(session));
}

describe('readPortalSessionTokens', () => {
  beforeEach(() => {
    installCookies([]);
  });

  it('decodes a single base64-encoded cookie', async () => {
    installCookies([{ name: COOKIE_NAME, value: ssrCookieValue(SESSION), domain: 'app.patina.cloud' }]);

    const tokens = await readPortalSessionTokens();

    expect(tokens).toEqual({
      access_token: SESSION.access_token,
      refresh_token: SESSION.refresh_token,
    });
  });

  it('recombines chunked cookies (no base cookie present)', async () => {
    const full = ssrCookieValue(SESSION);
    const mid = Math.floor(full.length / 2);
    installCookies([
      // intentionally out of order to prove ordered reassembly
      { name: `${COOKIE_NAME}.1`, value: full.slice(mid), domain: 'app.patina.cloud' },
      { name: `${COOKIE_NAME}.0`, value: full.slice(0, mid), domain: 'app.patina.cloud' },
    ]);

    const tokens = await readPortalSessionTokens();

    expect(tokens).toEqual({
      access_token: SESSION.access_token,
      refresh_token: SESSION.refresh_token,
    });
  });

  it('preserves UTF-8 user metadata through the base64url round-trip', async () => {
    installCookies([{ name: COOKIE_NAME, value: ssrCookieValue(SESSION), domain: 'app.patina.cloud' }]);
    // Sanity: the encoder/decoder round-trip keeps multibyte chars intact, so a
    // valid session is returned rather than a JSON-parse failure.
    await expect(readPortalSessionTokens()).resolves.not.toBeNull();
  });

  it('decodes a raw (non-base64) JSON cookie for back-compat', async () => {
    installCookies([
      { name: COOKIE_NAME, value: encodeURIComponent(JSON.stringify(SESSION)), domain: 'app.patina.cloud' },
    ]);

    const tokens = await readPortalSessionTokens();

    expect(tokens).toEqual({
      access_token: SESSION.access_token,
      refresh_token: SESSION.refresh_token,
    });
  });

  it('returns null when no session cookie is present', async () => {
    installCookies([{ name: 'unrelated', value: 'x', domain: 'app.patina.cloud' }]);
    expect(await readPortalSessionTokens()).toBeNull();
  });

  it('returns null when the cookie lacks tokens', async () => {
    installCookies([
      { name: COOKIE_NAME, value: ssrCookieValue({ foo: 'bar' }), domain: 'app.patina.cloud' },
    ]);
    expect(await readPortalSessionTokens()).toBeNull();
  });

  it('returns null when the cookie value is undecodable', async () => {
    installCookies([{ name: COOKIE_NAME, value: 'base64-%%%not-valid', domain: 'app.patina.cloud' }]);
    expect(await readPortalSessionTokens()).toBeNull();
  });
});

describe('isSessionCookieName', () => {
  it('matches the base cookie and its chunks, not unrelated names', () => {
    expect(isSessionCookieName('sb-api-auth-token', 'sb-api-auth-token')).toBe(true);
    expect(isSessionCookieName('sb-api-auth-token.0', 'sb-api-auth-token')).toBe(true);
    expect(isSessionCookieName('sb-api-auth-token.12', 'sb-api-auth-token')).toBe(true);
    expect(isSessionCookieName('sb-api-auth-token-code-verifier', 'sb-api-auth-token')).toBe(false);
    expect(isSessionCookieName('other-cookie', 'sb-api-auth-token')).toBe(false);
  });
});
