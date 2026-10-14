'use client';

import { useEffect, useRef, useState } from 'react';
import { notifyManager, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient, onSessionSubjectChange } from '@patina/supabase';
import { useToast } from '@patina/design-system';
import { retireQueryClient } from '@/lib/react-query';
import { dropPreviousSubjectAutosaves } from '@/hooks/use-buffered-autosave';
import { retireAnalyticsSubject } from '@/lib/analytics/subject';
import { dismissReturnToLeadUndo } from '@/components/document/return-to-lead-undo';

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
 * - buffered edits of the previous subject's are dropped, never saved: every
 *   buffer, action and flush of theirs leaves the Send barrier, settled or
 *   not, and the edits the remount flushes are dropped;
 * - their Undo offer is withdrawn, their toasts are dismissed (render
 *   `DismissPreviousSubjectToasts` beside the Toaster), and an analytics
 *   capture their late work makes through `forThisSubject` is dropped;
 * - the next subject gets a fresh client and the subtree remounts under it
 *   (key it on `epoch`). A hook that took the retired client from
 *   `useQueryClient()` writes its late `onSuccess`/`onError` into a cache
 *   nothing reads any more, and every subscription effect runs again;
 * - every realtime channel open at that moment is removed, and Realtime is
 *   handed the next subject's token (or none) before the remount opens the
 *   next subject's.
 *
 * A sign-in in this tab (no one to someone, from its own auth event) keeps
 * the client and the mount. A signed-out portal shows only its auth pages,
 * which open no channel and run no mutation, so there is no previous subject
 * to fence, and a remount there would drop the sign-in page's own success
 * step before it navigates. What was read signed out is reset and read
 * again; open channels stay, since supabase-js hands them the new token on
 * SIGNED_IN. A sign-in only the shared cookie reports (another portal) is a
 * boundary like any other: no event reached this tab's session hooks or
 * Realtime, so they re-read on the remount and Realtime is handed the token.
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
      onSessionSubjectChange((prev, next, accessToken, source) => {
        if (prev === null && source === 'event') {
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

/**
 * The Toaster stays mounted across subjects and the design-system toast store
 * is module state, so a toast shown for the previous subject would stay up for
 * the next. Dismisses them all at each new epoch. It re-renders with every
 * toast, so render it as a leaf beside the Toaster.
 */
export function DismissPreviousSubjectToasts({ epoch }: { epoch: number }): null {
  const { dismiss } = useToast();
  const dismissedFor = useRef(epoch);
  useEffect(() => {
    if (dismissedFor.current === epoch) return;
    dismissedFor.current = epoch;
    dismiss();
  }, [epoch, dismiss]);
  return null;
}

function retire(client: QueryClient): void {
  retireQueryClient(client);
  // QueryClient.clear() clears the query cache and the mutation cache.
  client.clear();
  client.unmount();
  dropPreviousSubjectAutosaves();
  dismissReturnToLeadUndo();
  retireAnalyticsSubject();

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
 *
 * Held by hand, though, the next subject's token would outlive the next
 * refresh another portal writes to the cookie: realtime-js re-asks its token
 * callback (on connect and every heartbeat) only while no manual token is set,
 * and auth-js in this tab need not emit TOKEN_REFRESHED for a cookie that is
 * already fresh. So once it is in place, Realtime goes back to that callback,
 * which reads auth-js's stored session as every request does.
 */
function authorizeRealtime(accessToken: string | null): void {
  const { realtime } = createBrowserClient();
  if (accessToken) {
    // An explicit token is in place before setAuth's first await, and stays
    // until the callback has answered.
    void realtime.setAuth(accessToken).then(() => realtime.setAuth());
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
