import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// HT-35 — the automatic timer is disclosed once, and a member may decline it.
//
//   *"Disclose once on a member's first document open; per-member opt-out on
//     their own profile, default on, falls back to one-tap manual start."*
//
// Two columns on `profiles` (00618), read and written by their owner alone
// through the shipped "Users can update own profile" policy. Per member rather
// than per device: a sentence served again on a second browser is not a
// one-time disclosure, and a preference that lives in `localStorage` is not the
// member's, it is the machine's.
//
// The opt-out is the opt-OUT: `false` means auto-start stands, which is what
// every member who never opens the setting is on (R19/D11). `true` does NOT
// mean "no timer" — the document spine falls back to a one-tap manual start.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export const timeAutostartKeys = {
  preference: ['time-autostart-preference'] as const,
};

export interface TimeAutostartPreference {
  /** True = this member declined the automatic timer. */
  optedOut: boolean;
  /** When the one-time disclosure band was first shown. Null = never. */
  disclosedAt: string | null;
}

/**
 * The read behind the hook, exported so a caller that must have the answer
 * BEFORE it acts can `queryClient.fetchQuery` the same cache entry rather than
 * race a hook's settle — the shape `fetchProjectBillingAuthority` already uses
 * in the document spine.
 */
export async function fetchTimeAutostartPreference(): Promise<TimeAutostartPreference | null> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('time_autostart_opt_out, time_autostart_disclosed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return {
    optedOut: data?.time_autostart_opt_out === true,
    disclosedAt: data?.time_autostart_disclosed_at ?? null,
  };
}

/**
 * The viewer's own preference. `isSettled` matters to the caller: the spine
 * must not choose between automatic and manual start on an unread answer, and
 * the disclosure band must not appear before the stamp is known — either
 * mistake shows a member a sentence she has already dismissed, or takes her
 * timer away for the width of a fetch.
 */
export function useTimeAutostartPreference() {
  const query = useQuery({
    queryKey: timeAutostartKeys.preference,
    staleTime: 5 * 60_000,
    queryFn: fetchTimeAutostartPreference,
  });
  return {
    ...query,
    preference: query.data ?? null,
    /** Fail-safe: an unreadable preference leaves auto-start exactly as it
     *  ships. A read that errors must not silently opt a member out. */
    optedOut: query.data?.optedOut === true,
    disclosedAt: query.data?.disclosedAt ?? null,
    isSettled: query.isSuccess || query.isError,
    /**
     * The stamp is KNOWN — the read actually returned, rather than settling by
     * failing (W7-R4-09). `disclosedAt` is null in both cases and they mean
     * opposite things: one says "never disclosed", the other says "we could not
     * find out". HT-35 allows the sentence once in a working life, so only the
     * first may spend it; a caller that reads a failed fetch as "not disclosed"
     * re-serves the one-time disclosure on every failing load.
     */
    disclosureRead: query.isSuccess,
  };
}

/** The member's own act, on her own profile. Nobody else's row is reachable. */
export function useSetTimeAutostartOptOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (optedOut: boolean) => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Sign in to change this.');
      const { error } = await supabase
        .from('profiles')
        .update({ time_autostart_opt_out: optedOut })
        .eq('id', userId);
      if (error) throw error;
      return optedOut;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: timeAutostartKeys.preference,
      });
    },
  });
}

/**
 * Stamp the disclosure. Called when the band RENDERS, not when it is
 * dismissed: "appears once and never again" is the ruling's own test, and a
 * member who reloads past an undismissed band has still read the sentence.
 */
export function useMarkTimeAutostartDisclosed() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * W7-R4-09 — the write half of exactly-once. A stamp that never lands
     * leaves the column NULL while the band stands and is dismissed, so the
     * sentence comes back on the next load. Retried, because the failure this
     * actually meets is a dropped round trip rather than a refusal.
     */
    retry: 2,
    mutationFn: async () => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const { error } = await supabase
        .from('profiles')
        .update({ time_autostart_disclosed_at: new Date().toISOString() })
        .eq('id', userId)
        .is('time_autostart_disclosed_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: timeAutostartKeys.preference,
      });
    },
  });
}
