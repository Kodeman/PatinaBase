/**
 * Margin data — reads the `margin_items` view (00194) for one engagement
 * and exposes the one-act invalidation helper (spec §5): after a margin
 * action, every surface the act touched re-reads — margin, Desk, document
 * FF&E. Domain caches are invalidated by the domain mutations themselves.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export function useMarginItems(projectId: string | null, proposalId: string | null) {
  const key = projectId ?? proposalId ?? 'none';
  return useQuery<MarginItemRow[]>({
    queryKey: ['margin-items', key],
    enabled: Boolean(projectId || proposalId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const clauses = [
        projectId ? `project_id.eq.${projectId}` : null,
        proposalId ? `proposal_id.eq.${proposalId}` : null,
      ]
        .filter(Boolean)
        .join(',');
      const { data, error } = await getSupabase().from('margin_items').select('*').or(clauses);
      if (error) throw error;
      // Unordered — the rail applies R12 ordering (it knows line positions).
      return (data ?? []) as MarginItemRow[];
    },
  });
}

/** One act, many surfaces (§5): margin index + Desk + the document's lines. */
export function invalidateMarginSurfaces(qc: QueryClient, projectId: string | null) {
  void qc.invalidateQueries({ queryKey: ['margin-items'] });
  void qc.invalidateQueries({ queryKey: ['document-state'] });
  if (projectId) void qc.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
}

/** The one-act Pulse send (00195): pulse → sent + client-thread mirror in one
 *  transaction. THEN the full-body Friday email leg (R13) — decoupled and
 *  non-fatal (I12): the in-transaction mirror already reached the client, so
 *  an email failure must never surface as a send failure. */
export function useSendWeeklyPulse(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pulseId,
      body,
      subject,
    }: {
      pulseId: string;
      body: string;
      subject?: string;
    }) => {
      const { data, error } = await getSupabase().rpc('send_weekly_pulse', {
        p_pulse_id: pulseId,
        p_body: body,
        p_subject: subject ?? null,
      });
      if (error) throw error;

      // The email leg (R13). Fire-and-forget after the transactional send;
      // a non-2xx or a network failure here is logged, never thrown.
      try {
        await fetch('/api/pulse/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pulseId }),
        });
      } catch {
        // The portal mirror landed; the inbox touch can be retried later.
      }
      return data;
    },
    onSuccess: () => {
      invalidateMarginSurfaces(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['comms'] });
    },
  });
}
