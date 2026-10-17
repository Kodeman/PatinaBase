/**
 * Per-job item labels (US-37 #3, 00808). The label is
 * `project_ffe_items.doc_code`: assigned on insert (001… without a room,
 * LR-01… in a room), editable free text, unique among the job's live items.
 * The one writer is `set_project_ffe_item_label`; a blank label gets the next
 * automatic one. A clash is refused with 23505 and the plain sentence
 * `itemLabelRefusal` recognises.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { invalidateFfeCaches } from './use-procurement';

const getSupabase = () => createBrowserClient();

type ProjectFfeItemRow = Database['public']['Tables']['project_ffe_items']['Row'];

// [\s\S]: a label stored before 00808 may still hold a line break.
const TAKEN_SENTENCE = /^Another item in this job already uses ([\s\S]+)\.$/;
/** The unique index (00808) that backs the trigger's check. */
const LABEL_INDEX = 'project_ffe_items_label_unique';

/**
 * The sentence to show for a label clash, or null when `message` is some other
 * error. The server's sentence names the label as the other item holds it; a
 * raw index violation (a write that raced the check) names `label`, the one
 * the designer typed.
 */
export function itemLabelRefusal(
  message: string | null | undefined,
  label?: string | null,
): string | null {
  const text = (message ?? '').trim();
  const taken = TAKEN_SENTENCE.exec(text);
  if (taken) return `Another item in this job already uses ${taken[1]}.`;
  if (!text.includes(LABEL_INDEX)) return null;
  const typed = (label ?? '').trim();
  return `Another item in this job already uses ${typed || 'that label'}.`;
}

export interface SetFfeItemLabelInput {
  projectId: string;
  itemId: string;
  /** Free text; blank or null asks for the next automatic label. */
  label: string | null;
}

export function useSetFfeItemLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, label }: SetFfeItemLabelInput): Promise<ProjectFfeItemRow> => {
      const { data, error } = await getSupabase().rpc('set_project_ffe_item_label', {
        p_item_id: itemId,
        p_label: label ?? '',
      });
      if (error) throw error;
      return data as ProjectFfeItemRow;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}
