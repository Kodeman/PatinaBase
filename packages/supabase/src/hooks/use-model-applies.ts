'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { smsReviewKeys } from './use-sms-review';
import { invalidateProjectWorkflow } from './use-project-workflow';
import type { Database } from '../database.types';

// ═══════════════════════════════════════════════════════════════════════════
// MODEL APPLIES — what Patina changed on its own from a text (00787, V23 R2)
//
// One model_applies row per target row an autonomous apply moved (a field text
// can move several: mark_done also unblocks tasks/FF&E lines, all sharing the
// text's source_id). RLS bounds the read to the viewer's active studios.
// Undo puts back every row of one text in one transaction through
// revert_model_apply_group: any conflict wins and nothing is written.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export type ModelApplyRow = Pick<
  Database['public']['Tables']['model_applies']['Row'],
  | 'id'
  | 'studio_id'
  | 'project_id'
  | 'source'
  | 'source_id'
  | 'effect_type'
  | 'target_table'
  | 'target_id'
  | 'inserted'
  | 'summary'
  | 'applied_at'
  | 'reverted_at'
  | 'revert_outcome'
> & { project: { id: string; name: string | null } | null };

export interface ModelAppliesFilter {
  projectId?: string | null;
  sourceId?: string | null;
  /** ISO timestamp; only applies at or after it. */
  since?: string | null;
  enabled?: boolean;
}

export const modelAppliesKeys = {
  all: ['model-applies'] as const,
  list: (projectId: string | null, since: string | null, sourceId: string | null) =>
    ['model-applies', projectId, since, sourceId] as const,
};

/** Applies for the viewer's studios (optionally one project / since a time),
 *  latest first, reverted ones included. */
export function useModelApplies(filter: ModelAppliesFilter = {}) {
  const projectId = filter.projectId ?? null;
  const since = filter.since ?? null;
  const sourceId = filter.sourceId ?? null;
  return useQuery({
    queryKey: modelAppliesKeys.list(projectId, since, sourceId),
    enabled: filter.enabled ?? true,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async ({ signal }): Promise<ModelApplyRow[]> => {
      const supabase = getSupabase();
      const pageQuery = (includeSince = true) => {
        let query = supabase
          .from('model_applies')
          .select(
            'id, studio_id, project_id, source, source_id, effect_type, target_table, target_id, inserted, summary, applied_at, reverted_at, revert_outcome, project:projects(id, name)',
          )
          .eq('source', 'sms')
          .order('applied_at', { ascending: false })
          .order('id', { ascending: false });
        if (projectId) query = query.eq('project_id', projectId);
        if (includeSince && since) query = query.gte('applied_at', since);
        if (sourceId) query = query.eq('source_id', sourceId);
        return query;
      };
      const readPages = async <T,>(query: any): Promise<T[]> => {
        const rows: T[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await query
            .abortSignal(signal)
            .range(offset, offset + 999);
          if (error) throw error;
          const page = (data ?? []) as T[];
          rows.push(...page);
          if (page.length < 1000) return rows;
        }
      };

      if (sourceId || !since) return readPages<ModelApplyRow>(pageQuery());

      const sourceIds: string[] = [];
      const seen = new Set<string>();
      for (let pageIndex = 0; pageIndex < 10 && sourceIds.length < 50; pageIndex += 1) {
        let discovery = supabase
          .from('model_applies')
          .select('source_id')
          .eq('source', 'sms')
          .order('applied_at', { ascending: false })
          .order('id', { ascending: false })
          .gte('applied_at', since);
        if (projectId) discovery = discovery.eq('project_id', projectId);
        const { data, error } = await discovery
          .abortSignal(signal)
          .range(pageIndex * 1000, pageIndex * 1000 + 999);
        if (error) throw error;
        const page = data ?? [];
        for (const row of page) {
          if (row.source_id && !seen.has(row.source_id)) {
            seen.add(row.source_id);
            sourceIds.push(row.source_id);
            if (sourceIds.length === 50) break;
          }
        }
        if (page.length < 1000) break;
      }
      if (sourceIds.length === 0) return [];

      // The 50-text bound is deliberate for the Desk's today list (D8 has no more affordance).
      const batchedQuery = pageQuery(false).in('source_id', sourceIds);
      return readPages<ModelApplyRow>(batchedQuery);
    },
  });
}

export type RevertModelApplyOutcome = 'restored' | 'conflict' | 'already';

export interface RevertModelApplyInput {
  /** The text (sms_messages.id) whose applies are put back together. */
  sourceId: string;
  /** Carried for cache scoping (the project's coordination/tasks). */
  projectId?: string | null;
}

export interface RevertModelApplyResult {
  outcome: RevertModelApplyOutcome;
  sourceId?: string;
  restored?: number;
  conflicts?: string[];
}

/**
 * Undo everything one text applied (revert_model_apply_group, 00787). A
 * conflict writes nothing; restored/already settle the same way in the UI.
 * Sweeps the log, the margin, the SMS review queue and the surfaces a field
 * effect touches, as useReviewSmsMessage does.
 */
export function useRevertModelApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: RevertModelApplyInput,
    ): Promise<RevertModelApplyResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('revert_model_apply_group', {
        p_source_id: input.sourceId,
      });
      if (error) throw error;
      return data as unknown as RevertModelApplyResult;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: modelAppliesKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['margin-items'] });
      void queryClient.invalidateQueries({ queryKey: smsReviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['field-activity'] });
      void queryClient.invalidateQueries({ queryKey: ['document-state'] });
      if (input.projectId) {
        void queryClient.invalidateQueries({ queryKey: ['coordination-items', input.projectId] });
        void queryClient.invalidateQueries({ queryKey: ['section-tasks', input.projectId] });
        void queryClient.invalidateQueries({ queryKey: ['project-decisions', input.projectId] });
        void queryClient.invalidateQueries({ queryKey: ['project-ffe-items', input.projectId] });
        void invalidateProjectWorkflow(queryClient, input.projectId);
      }
    },
  });
}
