/**
 * Session-key management: uuidv4 shape, localStorage persistence, and the
 * load-bearing SSR guard (vitest runs in a node environment — no window — so
 * the "server" path here is the real one, not a simulation).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionKey,
  DEFAULT_SESSION_STORAGE_KEY,
  generateSessionKey,
  getOrCreateSessionKey,
  isSessionKey,
} from '../core/session-key';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateSessionKey', () => {
  it('produces uuidv4 values', () => {
    const a = generateSessionKey();
    const b = generateSessionKey();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = i * 17;
        return arr;
      },
    });
    expect(generateSessionKey()).toMatch(UUID_V4);
  });
});

describe('getOrCreateSessionKey — SSR safety', () => {
  it('does not throw without a window (server render) and returns a valid ephemeral key', () => {
    expect(typeof window).toBe('undefined'); // node environment — the real SSR case
    const key = getOrCreateSessionKey();
    expect(key).toMatch(UUID_V4);
    // Ephemeral: no storage → a second call mints a different key.
    expect(getOrCreateSessionKey()).not.toBe(key);
  });

  it('survives a localStorage that throws on access (private mode)', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    });
    expect(getOrCreateSessionKey()).toMatch(UUID_V4);
  });
});

describe('getOrCreateSessionKey — persistence', () => {
  it('mints once and returns the same key thereafter', () => {
    const localStorage = makeLocalStorage();
    vi.stubGlobal('window', { localStorage });
    const first = getOrCreateSessionKey();
    expect(first).toMatch(UUID_V4);
    expect(getOrCreateSessionKey()).toBe(first);
    expect(localStorage.getItem(DEFAULT_SESSION_STORAGE_KEY)).toBe(first);
  });

  it('replaces a corrupt stored value', () => {
    const localStorage = makeLocalStorage();
    localStorage.setItem(DEFAULT_SESSION_STORAGE_KEY, 'not-a-uuid');
    vi.stubGlobal('window', { localStorage });
    const key = getOrCreateSessionKey();
    expect(key).toMatch(UUID_V4);
    expect(localStorage.getItem(DEFAULT_SESSION_STORAGE_KEY)).toBe(key);
  });

  it('honors a custom storage key and clearSessionKey', () => {
    const localStorage = makeLocalStorage();
    vi.stubGlobal('window', { localStorage });
    const key = getOrCreateSessionKey('custom.key');
    expect(localStorage.getItem('custom.key')).toBe(key);
    clearSessionKey('custom.key');
    expect(localStorage.getItem('custom.key')).toBeNull();
  });
});

describe('isSessionKey', () => {
  it('accepts uuidv4 and rejects everything else', () => {
    expect(isSessionKey(generateSessionKey())).toBe(true);
    expect(isSessionKey('c1f00000-0000-4000-8000-000000000000')).toBe(true);
    expect(isSessionKey('c1f00000-0000-1000-8000-000000000000')).toBe(false); // v1
    expect(isSessionKey('')).toBe(false);
    expect(isSessionKey(null)).toBe(false);
    expect(isSessionKey(42)).toBe(false);
  });
});
