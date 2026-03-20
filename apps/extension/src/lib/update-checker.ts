/**
 * Self-hosted beta update checker.
 *
 * Fetches version.json from the configured update URL, compares with the
 * installed version, and caches the result in chrome.storage.local.
 *
 * When PLASMO_PUBLIC_UPDATE_URL is empty (CWS builds), all functions are no-ops.
 */

const UPDATE_URL = process.env.PLASMO_PUBLIC_UPDATE_URL || '';

const STORAGE_KEY = 'patina_update_info';
const DISMISSED_KEY = 'patina_update_dismissed';

export interface VersionInfo {
  version: string;
  downloadUrl: string;
  changelog: string;
  releasedAt: string;
}

export interface UpdateState {
  hasUpdate: boolean;
  versionInfo: VersionInfo | null;
  checkedAt: string;
}

/** Compare two semver strings. Returns >0 if a > b, <0 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** Fetch version.json and compare with installed version. Returns null if disabled or no update. */
export async function checkForUpdate(): Promise<UpdateState | null> {
  if (!UPDATE_URL) return null;

  try {
    const res = await fetch(UPDATE_URL, { cache: 'no-store' });
    if (!res.ok) return null;

    const remote: VersionInfo = await res.json();
    const current = chrome.runtime.getManifest().version;
    const hasUpdate = compareVersions(remote.version, current) > 0;

    // Check if this version was dismissed
    const dismissed = await getDismissedVersion();
    if (hasUpdate && dismissed === remote.version) {
      // Still cache it but mark as no update for UI purposes
      const state: UpdateState = { hasUpdate: false, versionInfo: remote, checkedAt: new Date().toISOString() };
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
      return state;
    }

    const state: UpdateState = {
      hasUpdate,
      versionInfo: hasUpdate ? remote : null,
      checkedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    return state;
  } catch {
    return null;
  }
}

/** Read cached update state from storage. */
export async function getUpdateInfo(): Promise<UpdateState | null> {
  if (!UPDATE_URL) return null;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as UpdateState) ?? null;
  } catch {
    return null;
  }
}

/** Mark a version as dismissed so the banner won't show again. */
export async function dismissUpdate(version: string): Promise<void> {
  if (!UPDATE_URL) return;
  await chrome.storage.local.set({ [DISMISSED_KEY]: version });

  // Also update cached state
  const current = await getUpdateInfo();
  if (current) {
    current.hasUpdate = false;
    await chrome.storage.local.set({ [STORAGE_KEY]: current });
  }
}

async function getDismissedVersion(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(DISMISSED_KEY);
    return (result[DISMISSED_KEY] as string) ?? null;
  } catch {
    return null;
  }
}
