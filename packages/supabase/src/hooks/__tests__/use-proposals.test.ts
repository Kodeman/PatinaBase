import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();
const from = vi.fn(() => ({
  select: (columns: string) => {
    select(columns);
    const query = {
      order: () => query,
      in: () => query,
      eq: () => query,
      single: () => Promise.resolve({ data: { id: 'proposal-1', designer: { display_name: 'Leah Hart' }, items: [] }, error: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [{ id: 'proposal-1', designer: { display_name: 'Leah Hart' } }], error: null }).then(resolve),
    };
    return query;
  },
}));

vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useProposal, useProposals } from '../use-proposals';

const queryFn = (hook: unknown) => (hook as { queryFn: () => Promise<unknown> }).queryFn;

describe('proposal owner profile projection', () => {
  beforeEach(() => { select.mockClear(); from.mockClear(); });

  it('useProposals selects only the owner display name for the Ask note', async () => {
    const rows = await queryFn(useProposals({ projectId: 'project-1' }))();
    expect(select).toHaveBeenCalledWith(expect.stringContaining('designer:profiles!proposals_designer_id_fkey(display_name)'));
    expect(rows).toEqual([{ id: 'proposal-1', designer: { display_name: 'Leah Hart' } }]);
  });

  it('useProposal selects only the owner display name for the Ask note', async () => {
    const row = await queryFn(useProposal('proposal-1'))();
    expect(select).toHaveBeenCalledWith(expect.stringContaining('designer:profiles!proposals_designer_id_fkey(display_name)'));
    expect(row).toMatchObject({ designer: { display_name: 'Leah Hart' } });
  });
});
