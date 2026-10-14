'use client';

import { useEffect, useRef, useState } from 'react';
import { notifyManager, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient, onSessionSubjectChange } from '@patina/supabase';
import { retireQueryClient } from '@/lib/react-query';
import { dropPreviousSubjectAutosaves } from '@/hooks/use-buffered-autosave';

/**
 * US-34 F1 — the cache boundary between signed-in subjects.
 *
 * Reads now take the user id from the session store instead of asking
 * `auth.getUser()` each time, so nothing in a query key says whose data a
 * cache entry holds. When the subject changes from someone to someone else or
 * to no one (sign-out, another tab, or another portal swapping the shared
 * cookie), nothing of the previous subject's may reach the next:
 *
 * - the previous subject's QueryClient is retired. It starts no further
 *   mutation attempt (each fails with `SubjectChangedError` before its call)
 *   and its global handlers stay silent. Both of its caches are cleared, so
 *   an in-flight read is cancelled silently and a paused or queued mutation
 *   is dropped, never resumed; and it is unmounted from the focus and online
 *   managers. A mutationFn already running at the switch still completes;
 *   that window is accepted;
 * - buffered edits of the previous subject's are dropped, never saved: the
 *   failed ones still registered for a later Send, and the ones the remount
 *   flushes;
 * - the next subject gets a fresh client and the subtree remounts under it
 *   (key it on `epoch`). A hook that took the retired client from
 *   `useQueryClient()` writes its late `onSuccess`/`onError` into a cache
 *   nothing reads any more, and every subscription effect runs again;
 * - every realtime channel open at that moment is removed, and Realtime is
 *   handed the next subject's token (or none) before the remount opens the
 *   next subject's.
 *
 * The first sign-in (no one to someone) keeps the client and the mount. A
 * signed-out portal shows only its auth pages, which open no channel and run
 * no mutation, so there is no previous subject to fence, and a remount there
 * would drop the sign-in page's own success step before it navigates. What
 * was read signed out is reset and read again; open channels stay, since
 * supabase-js hands them the new token on SIGNED_IN.
 */
export function useSessionSubjectBoundary(
  first: QueryClient,
  nextClient: () => QueryClient,
): { client: QueryClient; epoch: number } {
  const [subject, setSubject] = useState(() => ({ client: first, epoch: 0 }));
  // The listener runs outside React; it must retire the client on screen even
  // when two changes land before a render.
  const current = useRef(subject.client);

  useEffect(
    () =>
      onSessionSubjectChange((prev, next, accessToken) => {
        if (prev === null) {
          readAgain(current.current);
          return;
        }
        retire(current.current);
        authorizeRealtime(next ? accessToken : null);
        const client = nextClient();
        current.current = client;
        setSubject(({ epoch }) => ({ client, epoch: epoch + 1 }));
      }),
    [nextClient],
  );

  return subject;
}

function retire(client: QueryClient): void {
  retireQueryClient(client);
  // QueryClient.clear() clears the query cache and the mutation cache.
  client.clear();
  client.unmount();
  dropPreviousSubjectAutosaves();

  const supabase = createBrowserClient();
  // One by one, not removeAllChannels(): that clears the list after its
  // awaits, which would also drop channels the next subject opens meanwhile.
  for (const channel of supabase.getChannels()) {
    void supabase.removeChannel(channel);
  }
}

/**
 * supabase-js hands Realtime a token only on SIGNED_IN, TOKEN_REFRESHED and
 * SIGNED_OUT (SupabaseClient._handleTokenChanged). A cookie another portal
 * swapped raises none of them in this tab, and the token SIGNED_IN set by
 * hand survives every resubscribe (realtime-js 2.98.0 skips its callback for
 * a manual token), so channels the remount opens would still join as A.
 */
function authorizeRealtime(accessToken: string | null): void {
  const { realtime } = createBrowserClient();
  if (accessToken) {
    // An explicit token is in place before setAuth's first await.
    void realtime.setAuth(accessToken);
    return;
  }
  // No one: a join carries no token until the callback answers with the
  // anon key, so none joins as A meanwhile.
  realtime.accessTokenValue = null;
  void realtime.setAuth();
}

function readAgain(client: QueryClient): void {
  const cache = client.getQueryCache();
  notifyManager.batch(() => {
    for (const query of cache.getAll()) {
      // Cancels an in-flight read silently, so its late response lands nowhere.
      query.reset();
      if (query.getObserversCount() === 0) cache.remove(query);
    }
  });
  void client.refetchQueries({ type: 'active' });
}
