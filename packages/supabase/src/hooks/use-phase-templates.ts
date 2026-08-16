import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// PHASE TEMPLATES (phase_templates + apply_phase_template — migration 00135)
// ═══════════════════════════════════════════════════════════════════════════

export interface PhaseTemplateDeliverable {
  label: string;
  description?: string;
  is_required?: boolean;
  sort_order?: number;
}

export interface PhaseTemplateGate {
  gate_kind: string;
  payload?: Record<string, unknown>;
  sort_order?: number;
}

export interface PhaseTemplatePhase {
  name: string;
  phase_key: string;
  duration_weeks: number;
  fee_cents: number;
  revision_limit: number;
  sort_order: number;
  deliverables: PhaseTemplateDeliverable[];
  default_gates: PhaseTemplateGate[];
}

export interface PhaseTemplate {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  is_system: boolean;
  designer_id: string | null;
  studio_id: string | null;
  phases: PhaseTemplatePhase[];
  created_at: string;
  updated_at: string;
}

/**
 * List system templates plus custom templates frozen to the proposal's exact
 * studio. A caller with multiple workspaces must never see Studio A's custom
 * template while authoring Studio B's proposal.
 */
export function usePhaseTemplates(studioId: string | null) {
  return useQuery<PhaseTemplate[]>({
    queryKey: ['phase-templates', studioId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase
        .from('phase_templates')
        .select('*');
      query = studioId
        ? query.or(`is_system.eq.true,studio_id.eq.${studioId}`)
        : query.eq('is_system', true);
      const { data, error } = await query.order('label', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhaseTemplate[];
    },
  });
}

/**
 * Apply a phase template (by slug) to an existing proposal. Calls the
 * `apply_phase_template` RPC which inserts proposal_phases (with
 * deliverables + default gates) appended after any existing phases.
 *
 * Resolves to the array of inserted phase IDs so the caller can focus
 * the UI on the newly added phases.
 */
export function useApplyPhaseTemplate() {
  const queryClient = useQueryClient();
  return useMutation<
    string[],
    Error,
    { proposalId: string; templateSlug: string; requestId: string }
  >({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({ proposalId, templateSlug, requestId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('apply_phase_template', {
        p_proposal_id: proposalId,
        p_template_slug: templateSlug,
        p_request_id: requestId,
      });
      if (error) throw error;

      // RPC returns SETOF UUID. Supabase JS surfaces this either as a
      // string[] or as a list of {apply_phase_template: string} rows
      // depending on the version. Normalize to a flat string[].
      if (Array.isArray(data)) {
        return data.map((row: unknown) => {
          if (typeof row === 'string') return row;
          if (row && typeof row === 'object' && 'apply_phase_template' in row) {
            return String((row as { apply_phase_template: string }).apply_phase_template);
          }
          return String(row);
        });
      }
      if (data == null) return [];
      return [String(data)];
    },
    onSuccess: async (_phaseIds, { proposalId }) => {
      // Refresh phases + the scope summary + per-phase children.
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['phase-deliverables'] });
      queryClient.invalidateQueries({ queryKey: ['phase-gates'] });
      await invalidateProposalClientQueries(queryClient, proposalId);
    },
  });
}
