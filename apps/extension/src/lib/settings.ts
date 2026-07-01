/** T1 settings — persist capture prefs to chrome.storage.local. */
import type { Prefs } from '../state/types';

const KEY = 'patina_settings_v1';

export function loadPrefs(): Promise<Partial<Prefs> | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(KEY, (r) => resolve((r?.[KEY] as Partial<Prefs>) ?? null));
    } catch {
      resolve(null);
    }
  });
}

export function savePrefs(prefs: Prefs): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [KEY]: prefs }, () => resolve());
    } catch {
      resolve();
    }
  });
}
