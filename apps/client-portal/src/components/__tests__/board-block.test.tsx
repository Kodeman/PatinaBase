import { fireEvent, render, screen } from '@testing-library/react';
import { BoardsBlock } from '../board-block';

let mockSharedProps: Record<string, unknown> = {};

const mockUseBoardsWithItems = jest.fn();
const mockUseClientBoardFeedback = jest.fn();
const mockVerdictGiven = jest.fn();

jest.mock('@patina/supabase', () => ({
  useBoardsWithItems: (...args: unknown[]) => mockUseBoardsWithItems(...args),
  useClientBoardFeedback: (...args: unknown[]) => mockUseClientBoardFeedback(...args),
}));

jest.mock('@patina/design-system', () => ({
  BoardsBlock: (props: Record<string, unknown>) => {
    mockSharedProps = props;
    return <div data-testid="shared-boards" />;
  },
}));

jest.mock('@/components/strata-mark', () => ({
  StrataMark: () => null,
}));

jest.mock('@/lib/analytics/events', () => ({
  moodBoardEvents: { verdictGiven: (...args: unknown[]) => mockVerdictGiven(...args) },
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
  });

  it('enables id-backed on-canvas feedback for an authenticated client', () => {
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
  });

  it('keeps guest-resolved boards non-interactive even with stale feedback visibility', () => {
    render(
      <BoardsBlock
        boards={[]}
        resolved={[board as never]}
        proposalId="proposal-1"
        feedbackEnabled
      />,
    );

    expect(mockSharedProps.interactive).toBe(false);
    expect(mockSharedProps.renderPinInteraction).toBeUndefined();
    expect(mockUseClientBoardFeedback).toHaveBeenCalledWith(undefined);
  });
});
