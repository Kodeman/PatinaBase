import { PORTAL_URL, getAuthCookieName } from './supabase';

/**
 * Reads the portal's Supabase auth session from its cookie(s) so the extension
 * can adopt a session the user already established in the web portal.
 *
 * This mirrors how `@supabase/ssr` *writes* the cookie, which the naive
 * `JSON.parse(decodeURIComponent(value))` approach got wrong:
 *
 *  1. Chunking — when the serialized session exceeds `MAX_CHUNK_SIZE` (3180),
 *     `@supabase/ssr` splits it across `sb-…-auth-token.0`, `.1`, … and does
 *     NOT write the base `sb-…-auth-token` cookie. `chrome.cookies.get` for the
 *     base name then returns nothing. We combine the chunks back the same way
 *     `combineChunks` does.
 *  2. Encoding — the default `cookieEncoding: 'base64url'` stores the value as
 *     `base64-` + base64url(JSON), not raw JSON. We strip the prefix and decode
 *     (UTF-8-safe) before parsing, matching the ssr storage `getItem` path.
 *
 * Returns the access/refresh token pair, or null when no readable session
 * cookie is present.
 */

const BASE64_PREFIX = 'base64-';

interface PortalSessionTokens {
  access_token: string;
  refresh_token: string;
}

// ── base64url decode ─────────────────────────────────────────────────────────
// Ported verbatim from @supabase/ssr's base64url util (itself from
// supabase-community/base64url-js). The portal encodes the cookie with this
// exact alphabet and *without* `=` padding, and decodes UTF-8 by hand — so we
// decode the same way rather than risk `atob`/`TextDecoder` padding edge cases.

// 6-bit -> Base64-URL char. Reverse map: char code -> 6 bits (-1 invalid, -2 skip).
const FROM_BASE64URL = (() => {
  const TO_BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
  const IGNORE = ' \t\n\r='.split('');
  const map = new Array<number>(128).fill(-1);
  IGNORE.forEach((c) => (map[c.charCodeAt(0)] = -2));
  TO_BASE64URL.forEach((c, i) => (map[c.charCodeAt(0)] = i));
  return map;
})();

function stringFromUTF8(
  byte: number,
  state: { utf8seq: number; codepoint: number },
  emit: (codepoint: number) => void
): void {
  if (state.utf8seq === 0) {
    if (byte <= 0x7f) {
      emit(byte);
      return;
    }
    for (let leadingBit = 1; leadingBit < 6; leadingBit += 1) {
      if (((byte >> (7 - leadingBit)) & 1) === 0) {
        state.utf8seq = leadingBit;
        break;
      }
    }
    if (state.utf8seq === 2) state.codepoint = byte & 31;
    else if (state.utf8seq === 3) state.codepoint = byte & 15;
    else if (state.utf8seq === 4) state.codepoint = byte & 7;
    else throw new Error('Invalid UTF-8 sequence');
    state.utf8seq -= 1;
  } else if (state.utf8seq > 0) {
    if (byte <= 0x7f) throw new Error('Invalid UTF-8 sequence');
    state.codepoint = (state.codepoint << 6) | (byte & 63);
    state.utf8seq -= 1;
    if (state.utf8seq === 0) emit(state.codepoint);
  }
}

/** base64url (no padding) -> UTF-8 string. Mirrors @supabase/ssr exactly. */
function stringFromBase64URL(str: string): string {
  const conv: string[] = [];
  const emit = (codepoint: number) => conv.push(String.fromCodePoint(codepoint));
  const state = { utf8seq: 0, codepoint: 0 };
  let queue = 0;
  let queuedBits = 0;
  for (let i = 0; i < str.length; i += 1) {
    const bits = FROM_BASE64URL[str.charCodeAt(i)];
    if (bits > -1) {
      queue = (queue << 6) | bits;
      queuedBits += 6;
      while (queuedBits >= 8) {
        stringFromUTF8((queue >> (queuedBits - 8)) & 0xff, state, emit);
        queuedBits -= 8;
      }
    } else if (bits === -2) {
      continue;
    } else {
      throw new Error(`Invalid Base64-URL character "${str.at(i)}" at position ${i}`);
    }
  }
  return conv.join('');
}

/**
 * Reassemble the cookie value the way `@supabase/ssr`'s `combineChunks` does:
 * prefer the un-chunked base cookie; otherwise concatenate `name.0`, `name.1`,
 * … in order, stopping at the first missing index.
 */
function combineChunks(name: string, cookies: chrome.cookies.Cookie[]): string | null {
  const byName = new Map(cookies.map((c) => [c.name, c.value]));

  const base = byName.get(name);
  if (base) return base;

  const parts: string[] = [];
  for (let i = 0; ; i++) {
    const chunk = byName.get(`${name}.${i}`);
    if (chunk === undefined) break;
    parts.push(chunk);
  }
  return parts.length > 0 ? parts.join('') : null;
}

/** Decode a combined cookie value into the stored session JSON string. */
function decodeCookieValue(raw: string): string {
  if (raw.startsWith(BASE64_PREFIX)) {
    return stringFromBase64URL(raw.slice(BASE64_PREFIX.length));
  }
  // Raw (non-base64) encoding fallback — value is percent-encoded JSON.
  return decodeURIComponent(raw);
}

/**
 * Read and decode the portal's Supabase session cookie. Tolerant of every
 * failure mode (no cookie, parse error, missing tokens) — returns null rather
 * than throwing so callers can simply branch on the result.
 */
export async function readPortalSessionTokens(): Promise<PortalSessionTokens | null> {
  try {
    const name = getAuthCookieName();
    const cookies = await chrome.cookies.getAll({ url: PORTAL_URL });
    const raw = combineChunks(name, cookies);
    if (!raw) return null;

    const parsed = JSON.parse(decodeCookieValue(raw));
    if (!parsed?.access_token || !parsed?.refresh_token) return null;

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    };
  } catch {
    return null;
  }
}

/** True when a cookie name is the base session cookie or one of its chunks. */
export function isSessionCookieName(cookieName: string, baseName: string): boolean {
  return cookieName === baseName || cookieName.startsWith(`${baseName}.`);
}
