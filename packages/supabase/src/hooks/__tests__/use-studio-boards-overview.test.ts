import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

import { useStudioBoardsOverview, DEFAULT_STUDIO_BOARDS_CAP } from '../use-studio-boards-overview';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'board-1',
    name: 'Living room direction',
    owner_kind: 'project',
    owner_id: 'project-1',
    owner_name: 'Hale residence',
    cover_image_url: null,
    updated_at: '2026-08-03T12:00:00Z',
    has_active_share: true,
    verdict_client_approved: '1',
    verdict_client_rejected: 0,
    verdict_client_comment: 0,
    verdict_guest_approved: '1',
    verdict_guest_rejected: 0,
    verdict_guest_comment: 0,
    unresolved_direction_count: '3',
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe('useStudioBoardsOverview', () => {
  it('calls the aggregate RPC with a one-extra-row limit, never a row-per-pin embed', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const query = useStudioBoardsOverview() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<{ boards: unknown[]; capped: boolean }>;
    };

    expect(query.queryKey).toEqual(['studio-boards-overview', DEFAULT_STUDIO_BOARDS_CAP]);
    await query.queryFn();
    expect(rpc).toHaveBeenCalledWith('studio_boards_overview', {
      p_limit: DEFAULT_STUDIO_BOARDS_CAP + 1,
    });
  });

  it('parses stringified bigint aggregate columns and folds client+guest into totals', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const query = useStudioBoardsOverview() as unknown as {
      queryFn: () => Promise<{ boards: Array<Record<string, unknown>>; capped: boolean }>;
    };
    const result = await query.queryFn();

    expect(result.capped).toBe(false);
    expect(result.boards).toEqual([
      expect.objectContaining({
        id: 'board-1',
        ownerKind: 'project',
        ownerId: 'project-1',
        ownerName: 'Hale residence',
        reactionStatus: 'approved_pipeline',
        unresolvedDirectionCount: 3,
        verdicts: expect.objectContaining({
          approved: 2,
          total: 2,
          bySource: {
            client: { approved: 1, rejected: 0, comment: 0, total: 1 },
            guest: { approved: 1, rejected: 0, comment: 0, total: 1 },
          },
        }),
      }),
    ]);
  });

  it('derives awaiting_reaction when there is an active share but no verdicts yet', async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          verdict_client_approved: 0,
          verdict_guest_approved: 0,
          unresolved_direction_count: 0,
        }),
      ],
      error: null,
    });
    const query = useStudioBoardsOverview() as unknown as {
      queryFn: () => Promise<{ boards: Array<{ reactionStatus: string | null }> }>;
    };
    const result = await query.queryFn();
    expect(result.boards[0].reactionStatus).toBe('awaiting_reaction');
  });

  it('detects capped when the RPC returns one more row than the safe cap', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row({ id: `board-${i}` }));
    rpc.mockResolvedValue({ data: rows, error: null });
    const query = useStudioBoardsOverview(2) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<{ boards: unknown[]; capped: boolean }>;
    };
    expect(query.queryKey).toEqual(['studio-boards-overview', 2]);
    const result = await query.queryFn();
    expect(result.capped).toBe(true);
    expect(result.boards).toHaveLength(2);
  });

  it('propagates an RPC error rather than swallowing it', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });
    const query = useStudioBoardsOverview() as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(query.queryFn()).rejects.toThrow('permission denied');
  });
});
