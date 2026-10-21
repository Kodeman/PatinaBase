import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase/client';

import type { ClientProjectEditorial } from '@/lib/editorial/types';

/* The House Issue's plate read (00842 `get_client_project_editorial`). The
   server page reads it first so the hero preload is in the SSR HTML; this hook
   carries that answer as `initialData` and keeps it fresh after mutations. */

export const clientEditorialKey = (projectId: string) =>
  ['client-project-editorial', projectId] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The envelope, or null when the answer is not one. A malformed read is the
 * same as no read: the page falls back to today's house, never to an error.
 */
export function parseClientEditorial(data: unknown): ClientProjectEditorial | null {
  if (!isRecord(data) || !isRecord(data.project) || typeof data.project.id !== 'string') return null;
  const lists = ['rooms', 'assets', 'palette', 'boards', 'sheets'] as const;
  if (!lists.every((key) => Array.isArray(data[key]))) return null;
  return data as unknown as ClientProjectEditorial;
}

export function useClientEditorial(projectId: string, initialData: ClientProjectEditorial | null, enabled = true) {
  return useQuery<ClientProjectEditorial | null>({
    queryKey: clientEditorialKey(projectId),
    // Off with the flag: a flag-off page makes no read it would not have made.
    enabled: enabled && !!projectId,
    initialData,
    // The server answer is fresh at hydration; refetch on the usual triggers.
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (createBrowserClient() as any).rpc('get_client_project_editorial', {
        p_project_id: projectId,
      });
      // A failed refresh keeps the page on what it already had, never an error.
      if (error) throw error;
      return parseClientEditorial(data);
    },
  });
}
