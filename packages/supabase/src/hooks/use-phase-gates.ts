import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// PHASE GATES (proposal_phase_gates — see migration 00134)
// ═══════════════════════════════════════════════════════════════════════════

export type PhaseGateKind =
  | 'client_signature'
  | 'deliverables_complete'
  | 'payment_received'
  | 'designer_override'
  | 'prior_phase_signed';

export interface PhaseGate {
  id: string;
  phase_id: string;
  gate_kind: PhaseGateKind;
  payload: Record<string, unknown>;
  satisfied_at: string | null;
  satisfied_by: string | null;
  override_reason: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PhaseGateStatus = 'passed' | 'pending' | 'blocked';

/**
 * Compute the aggregate status for a phase given its gates.
 *
 *  - `passed`  — every gate has been satisfied
 *  - `pending` — there are no gates configured yet
 *  - `blocked` — at least one gate is unsatisfied AND there is no
 *               `designer_override` row sitting in the same phase
 */
export function computePhaseGateStatus(gates: PhaseGate[]): PhaseGateStatus {
  if (!gates || gates.length === 0) return 'pending';

  const allSatisfied = gates.every((g) => g.satisfied_at !== null);
  if (allSatisfied) return 'passed';

  const hasOverride = gates.some(
    (g) => g.gate_kind === 'designer_override' && g.satisfied_at !== null
  );
  if (hasOverride) return 'passed';

  return 'blocked';
}

export function usePhaseGates(phaseId: string) {
  return useQuery<PhaseGate[]>({
    queryKey: ['phase-gates', phaseId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phase_gates')
        .select('*')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhaseGate[];
    },
    enabled: !!phaseId,
  });
}

export function useAddGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      gateKind,
      payload,
    }: {
      phaseId: string;
      gateKind: PhaseGateKind;
      payload?: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_phase_gates')
        .select('sort_order')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_phase_gates')
        .insert({
          phase_id: phaseId,
          gate_kind: gateKind,
          payload: payload ?? {},
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PhaseGate;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-gates', phaseId] });
    },
  });
}

export function useUpdateGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gateId,
      updates,
    }: {
      gateId: string;
      phaseId: string;
      updates: Partial<PhaseGate>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phase_gates')
        .update(updates)
        .eq('id', gateId)
        .select()
        .single();
      if (error) throw error;
      return data as PhaseGate;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-gates', phaseId] });
    },
  });
}

export function useRemoveGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gateId,
    }: {
      gateId: string;
      phaseId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('proposal_phase_gates')
        .delete()
        .eq('id', gateId);
      if (error) throw error;
      return { gateId };
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-gates', phaseId] });
    },
  });
}

export function useSatisfyGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gateId,
    }: {
      gateId: string;
      phaseId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const { data, error } = await supabase
        .from('proposal_phase_gates')
        .update({
          satisfied_at: new Date().toISOString(),
          satisfied_by: userId,
        })
        .eq('id', gateId)
        .select()
        .single();
      if (error) throw error;
      return data as PhaseGate;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-gates', phaseId] });
    },
  });
}

/**
 * Insert a `designer_override` gate that is satisfied at creation time.
 * The override row carries the reason on `override_reason` so it is
 * visible to clients who later inspect the phase history.
 */
export function useDesignerOverrideGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      reason,
    }: {
      phaseId: string;
      reason: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const { data: existing } = await supabase
        .from('proposal_phase_gates')
        .select('sort_order')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_phase_gates')
        .insert({
          phase_id: phaseId,
          gate_kind: 'designer_override',
          payload: {},
          override_reason: reason,
          satisfied_at: new Date().toISOString(),
          satisfied_by: userId,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PhaseGate;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-gates', phaseId] });
    },
  });
}
