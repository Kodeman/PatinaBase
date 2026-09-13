'use client';

/**
 * CHASE THE RENEWAL — a draft, never a send.
 *
 * "Chase the renewal" writes one row onto the agent queue through
 * `enqueue_agent_task` and stops there: the task lands `awaiting_review`, and a
 * person presses send. No automated external sends is a standing rule, and the
 * act's own consequence sentence on the company card says exactly that.
 *
 * ⚠ THE SMALLEST POSSIBLE ADDITION, UNDER THIS SURFACE. W2a owns
 * `packages/supabase/src/hooks`, and no chase hook is among its exports, so
 * this mutation lives here rather than being written into a package this wave
 * does not own. It belongs in `@patina/supabase` the moment the queue grows a
 * second portal caller — flagged for the orchestrator.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

/** The queue's own word for this work. */
export const COMPLIANCE_CHASE_TASK_TYPE = 'compliance_chase';

/** What the act promises on the face, and what it actually does. */
export function chaseConsequenceSentence(firmName: string): string {
  return `This drafts a note to ${firmName}'s paperwork contact and files it for your review. Nothing is sent until you send it.`;
}

export interface ChaseRenewalInput {
  organizationId: string;
  /** The firm's card. */
  companyId: string;
  companyName: string;
  /** The paper being chased, so the draft can name it. */
  documentId?: string | null;
  documentLabel?: string | null;
  /** The person the note is addressed to, when the firm names one. */
  paperworkContactPersonId?: string | null;
}

export function useChaseTheRenewal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChaseRenewalInput) => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.rpc('enqueue_agent_task', {
        p_task_type: COMPLIANCE_CHASE_TASK_TYPE,
        p_entity_type: 'studio_contact',
        p_entity_id: input.companyId,
        // A draft, and only a draft. The queue's review gate is the send gate.
        p_status: 'awaiting_review',
        p_source: 'people_room',
        p_summary: `Chase ${input.companyName} for ${input.documentLabel ?? 'a current certificate'}`,
        p_payload: {
          organization_id: input.organizationId,
          company_id: input.companyId,
          company_name: input.companyName,
          document_id: input.documentId ?? null,
          document_label: input.documentLabel ?? null,
          paperwork_contact_person_id: input.paperworkContactPersonId ?? null,
        },
        // One standing chase per firm per paper: pressing twice files one note.
        p_idempotency_key: `compliance_chase:${input.companyId}:${input.documentId ?? 'any'}`,
        p_on_conflict: 'ignore',
      });
      if (error) throw error;
      return data as unknown;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
    },
  });
}
