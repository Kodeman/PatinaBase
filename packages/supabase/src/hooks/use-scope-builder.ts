import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { updateProposalTotal } from '../lib/proposal-total';
import type { SchedulePhaseInput, ScheduleMilestoneInput, MilestoneKind } from '@patina/utils';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — canonical row shapes for the scope-builder tables. Shared with the
// design-system proposal sub-blocks and both portals so renderers don't redefine.
// ═══════════════════════════════════════════════════════════════════════════

export interface ProposalScopeRoom {
  id: string;
  proposal_id: string;
  name: string;
  room_type: string | null;
  dimensions: string | null;
  floor_area_sqft: number | null;
  budget_cents: number;
  ffe_categories: string[];
  notes: string | null;
  sort_order: number;
}

export interface ProposalPhase {
  id: string;
  proposal_id: string;
  name: string;
  phase_key: string | null;
  duration_weeks: number | null;
  fee_cents: number;
  revision_limit: number | null;
  gate_condition: string | null;
  deliverables: Array<{ label: string; type?: string }>;
  sort_order: number;
  /**
   * Chain columns (00324 — Schedule Compose). Nullable/defaulted on rows
   * written before this migration; `useProposalPhases` selects `*` so these
   * are always present on the wire, just possibly null.
   */
  duration_days: number | null;
  follows_phase_id: string | null;
  anchor_date: string | null;
  lane: 'main' | 'thread';
}

export interface ProposalExclusion {
  id: string;
  proposal_id: string;
  description: string;
  category: string | null;
  sort_order: number;
}

