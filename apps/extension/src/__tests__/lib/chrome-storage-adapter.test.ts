import { describe, it, expect, beforeEach } from 'vitest';
import { chromeStorageAdapter } from '../../lib/chrome-storage-adapter';

/**
 * Round-trips the chromeStorageAdapter against a fake chrome.storage.local
 * with the same Promise-based API the adapter targets. The global setup.ts
 * already attaches a `chrome` mock to globalThis but its storage methods
 * are `vi.fn()` stubs with no behavior — we replace them here with a
 * Promise-based fake backed by a local Record so we can exercise the
 * adapter's real get/set/remove path.
 */
describe('chromeStorageAdapter', () => {
  let fakeStore: Record<string, string>;

  beforeEach(() => {
    fakeStore = {};
    (globalThis as unknown as { chrome: { storage: { local: unknown } } }).chrome.storage.local = {
      get: (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys;
        if (fakeStore[key] === undefined) return Promise.resolve({});
        return Promise.resolve({ [key]: fakeStore[key] });
      },
      set: (obj: Record<string, string>) => {
        Object.assign(fakeStore, obj);
        return Promise.resolve();
      },
      remove: (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys;
        delete fakeStore[key];
        return Promise.resolve();
      },
    };
  });

  it('round-trips a value via set/get/remove', async () => {
    const payload = JSON.stringify({ foo: 'bar' });
    await chromeStorageAdapter.setItem('sb-test-key', payload);
    expect(await chromeStorageAdapter.getItem('sb-test-key')).toBe(payload);
    await chromeStorageAdapter.removeItem('sb-test-key');
    expect(await chromeStorageAdapter.getItem('sb-test-key')).toBeNull();
  });

  it('returns null for missing keys', async () => {
    expect(await chromeStorageAdapter.getItem('never-stored')).toBeNull();
  });

  it('persists the underlying value in chrome.storage.local', async () => {
    await chromeStorageAdapter.setItem('sb-session', 'token-blob');
    expect(fakeStore['sb-session']).toBe('token-blob');
  });
});
