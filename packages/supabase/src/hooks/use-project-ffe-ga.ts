import { useMutation, useQueryClient } from '@tanstack/react-query';
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

type JsonRecord = Record<string, unknown>;

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function rpcRequest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rpcRequest);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => [snakeKey(key), rpcRequest(item)]),
  );
}

async function callCommand<Result>(name: string, request: object): Promise<Result> {
  // Generated function types arrive with the migration lane; this compatibility
  // cast keeps the web lane buildable while preserving one public RPC boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient() as any;
  const { data, error } = await supabase.rpc(name, { request: rpcRequest(request) });
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
  return {
    outcome: (row.outcome ?? 'created') as PlaceProductInProjectResult['outcome'],
    selectionId: responseString(row, 'selectionId', 'selection_id'),
    selectionThreadId: responseString(row, 'selectionThreadId', 'selection_thread_id'),
    placementId: (row.placementId ?? row.placement_id ?? null) as string | null,
  };
}

function invalidateProjectFfe(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  invalidateFfeCaches(queryClient, projectId);
  queryClient.invalidateQueries({
    queryKey: boardOwnerQueryKeys.list({ kind: 'project', id: projectId }),
  });
  queryClient.invalidateQueries({
    queryKey: boardOwnerQueryKeys.withItems({ kind: 'project', id: projectId }),
  });
  queryClient.invalidateQueries({ queryKey: ['project-review-editions', projectId] });
}

export function usePlaceProductInProjectV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: PlaceProductInProjectRequest) =>
      normalizePlacement(await callCommand<unknown>('place_product_in_project_v2', request)),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useCreateProjectBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateProjectBoardRequest): Promise<string> =>
      responseString(await callCommand<unknown>('create_project_board', request), 'boardId', 'board_id'),
    onSuccess: (_boardId, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function usePromoteBoardReferenceToSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: PromoteBoardReferenceRequest) =>
      normalizePlacement(
        await callCommand<unknown>('promote_board_reference_to_selection', request),
      ),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useCreateNamedProjectNeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateNamedProjectNeedRequest): Promise<string> =>
      responseString(
        await callCommand<unknown>('create_named_project_need', request),
        'selectionId',
        'selection_id',
      ),
    onSuccess: (_selectionId, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useTriageProjectFfeItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: TriageProjectFfeItemsRequest) =>
      callCommand<unknown>('triage_project_ffe_items', request),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useArchiveProjectSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ArchiveProjectSelectionRequest) =>
      callCommand<unknown>('archive_project_selection', request),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function useSupersedeProjectSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SupersedeProjectSelectionRequest) =>
      callCommand<unknown>('supersede_project_selection', request),
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}

export function usePublishProjectReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: PublishProjectReviewRequest): Promise<PublishProjectReviewResult> => {
      const row = await callCommand<JsonRecord>('publish_project_review', request);
      return {
        editionId: responseString(row, 'editionId', 'edition_id'),
        editionNumber: Number(row.editionNumber ?? row.edition_number ?? 0),
        status: 'published',
        deliveryStatus: (row.deliveryStatus ?? row.delivery_status ?? 'not_requested') as
          PublishProjectReviewResult['deliveryStatus'],
      };
    },
    onSuccess: (_result, request) => invalidateProjectFfe(queryClient, request.projectId),
  });
}
