import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardsBlock } from '../board-block';

let mockSharedProps: Record<string, unknown> = {};

const mockUseBoardsWithItems = jest.fn();
const mockUseClientBoardFeedback = jest.fn();
const mockVerdictGiven = jest.fn();
const mockRenderSucceeded = jest.fn();
const mockRenderFailed = jest.fn();
let mockRendererError: Error | null = null;

jest.mock('@patina/supabase', () => ({
  useBoardsWithItems: (...args: unknown[]) => mockUseBoardsWithItems(...args),
  useClientBoardFeedback: (...args: unknown[]) => mockUseClientBoardFeedback(...args),
}));

jest.mock('@patina/design-system', () => ({
  BoardsBlock: (props: Record<string, unknown>) => {
    if (mockRendererError) throw mockRendererError;
    mockSharedProps = props;
    return <div data-testid="shared-boards" />;
  },
}));

jest.mock('@/components/strata-mark', () => ({
  StrataMark: () => null,
}));

jest.mock('@/lib/analytics/events', () => ({
  moodBoardEvents: {
    verdictGiven: (...args: unknown[]) => mockVerdictGiven(...args),
    renderSucceeded: (...args: unknown[]) => mockRenderSucceeded(...args),
    renderFailed: (...args: unknown[]) => mockRenderFailed(...args),
  },
}));

jest.mock('@/components/proposal-line-feedback', () => ({
  LineFeedback: ({ variant, boardItemId, onSubmitted }: { variant?: string; boardItemId?: string; onSubmitted?: (verdict: string) => void }) => (
    <button type="button" onClick={() => onSubmitted?.('approved')} data-testid="line-feedback" data-variant={variant} data-board-item-id={boardItemId} />
  ),
}));

const board = {
  id: 'board-1',
  proposal_id: 'proposal-1',
  name: 'Board',
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sections: [],
  items: [
    {
      id: 'pin-1',
      type: 'product',
      x: 0,
      y: 0,
      width: 240,
      height: null,
      z_index: 0,
      rotation: 0,
      data: {},
    },
  ],
};

describe('client board verdict affordances', () => {
  beforeEach(() => {
    mockSharedProps = {};
    mockUseBoardsWithItems.mockReturnValue({ data: [board] });
    mockUseClientBoardFeedback.mockReturnValue({ data: [] });
    mockVerdictGiven.mockReset();
    mockRenderSucceeded.mockReset();
    mockRenderFailed.mockReset();
    mockRendererError = null;
  });

  it('enables id-backed feedback and records a successful client render', async () => {
    render(
      <BoardsBlock
        boards={[{ id: 'board-1', proposal_id: 'proposal-1' } as never]}
        proposalId="proposal-1"
        feedbackEnabled
      />,
    );

    expect(screen.getByTestId('shared-boards')).toBeInTheDocument();
    expect(mockSharedProps.interactive).toBe(true);
    const renderInteraction = mockSharedProps.renderPinInteraction as (item: unknown) => JSX.Element;
    render(renderInteraction({ id: 'pin-1', type: 'product' }));
    expect(screen.getByTestId('line-feedback')).toHaveAttribute('data-variant', 'pin');
    expect(screen.getByTestId('line-feedback')).toHaveAttribute('data-board-item-id', 'pin-1');
    fireEvent.click(screen.getByTestId('line-feedback'));
    expect(mockVerdictGiven).toHaveBeenCalledWith({
      verdict: 'approved',
      boardId: 'board-1',
      boardItemId: 'pin-1',
      itemType: 'product',
    });
    await waitFor(() => expect(mockRenderSucceeded).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      boardCount: 1,
      surface: 'client_proposal',
    }));
  });

  it('keeps guest-resolved boards non-interactive even with stale feedback visibility', () => {
    render(
      <BoardsBlock
        boards={[]}
        resolved={[board as never]}
        proposalId="proposal-1"
        surface="guest_share"
        feedbackEnabled
      />,
    );

    expect(mockSharedProps.interactive).toBe(false);
    expect(mockSharedProps.renderPinInteraction).toBeUndefined();
    expect(mockUseClientBoardFeedback).toHaveBeenCalledWith(undefined);
  });

  it('keeps pre-resolved authenticated boards interactive and in the client telemetry cohort', async () => {
    render(
      <BoardsBlock
        boards={[]}
        resolved={[board as never]}
        proposalId="proposal-1"
        surface="client_proposal"
        feedbackEnabled
      />,
    );

    expect(mockSharedProps.interactive).toBe(true);
    expect(mockSharedProps.renderPinInteraction).toEqual(expect.any(Function));
    expect(mockUseClientBoardFeedback).toHaveBeenCalledWith('proposal-1');
    await waitFor(() => expect(mockRenderSucceeded).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      boardCount: 1,
      surface: 'client_proposal',
    }));
  });

  it('contains renderer failures and records the scoped failure without proposal content', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const rendererError = new Error('private product title should not be forwarded');
    mockRendererError = rendererError;

    render(
      <BoardsBlock
        boards={[{ id: 'board-1', proposal_id: 'proposal-1' } as never]}
        proposalId="proposal-1"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('This mood board could not be displayed.');
    expect(mockRenderFailed).toHaveBeenCalledWith(
      rendererError,
      {
        proposalId: 'proposal-1',
        boardCount: 1,
        surface: 'client_proposal',
      },
    );
    expect(mockRenderSucceeded).not.toHaveBeenCalled();
  });
});
