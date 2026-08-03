import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useSubmitVerdict } from '../use-item-feedback';

describe('useSubmitVerdict validation', () => {
  beforeEach(() => {
    from.mockClear();
    insert.mockClear();
    invalidateQueries.mockClear();
  });

  it('surfaces an empty comment as client validation before issuing a write', async () => {
    const mutation = useSubmitVerdict() as unknown as {
      mutationFn: (input: {
        proposalId: string;
        boardItemId: string;
        verdict: 'comment';
        body: string;
      }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({
        proposalId: 'proposal-1',
        boardItemId: 'pin-1',
        verdict: 'comment',
        body: '   ',
      }),
    ).rejects.toThrow('Add a note before submitting.');
    expect(from).not.toHaveBeenCalled();
  });
});
