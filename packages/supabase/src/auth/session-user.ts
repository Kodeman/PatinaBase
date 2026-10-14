'use client';

import { useSyncExternalStore } from 'react';
import type { Session, SupportedStorage } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';

/**
 * US-34 F1 — the signed-in subject for browser reads, without a network hop.
 *
 * A browser read needs the user's id, not a fresh server verdict: RLS decides
 * what the read may see from the JWT (`auth.uid()`), and writes keep that
 * server attribution. `auth.getUser()` is a network call that holds the auth
 * lock, so hooks that asked it inside every queryFn queued 16–21 of them back
 * to back ahead of the first data read on a hard load. This store reads the
 * session once (`getSession()`, local unless the token needs a refresh) and
 * follows it through ONE `onAuthStateChange` subscription.
 *
 * That subscription only hears this origin. The auth cookie spans every
 * portal's subdomain, so another portal can swap it to another user, or clear
 * it, and no event reaches this tab while every request already carries the
 * new JWT. So the store also re-reads the stored session itself: when the tab
 * is shown or focused, and on a read at most once per `RECHECK_MS`.
 *
 * Browser-only. On a server a module-level store would be shared across
 * requests, so outside a browser nothing is stored: `getSessionUserId()` asks
 * `auth.getUser()` as the hooks did before, `useSessionUserId()` is null and
 * `onSessionSubjectChange` never fires. Server routes keep their own
 * `getUser()`.
 *
 * The subject is the user id. After the first reading, every change of it —
 * none to someone, someone to none, and user A to user B with or without a
 * SIGNED_OUT in between — is reported to `onSessionSubjectChange` listeners
 * before readers re-render. The portal's QueryClient wiring uses that as its
 * cache boundary.
 */

type SubjectListener = (prev: string | null, next: string | null) => void;

/** How often a read may re-read the stored session. */
const RECHECK_MS = 2000;

let seedPromise: Promise<void> | null = null;
let seeded = false;
let userId: string | null = null;
let applied = 0;
let checkedAt = 0;
let checking: Promise<void> | null = null;
const readers = new Set<() => void>();
const subjectListeners = new Set<SubjectListener>();

const isBrowser = () => typeof window !== 'undefined';

function apply(next: string | null): void {
  applied += 1;
  if (!seeded) {
    // The first reading is the starting subject, not a change of subject.
    seeded = true;
    userId = next;
    readers.forEach((reader) => reader());
    return;
  }
  if (next === userId) return;
  const prev = userId;
  userId = next;
  subjectListeners.forEach((listener) => listener(prev, next));
  readers.forEach((reader) => reader());
}

/**
 * The user id in the stored session, read as auth-js reads it but without
 * `getSession()`. In auth-js 2.98.0 that call waits for the cross-tab
 * navigator lock, so it queues behind any holder's network call (a
 * `getUser()`, a token refresh), and it refreshes over the network itself
 * when the token is within 90 s of expiry. Reading the client's own storage
 * (the auth cookie) costs neither.
 */
async function readStoredUserId(): Promise<string | null> {
  // Protected in auth-js's types; at runtime, the client's own storage and key.
  const { storage, storageKey } = createBrowserClient().auth as unknown as {
    storage: SupportedStorage;
    storageKey: string;
  };
  const stored = await storage.getItem(storageKey);
  if (!stored) return null;
  const session = JSON.parse(stored) as Partial<Session> | null;
  // What auth-js counts as a session (GoTrueClient._isValidSession).
  if (!session?.access_token || !session.refresh_token || !session.expires_at) return null;
  return session.user?.id ?? null;
}

/** Re-reads the stored session and follows it when it names another subject. */
function recheck(): Promise<void> {
  if (!checking) {
    const since = applied;
    checkedAt = Date.now();
    checking = readStoredUserId()
      .then(
        (id) => {
          // An auth event that landed during the read is newer than it.
          if (applied === since) apply(id);
        },
        // A failed read leaves the subject as it was.
        () => {},
      )
      .finally(() => {
        checking = null;
      });
  }
  return checking;
}

function start(): Promise<void> {
  if (seedPromise) return seedPromise;
  const { auth } = createBrowserClient();
  // A listener must not await another auth call (auth-js holds its lock while
  // it runs), and `apply` does not.
  auth.onAuthStateChange((_event, session) => apply(session?.user?.id ?? null));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void recheck();
  });
  window.addEventListener('focus', () => void recheck());
  checkedAt = Date.now();
  seedPromise = auth.getSession().then(
    ({ data }) => {
      if (!seeded) apply(data.session?.user?.id ?? null);
    },
    () => {
      if (!seeded) apply(null);
    },
  );
  return seedPromise;
}

/** The signed-in user's id for a browser read (null when signed out). */
export async function getSessionUserId(): Promise<string | null> {
  if (!isBrowser()) {
    const { data } = await createBrowserClient().auth.getUser();
    return data.user?.id ?? null;
  }
  if (!seeded) await start();
  else if (checking || Date.now() - checkedAt >= RECHECK_MS) await recheck();
  return userId;
}

function subscribe(reader: () => void): () => void {
  readers.add(reader);
  void start();
  return () => {
    readers.delete(reader);
  };
}

const readUserId = () => userId;
const readNoUser = () => null;

/** The signed-in user's id; null until the session is read, and on a server. */
export function useSessionUserId(): string | null {
  return useSyncExternalStore(subscribe, readUserId, readNoUser);
}

/**
 * Called with (previous id, next id) whenever the signed-in subject changes.
 * Returns the unsubscribe.
 */
export function onSessionSubjectChange(listener: SubjectListener): () => void {
  if (!isBrowser()) return () => {};
  subjectListeners.add(listener);
  void start();
  return () => {
    subjectListeners.delete(listener);
  };
}
