'use client';

import { useEffect } from 'react';
import { notifyManager, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient, onSessionSubjectChange } from '@patina/supabase';

/**
 * US-34 F1 — the cache boundary between signed-in subjects.
 *
 * Reads now take the user id from the session store instead of asking
 * `auth.getUser()` each time, so nothing in a query key says whose data a
 * cache entry holds. When the subject changes (sign-in, sign-out, or user A
 * to user B with no SIGNED_OUT between, e.g. another tab), everything cached
 * or listening under the previous subject goes:
 *
 * - every query is reset, which cancels its in-flight read silently, so a late
 *   response for the previous subject resolves into nothing; queries nobody
 *   is watching are then removed;
 * - every realtime channel open at that moment is removed (they were joined
 *   for the previous subject; hooks keyed on the user re-open theirs);
 * - when someone is signed in, the queries on screen fetch again for them.
 */
export function crossSessionSubject(client: QueryClient, next: string | null): void {
  const cache = client.getQueryCache();
  notifyManager.batch(() => {
    for (const query of cache.getAll()) {
      query.reset();
      if (query.getObserversCount() === 0) cache.remove(query);
    }
  });

  const supabase = createBrowserClient();
  // One by one, not removeAllChannels(): that clears the list after its
  // awaits, which would also drop channels the next subject opens meanwhile.
  for (const channel of supabase.getChannels()) {
    void supabase.removeChannel(channel);
  }

  if (next !== null) void client.refetchQueries({ type: 'active' });
}

/** Wires `crossSessionSubject` to the session store for this client. */
export function useSessionSubjectBoundary(client: QueryClient): void {
  useEffect(
    () => onSessionSubjectChange((_prev, next) => crossSessionSubject(client, next)),
    [client],
  );
}
