import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn(() => Promise.resolve());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

import {
  useAddExclusion,
  useAddScopeRoom,
  useReorderProposalItems,
  useUpdatePaymentMilestone,
  useUpdateProposalPhase,
  useUpsertChangeOrderTerms,
} from '../use-scope-builder';
import {
  useAddProposalItem,
  useUpsertProposalSection,
} from '../use-proposals';
import { useConsumeCapture } from '../use-proposal-captures';
import { useApplyPhaseTemplate } from '../use-phase-templates';
import { useCopyScheduleAsBuilt } from '../use-schedule-compose';
import {
  useAddBoardItem,
  useSaveBoardLayout,
  useUpsertBoard,
} from '../use-boards';
import { useUpsertPalette, useUpsertSwatch } from '../use-palettes';
import { useSwapLineToProduct } from '../use-taught-alternatives';

type MutationConfig = {
  mutationKey?: string[];
  meta?: Record<string, unknown>;
  onSuccess?: (data: unknown, variables: Record<string, unknown>) => unknown;
  onSettled?: (
    data: unknown,
    error: unknown,
    variables: Record<string, unknown>,
  ) => unknown;
};

const PROPOSAL_ID = 'proposal-1';

async function expectCanonicalClientInvalidations(
  invoke: () => unknown,
) {
  invalidateQueries.mockClear();
  await invoke();

  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['drafting-facets', PROPOSAL_ID],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['proposal-mirror', PROPOSAL_ID],
  });
}

describe('proposal child mutation invalidation contract', () => {
  beforeEach(() => invalidateQueries.mockClear());

  it('marks buffered phase and change-order writes as send-gating client-copy mutations', () => {
    const phase = useUpdateProposalPhase() as MutationConfig;
    const terms = useUpsertChangeOrderTerms({
      errorSurface: 'inline',
    }) as MutationConfig;

    expect(phase.mutationKey).toEqual(['proposal-client-copy']);
    expect(terms.mutationKey).toEqual(['proposal-client-copy']);
    expect(terms.meta).toEqual({ errorSurface: 'inline' });
  });

  it.each([
    [
      'scope rooms',
      () =>
        (useAddScopeRoom() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'proposal phases',
      () =>
        (useUpdateProposalPhase() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'exclusions',
      () =>
        (useAddExclusion() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'payment milestones',
      () =>
        (useUpdatePaymentMilestone() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'change-order terms',
      () =>
        (useUpsertChangeOrderTerms() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'proposal items',
      () =>
        (useAddProposalItem() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'proposal sections',
      () =>
        (useUpsertProposalSection() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'consumed captures that create proposal items',
      () =>
        (useConsumeCapture() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
        }),
    ],
    [
      'phase templates',
      () =>
        (useApplyPhaseTemplate() as MutationConfig).onSuccess?.([], {
          proposalId: PROPOSAL_ID,
          templateSlug: 'patina_six',
          requestId: 'application-1',
        }),
    ],
    [
      'copied proposal schedules',
      () =>
        (useCopyScheduleAsBuilt() as MutationConfig).onSuccess?.([], {
          targetProposalId: PROPOSAL_ID,
        }),
    ],
    [
      'accepted alternatives that replace proposal items',
      () =>
        (useSwapLineToProduct() as MutationConfig).onSuccess?.({}, {
          proposalId: PROPOSAL_ID,
          proposalItemId: 'item-1',
          productId: 'product-1',
          feedbackId: 'feedback-1',
        }),
    ],
  ])('invalidates both exact client reads for %s', async (_label, invoke) => {
    await expectCanonicalClientInvalidations(invoke);
  });

  it('invalidates both exact client reads when proposal items reorder', async () => {
    const config = useReorderProposalItems() as MutationConfig;
    await expectCanonicalClientInvalidations(() =>
      config.onSettled?.(null, null, {
        proposalId: PROPOSAL_ID,
        orderedIds: ['item-1'],
      }),
    );
  });

  it('invalidates both exact client reads for proposal boards and board items', async () => {
    const board = useUpsertBoard() as MutationConfig;
    await expectCanonicalClientInvalidations(() =>
      board.onSuccess?.(
        { id: 'board-1', proposal_id: PROPOSAL_ID, project_id: null },
        { proposalId: PROPOSAL_ID },
      ),
    );

    const item = useAddBoardItem() as MutationConfig;
    await expectCanonicalClientInvalidations(() =>
      item.onSuccess?.(
        { id: 'item-1', board_id: 'board-1' },
        { boardId: 'board-1', proposalId: PROPOSAL_ID },
      ),
    );

    const layout = useSaveBoardLayout() as MutationConfig;
    await expectCanonicalClientInvalidations(() =>
      layout.onSuccess?.(null, {
        boardId: 'board-1',
        proposalId: PROPOSAL_ID,
        positions: [],
      }),
    );
  });

  it('invalidates both exact client reads for palettes and nested swatches', async () => {
    const palette = useUpsertPalette() as MutationConfig;
    await expectCanonicalClientInvalidations(() =>
      palette.onSuccess?.(
        { id: 'palette-1', proposal_id: PROPOSAL_ID },
        { proposalId: PROPOSAL_ID },
      ),
    );

    const swatch = useUpsertSwatch() as MutationConfig;
    await expectCanonicalClientInvalidations(() =>
      swatch.onSuccess?.(
        { id: 'swatch-1', palette_id: 'palette-1' },
        { paletteId: 'palette-1', proposalId: PROPOSAL_ID },
      ),
    );
  });
});
