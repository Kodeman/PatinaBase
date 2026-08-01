'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';

const REFRESH_DEBOUNCE_MS = 75;

/**
 * Refresh the server-authored client project view whenever canonical
 * project_phases rows change. Payload shape is intentionally irrelevant: the
 * database row is the source of truth, and the refreshed server props remap
 * the complete branching timeline.
 */
export function useProjectPhaseRealtime(projectId: string, enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !projectId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createBrowserClient() as any;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`client-project-phases:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_phases',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            router.refresh();
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, projectId, router]);
}
