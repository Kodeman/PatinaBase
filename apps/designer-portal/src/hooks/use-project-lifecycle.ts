/**
 * Project lifecycle hooks (Track 7 · R79/R80) — open a project directly,
 * self-save its vitals, and close the book.
 *
 *   · useOpenProjectDirect  — the OpenProjectSheet's one act (00237 RPC).
 *     The sheet supplies a client-generated id so a retried submit can never
 *     double-insert.
 *   · useSaveProjectVitals  — the letterhead's blur-save channel (R40/R70 law).
 *     Reuses @patina/supabase's useUpdateProject for the write, then refreshes
 *     the DOCUMENT read models the package hook doesn't know about
 *     (project-v2 · document_state · desk).
 *   · useCloseProject       — the Care band's "Close the book" (00238 RPC):
 *     one transaction — status → completed, closure checklist + portfolio
 *     snapshot persist; completed_at stamps via the 00095 trigger.
 *   · usePhaseActualMinutes — logged minutes per phase_key (the actuals the
 *     estimate fields sit beside).
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient, useUpdateProject } from '@patina/supabase';
import type { ClosureItem, PortfolioSnapshot } from '@/lib/document/closure-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

/** One-act invalidation sweep for a project-document write (§5): the open
 *  document, the Desk, and the legacy project surfaces re-derive together. */
function invalidateProjectDocument(qc: QueryClient, projectId: string | null) {
  void qc.invalidateQueries({ queryKey: ['document-state'] });
  void qc.invalidateQueries({ queryKey: ['desk-engagements'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  if (projectId) {
    void qc.invalidateQueries({ queryKey: ['project-v2', projectId] });
    void qc.invalidateQueries({ queryKey: ['project-phases', projectId] });
  }
}

export interface OpenProjectDirectInput {
  /** Client-generated uuid — makes a retried submit return the same project. */
  id: string;
  title: string;
  clientId: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  /** YYYY-MM-DD */
  startDate: string | null;
}

/** R79 — open a project that skips the proposal (00237). Returns the id. */
export function useOpenProjectDirect() {
  const qc = useQueryClient();
  return useMutation({
    // R83: the sheet renders failures inline at the act site.
    meta: { errorSurface: 'inline' as const },
    mutationFn: async (input: OpenProjectDirectInput): Promise<string> => {
      const { data, error } = await getSupabase().rpc('open_project_direct', {
        p_title: input.title,
        p_client_id: input.clientId,
        p_budget_min_cents: input.budgetMinCents,
        p_budget_max_cents: input.budgetMaxCents,
        p_start_date: input.startDate,
        p_id: input.id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (projectId) => {
      invalidateProjectDocument(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

/** The columns the letterhead vitals may write (R80). */
export interface ProjectVitalsPatch {
  name?: string;
  start_date?: string | null;
  target_end_date?: string | null;
  budget_min?: number | null; // cents
  budget_max?: number | null; // cents
  client_visibility_tier?: 'full' | 'milestone' | 'curated';
}

/** R80 — the letterhead's blur-save write. One column per blur, then the
 *  document read models re-derive (§5). */
export function useSaveProjectVitals(projectId: string) {
  const qc = useQueryClient();
  const update = useUpdateProject({ errorSurface: 'inline' });
  return useMutation({
    meta: { errorSurface: 'inline' as const },
    mutationFn: async (patch: ProjectVitalsPatch) => {
      // The package hook's typed surface predates these columns; the write
      // path passes the object through to PostgREST unchanged.
      return update.mutateAsync({
        projectId,
        data: patch as Parameters<typeof update.mutateAsync>[0]['data'],
      });
    },
    onSuccess: () => invalidateProjectDocument(qc, projectId),
  });
}

/** R80 — logged minutes per phase_key for one project (the actuals column of
 *  the phase-estimates fold). RLS scopes rows to the project's designer/team. */
export function usePhaseActualMinutes(projectId: string | null) {
  return useQuery<Record<string, number>>({
    queryKey: ['phase-actual-minutes', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_time_entries')
        .select('phase_key, duration_minutes')
        .eq('project_id', projectId)
        .not('duration_minutes', 'is', null);
      if (error) throw error;
      const byPhase: Record<string, number> = {};
      for (const e of (data ?? []) as { phase_key: string | null; duration_minutes: number }[]) {
        const key = e.phase_key ?? '';
        byPhase[key] = (byPhase[key] ?? 0) + (e.duration_minutes ?? 0);
      }
      return byPhase;
    },
  });
}

/** R80 — "Close the book" (00238): one transaction settles the project. */
export function useCloseProject() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorSurface: 'inline' as const },
    mutationFn: async ({
      projectId,
      closure,
      snapshot,
    }: {
      projectId: string;
      closure: ClosureItem[];
      snapshot: PortfolioSnapshot;
    }) => {
      const { data, error } = await getSupabase().rpc('close_project', {
        p_project_id: projectId,
        p_closure: closure,
        p_snapshot: snapshot,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { projectId }) => invalidateProjectDocument(qc, projectId),
  });
}
