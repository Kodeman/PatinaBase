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

import {
  useAddProposalPhase,
  useRemoveProposalPhase,
  useUpdateProposalPhase,
} from '../use-scope-builder';

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

type UpdateMutationConfig = {
  mutationFn: (input: {
    phaseId: string;
    proposalId: string;
    updates: Record<string, unknown>;
    expectedUpdatedAt: string;
  }) => Promise<unknown>;
};

type RemoveMutationConfig = {
  mutationFn: (input: {
    phaseId: string;
    proposalId: string;
    expectedUpdatedAt: string;
  }) => Promise<unknown>;
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

  it('routes editable fields through the checked CAS update RPC', async () => {
    const row = {
      id: 'phase-1',
      proposal_id: 'proposal-1',
      fee_cents: 225_000,
      updated_at: '2026-07-31T12:01:00.000Z',
    };
    rpc.mockResolvedValue({ data: row, error: null });
    const config = useUpdateProposalPhase() as unknown as UpdateMutationConfig;

    await expect(
      config.mutationFn({
        phaseId: 'phase-1',
        proposalId: 'proposal-1',
        updates: { fee_cents: 225_000 },
        expectedUpdatedAt: '2026-07-31T12:00:00.000Z',
      }),
    ).resolves.toEqual(row);

    expect(rpc).toHaveBeenCalledWith('update_proposal_phase', {
      p_phase_id: 'phase-1',
      p_proposal_id: 'proposal-1',
      p_patch: { fee_cents: 225_000 },
      p_expected_updated_at: '2026-07-31T12:00:00.000Z',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('routes phase removal through the checked rewire-and-total RPC', async () => {
    const removed = { id: 'phase-1', proposal_id: 'proposal-1' };
    rpc.mockResolvedValue({ data: removed, error: null });
    const config = useRemoveProposalPhase() as unknown as RemoveMutationConfig;

    await expect(
      config.mutationFn({
        phaseId: 'phase-1',
        proposalId: 'proposal-1',
        expectedUpdatedAt: '2026-07-31T12:00:00.000Z',
      }),
    ).resolves.toEqual(removed);

    expect(rpc).toHaveBeenCalledWith('remove_proposal_phase', {
      p_phase_id: 'phase-1',
      p_proposal_id: 'proposal-1',
      p_expected_updated_at: '2026-07-31T12:00:00.000Z',
    });
    expect(from).not.toHaveBeenCalled();
  });
});
