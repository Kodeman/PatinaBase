'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// THE SUBJECT LINE (R4, migration 00590)
//
// One optional line per engagement, written by the studio and printed under
// the name in the letterhead. The column is `subject text` on all four
// engagement tables, and `document_state.subject` reads whichever leg the row
// came from — so the write has to reach the same four tables the view reads.
//
// The head degrades to an ASSEMBLED line (project type + named rooms) when
// this is null. That line is never written here: it is derived at print time,
// and persisting it would freeze a description that the discovery row is
// still moving.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export type EngagementSubjectKind =
  | 'project'
  | 'proposal'
  | 'lead'
  | 'relationship';

export interface UpdateEngagementSubjectInput {
  kind: EngagementSubjectKind;
  /** The engagement's own id — `document_state.engagement_id`. */
  id: string;
  /** Blank (or whitespace) saves NULL: an emptied line is no line. */
  subject: string | null;
}

/** `document_state`'s four legs, in the order the view unions them. */
const TABLE_FOR_KIND: Record<EngagementSubjectKind, string> = {
  project: 'projects',
  proposal: 'proposals',
  lead: 'leads',
  relationship: 'designer_clients',
};

/** The list key each kind's own hook file holds. */
const LIST_KEY_FOR_KIND: Record<EngagementSubjectKind, string> = {
  project: 'projects',
  proposal: 'proposals',
  lead: 'leads',
  relationship: 'designer-clients',
};

export function useUpdateEngagementSubject(): UseMutationResult<
  void,
  Error,
  UpdateEngagementSubjectInput
> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateEngagementSubjectInput>({
    mutationFn: async ({ kind, id, subject }) => {
      const supabase = getSupabase();
      const trimmed = subject?.trim() ?? '';
      const { error } = await supabase
        // The table is chosen by kind, so the builder's per-table generic
        // cannot be resolved statically; the patch is one nullable text
        // column that every one of the four carries.
        .from(TABLE_FOR_KIND[kind] as never)
        .update({ subject: trimmed === '' ? null : trimmed } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_result, { kind }) => {
      // The letterhead reads `document_state`; the Desk reads its own
      // composition; the kind's own list carries the row too.
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
      queryClient.invalidateQueries({ queryKey: ['desk'] });
      queryClient.invalidateQueries({ queryKey: [LIST_KEY_FOR_KIND[kind]] });
    },
  });
}
