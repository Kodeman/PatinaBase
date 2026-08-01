import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

const scopeBuilder = queryBuilder({ data: [], error: null });
const supabaseClient = {
  rpc: vi.fn(),
  from: vi.fn(() => scopeBuilder),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

import { useProjectDocuments } from '../use-project-documents';

beforeEach(() => {
  supabaseClient.rpc.mockReset();
  supabaseClient.rpc.mockResolvedValue({ data: [], error: null });
  supabaseClient.from.mockClear();
  scopeBuilder.select.mockClear();
  scopeBuilder.eq.mockClear();
  scopeBuilder.order.mockClear();
});

describe('useProjectDocuments proposal boundary', () => {
  it('uses the client-safe proposal RPC and keeps only this project', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: [
        {
          id: 'proposal-here',
          project_id: 'project-1',
          title: 'Current edition',
          status: 'accepted',
          total_amount: 125000,
          signed_at: '2026-02-01T10:00:00Z',
        },
        {
          id: 'proposal-elsewhere',
          project_id: 'project-2',
          title: 'Other project',
          status: 'sent',
          total_amount: 99000,
          signed_at: null,
        },
      ],
      error: null,
    });

    const config = useProjectDocuments('project-1') as unknown as {
      queryFn: () => Promise<Array<{ id: string; title: string }>>;
    };
    const documents = await config.queryFn();

    expect(supabaseClient.rpc).toHaveBeenCalledWith('list_client_proposals');
    expect(supabaseClient.from).not.toHaveBeenCalledWith('proposals');
    expect(documents).toEqual([
      expect.objectContaining({ id: 'proposal-here', title: 'Current edition' }),
    ]);
  });
});
