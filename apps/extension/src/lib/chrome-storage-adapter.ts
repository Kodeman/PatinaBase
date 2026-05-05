/**
 * Storage adapter that backs Supabase auth persistence with
 * chrome.storage.local instead of the default browser localStorage.
 *
 * Plasmo isolates window/localStorage per surface (sidepanel, background
 * service worker, popup, content scripts), so a session signed-in on the
 * sidepanel was invisible to the background worker — that's why the
 * offline capture queue's `auth.getSession()` check kept silently failing.
 *
 * chrome.storage.local is shared across every extension surface, so any
 * Supabase client built with this adapter will see the same persisted
 * session.
 */

type SupabaseSupportedStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  );
}

export const chromeStorageAdapter: SupabaseSupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isChromeStorageAvailable()) {
      // Fallback for Vitest / jsdom environments that don't stub chrome.
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    const result = await chrome.storage.local.get([key]);
    const value = result[key];
    return typeof value === 'string' ? value : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isChromeStorageAvailable()) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* noop */
      }
      return;
    }
    await chrome.storage.local.set({ [key]: value });
  },

  async removeItem(key: string): Promise<void> {
    if (!isChromeStorageAvailable()) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* noop */
      }
      return;
    }
    await chrome.storage.local.remove([key]);
  },
};
