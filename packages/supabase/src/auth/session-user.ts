'use client';

import { useSyncExternalStore } from 'react';
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

let seedPromise: Promise<void> | null = null;
let seeded = false;
let userId: string | null = null;
const readers = new Set<() => void>();
const subjectListeners = new Set<SubjectListener>();

const isBrowser = () => typeof window !== 'undefined';

function apply(next: string | null): void {
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

function start(): Promise<void> {
  if (seedPromise) return seedPromise;
  const { auth } = createBrowserClient();
  // A listener must not await another auth call (auth-js holds its lock while
  // it runs), and `apply` does not.
  auth.onAuthStateChange((_event, session) => apply(session?.user?.id ?? null));
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
