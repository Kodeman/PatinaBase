import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc, from }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useAddProposalPhase } from '../use-scope-builder';

type AddPhaseInput = {
  proposalId: string;
  name: string;
  phaseKey?: string;
  durationWeeks?: number;
  feeCents?: number;
  revisionLimit?: number;
  gateCondition?: string;
  deliverables?: Array<{ label: string; type?: string }>;
  durationDays?: number;
  anchorDate?: string;
  lane?: 'main' | 'thread';
};

type MutationConfig = {
  mutationFn: (input: AddPhaseInput) => Promise<unknown>;
};

describe('useAddProposalPhase authority boundary', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    invalidateQueries.mockReset();
  });

  it('delegates predecessor, ordering, and proposal-total authority to one RPC', async () => {
    const row = {
      id: 'phase-2',
      proposal_id: 'proposal-1',
      follows_phase_id: 'phase-1',
      sort_order: 1,
    };
    rpc.mockResolvedValue({ data: row, error: null });
    const config = useAddProposalPhase() as unknown as MutationConfig;

    await expect(
      config.mutationFn({
        proposalId: 'proposal-1',
        name: 'Procurement',
        phaseKey: 'procurement',
        durationWeeks: 4,
        durationDays: 28,
        feeCents: 125_000,
        revisionLimit: 2,
        gateCondition: 'Client approval',
        deliverables: [{ label: 'Purchase orders' }],
        anchorDate: '2026-09-01',
        lane: 'main',
      }),
    ).resolves.toEqual(row);

    expect(rpc).toHaveBeenCalledWith('create_proposal_phase', {
      p_proposal_id: 'proposal-1',
      p_name: 'Procurement',
      p_phase_key: 'procurement',
      p_duration_weeks: 4,
      p_fee_cents: 125_000,
      p_revision_limit: 2,
      p_gate_condition: 'Client approval',
      p_deliverables: [{ label: 'Purchase orders' }],
      p_duration_days: 28,
      p_anchor_date: '2026-09-01',
      p_lane: 'main',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('fails instead of falling back to a direct phase insert', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: new Error('proposal phase topology is ambiguous'),
    });
    const config = useAddProposalPhase() as unknown as MutationConfig;

    await expect(
      config.mutationFn({ proposalId: 'proposal-1', name: 'New Phase' }),
    ).rejects.toThrow('proposal phase topology is ambiguous');
    expect(from).not.toHaveBeenCalled();
  });
});
