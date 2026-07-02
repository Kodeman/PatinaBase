/**
 * Amendment hooks (Track 7 · R81) — the Amendment sheet's acts over the
 * SHIPPED scope-change machinery (scope_change_requests, 00066/00084):
 *
 *   · useComposeAmendment — create (draft or straight to sent) via the
 *     @patina/supabase hooks, optionally marking the R14 margin note it
 *     escalated from (margin_notes.escalated_to_scope_change_id).
 *   · useSendAmendment    — flip a draft to 'sent' (the client sees it in
 *     their portal's scope-change surface).
 *   · useApplyAmendment   — apply an APPROVED amendment through the
 *     apply_scope_change RPC (00084): rooms + FF&E lines + budget + timeline
 *     land in ONE transaction (§5), applied_at stamps.
 *
 * All acts carry errorSurface 'inline' (R83) — failures render at the act
 * site inside the sheet, never as a toast (D2).
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  useCreateScopeChangeRequest,
  useSendScopeChangeRequest,
} from '@patina/supabase';
import { invalidateMarginSurfaces } from '@/hooks/use-margin-items';
import { roomToStoredShape } from '@/lib/document/amendment-derivation';


const getSupabase = () => createBrowserClient() as any;

type AnyRecord = any;

/** One-act sweep after an amendment moves: the sheet's list, the open
 *  document's money surfaces, the margin, and the Desk re-derive together. */
function invalidateAmendmentSurfaces(qc: QueryClient, projectId: string) {
  void qc.invalidateQueries({ queryKey: ['scope-changes', projectId] });
  void qc.invalidateQueries({ queryKey: ['document-state'] });
  void qc.invalidateQueries({ queryKey: ['desk-engagements'] });
  invalidateMarginSurfaces(qc, projectId);
}

export interface ComposeAmendmentInput {
  projectId: string;
  title: string;
  description: string;
  additionalFfeCents: number;
  additionalFeeCents: number;
  timelineWeeks: number;
  newTotalCents: number;
  newRooms: Array<{ name: string; budgetCents: number }>;
  /** true → straight to the client ('sent'); false → parked as a draft. */
  send: boolean;
  /** The R14 margin note this escalated from, when any — recorded on it. */
  noteId?: string | null;
}

export function useComposeAmendment() {
  const qc = useQueryClient();
  const create = useCreateScopeChangeRequest({ errorSurface: 'inline' });
  const send = useSendScopeChangeRequest({ errorSurface: 'inline' });

  return useMutation({
    meta: { errorSurface: 'inline' as const },
    mutationFn: async (input: ComposeAmendmentInput): Promise<AnyRecord> => {
      const scr = await create.mutateAsync({
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        additionalFfeBudgetCents: input.additionalFfeCents,
        additionalDesignFeeCents: input.additionalFeeCents,
        timelineImpactWeeks: input.timelineWeeks,
        newTotalBudgetCents: input.newTotalCents,
        // Stored snake_case so apply_scope_change (00084) reads them 1:1.
        newRooms: input.newRooms.map(roomToStoredShape),
      });

      if (input.send) {
        await send.mutateAsync({ requestId: scr.id, projectId: input.projectId });
      }

      // The note remembers what it became (R14). A failure here must not
      // orphan the composed amendment — record it best-effort and continue.
      if (input.noteId) {
        await getSupabase()
          .from('margin_notes')
          .update({
            escalated_to_scope_change_id: scr.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.noteId);
      }

      return scr;
    },
    onSuccess: (_scr, input) => invalidateAmendmentSurfaces(qc, input.projectId),
  });
}

export function useSendAmendment() {
  const qc = useQueryClient();
  const send = useSendScopeChangeRequest({ errorSurface: 'inline' });
  return useMutation({
    meta: { errorSurface: 'inline' as const },
    mutationFn: async ({ requestId, projectId }: { requestId: string; projectId: string }) =>
      send.mutateAsync({ requestId, projectId }),
    onSuccess: (_d, { projectId }) => invalidateAmendmentSurfaces(qc, projectId),
  });
}

/** Apply an approved amendment to the project — the 00084 RPC does rooms,
 *  FF&E lines, budget, and timeline in one transaction and stamps applied_at. */
export function useApplyAmendment() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorSurface: 'inline' as const },
    mutationFn: async ({ requestId }: { requestId: string; projectId: string }) => {
      const { error } = await getSupabase().rpc('apply_scope_change', {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { requestId, projectId }) => {
      invalidateAmendmentSurfaces(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['scope-change', requestId] });
      // The applied budget/rooms/lines ripple through the project read models.
      void qc.invalidateQueries({ queryKey: ['project-v2', projectId] });
      void qc.invalidateQueries({ queryKey: ['project-rooms', projectId] });
      void qc.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      void qc.invalidateQueries({ queryKey: ['project-financials', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
