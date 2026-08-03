import { describe, expect, it, vi } from 'vitest';

const rows = [
  {
    id: 'board-proposal',
    name: 'Living room direction',
    proposal_id: 'proposal-1',
    project_id: null,
    cover_image_url: null,
    updated_at: '2026-08-03T12:00:00Z',
    proposal: { title: 'Hale proposal' },
    project: null,
    room: { name: 'Living room' },
    proposal_board_items: [
      {
        verdicts: [
          {
            id: 'feedback-old',
            client_id: 'client-1',
            verdict: 'rejected',
            created_at: '2026-08-01T10:00:00Z',
          },
          {
            id: 'feedback-current',
            client_id: 'client-1',
            verdict: 'approved',
            created_at: '2026-08-02T10:00:00Z',
          },
        ],
      },
    ],
  },
  {
    id: 'board-project',
    name: 'Install palette',
    proposal_id: null,
    project_id: 'project-1',
    cover_image_url: 'https://images.example/cover.png',
    updated_at: '2026-08-02T12:00:00Z',
    proposal: null,
    project: { name: 'Hale residence' },
    room: null,
    proposal_board_items: [],
  },
];

const chain = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};
chain.select.mockReturnValue(chain);
chain.eq.mockReturnValue(chain);
chain.order.mockReturnValue(chain);
chain.limit.mockResolvedValue({ data: rows, error: null });
const from = vi.fn(() => chain);

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

import { useRecentBoards } from '../use-recent-boards';

describe('useRecentBoards', () => {
  it('normalizes both owner legs and applies the eight-row recency query', async () => {
    const query = useRecentBoards() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<Array<Record<string, unknown>>>;
    };
    const result = await query.queryFn();

    expect(query.queryKey).toEqual(['recent-boards', 8]);
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    expect(chain.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(8);
    expect(chain.select).toHaveBeenCalledWith(
      expect.stringContaining('verdicts:item_feedback!item_feedback_board_item_id_fkey'),
    );
    expect(result).toMatchObject([
      {
        id: 'board-proposal',
        owner: { kind: 'proposal', id: 'proposal-1' },
        ownerName: 'Hale proposal',
        roomName: 'Living room',
        verdictCounts: { approved: 1, rejected: 0, comment: 0, total: 1 },
      },
      {
        id: 'board-project',
        owner: { kind: 'project', id: 'project-1' },
        ownerName: 'Hale residence',
        roomName: null,
        verdictCounts: { approved: 0, rejected: 0, comment: 0, total: 0 },
      },
    ]);
  });
});
