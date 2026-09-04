'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export const readingMarkKeys = {
  current: (projectId: string) => ['project-reading-mark', projectId] as const,
  previous: (projectId: string) =>
    ['project-reading-mark', 'previous', projectId] as const,
};

// Realtime is the primary freshness path (project_notes is on the
// supabase_realtime publication, and the reading mark itself only ever moves
// in response to this tab's own useMarkProjectRead call), but the client
// portal sets refetchOnWindowFocus: false globally (providers.tsx) and a
// dropped socket or a mark written from another tab/device should still
// self-heal — spec §10 risk 8's "refetch-on-focus fallback". Idiom + comment
// shape from use-project-approvals.ts:126-134.
const readingMarkForegroundRefresh = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function useReadingMark(projectId: string | undefined) {
  return useQuery({
    queryKey: readingMarkKeys.current(projectId ?? ''),
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_reading_marks')
        .select('read_at')
        .eq('project_id', projectId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.read_at ?? null;
    },
    enabled: !!projectId,
    ...readingMarkForegroundRefresh,
  });
}

export interface MarkProjectReadInput {
  projectId: string;
}

export function useMarkProjectRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: MarkProjectReadInput): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('mark_project_read', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return (data ?? null) as string | null;
    },
    onSuccess: (previous, variables) => {
      queryClient.setQueryData(
        readingMarkKeys.previous(variables.projectId),
        previous ?? null
      );
      queryClient.invalidateQueries({
        queryKey: readingMarkKeys.current(variables.projectId),
      });
    },
  });
}

/**
 * Cache-only read of the timestamp `useMarkProjectRead` stashed under the
 * `previous` key — no fetcher of its own; `enabled: false` + `staleTime:
 * Infinity` keep it from ever hitting the network, so it only ever reflects
 * what the mutation's onSuccess wrote via setQueryData.
 *
 * Tri-state contract (no `initialData`, so the three states stay distinct):
 * - `data === undefined` — `useMarkProjectRead` has not resolved yet in this
 *   session; the "since yesterday" read is not yet known. Do not render a
 *   "nothing changed" sentence from this state.
 * - `data === null` — the mutation resolved and there was no PRIOR mark
 *   (this is the first-ever visit); everything on the page counts as new.
 * - `data === '<timestamp>'` — the mutation resolved and this is the read_at
 *   from before this visit; diff other timestamps against it.
 */
export function usePreviousReadingMark(projectId: string | undefined) {
  return useQuery({
    queryKey: readingMarkKeys.previous(projectId ?? ''),
    queryFn: (): string | null => null,
    enabled: false,
    staleTime: Infinity,
  });
}