export interface ProposalPaymentMilestone {
  id: string;
  proposal_id: string;
  phase_id: string | null;
  label: string;
  percentage: number;
  amount_cents: number;
  trigger_condition: string | null;
  sort_order: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE ROOMS
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalScopeRooms(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-scope-rooms', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_scope_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddScopeRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      name,
      roomId,
      roomType,
      dimensions,
      floorAreaSqft,
      budgetCents,
      ffeCategories,
      notes,
    }: {
      proposalId: string;
      name: string;
      roomId?: string;
      roomType?: string;
      dimensions?: string;
      floorAreaSqft?: number;
      budgetCents?: number;
      ffeCategories?: string[];
      notes?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_scope_rooms')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_scope_rooms')
        .insert({
          proposal_id: proposalId,
          room_id: roomId || null,
          name,
          room_type: roomType || null,
          dimensions: dimensions || null,
          floor_area_sqft: floorAreaSqft || null,
          budget_cents: budgetCents || 0,
          ffe_categories: ffeCategories || [],
          notes: notes || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

export function useUpdateScopeRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      roomId,
      proposalId,
      updates,
    }: {
      roomId: string;
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_scope_rooms')
        .update(updates)
        .eq('id', roomId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

export function useRemoveScopeRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, proposalId }: { roomId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_scope_rooms').delete().eq('id', roomId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

/**
 * Reorder a proposal's FF&E schedule lines (Schedule & Boards Wave 1 · S3).
 *
 * `orderedIds` is the new GLOBAL order of every line in the proposal (position
 * is a global sort key; the room grouping in the UI is a view over it). Persists
 * the whole ordering in one statement via the reorder_proposal_items RPC (00263,
 * SECURITY INVOKER — RLS authorizes) and optimistically reorders the
 * ['proposal-items-schedule', proposalId] cache so the drag lands instantly,
 * rolling back on error.
 */
export function useReorderProposalItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId, orderedIds }: { proposalId: string; orderedIds: string[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('reorder_proposal_items', {
        p_proposal_id: proposalId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    onMutate: async ({ proposalId, orderedIds }) => {
      const key = ['proposal-items-schedule', proposalId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
      queryClient.setQueryData(key, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return [...old]
          .map((it: { id: string; position?: number }) =>
            rank.has(it.id) ? { ...it, position: rank.get(it.id)! } : it
          )
          .sort(
            (a: { position?: number }, b: { position?: number }) =>
              (a.position ?? 0) - (b.position ?? 0)
          );
      });
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: (_d, _e, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

/**
 * Reorder a proposal's scope rooms (Schedule & Boards Wave 1 · S3). Persists the
 * whole ordering via the reorder_proposal_scope_rooms RPC (00263, SECURITY
 * INVOKER) and optimistically reorders the ['proposal-scope-rooms', proposalId]
 * cache, rolling back on error.
 */
export function useReorderProposalScopeRooms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId, orderedIds }: { proposalId: string; orderedIds: string[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('reorder_proposal_scope_rooms', {
        p_proposal_id: proposalId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    onMutate: async ({ proposalId, orderedIds }) => {
      const key = ['proposal-scope-rooms', proposalId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
      queryClient.setQueryData(key, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return [...old]
          .map((r: { id: string; sort_order?: number }) =>
            rank.has(r.id) ? { ...r, sort_order: rank.get(r.id)! } : r
          )
          .sort(
            (a: { sort_order?: number }, b: { sort_order?: number }) =>
              (a.sort_order ?? 0) - (b.sort_order ?? 0)
          );
      });
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: (_d, _e, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL PHASES
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalPhases(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-phases', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phases')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddProposalPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      name,
      phaseKey,
      durationWeeks,
      feeCents,
      revisionLimit,
      gateCondition,
      deliverables,
      durationDays,
      anchorDate,
      followsPhaseId,
      lane,
    }: {
      proposalId: string;
      name: string;
      phaseKey?: string;
      durationWeeks?: number;
      feeCents?: number;
      revisionLimit?: number;
      gateCondition?: string;
      deliverables?: Array<{ label: string; type?: string }>;
      /**
       * Chain columns (00323/00324 — Schedule Compose). Additive: existing
       * callers that omit these keep the exact prior insert shape —
       * duration_days/anchor_date/follows_phase_id NULL, lane 'main' (the
       * column's own DB default).
       */
      durationDays?: number;
      anchorDate?: string;
      followsPhaseId?: string;
      lane?: 'main' | 'thread';
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_phases')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_phases')
        .insert({
          proposal_id: proposalId,
          name,
          phase_key: phaseKey || null,
          duration_weeks: durationWeeks || null,
          fee_cents: feeCents || 0,
          revision_limit: revisionLimit ?? 2,
          gate_condition: gateCondition || null,
          deliverables: deliverables || [],
          sort_order: nextOrder,
          duration_days: durationDays ?? null,
          anchor_date: anchorDate ?? null,
          follows_phase_id: followsPhaseId ?? null,
          lane: lane ?? 'main',
        })
        .select()
        .single();
      if (error) throw error;
      // Phase fees count toward proposals.total_amount — keep it in step.
      await updateProposalTotal(supabase, proposalId);
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

export function useUpdateProposalPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      proposalId,
      updates,
    }: {
      phaseId: string;
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phases')
        .update(updates)
        .eq('id', phaseId)
        .select()
        .single();
      if (error) throw error;
      // A fee edit changes proposals.total_amount.
      await updateProposalTotal(supabase, proposalId);
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

export function useRemoveProposalPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ phaseId, proposalId }: { phaseId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_phases').delete().eq('id', phaseId);
      if (error) throw error;
      // Removing a phase drops its fee from proposals.total_amount.
      await updateProposalTotal(supabase, proposalId);
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL SCHEDULE MILESTONES (00324 — the client-visible readonly delta,
// R101.3: proposals carry ANCHORED dates only, no offset-days branch —
// anchor_date is NOT NULL on this table, unlike schedule_milestones which
// also allows offset_days).
// ═══════════════════════════════════════════════════════════════════════════

export interface ProposalScheduleMilestone {
  id: string;
  phase_id: string;
  name: string;
  kind: string;
  anchor_date: string;
  sort_order: number;
}

/**
 * proposal_schedule_milestones for a proposal, joined through proposal_phases
 * (the table has no proposal_id of its own — every milestone hangs off a
 * phase), mirroring useScheduleMilestones' join-through-parent shape on the
 * project side (use-schedule.ts). Key `['proposal-schedule-milestones', proposalId]`.
 */
export function useProposalScheduleMilestones(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-schedule-milestones', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_schedule_milestones')
        .select('*, proposal_phases!inner(proposal_id)')
        .eq('proposal_phases.proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      // The join is a filter only — strip the embed so the returned shape is
      // exactly the proposal_schedule_milestones row.
      return (data ?? []).map((row: ProposalScheduleMilestone & { proposal_phases?: unknown }) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { proposal_phases: _joined, ...rest } = row;
        return rest as ProposalScheduleMilestone;
      });
    },
    enabled: !!proposalId,
  });
}

export function useAddProposalScheduleMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      name,
      kind,
      anchorDate,
    }: {
      /** Required for invalidation only — not a column on proposal_schedule_milestones. */
      proposalId: string;
      phaseId: string;
      name: string;
      kind?: string;
      /** NOT NULL on this table — proposals carry anchored dates only (R101.3). */
      anchorDate: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_schedule_milestones')
        .select('sort_order')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_schedule_milestones')
        .insert({
          phase_id: phaseId,
          name,
          kind: kind || 'event',
          anchor_date: anchorDate,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-schedule-milestones', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

export function useUpdateProposalScheduleMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
      updates,
    }: {
      milestoneId: string;
      /** Required for invalidation only — not a column on proposal_schedule_milestones. */
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_schedule_milestones')
        .update(updates)
        .eq('id', milestoneId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-schedule-milestones', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

export function useRemoveProposalScheduleMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
    }: {
      milestoneId: string;
      /** Required for invalidation only — not a column on proposal_schedule_milestones. */
      proposalId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_schedule_milestones').delete().eq('id', milestoneId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-schedule-milestones', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PURE ROW → RESOLVER-INPUT MAPPERS (Slice 03 §4 — the proposal-side
// equivalents of use-schedule.ts's mapPhaseRowToScheduleInput /
// mapMilestoneRowToScheduleInput). Feed PhaseBuilder's ScheduleBirth /
// GhostAddLine so the compute-preview line resolves against the REAL
// committed proposal chain (R100 — resolveSchedule stays the only engine;
// this only reshapes rows). proposal_phases has no `status` column (a
// proposal phase is always notionally 'pending' pre-activation) and
// proposal_schedule_milestones has neither `offset_days` nor `status`
// (R101.3 — always a hard anchor date) — both map to the resolver's
// closest honest constant rather than a DB column that doesn't exist.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Narrowed to the chain columns only (Pick, not the full ProposalPhase) so a
 * caller with its own row shape (e.g. PhaseBuilder's local ProposalPhaseRow,
 * which omits `deliverables`) can pass it structurally without carrying
 * fields this mapper never reads.
 */
export type ProposalPhaseChainRow = Pick<
  ProposalPhase,
  'id' | 'name' | 'duration_days' | 'duration_weeks' | 'follows_phase_id' | 'anchor_date' | 'lane' | 'sort_order'
>;

export function mapProposalPhaseRowToScheduleInput(row: ProposalPhaseChainRow): SchedulePhaseInput {
  return {
    id: row.id,
    name: row.name,
    durationDays: row.duration_days ?? null,
    durationWeeks: row.duration_weeks ?? null,
    followsPhaseId: row.follows_phase_id ?? null,
    anchorDate: row.anchor_date ?? null,
    lane: row.lane === 'thread' ? 'thread' : 'main',
    startDate: null,
    targetEndDate: null,
    sortOrder: row.sort_order ?? 0,
    status: 'pending',
  };
}

const PROPOSAL_MILESTONE_KINDS: readonly MilestoneKind[] = ['signoff', 'decision', 'delivery', 'event'];

export function mapProposalScheduleMilestoneRowToScheduleInput(
  row: ProposalScheduleMilestone
): ScheduleMilestoneInput {
  return {
    id: row.id,
    phaseId: row.phase_id,
    name: row.name,
    kind: (PROPOSAL_MILESTONE_KINDS as readonly string[]).includes(row.kind)
      ? (row.kind as MilestoneKind)
      : 'event',
    offsetDays: null, // proposal milestones are never offset — always anchored (R101.3)
    anchorDate: row.anchor_date,
    status: 'upcoming',
    sortOrder: row.sort_order ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL EXCLUSIONS
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalExclusions(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-exclusions', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_exclusions')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      description,
      category,
    }: {
      proposalId: string;
      description: string;
      category?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_exclusions')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_exclusions')
        .insert({
          proposal_id: proposalId,
          description,
          category: category || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-exclusions', proposalId] });
    },
  });
}

export function useRemoveExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ exclusionId, proposalId }: { exclusionId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_exclusions').delete().eq('id', exclusionId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-exclusions', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT MILESTONES
// ═══════════════════════════════════════════════════════════════════════════

async function invalidateProposalPaymentSchedule(
  queryClient: QueryClient,
  proposalId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ['proposal-payment-milestones', proposalId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['proposal-mirror', proposalId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['drafting-facets', proposalId],
    }),
  ]);
}

export function useProposalPaymentMilestones(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-payment-milestones', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_payment_milestones')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddPaymentMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['proposal-payment-schedule'],
    mutationFn: async ({
      proposalId,
      phaseId,
      label,
      percentage,
      amountCents,
      triggerCondition,
    }: {
      proposalId: string;
      phaseId?: string;
      label: string;
      percentage: number;
      amountCents?: number;
      triggerCondition?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_payment_milestones')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_payment_milestones')
        .insert({
          proposal_id: proposalId,
          phase_id: phaseId || null,
          label,
          percentage,
          amount_cents: amountCents || 0,
          trigger_condition: triggerCondition || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_, { proposalId }) => {
      await invalidateProposalPaymentSchedule(queryClient, proposalId);
    },
  });
}

export function useUpdatePaymentMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['proposal-payment-schedule'],
    mutationFn: async ({
      milestoneId,
      proposalId,
      updates,
    }: {
      milestoneId: string;
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_payment_milestones')
        .update(updates)
        .eq('id', milestoneId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_, { proposalId }) => {
      await invalidateProposalPaymentSchedule(queryClient, proposalId);
    },
  });
}

export function useRemovePaymentMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['proposal-payment-schedule'],
    mutationFn: async ({ milestoneId, proposalId }: { milestoneId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_payment_milestones').delete().eq('id', milestoneId);
      if (error) throw error;
    },
    onSuccess: async (_, { proposalId }) => {
      await invalidateProposalPaymentSchedule(queryClient, proposalId);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE ORDER TERMS
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalChangeOrderTerms(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-co-terms', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_change_order_terms')
        .select('*')
        .eq('proposal_id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!proposalId,
  });
}

export function useUpsertChangeOrderTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      processDescription,
      hourlyRateCents,
      minimumFeeCents,
      approvalRequired,
    }: {
      proposalId: string;
      processDescription: string;
      hourlyRateCents?: number;
      minimumFeeCents?: number;
      approvalRequired?: boolean;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_change_order_terms')
        .upsert(
          {
            proposal_id: proposalId,
            process_description: processDescription,
            hourly_rate_cents: hourlyRateCents || 0,
            minimum_fee_cents: minimumFeeCents || 0,
            approval_required: approvalRequired ?? true,
          },
          { onConflict: 'proposal_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-co-terms', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE BUILDER SUMMARY (aggregate)
// ═══════════════════════════════════════════════════════════════════════════

export function useScopeBuilderSummary(proposalId: string) {
  return useQuery({
    queryKey: ['scope-builder-summary', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const [roomsRes, phasesRes, itemsRes] = await Promise.all([
        supabase
          .from('proposal_scope_rooms')
          .select('budget_cents')
          .eq('proposal_id', proposalId),
        supabase
          .from('proposal_phases')
          .select('fee_cents, duration_weeks')
          .eq('proposal_id', proposalId),
        supabase
          .from('proposal_items')
          .select('line_total_cents')
          .eq('proposal_id', proposalId),
      ]);

      const rooms = roomsRes.data ?? [];
      const phases = phasesRes.data ?? [];
      const items = itemsRes.data ?? [];

      return {
        totalRooms: rooms.length,
        totalFFEItems: items.length,
        // Per-room budget inputs (designer's target allocation per room).
        totalBudgetCents: rooms.reduce((sum: number, r: { budget_cents: number }) => sum + (r.budget_cents || 0), 0),
        // Actual FF&E schedule estimate = Σ line totals (fixed qty×price +
        // allowance midpoints). This is what the "FF&E Est. Total" tile shows.
        totalFFEEstimateCents: items.reduce(
          (sum: number, i: { line_total_cents: number | null }) => sum + (i.line_total_cents || 0),
          0
        ),
        totalDesignFeeCents: phases.reduce((sum: number, p: { fee_cents: number }) => sum + (p.fee_cents || 0), 0),
        totalPhases: phases.length,
        estimatedWeeks: phases.reduce((sum: number, p: { duration_weeks: number | null }) => sum + (p.duration_weeks || 0), 0),
      };
    },
    enabled: !!proposalId,
  });
}
