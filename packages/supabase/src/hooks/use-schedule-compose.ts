import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { MilestoneKind, MilestoneStatus } from '@patina/utils';

// ═══════════════════════════════════════════════════════════════════════════
// The Document · Schedule (C4) — Slice 03 (Compose) write paths, PROJECT side.
//
// use-schedule.ts stays read-only (the Spine's fetch + useResolvedSchedule
// door); every mutation that writes schedule_milestones or the project_phases
// chain columns (duration_days/anchor_date/follows_phase_id/lane — 00323)
// lives here instead. Nothing in this module computes a date — resolveSchedule
// (@patina/utils) is still the ONE pure time engine; these hooks only persist
// the entry-grammar's parsed output (packages/utils/src/schedule-entry.ts)
// and invalidate the caches useResolvedSchedule composes from
// (['project-phases', id] + ['schedule-milestones', id]).
//
// Proposal-side compose mutations (proposal_phases chain columns,
// proposal_schedule_milestones) live in use-scope-builder.ts next to the rest
// of the proposal-phase hooks, not here.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE MILESTONES (project side)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert a schedule_milestones row under a project_phases parent. `projectId`
 * is not a column on the table (it hangs off phase_id only) — it is required
 * here purely for cache invalidation, matching useScheduleMilestones' key.
 */
export function useAddScheduleMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      name,
      kind,
      offsetDays,
      anchorDate,
    }: {
      /** Required for invalidation only — not a column on schedule_milestones. */
      projectId: string;
      phaseId: string;
      name: string;
      kind?: MilestoneKind;
      /**
       * The entry grammar's two branches (S2 parseScheduleEntry) — pass
       * exactly one. Omitted keys are left out of the insert (DB default
       * applies); this is a create path, so there is no "clear" semantic.
       */
      offsetDays?: number | null;
      anchorDate?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('schedule_milestones')
        .select('sort_order')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const insert: Record<string, unknown> = {
        phase_id: phaseId,
        name,
        sort_order: nextOrder,
      };
      if (kind !== undefined) insert.kind = kind;
      if (offsetDays !== undefined) insert.offset_days = offsetDays;
      if (anchorDate !== undefined) insert.anchor_date = anchorDate;

      const { data, error } = await supabase
        .from('schedule_milestones')
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    },
  });
}

export function useUpdateScheduleMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
      name,
      kind,
      offsetDays,
      anchorDate,
      status,
      sortOrder,
    }: {
      milestoneId: string;
      /** Required for invalidation only — not a column on schedule_milestones. */
      projectId: string;
      name?: string;
      kind?: MilestoneKind;
      /**
       * Omit to leave a column untouched; pass null to clear it. The chip
       * unpin affordance (S3 milestone-row.tsx) clears anchorDate this way.
       */
      offsetDays?: number | null;
      anchorDate?: string | null;
      status?: MilestoneStatus;
      sortOrder?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (kind !== undefined) updates.kind = kind;
      if (offsetDays !== undefined) updates.offset_days = offsetDays;
      if (anchorDate !== undefined) updates.anchor_date = anchorDate;
      if (status !== undefined) updates.status = status;
      if (sortOrder !== undefined) updates.sort_order = sortOrder;

      const { data, error } = await supabase
        .from('schedule_milestones')
        .update(updates)
        .eq('id', milestoneId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    },
  });
}

