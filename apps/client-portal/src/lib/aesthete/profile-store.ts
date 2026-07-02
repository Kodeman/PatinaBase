/**
 * localStorage persistence for the quiz result (Wave 3A).
 *
 * The submit RPC response is the ONLY place an anonymous visitor ever sees
 * their profile (anon can cause rows, never read tables — §7.1), so the
 * results page can't re-fetch it. We stash the response next to the session
 * key the package already persists; the stored profile is only trusted when
 * its session_key matches the live one (a cleared/rotated key invalidates it).
 *
 * Same posture as the session key itself: storage failures (SSR, private
 * mode) degrade to null — the results page then renders matches without the
 * profile panel rather than throwing.
 */
import type { StyleQuizProfile } from '@patina/types';

export const PROFILE_STORAGE_KEY = 'patina.aesthete.profile';
/** Session keys already claimed by the signed-in user (avoid re-claim churn). */
export const CLAIMED_STORAGE_KEY = 'patina.aesthete.claimed';

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storeQuizProfile(profile: StyleQuizProfile): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* quota/security errors — results page degrades gracefully */
  }
}

export function loadQuizProfile(sessionKey: string | null): StyleQuizProfile | null {
  const storage = safeStorage();
  if (!storage || !sessionKey) return null;
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StyleQuizProfile;
    if (!parsed || parsed.session_key !== sessionKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearQuizProfile(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Has this session key already been claimed by a signed-in visit? */
export function wasSessionClaimed(sessionKey: string): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    return storage.getItem(CLAIMED_STORAGE_KEY) === sessionKey;
  } catch {
    return false;
  }
}

export function markSessionClaimed(sessionKey: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(CLAIMED_STORAGE_KEY, sessionKey);
  } catch {
    /* ignore */
  }
}
