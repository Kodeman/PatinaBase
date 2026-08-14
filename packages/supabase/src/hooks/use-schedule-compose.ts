import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';
import type { MilestoneKind, MilestoneStatus } from '@patina/utils';
import { settleScheduleWrite } from './schedule-write-settle';

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
// BIRTH SUPPORT — past-project phase counts (the "from a past project"
// picker, Slice 03 §3/§4). ONE grouped read: project_phases is designer-scoped
// by RLS, so a bare select returns only this designer's phases; we count them
// per project_id client-side rather than firing N `useProjectPhases` queries.
// Read-only — lives here (not use-schedule.ts, the Spine's own read door)
// because it exists only to feed the birth picker, a compose surface.
// ═══════════════════════════════════════════════════════════════════════════

/** `{ [projectId]: phaseCount }` across every project the designer can read. */
export function useProjectPhaseCounts() {
  return useQuery({
    queryKey: ['project-phase-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.from('project_phases').select('project_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ project_id: string | null }>) {
        if (row.project_id) counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

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
      void settleScheduleWrite(queryClient, projectId);
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
      void settleScheduleWrite(queryClient, projectId);
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
      void settleScheduleWrite(queryClient, projectId);
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
      projectId,
      expectedUpdatedAt,
      durationDays,
      anchorDate,
      followsPhaseId,
      lane,
    }: {
      phaseId: string;
      projectId: string;
      /** Caller-observed project_phases.updated_at compare-and-swap token. */
      expectedUpdatedAt: string;
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

      const { data, error } = await supabase.rpc('update_project_phase', {
        p_project_id: projectId,
        p_phase_id: phaseId,
        p_expected_updated_at: expectedUpdatedAt,
        p_patch: updates,
      });
      if (error) throw error;
      if (
        data == null ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        (data as Record<string, unknown>).id !== phaseId ||
        (data as Record<string, unknown>).project_id !== projectId ||
        typeof (data as Record<string, unknown>).updated_at !== 'string'
      ) {
        throw new Error('useUpdateProjectPhaseChain: invalid phase receipt');
      }
      return data;
    },
    onSuccess: (_, { projectId }) => {
      void settleScheduleWrite(queryClient, projectId);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE PHASE WITH RELINK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Delete one pending project phase through 00398's atomic server boundary.
 * The browser supplies no follower list: Postgres locks the complete project
 * graph, derives every direct follower, relinks them to the deleted phase's
 * predecessor, and deletes in one transaction.
 */
export interface DeleteProjectPhaseReceipt {
  deleted_phase_id: string;
  predecessor_phase_id: string | null;
  relinked_phase_ids: string[];
}

export function useDeletePhaseWithRelink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      projectId,
    }: {
      projectId: string;
      phaseId: string;
    }): Promise<DeleteProjectPhaseReceipt> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('delete_project_phase', {
        p_project_id: projectId,
        p_phase_id: phaseId,
      });
      if (error) throw error;
      if (data == null || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('useDeletePhaseWithRelink: invalid delete receipt');
      }
      const receipt = data as Record<string, unknown>;
      const keys = Object.keys(receipt).sort();
      if (
        keys.length !== 3 ||
        keys[0] !== 'deleted_phase_id' ||
        keys[1] !== 'predecessor_phase_id' ||
        keys[2] !== 'relinked_phase_ids' ||
        receipt.deleted_phase_id !== phaseId ||
        (receipt.predecessor_phase_id !== null &&
          typeof receipt.predecessor_phase_id !== 'string') ||
        !Array.isArray(receipt.relinked_phase_ids) ||
        !receipt.relinked_phase_ids.every((id) => typeof id === 'string')
      ) {
        throw new Error('useDeletePhaseWithRelink: invalid delete receipt');
      }
      return receipt as unknown as DeleteProjectPhaseReceipt;
    },
    onSuccess: (_, { projectId }) => {
      void settleScheduleWrite(queryClient, projectId);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMIT DOOR (Slice 04, R100 "Editing: the ripple") — the ripple's single
// write path. schedule-ripple-derivation.ts (apps/designer-portal, S4-1)
// previews a `RipplePendingEdit` twice through the pure resolver; committing
// it calls the `commit_schedule_edit` RPC (00325), which applies exactly
// that edit under an ownership + project-scoped guard.
//
// `RipplePendingEditInput` below is a STRUCTURAL MIRROR of designer-portal's
// `RipplePendingEdit`, not an import of it — packages/supabase cannot depend
// on an app (the dependency direction is apps → packages, never back), so
// this type is deliberately re-declared here. TypeScript's structural typing
// makes a real `RipplePendingEdit` value assignable to this type with zero
// cast at the call site, as long as the two stay in sync (both are small,
// stable, and reviewed together).
// ═══════════════════════════════════════════════════════════════════════════

/** Mirrors `RipplePendingEdit` (apps/designer-portal/src/lib/document/
 *  schedule-ripple-derivation.ts, S4-1) field-for-field. */
export type RipplePendingEditInput =
  | { kind: 'phase-duration'; phaseId: string; durationDays: number }
  | { kind: 'phase-anchor'; phaseId: string; anchorDate: string }
  | { kind: 'milestone-offset'; milestoneId: string; phaseId: string; offsetDays: number }
  | { kind: 'milestone-anchor'; milestoneId: string; anchorDate: string };

/** The RPC boundary's shape for one edit — snake_case, `kind` preserved
 *  verbatim as the discriminant `commit_schedule_edit` (00325) switches on. */
export type SerializedRippleEdit =
  | { kind: 'phase-duration'; phase_id: string; duration_days: number }
  | { kind: 'phase-anchor'; phase_id: string; anchor_date: string }
  | { kind: 'milestone-offset'; milestone_id: string; phase_id: string; offset_days: number }
  | { kind: 'milestone-anchor'; milestone_id: string; anchor_date: string };

/**
 * Pure camelCase → snake_case mapper for the ripple's one write path. Total
 * over `RipplePendingEditInput`'s closed union — the `default` branch only
 * exists so an exhaustiveness check fires here (not at the RPC, as a
 * plpgsql "unknown kind" exception) if the union ever grows without this
 * function being updated. Exported standalone for unit testing — no
 * Supabase, no React Query involved.
 */
export function serializeRippleEditForRpc(edit: RipplePendingEditInput): SerializedRippleEdit {
  switch (edit.kind) {
    case 'phase-duration':
      return { kind: 'phase-duration', phase_id: edit.phaseId, duration_days: edit.durationDays };
    case 'phase-anchor':
      return { kind: 'phase-anchor', phase_id: edit.phaseId, anchor_date: edit.anchorDate };
    case 'milestone-offset':
      return {
        kind: 'milestone-offset',
        milestone_id: edit.milestoneId,
        phase_id: edit.phaseId,
        offset_days: edit.offsetDays,
      };
    case 'milestone-anchor':
      return {
        kind: 'milestone-anchor',
        milestone_id: edit.milestoneId,
        anchor_date: edit.anchorDate,
      };
    default: {
      const _exhaustive: never = edit;
      throw new Error(`serializeRippleEditForRpc: unknown edit kind ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Thin wrapper over the `commit_schedule_edit` RPC — the ripple's commit
 * door. `edits` is normally a ONE-element array (the ripple previews exactly
 * one pending edit at a time, T6's single-session state), but the door
 * itself is batch-shaped for Slice 05+. Invalidates every cache the
 * committed edit can move: the phase chain, the milestones, the project-v2
 * rollup the Spine/header both read, and — Slice 05 (R100 "Memory") —
 * `schedule-revisions`, since 00326's regraft cuts a new numbered revision
 * every time this RPC runs.
 *
 * ⚠ Return type: migration 00326 changed `commit_schedule_edit`'s return
 * from UUID (the placeholder `p_project_id`, pre-Slice-05) to INTEGER (the
 * newly cut revision's `v`). Callers that previously treated the resolved
 * value as an opaque string must not — it is now the revision number.
 */
export function useCommitScheduleEdit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      edits,
      reason,
    }: {
      projectId: string;
      edits: RipplePendingEditInput[];
      reason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('commit_schedule_edit', {
        p_project_id: projectId,
        p_edits: edits.map(serializeRippleEditForRpc),
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (_, { projectId }) => {
      void settleScheduleWrite(queryClient, projectId);
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
      void settleScheduleWrite(queryClient, projectId);
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
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
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
    onSuccess: async (_, { targetProposalId, targetProjectId }) => {
      if (targetProjectId) {
        void settleScheduleWrite(queryClient, targetProjectId);
      } else if (targetProposalId) {
        queryClient.invalidateQueries({ queryKey: ['proposal-phases', targetProposalId] });
        queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', targetProposalId] });
        queryClient.invalidateQueries({ queryKey: ['proposal', targetProposalId] });
        await invalidateProposalClientQueries(queryClient, targetProposalId);
      }
    },
  });
}