export function useRemoveScheduleMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
    }: {
      milestoneId: string;
      /** Required for invalidation only — not a column on schedule_milestones. */
      projectId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('schedule_milestones').delete().eq('id', milestoneId);
      if (error) throw error;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT PHASE CHAIN (00323 columns: duration_days / anchor_date /
// follows_phase_id / lane) — project_phases identity fields (name, phase_key,
// status, fee_cents, ...) stay on useUpdateProjectPhaseStatus /
// useUpdateProjectPhaseDates in use-project-v2.ts; this hook is chain-only.
// ═══════════════════════════════════════════════════════════════════════════

export function useUpdateProjectPhaseChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      durationDays,
      anchorDate,
      followsPhaseId,
      lane,
    }: {
      phaseId: string;
      projectId: string;
      /**
       * Omit to leave a column untouched; pass null to clear it (lane is
       * NOT NULL — omit rather than null it).
       */
      durationDays?: number | null;
      anchorDate?: string | null;
      followsPhaseId?: string | null;
      lane?: 'main' | 'thread';
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const updates: Record<string, unknown> = {};
      if (durationDays !== undefined) updates.duration_days = durationDays;
      if (anchorDate !== undefined) updates.anchor_date = anchorDate;
      if (followsPhaseId !== undefined) updates.follows_phase_id = followsPhaseId;
      if (lane !== undefined) updates.lane = lane;

      const { data, error } = await supabase
        .from('project_phases')
        .update(updates)
        .eq('id', phaseId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE PHASE WITH RELINK
// ═══════════════════════════════════════════════════════════════════════════

/** One relink step: point `phaseId`'s follows_phase_id at `followsPhaseId`. */
export interface PhaseRelinkUpdate {
  phaseId: string;
  followsPhaseId: string | null;
}

/**
 * Delete a project_phases row without fragmenting the chain. `relinkUpdates`
 * is computed by the caller from the pure `relinkOnDelete` helper (T22,
 * lib/document/schedule-compose-derivation.ts in the designer portal) — the
 * deleted phase's followers, re-pointed at the deleted phase's own
 * predecessor.
 *
 * Sequence matters: relink FIRST, then delete. project_phases_follows_phase_id_fkey
 * is ON DELETE SET NULL — deleting before relinking would let Postgres null
 * out any follower this array doesn't explicitly cover, silently orphaning
 * it from the chain instead of re-linking it past the deleted phase.
 *
 * NOT transactional: these are sequential awaited PostgREST calls, not one
 * statement. A mid-sequence failure leaves some relinks applied and the
 * phase still present — the thrown error propagates to the caller (no
 * partial-success silent state); the UI must surface it. A future RPC
 * wrapping this in a single plpgsql transaction can harden it.
 */
export function useDeletePhaseWithRelink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      relinkUpdates,
    }: {
      projectId: string;
      phaseId: string;
      relinkUpdates: PhaseRelinkUpdate[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      for (const { phaseId: followerId, followsPhaseId } of relinkUpdates) {
        const { error: relinkError } = await supabase
          .from('project_phases')
          .update({ follows_phase_id: followsPhaseId })
          .eq('id', followerId);
        if (relinkError) throw relinkError;
      }

      const { error: deleteError } = await supabase.from('project_phases').delete().eq('id', phaseId);
      if (deleteError) throw deleteError;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BIRTH WRAPPERS (R100 — a schedule is created once and never rebuilt; both
// RPCs refuse if the target already has phases)
// ═══════════════════════════════════════════════════════════════════════════

/** Thin wrapper over the `seed_project_schedule_from_template` RPC (00324). */
export function useSeedProjectScheduleFromTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      templateSlug,
    }: {
      projectId: string;
      templateSlug: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('seed_project_schedule_from_template', {
        p_project_id: projectId,
        p_template_slug: templateSlug,
      });
      if (error) throw error;
      return (data ?? []) as string[];
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    },
  });
}

/**
 * Thin wrapper over the `copy_schedule_as_built` RPC (00324) — clones a
 * source project's schedule as an as-built chain onto EXACTLY ONE target
 * (proposal OR project; the RPC itself enforces this — mirrored here so the
 * caller fails fast with a readable message instead of a Postgres exception).
 */
export function useCopyScheduleAsBuilt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceProjectId,
      targetProposalId,
      targetProjectId,
    }: {
      sourceProjectId: string;
      targetProposalId?: string;
      targetProjectId?: string;
    }) => {
      if ((targetProposalId == null) === (targetProjectId == null)) {
        throw new Error(
          'useCopyScheduleAsBuilt: pass exactly one of targetProposalId / targetProjectId'
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('copy_schedule_as_built', {
        p_source_project_id: sourceProjectId,
        p_target_proposal_id: targetProposalId ?? null,
        p_target_project_id: targetProjectId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as string[];
    },
    onSuccess: (_, { targetProposalId, targetProjectId }) => {
      if (targetProjectId) {
        queryClient.invalidateQueries({ queryKey: ['project-phases', targetProjectId] });
        queryClient.invalidateQueries({ queryKey: ['schedule-milestones', targetProjectId] });
        queryClient.invalidateQueries({ queryKey: ['project-v2', targetProjectId] });
      } else if (targetProposalId) {
        queryClient.invalidateQueries({ queryKey: ['proposal-phases', targetProposalId] });
        queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', targetProposalId] });
        queryClient.invalidateQueries({ queryKey: ['proposal', targetProposalId] });
      }
    },
  });
}
