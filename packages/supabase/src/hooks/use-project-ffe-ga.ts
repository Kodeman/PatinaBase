import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ArchiveProjectSelectionRequest,
  CreateNamedProjectNeedRequest,
  CreateProjectBoardRequest,
  PlaceProductInProjectRequest,
  PlaceProductInProjectResult,
  PromoteBoardReferenceRequest,
  PublishProjectReviewRequest,
  PublishProjectReviewResult,
  SupersedeProjectSelectionRequest,
  TriageProjectFfeItemsRequest,
} from '@patina/types';
import { createBrowserClient } from '../client';
import { boardOwnerQueryKeys } from './use-boards';
import { invalidateFfeCaches } from './use-procurement';
import { useOptimisticMutation } from './optimistic';

type JsonRecord = Record<string, unknown>;

export interface ProjectFfeReadiness {
  selectionId: string;
  ready: boolean;
  missingFields: string[];
}

export interface ProjectReviewAttention {
  feedbackId: string;
  selectionId: string;
  verdict: 'rejected' | 'comment';
  createdAt: string;
}

async function callJsonCommand<Result>(name: string, request: object): Promise<Result> {
  // Generated function types arrive with the migration lane; this compatibility
  // cast keeps the web lane buildable while preserving one public RPC boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient() as any;
  const { data, error } = await supabase.rpc(name, { p_request: request });
  if (error) throw error;
  return data as Result;
}

function responseString(data: unknown, camel: string, snake: string): string {
  if (typeof data === 'string') return data;
  const row = (data ?? {}) as JsonRecord;
  const value = row[camel] ?? row[snake];
  if (typeof value !== 'string') throw new Error(`${snake} was not returned`);
  return value;
}

function normalizePlacement(data: unknown): PlaceProductInProjectResult {
  const row = (data ?? {}) as JsonRecord;
  const outcome = row.outcome;
  if (!['created', 'reused', 'filled', 'held'].includes(String(outcome))) {
    throw new Error('outcome was not returned');
  }
  const selectionId = typeof row.selectionId === 'string' ? row.selectionId : null;
  if (outcome !== 'held' && !selectionId) throw new Error('selectionId was not returned');
  return {
    outcome: outcome as PlaceProductInProjectResult['outcome'],
    selectionId,
    threadId: typeof row.threadId === 'string' ? row.threadId : null,
    placementId: (row.placementId ?? row.placement_id ?? null) as string | null,
    ...(['fixed', 'allowance', 'tbd'].includes(String(row.itemType))
      ? { itemType: row.itemType as PlaceProductInProjectResult['itemType'] }
      : {}),
    ...(typeof row.roleConfigurationIdentity === 'string'
      ? { roleConfigurationIdentity: row.roleConfigurationIdentity }
      : {}),
  };
}

function normalizeReadiness(data: unknown): ProjectFfeReadiness {
  const row = (data ?? {}) as JsonRecord;
  if (typeof row.selectionId !== 'string' || typeof row.ready !== 'boolean') {
    throw new Error('Authoritative FF&E readiness was not returned');
  }
  return {
    ...row,
    selectionId: row.selectionId,
    ready: row.ready,
    missingFields: Array.isArray(row.missingFields)
      ? row.missingFields.filter((field): field is string => typeof field === 'string')
      : [],
  };
}

function normalizeReadinessBatch(data: unknown, ids: readonly string[]): ProjectFfeReadiness[] {
  if (!Array.isArray(data) || data.length !== ids.length) {
    throw new Error('Authoritative FF&E readiness batch was not returned');
  }
  return data.map((entry: unknown, index) => {
    const row = (entry ?? {}) as JsonRecord;
    if (row.selectionId !== ids[index] || row.error === undefined) {
      throw new Error('Authoritative FF&E readiness batch was not returned');
    }
    if (row.error !== null) throw row.error;
    return normalizeReadiness(row.readiness);
  });
}

