/**
 * The client's own answers — `project_notes.answered_at` (00565:236) inside the
 * last day, for the studio's own projects. The Desk's day's line reads these
 * and nothing else about them.
 *
 * A plain table read: `project_notes_studio_select` already scopes the table to
 * `app_private.is_project_studio_member(project_id)`, so there is no RPC, no
 * new table, and no service role in this path. `gte` on a nullable column
 * excludes NULLs, so the window filter is also the "was it answered" filter.
 *
 * The Desk's own 60s tick, so the roster and the day's line re-read together.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import {
  ANSWERED_NOTE_WINDOW_MS,
  type AnsweredClientNote,
} from '@/lib/document/desk-roster-derivation';

// `project_notes` is not in the generated database.types.ts yet, so the client
// is cast like the other portal-local Desk hooks.
const getSupabase = () => createBrowserClient() as any;

/** One line per project is all the day's line can print; the cap is here so a
 *  studio with a busy week never pulls an unbounded page. */
export const ANSWERED_NOTE_LIMIT = 50;

interface AnsweredNoteRow {
  project_id: string | null;
  answered_at: string | null;
}

export function useAnsweredNotes(options: { enabled?: boolean } = {}) {
  return useQuery<AnsweredClientNote[]>({
    queryKey: ['project-notes', 'answered', 'desk'],
    enabled: options.enabled ?? true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = getSupabase();
      const since = new Date(
        Date.now() - ANSWERED_NOTE_WINDOW_MS,
      ).toISOString();
      const { data, error } = await supabase
        .from('project_notes')
        .select('project_id, answered_at')
        .gte('answered_at', since)
        .order('answered_at', { ascending: false })
        .limit(ANSWERED_NOTE_LIMIT);
      if (error) throw error;
      return ((data ?? []) as AnsweredNoteRow[])
        .filter(
          (row): row is { project_id: string; answered_at: string } =>
            !!row.project_id && !!row.answered_at,
        )
        .map((row) => ({
          projectId: row.project_id,
          answeredAt: row.answered_at,
        }));
    },
  });
}
