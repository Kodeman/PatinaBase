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
  useCreateProjectBoard,
  usePlaceProductInProjectV2,
  usePromoteBoardReferenceToSelection,
} from '../use-project-ffe-ga';

beforeEach(() => {
  rpc.mockReset();
  invalidateQueries.mockReset();
});

describe('project FF&E GA commands', () => {
  it('places a product through the canonical v2 RPC and normalizes its identity result', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'reused',
        selection_id: 'selection-1',
        selection_thread_id: 'thread-1',
        placement_id: 'placement-1',
      },
      error: null,
    });
    const config = usePlaceProductInProjectV2() as unknown as {
      mutationFn: (request: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(config.mutationFn({
      projectId: 'project-1',
      productId: 'product-1',
      assignmentScope: 'room',
      projectRoomId: 'room-1',
      boardId: 'board-1',
      designDisposition: 'candidate',
      duplicateMode: 'reuse',
      idempotencyKey: 'request-1',
    })).resolves.toEqual({
      outcome: 'reused',
      selectionId: 'selection-1',
      selectionThreadId: 'thread-1',
      placementId: 'placement-1',
    });
    expect(rpc).toHaveBeenCalledWith('place_product_in_project_v2', {
      request: {
        project_id: 'project-1',
        product_id: 'product-1',
        assignment_scope: 'room',
        project_room_id: 'room-1',
        board_id: 'board-1',
        design_disposition: 'candidate',
        duplicate_mode: 'reuse',
        idempotency_key: 'request-1',
      },
    });
  });

  it('creates a project board without direct table writes', async () => {
    rpc.mockResolvedValue({ data: { board_id: 'board-2' }, error: null });
    const config = useCreateProjectBoard() as unknown as {
      mutationFn: (request: Record<string, unknown>) => Promise<string>;
    };

    await expect(config.mutationFn({
      projectId: 'project-1',
      name: 'Living room',
      starterIntent: 'blank',
      idempotencyKey: 'request-2',
    })).resolves.toBe('board-2');
    expect(rpc).toHaveBeenCalledWith('create_project_board', {
      request: {
        project_id: 'project-1',
        name: 'Living room',
        starter_intent: 'blank',
        idempotency_key: 'request-2',
      },
    });
  });

  it('promotes a board reference through one project-scoped command', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'created',
        selection_id: 'selection-3',
        selection_thread_id: 'thread-3',
        placement_id: 'placement-3',
      },
      error: null,
    });
    const config = usePromoteBoardReferenceToSelection() as unknown as {
      mutationFn: (request: Record<string, unknown>) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'project-1',
      boardId: 'board-1',
      placementId: 'reference-1',
      assignmentScope: 'unassigned',
      designDisposition: 'candidate',
      duplicateMode: 'reuse',
      idempotencyKey: 'request-3',
    });
    expect(rpc).toHaveBeenCalledWith('promote_board_reference_to_selection', {
      request: expect.objectContaining({
        project_id: 'project-1',
        board_id: 'board-1',
        placement_id: 'reference-1',
      }),
    });
  });

  it('surfaces RPC failures', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('not authorized') });
    const config = useCreateProjectBoard() as unknown as {
      mutationFn: (request: Record<string, unknown>) => Promise<string>;
    };
    await expect(config.mutationFn({
      projectId: 'project-1',
      name: 'Denied',
      idempotencyKey: 'request-4',
    })).rejects.toThrow('not authorized');
  });
});