export function useProjectFfeReadiness(selectionIds: readonly string[]) {
  const ids = [...new Set(selectionIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['project-ffe-readiness', ids],
    enabled: ids.length > 0,
    queryFn: async ({ signal }: { signal?: AbortSignal } = {}): Promise<ProjectFfeReadiness[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const read = async (name: string, parameters: object) => {
        signal?.throwIfAborted();
        const request = supabase.rpc(name, parameters);
        const response = await (signal ? request.abortSignal(signal) : request);
        signal?.throwIfAborted();
        return response;
      };
      const results: ProjectFfeReadiness[] = [];
      for (let start = 0; start < ids.length; start += 100) {
        const chunk = ids.slice(start, start + 100);
        const { data, error } = await read('get_project_ffe_readiness_batch', {
          p_ffe_item_ids: chunk,
        });
        if (error) {
          // 00880 ships revoked; older servers may not expose it yet. Probe once
          // per query, never memoize availability across users or projects.
          if (!['42501', 'PGRST202', '42883'].includes(error.code)) throw error;
          break;
        }
        results.push(...normalizeReadinessBatch(data, chunk));
      }
      // Only unavailable chunks fall back. Per-entry refusals and unexpected
      // failures reject the query; they must never turn into ready results.
      let cursor = results.length;
      const worker = async (): Promise<void> => {
        for (;;) {
          const index = cursor++;
          if (index >= ids.length) return;
          const { data, error } = await read('get_project_ffe_readiness', {
            p_ffe_item_id: ids[index],
          });
          if (error) throw error;
          results[index] = normalizeReadiness(data);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(8, ids.length - results.length) }, () => worker()),
      );
      return results;
    },
    staleTime: 15_000,
  });
}

export function useProjectReviewAttention(projectId: string) {
  return useQuery({
    queryKey: ['project-review-attention', projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectReviewAttention[]> => {
      // Studio-owned review feedback is a working projection. Clients never
      // use this path; their reads stay behind the curated review RPC.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data, error } = await supabase
        .from('item_feedback')
        .select(`
          id, verdict, created_at, resolved_at,
          review_item:project_review_items!inner(
            source_ffe_item_id,
            edition:project_review_editions!inner(project_id, status)
          )
        `)
        .eq('review_item.edition.project_id', projectId)
        .eq('review_item.edition.status', 'published')
        .in('verdict', ['rejected', 'comment'])
        .is('resolved_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, any>>).flatMap((row) => {
        const reviewItem = Array.isArray(row.review_item) ? row.review_item[0] : row.review_item;
        const selectionId = reviewItem?.source_ffe_item_id;
        if (typeof selectionId !== 'string' || !['rejected', 'comment'].includes(row.verdict)) {
          return [];
        }
        return [{
          feedbackId: String(row.id),
          selectionId,
          verdict: row.verdict as 'rejected' | 'comment',
          createdAt: String(row.created_at),
        }];
      });
    },
  });
}

function invalidateProjectFfe(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  boardId?: string | null,
) {
  invalidateFfeCaches(queryClient, projectId);
  queryClient.invalidateQueries({
    queryKey: boardOwnerQueryKeys.list({ kind: 'project', id: projectId }),
  });
  queryClient.invalidateQueries({
    queryKey: boardOwnerQueryKeys.withItems({ kind: 'project', id: projectId }),
  });
  queryClient.invalidateQueries({ queryKey: ['project-review-editions', projectId] });
  queryClient.invalidateQueries({ queryKey: ['project-review-attention', projectId] });
  if (boardId) queryClient.invalidateQueries({ queryKey: ['board', boardId] });
}

export function usePlaceProductInProjectV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: PlaceProductInProjectRequest) =>
      normalizePlacement(await callJsonCommand<unknown>('place_product_in_project_v2', request)),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId, request.boardId),
  });
}

export function useCreateProjectBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateProjectBoardRequest): Promise<string> =>
      responseString(await callJsonCommand<unknown>('create_project_board', request), 'boardId', 'board_id'),
    onSuccess: (_boardId, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function usePromoteBoardReferenceToSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: PromoteBoardReferenceRequest) =>
      normalizePlacement(
        await (createBrowserClient() as any).rpc('promote_board_reference_to_selection', {
          p_board_item_id: request.boardItemId,
          p_request: {
            assignmentScope: request.assignmentScope,
            roomId: request.roomId ?? null,
            disposition: request.disposition ?? 'candidate',
            duplicateMode: request.duplicateMode,
            idempotencyKey: request.idempotencyKey,
            // Omitted keys stay absent: the RPC falls back to the pin's
            // product, and a JSON null sourceMetadata would corrupt routing_source.
            ...(request.name ? { name: request.name } : {}),
            ...(request.productId ? { productId: request.productId } : {}),
            ...(request.sourceMetadata ? { sourceMetadata: request.sourceMetadata } : {}),
          },
        }).then(({ data, error }: { data: unknown; error: unknown }) => {
          if (error) throw error;
          return data;
        }),
      ),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

