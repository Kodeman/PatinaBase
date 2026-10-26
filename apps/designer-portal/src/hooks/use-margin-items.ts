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
      const supabase = getSupabase();
      const { data, error } = await supabase.from('margin_items').select('*').or(clauses);
      if (error) throw error;
      const rows = (data ?? []) as MarginItemRow[];
      if (!rows.some((row) => row.kind === 'note')) return rows;
      // The union view preserves its legacy shape. Read additive note metadata
      // under the same caller's RLS, not through the private integrity helper.
      const { data: notes, error: noteError } = await supabase.from('margin_notes')
        .select('id, project_id, subject_kind, subject_id').or(clauses);
      if (noteError) throw noteError;
      const byId = new Map<string, { project_id: string | null; subject_kind: string | null; subject_id: string | null }>(
        (notes ?? []).map((note: { id: string; project_id: string | null; subject_kind: string | null; subject_id: string | null }) => [note.id, note]),
      );
      // Unordered — the rail applies R12 ordering (it knows line positions).
      return rows.map((row) => {
        if (row.kind !== 'note') return row;
        const note = byId.get(row.item_id);
        const subject = note?.project_id === row.project_id ? note : null;
        return { ...row, payload: { ...row.payload,
          subject_kind: subject?.subject_kind ?? null,
          subject_id: subject?.subject_id ?? null,
        } };
      });
    },
  });
}

/** One act, many surfaces (§5): margin index + Desk + the document's lines + the
 *  coordination band (a decision resolved from the margin is the SAME widened
 *  client_decisions row the band reads — keep it from going stale until refetch). */
export function invalidateMarginSurfaces(qc: QueryClient, projectId: string | null) {
  void qc.invalidateQueries({ queryKey: ['margin-items'] });
  void qc.invalidateQueries({ queryKey: ['document-state'] });
  if (projectId) {
    void qc.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
    void qc.invalidateQueries({ queryKey: ['coordination-items', projectId] });
  }
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
