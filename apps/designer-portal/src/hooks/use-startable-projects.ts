/**
 * Projects a timer can start on — shared by the ⌘K palette's Time group and
 * the header TimerButton. Lives in its own module (not use-time-tracking)
 * because use-projects already imports from use-time-tracking and pulling
 * useProjects in there would create an import cycle.
 */

import { useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';

// Mock fixture projects use slug ids ('olsen-residence') — timers need a real
// projects row, so only UUID-backed projects are startable.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StartableProject {
  id: string;
  name: string | null;
}

/** Active/planning UUID-backed projects, name-filterable, capped at `limit` (6). */
export function useStartableProjects(query?: string, limit = 6): StartableProject[] {
  const { data: projects } = useProjects();

  return useMemo(() => {
    const q = (query ?? '').trim().toLowerCase();
    return ((projects ?? []) as Array<{ id: string; name?: string | null; status?: string | null }>)
      .filter((p) => UUID_RE.test(p.id) && (p.status === 'active' || p.status === 'planning'))
      .filter((p) => !q || (p.name ?? '').toLowerCase().includes(q))
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name ?? null }));
  }, [projects, query, limit]);
}
