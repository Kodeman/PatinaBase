import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  pipelinesService,
  type CreateDesignerProspectInput,
  type DesignerProspect,
  type DesignerProspectFilters,
  type PipelineEntityType,
  type UpdateDesignerProspectInput,
} from '@/services/pipelines';
import { pipelineService, type VendorListFilters } from '@/services/vendor-pipeline';
import type { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;

// ─── Query keys ──────────────────────────────────────────────────────────────
// Mirrors use-agent-tasks.ts / use-pipeline.ts: one canonical factory,
// lists() is the invalidation root for every filtered list variant.
export const pipelineBoardKeys = {
  all: ['pipelines'] as const,
  prospects: () => [...pipelineBoardKeys.all, 'prospects'] as const,
  prospectList: (filters?: DesignerProspectFilters) =>
    [...pipelineBoardKeys.prospects(), 'list', filters ?? {}] as const,
  vendors: () => [...pipelineBoardKeys.all, 'vendors'] as const,
  vendorList: (filters?: VendorListFilters) =>
    [...pipelineBoardKeys.vendors(), 'list', filters ?? {}] as const,
};

/**
 * The Designers board's data source. filters is typically empty (the board
 * fetches every prospect and buckets client-side by stage into columns) but
 * is exposed for the "New prospect" flow / future filtering.
 */
export function useDesignerProspects(filters?: DesignerProspectFilters) {
  return useQuery({
    queryKey: pipelineBoardKeys.prospectList(filters),
    queryFn: () => pipelinesService.listDesignerProspects(filters),
    staleTime: 15_000,
  });
}

/**
 * The Makers board's data source — reuses the existing vendor-pipeline
 * service (pipelineService.listVendors) rather than duplicating it; a
 * distinct query key namespace ('pipelines'/'vendors') keeps this board's
 * cache independent of /pipeline's own useVendors() cache under
 * pipelineKeys (use-pipeline.ts) so the two surfaces don't fight over
 * invalidation timing.
 */
export function usePipelineVendorsBoard(filters?: VendorListFilters) {
  return useQuery({
    queryKey: pipelineBoardKeys.vendorList(filters),
    queryFn: () => pipelineService.listVendors(filters),
    staleTime: 15_000,
  });
}

export function useCreateDesignerProspect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDesignerProspectInput) =>
      pipelinesService.createDesignerProspect(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineBoardKeys.prospects() });
    },
  });
}

export function useUpdateDesignerProspect(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: UpdateDesignerProspectInput) =>
      pipelinesService.updateDesignerProspect(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineBoardKeys.prospects() });
    },
  });
}

export interface MoveStageInput {
  entityType: PipelineEntityType;
  entityId: string;
  toStage: string;
  note?: string;
}

/**
 * Shared drag-and-drop / action-menu stage mover for both boards.
 *
 * Optimistic: onMutate immediately rewrites the moved card's stage (and, for
 * designer_prospects, stage_entered_at) in every cached list so the card
 * jumps columns instantly instead of waiting on the round trip; onError
 * rolls back to the pre-drag snapshot; onSettled reconciles with the server.
 * Mirrors useReviewTask's snapshot/rollback shape in use-agent-tasks.ts.
 */
export function useMovePipelineStage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: MoveStageInput) => pipelinesService.moveStage(input),

    onMutate: async (input) => {
      const isProspect = input.entityType === 'designer_prospect';
      const rootKey = isProspect ? pipelineBoardKeys.prospects() : pipelineBoardKeys.vendors();

      await qc.cancelQueries({ queryKey: rootKey });

      if (isProspect) {
        const snapshots = qc.getQueriesData<DesignerProspect[]>({ queryKey: rootKey });
        const now = new Date().toISOString();
        for (const [key, rows] of snapshots) {
          if (!rows) continue;
          qc.setQueryData<DesignerProspect[]>(
            key as QueryKey,
            rows.map((r) =>
              r.id === input.entityId
                ? { ...r, stage: input.toStage as DesignerProspect['stage'], stage_entered_at: now }
                : r,
            ),
          );
        }
        return { rootKey, snapshots };
      }

      const snapshots = qc.getQueriesData<Vendor[]>({ queryKey: rootKey });
      const now = new Date().toISOString();
      for (const [key, rows] of snapshots) {
        if (!rows) continue;
        qc.setQueryData<Vendor[]>(
          key as QueryKey,
          rows.map((r) =>
            r.id === input.entityId
              ? { ...r, stage: input.toStage as Vendor['stage'], stage_changed_at: now }
              : r,
          ),
        );
      }
      return { rootKey, snapshots };
    },

    onError: (_err, _input, context) => {
      context?.snapshots?.forEach(([key, rows]) => {
        qc.setQueryData(key as QueryKey, rows);
      });
    },

    onSettled: (_data, _err, input) => {
      const isProspect = input.entityType === 'designer_prospect';
      qc.invalidateQueries({
        queryKey: isProspect ? pipelineBoardKeys.prospects() : pipelineBoardKeys.vendors(),
      });
    },
  });
}
