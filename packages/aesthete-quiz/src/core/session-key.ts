/**
 * Session-key management (design §7.1).
 *
 * The session key is a client-generated uuidv4 persisted in localStorage — a
 * bearer capability: it lets an anonymous visitor cause profile rows and later
 * claim them on signup. Unknown keys 404; anon can never read tables with it.
 *
 * SSR-safe: on the server (no window / no localStorage / storage throwing in
 * private-mode browsers) an ephemeral key is returned instead of throwing.
 */

export const DEFAULT_SESSION_STORAGE_KEY = 'patina.aesthete.session_key';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSessionKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Generate a uuidv4. Prefers crypto.randomUUID; falls back to getRandomValues. */
export function generateSessionKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // some environments throw on localStorage ACCESS
  }
}

/**
 * Read the persisted session key, minting + persisting one when absent or
 * corrupt. Without usable storage (SSR, private mode) returns a fresh
 * ephemeral key each call — never throws.
 */
export function getOrCreateSessionKey(storageKey: string = DEFAULT_SESSION_STORAGE_KEY): string {
  const storage = safeStorage();
  if (!storage) return generateSessionKey();
  try {
    const existing = storage.getItem(storageKey);
    if (isSessionKey(existing)) return existing;
    const fresh = generateSessionKey();
    storage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return generateSessionKey(); // quota/security errors → ephemeral
  }
}

/** Forget the persisted key (e.g. after a claim, or on sign-out). */
export function clearSessionKey(storageKey: string = DEFAULT_SESSION_STORAGE_KEY): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
