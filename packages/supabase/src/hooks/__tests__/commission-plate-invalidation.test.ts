import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { BoardOwnerRef } from '@patina/types';

let client: QueryClient;
vi.mock('@tanstack/react-query', async (original) => ({
  ...await original<typeof import('@tanstack/react-query')>(),
  useMutation: (options: unknown) => options,
  useQueryClient: () => client,
}));
import {
  commissionPlateQueryKeys,
  useApplyBoardRoomState,
  useContinueBoardInProject,
  useDeleteBoard,
  useDuplicateBoard,
  useUpsertBoard,
} from '../use-boards';

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000 } } });
});

describe('native board cover projection invalidation', () => {
  const proposal = { kind: 'proposal', id: 'q1' } as const;
  const project = { kind: 'project', id: 'p1' } as const;
  const changes: Array<{ name: string; owner: BoardOwnerRef; complete: () => Promise<unknown> }> = [
    { name: 'cover upsert', owner: proposal, complete: async () => {
      const mutation = useUpsertBoard() as any;
      await mutation.onSuccess({ id: 'b1', proposal_id: 'q1', project_id: null });
    } },
    { name: 'board duplicate', owner: proposal, complete: async () => {
      const mutation = useDuplicateBoard() as any;
      await mutation.onSettled(null, null, { proposalId: 'q1', boardId: 'b1' });
    } },
    { name: 'board delete', owner: proposal, complete: async () => {
      const mutation = useDeleteBoard() as any;
      await mutation.onSuccess(null, { proposalId: 'q1', boardId: 'b1' });
    } },
    ...[proposal, project].map((owner) => ({ name: owner.kind + ' room cover command', owner, complete: async () => {
      const mutation = useApplyBoardRoomState() as any;
      await mutation.onSettled(null, null, { owner, boardId: 'b1' });
    } })),
    { name: 'continue project cover', owner: project, complete: async () => {
      const mutation = useContinueBoardInProject() as any;
      await mutation.onSuccess('b1', { projectId: 'p1' });
    } },
  ];
  it.each(changes)('$name marks only participating plate batches stale', async ({ owner, complete }) => {
    const owned = commissionPlateQueryKeys.list(owner.kind === 'project' ? [owner.id] : [], owner.kind === 'proposal' ? [owner.id] : []);
    const unrelated = commissionPlateQueryKeys.list(['p-other'], ['q-other']);
    client.setQueryData(owned, [{ cover_image_url: 'old' }]);
    client.setQueryData(unrelated, []);
    expect(client.getQueryState(owned)?.isInvalidated).toBe(false);
    await complete();
    expect(client.getQueryState(owned)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    expect(client.getQueryData(owned)).toEqual([{ cover_image_url: 'old' }]);
    client.clear();
  });
});
