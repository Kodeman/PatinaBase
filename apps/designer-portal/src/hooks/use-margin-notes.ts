/**
 * Margin notes (R14) — capture and in-place escalation. Notes are the
 * margin's private layer: designer-authored, studio-visible (D6; RLS is
 * author-scoped in v1), never client-visible. Escalation converts a note
 * into a real artifact through the SHIPPED machinery: a draft client
 * decision, or a draft scope change request (audit: scope_change_requests
 * exists with create/send/approve flows — no stub needed).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { invalidateMarginSurfaces } from '@/hooks/use-margin-items';
import { useAuth } from '@/hooks/use-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface CreateMarginNoteInput {
  projectId: string | null;
  proposalId: string | null;
  // R66: the relationship anchor for a pre-project Discovery engagement
  // (document_state Shape D), where project/proposal are both null.
  designerClientId?: string | null;
  body: string;
  anchorKind?: 'line' | 'section' | 'letterhead';
  anchorId?: string | null;
  dueDate?: string | null;
}

export function useCreateMarginNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateMarginNoteInput) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { data, error } = await getSupabase()
        .from('margin_notes')
        .insert({
          project_id: input.projectId,
          proposal_id: input.proposalId,
          designer_client_id: input.designerClientId ?? null,
          designer_id: user.id,
          body: input.body,
          anchor_kind: input.anchorKind ?? 'letterhead',
          anchor_id: input.anchorId ?? null,
          due_date: input.dueDate ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => {
      invalidateMarginSurfaces(qc, input.projectId);
      if (input.designerClientId) {
        void qc.invalidateQueries({ queryKey: ['discovery-margin', input.designerClientId] });
      }
    },
  });
}

/** Escalate a note to a DRAFT client decision (R14 path a). The decision
 *  enters the shipped decisions machinery; the note records what it became. */
export function useEscalateNoteToDecision() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      noteId,
      projectId,
      designerClientId,
      body,
    }: {
      noteId: string;
      projectId: string;
      /** Exact relationship already bound by the document shell. */
      designerClientId: string;
      body: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const supabase = getSupabase();

      const title = body.length > 70 ? `${body.slice(0, 67)}…` : body;
      const decisionId = crypto.randomUUID();
      const { data: decision, error: decError } = await supabase.rpc('create_client_decision', {
        p_decision_id: decisionId,
        p_payload: {
          designer_client_id: designerClientId,
          project_id: projectId,
          title,
          context: body,
          status: 'draft',
          blocking_status: 'non_blocking',
        },
        p_options: [],
        p_blocked_ffe_item_ids: [],
        p_blocked_task_ids: [],
      });
      if (decError) throw decError;
      if (!decision) throw new Error('Decision escalation returned no row');

      const { error: noteError } = await supabase
        .from('margin_notes')
        .update({ escalated_to_decision_id: decision.id, updated_at: new Date().toISOString() })
        .eq('id', noteId);
      if (noteError) throw noteError;
      return decision;
    },
    onSuccess: (_d, { projectId }) => invalidateMarginSurfaces(qc, projectId),
  });
}

/** Escalate a note to a DRAFT scope change request (R14 path b — the call
 *  was a change request). Uses the existing scope_change_requests artifact. */
export function useEscalateNoteToScopeChange() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      noteId,
      projectId,
      body,
    }: {
      noteId: string;
      projectId: string;
      body: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const supabase = getSupabase();
      const title = body.length > 70 ? `${body.slice(0, 67)}…` : body;

      const { data: scr, error: scrError } = await supabase
        .from('scope_change_requests')
        .insert({
          project_id: projectId,
          requested_by: user.id,
          title,
          description: body,
          status: 'draft',
        })
        .select()
        .single();
      if (scrError) throw scrError;

      const { error: noteError } = await supabase
        .from('margin_notes')
        .update({
          escalated_to_scope_change_id: scr.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);
      if (noteError) throw noteError;
      return scr;
    },
    onSuccess: (_d, { projectId }) => invalidateMarginSurfaces(qc, projectId),
  });
}
