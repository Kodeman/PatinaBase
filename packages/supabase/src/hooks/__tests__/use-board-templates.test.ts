import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  useMaterializeBoardTemplate,
  useSaveBoardAsTemplate,
} from '../use-board-templates';

describe('board template mutations', () => {
  beforeEach(() => {
    rpc.mockReset();
    invalidateQueries.mockClear();
  });

  it('materializes a project template with exactly one owner leg', async () => {
    rpc.mockResolvedValue({ data: 'board-2', error: null });
    const mutation = useMaterializeBoardTemplate() as unknown as {
      mutationFn: (input: {
        templateId: string;
        owner: { kind: 'project'; id: string };
        name: string;
      }) => Promise<string>;
    };

    await expect(
      mutation.mutationFn({
        templateId: 'template-1',
        owner: { kind: 'project', id: 'project-1' },
        name: '  Living room  ',
      }),
    ).resolves.toBe('board-2');
    expect(rpc).toHaveBeenCalledWith('materialize_board_template', {
      p_template_id: 'template-1',
      p_proposal_id: null,
      p_project_id: 'project-1',
      p_name: 'Living room',
      p_scope_room_id: null,
    });
  });

  it('rejects a proposal-room anchor on a project board before the RPC', async () => {
    const mutation = useMaterializeBoardTemplate() as unknown as {
      mutationFn: (input: {
        templateId: string;
        owner: { kind: 'project'; id: string };
        scopeRoomId: string;
      }) => Promise<string>;
    };

    await expect(
      mutation.mutationFn({
        templateId: 'template-1',
        owner: { kind: 'project', id: 'project-1' },
        scopeRoomId: 'room-1',
      }),
    ).rejects.toThrow('Project boards cannot target a proposal room.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects an empty saved-template name before the RPC', async () => {
    const mutation = useSaveBoardAsTemplate() as unknown as {
      mutationFn: (input: {
        boardId: string;
        studioId: string;
        name: string;
      }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({ boardId: 'board-1', studioId: 'studio-1', name: '  ' }),
    ).rejects.toThrow('Template name is required.');
    expect(rpc).not.toHaveBeenCalled();
  });
});
