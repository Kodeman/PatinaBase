import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  useArchiveProjectSelection,
  useCreateNamedProjectNeed,
  useCreateProjectBoard,
  usePlaceProductInProjectV2,
  usePromoteBoardReferenceToSelection,
  usePublishProjectReview,
  useSupersedeProjectSelection,
  useTriageProjectFfeItems,
} from '../use-project-ffe-ga';

type MutationConfig = { mutationFn: (request: any) => Promise<any> };

beforeEach(() => {
  rpc.mockReset();
  invalidateQueries.mockReset();
});

describe('project FF&E GA commands', () => {
  it('passes the canonical camelCase placement request as p_request', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'reused',
        selectionId: 'selection-1',
        threadId: 'thread-1',
        placementId: 'placement-1',
      },
      error: null,
    });
    const config = usePlaceProductInProjectV2() as unknown as MutationConfig;
    const request = {
      projectId: 'project-1',
      productId: 'product-1',
      assignmentScope: 'room',
      roomId: 'room-1',
      boardId: 'board-1',
      disposition: 'candidate',
      duplicateMode: 'reuse',
      idempotencyKey: 'request-1',
    };

    await expect(config.mutationFn(request)).resolves.toEqual({
      outcome: 'reused',
      selectionId: 'selection-1',
      threadId: 'thread-1',
      placementId: 'placement-1',
    });
    expect(rpc).toHaveBeenCalledWith('place_product_in_project_v2', {
      p_request: request,
    });
  });

  it('accepts the held outcome without fabricated selection identities', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'held', projectId: 'project-1' }, error: null });
    const config = usePlaceProductInProjectV2() as unknown as MutationConfig;

    await expect(config.mutationFn({
      projectId: 'project-1',
      productId: 'product-1',
      assignmentScope: 'unassigned',
      duplicateMode: 'hold',
      idempotencyKey: 'request-held',
    })).resolves.toEqual({
      outcome: 'held', selectionId: null, threadId: null, placementId: null,
    });
  });

  it('creates a project board with the SQL roomId shape', async () => {
    rpc.mockResolvedValue({ data: { boardId: 'board-2' }, error: null });
    const config = useCreateProjectBoard() as unknown as MutationConfig;
    const request = { projectId: 'project-1', name: 'Living room', roomId: 'room-1' };

    await expect(config.mutationFn(request)).resolves.toBe('board-2');
    expect(rpc).toHaveBeenCalledWith('create_project_board', { p_request: request });
  });

  it('creates a named need through the same canonical placement result', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'created', selectionId: 'selection-2', threadId: 'thread-2', placementId: 'placement-2' },
      error: null,
    });
    const config = useCreateNamedProjectNeed() as unknown as MutationConfig;
    const request = {
      projectId: 'project-1',
      name: 'Reading chair',
      quantity: 2,
      assignmentScope: 'room',
      roomId: 'room-1',
      boardId: 'board-1',
      disposition: 'candidate',
      source: 'named-need',
      sourceMetadata: { needKind: 'placeholder' },
      idempotencyKey: 'need-1',
    };

    await expect(config.mutationFn(request)).resolves.toEqual({
      outcome: 'created', selectionId: 'selection-2', threadId: 'thread-2', placementId: 'placement-2',
    });
    expect(rpc).toHaveBeenCalledWith('create_named_project_need', { p_request: request });
  });

  it('promotes a board item with the positional id and camelCase p_request', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'created', selectionId: 'selection-3', threadId: 'thread-3', placementId: 'reference-1' },
      error: null,
    });
    const config = usePromoteBoardReferenceToSelection() as unknown as MutationConfig;

    await config.mutationFn({
      projectId: 'project-1',
      boardItemId: 'reference-1',
      assignmentScope: 'unassigned',
      roomId: null,
      disposition: 'candidate',
      duplicateMode: 'reuse',
      idempotencyKey: 'request-3',
    });
    expect(rpc).toHaveBeenCalledWith('promote_board_reference_to_selection', {
      p_board_item_id: 'reference-1',
      p_request: {
        assignmentScope: 'unassigned',
        roomId: null,
        disposition: 'candidate',
        duplicateMode: 'reuse',
        idempotencyKey: 'request-3',
      },
    });
  });

  it('uses the exact triage, archive, and supersession signatures', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const triage = useTriageProjectFfeItems() as unknown as MutationConfig;
    const archive = useArchiveProjectSelection() as unknown as MutationConfig;
    const supersede = useSupersedeProjectSelection() as unknown as MutationConfig;

    await triage.mutationFn({
      projectId: 'project-1', selectionIds: ['selection-1'], assignmentScope: 'room',
      roomId: 'room-1', disposition: 'selected',
    });
    expect(rpc).toHaveBeenLastCalledWith('triage_project_ffe_items', {
      p_request: {
        projectId: 'project-1', selectionIds: ['selection-1'], assignmentScope: 'room',
        roomId: 'room-1', disposition: 'selected',
      },
    });

    await archive.mutationFn({ projectId: 'project-1', selectionId: 'selection-1', reason: 'No longer needed' });
    expect(rpc).toHaveBeenLastCalledWith('archive_project_selection', {
      p_ffe_item_id: 'selection-1', p_reason: 'No longer needed',
    });

    await supersede.mutationFn({
      projectId: 'project-1', selectionId: 'selection-1', productId: 'product-2',
      name: 'Replacement', placementIds: ['placement-1'],
    });
    expect(rpc).toHaveBeenLastCalledWith('supersede_project_selection', {
      p_request: {
        selectionId: 'selection-1', productId: 'product-2', name: 'Replacement',
        placementIds: ['placement-1'],
      },
    });
  });

  it('publishes the SQL item snapshots and normalizes the immutable edition result', async () => {
    rpc.mockResolvedValue({
      data: { editionId: 'edition-1', editionNumber: 2, status: 'published', snapshotHash: 'abc', itemCount: 1 },
      error: null,
    });
    const config = usePublishProjectReview() as unknown as MutationConfig;
    const request = {
      projectId: 'project-1',
      title: 'Review 2',
      items: [{ selectionId: 'selection-1', clientFields: {}, mediaAssetIds: [], sortOrder: 0 }],
      boardIds: ['board-1'],
      clientPriceMode: 'line_total',
    };

    await expect(config.mutationFn(request)).resolves.toEqual({
      editionId: 'edition-1', editionNumber: 2, status: 'published', snapshotHash: 'abc', itemCount: 1,
    });
    expect(rpc).toHaveBeenCalledWith('publish_project_review', { p_request: request });
  });

  it('surfaces RPC failures', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('not authorized') });
    const config = useCreateProjectBoard() as unknown as MutationConfig;
    await expect(config.mutationFn({ projectId: 'project-1', name: 'Denied' }))
      .rejects.toThrow('not authorized');
  });
});
