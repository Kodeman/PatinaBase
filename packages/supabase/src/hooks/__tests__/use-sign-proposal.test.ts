import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useSignProposal } from '../use-proposals';

type SignMutation = {
  mutationFn: (input: Record<string, unknown>) => Promise<unknown>;
  onSuccess: (data: unknown, variables: { proposalId: string }) => void;
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: {
      id: 'proposal-1',
      status: 'accepted',
      project_id: 'project-1',
    },
    error: null,
  });
  invalidateQueries.mockReset();
});

describe('useSignProposal authority contract', () => {
  it('forwards only proposal identity and legal name to the browser RPC', async () => {
    const config = useSignProposal() as unknown as SignMutation;

    await config.mutationFn({
      proposalId: 'proposal-1',
      signedByName: 'Jamie Homeowner',
      // Extra runtime keys model a stale or malicious caller. The hook's public
      // TypeScript surface excludes them and its explicit RPC object ignores them.
      signedIp: '203.0.113.99',
      autoActivate: false,
      startDate: '2040-01-01',
    });

    expect(rpc).toHaveBeenCalledWith('sign_proposal', {
      p_proposal_id: 'proposal-1',
      p_signed_name: 'Jamie Homeowner',
    });
  });

  it('invalidates every proposal, decision, and activated-project read', () => {
    const config = useSignProposal() as unknown as SignMutation;

    config.onSuccess({}, { proposalId: 'proposal-1' });

    for (const queryKey of [
      ['proposals'],
      ['proposal', 'proposal-1'],
      ['proposal-stats'],
      ['document-state'],
      ['desk-engagements'],
      ['projects'],
      ['proposal-project', 'proposal-1'],
    ]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    }
  });
});