const NO_NEEDS: CreateNamedProjectNeedRequest[] = [];

/**
 * Adds a named line to the schedule. With `optimistic` (US-34 N3, flag
 * `optimistic-ink`) the caller draws the line at once from `pending` (M13:
 * one list, so a `variables` ghost); the RPC's selection is the receipt, and
 * the write stays pending until the project's lines have re-read (M1b), so
 * the ghost hands over to the real line without a gap.
 */
export function useCreateNamedProjectNeed(options: { optimistic?: boolean } = {}) {
  const queryClient = useQueryClient();
  const plain = useMutation({
    mutationFn: async (request: CreateNamedProjectNeedRequest): Promise<PlaceProductInProjectResult> =>
      normalizePlacement(await callJsonCommand<unknown>('create_named_project_need', request)),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId, request.boardId),
  });
  const ink = useOptimisticMutation<CreateNamedProjectNeedRequest, PlaceProductInProjectResult>({
    honesty: 'internal',
    scopeId: 'named-project-need',
    keys: [],
    meta: { errorSurface: 'inline' },
    // The receipt: normalizePlacement throws on an empty answer, and on any
    // outcome but `held` that names no selection (R6).
    mutationFn: async (request) =>
      normalizePlacement(await callJsonCommand<unknown>('create_named_project_need', request)),
    apply: (current) => current,
    invert: (current) => current,
    onSuccess: async (_result, request) => {
      invalidateProjectFfe(queryClient, request.projectId, request.boardId);
      // The receipt names the line but is not the line, so the ghost stays
      // until the lines have re-read. A failed or offline read is read again;
      // the create never runs twice.
      const lines = { queryKey: ['project-ffe-items', request.projectId], type: 'active' } as const;
      for (let attempt = 0; ; attempt += 1) {
        // Joins the re-read just started above; it never starts a second one.
        await queryClient.refetchQueries(lines, { cancelRefetch: false });
        const stale = queryClient.getQueryCache().findAll(lines).some((query) => query.state.isInvalidated);
        if (!stale) return;
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 30_000)));
      }
    },
  });
  return options.optimistic ? ink : { ...plain, pending: NO_NEEDS };
}

export function useTriageProjectFfeItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: TriageProjectFfeItemsRequest) =>
      callJsonCommand<unknown>('triage_project_ffe_items', {
        projectId: request.projectId,
        selectionIds: request.selectionIds,
        assignmentScope: request.assignmentScope,
        roomId: request.roomId ?? null,
        disposition: request.disposition,
      }),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useArchiveProjectSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: ArchiveProjectSelectionRequest) => {
      const { data, error } = await (createBrowserClient() as any).rpc('archive_project_selection', {
        p_ffe_item_id: request.selectionId,
        p_reason: request.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useSupersedeProjectSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SupersedeProjectSelectionRequest) =>
      callJsonCommand<unknown>('supersede_project_selection', {
        selectionId: request.selectionId,
        productId: request.productId ?? null,
        name: request.name ?? null,
        placementIds: request.placementIds,
      }),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function usePublishProjectReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: PublishProjectReviewRequest): Promise<PublishProjectReviewResult> => {
      const row = await callJsonCommand<JsonRecord>('publish_project_review', request);
      return {
        editionId: responseString(row, 'editionId', 'edition_id'),
        editionNumber: Number(row.editionNumber ?? row.edition_number ?? 0),
        status: 'published',
        snapshotHash: responseString(row, 'snapshotHash', 'snapshot_hash'),
        itemCount: Number(row.itemCount ?? row.item_count ?? 0),
      };
    },
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}
