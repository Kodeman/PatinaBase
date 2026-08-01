'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';

const REFRESH_DEBOUNCE_MS = 75;

/**
 * Refresh the server-authored client project view when canonical phase rows
 * are created or transitioned. Payload shape is intentionally irrelevant: the
 * database row is the source of truth, and refreshed server props remap the
 * complete branching timeline. Supabase cannot filter DELETE events, so phase
 * deletion converges on navigation or manual refresh instead of subscribing a
 * project client to ambiguous unfiltered deletes.
 */
export function useProjectPhaseRealtime(projectId: string, enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !projectId) return;

    const supabase = createBrowserClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshFromCanonicalRows = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    const phaseFilter = {
      schema: 'public',
      table: 'project_phases',
      filter: `project_id=eq.${projectId}`,
    } as const;

    const channel = supabase
      .channel(`client-project-phases:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          ...phaseFilter,
        },
        refreshFromCanonicalRows,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          ...phaseFilter,
        },
        refreshFromCanonicalRows,
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, projectId, router]);
}
