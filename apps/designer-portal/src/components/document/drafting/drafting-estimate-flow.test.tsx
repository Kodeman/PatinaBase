import { fireEvent, render, screen } from '@testing-library/react';
import { DraftingEstimateFlow } from './drafting-estimate-flow';

const mockQueue = jest.fn();
const mockFlush = jest.fn();
let mockDraftingPercent = 50;
let mockEstimatedHours: number | null = 36;

jest.mock('@/hooks/use-buffered-autosave', () => ({
  useBufferedAutosave: () => ({
    queue: mockQueue,
    flush: mockFlush,
    flushAll: jest.fn(),
    state: 'idle',
    error: null,
  }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingEstimate: () => ({
    data: { sectionId: 'investment-1', estimatedHours: mockEstimatedHours },
    isLoading: false,
  }),
  useDraftingState: () => ({ pct: mockDraftingPercent }),
  useSaveDraftingEstimate: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useProposal: () => ({
    data: { status: 'draft', commercial_state: 'draft' },
  }),
}));

describe('DraftingEstimateFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraftingPercent = 50;
    mockEstimatedHours = 36;
  });

  it('restores the estimate and queues valid edits for autosave', () => {
    render(<DraftingEstimateFlow proposalId="proposal-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Estimate · ROM estimate/i }));
    const input = screen.getByRole('spinbutton', {
      name: 'Estimated design hours hours',
    });
    expect(input).toHaveValue(36);

    fireEvent.change(input, { target: { value: '48' } });
    expect(mockQueue).toHaveBeenCalledWith('estimate', { estimatedHours: 48 });
  });

  it('derives quote-ready from persisted hours and canonical drafting completeness', () => {
    mockDraftingPercent = 100;
    render(<DraftingEstimateFlow proposalId="proposal-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Estimate · Quote ready/i }));
    expect(screen.getByText('Quote ready').closest('li')).toHaveAttribute(
      'data-current',
      'true',
    );
  });
});
