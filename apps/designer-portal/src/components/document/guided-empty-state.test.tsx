import { fireEvent, render, screen } from '@testing-library/react';
import { GuidedEmptyState } from './guided-empty-state';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';

jest.mock('@/lib/help-system/help-events', () => ({
  HELP_EVENTS: { EMPTY_STATE_SHOWN: 'help.empty_state.shown' },
  safeCapture: jest.fn(),
}));

const safeCaptureMock = safeCapture as jest.Mock;

describe('GuidedEmptyState', () => {
  beforeEach(() => {
    safeCaptureMock.mockClear();
  });

  it('explains the section and exposes one 44px starting action', () => {
    const onStart = jest.fn();
    render(
      <GuidedEmptyState
        title="Build the FF&E schedule"
        description="Add the pieces the studio will specify, price, authorize, and procure."
        inputs={['Room', 'Piece or allowance', 'Budget']}
        action={{ key: 'start-ffe', label: 'Open the spec book', onClick: onStart }}
      />,
    );

    expect(screen.getByText(/Start with · Room · Piece or allowance · Budget/)).toBeInTheDocument();
    const action = screen.getByRole('button', { name: 'Open the spec book' });
    expect(action).toHaveClass('min-h-[44px]');
    fireEvent.click(action);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('fires help.empty_state.shown once per mount with surface_key and region_key', () => {
    const { rerender } = render(
      <GuidedEmptyState
        title="Build the FF&E schedule"
        description="Add the pieces the studio will specify, price, authorize, and procure."
        inputs={[]}
        action={{ key: 'start-ffe', label: 'Open the spec book', onClick: jest.fn() }}
      />,
    );

    expect(safeCaptureMock).toHaveBeenCalledTimes(1);
    expect(safeCaptureMock).toHaveBeenCalledWith(HELP_EVENTS.EMPTY_STATE_SHOWN, {
      surface_key: 'open-document',
      region_key: 'guided-empty-state',
    });

    rerender(
      <GuidedEmptyState
        title="Build the FF&E schedule"
        description="Add the pieces the studio will specify, price, authorize, and procure."
        inputs={[]}
        action={{ key: 'start-ffe', label: 'Open the spec book', onClick: jest.fn() }}
      />,
    );
    expect(safeCaptureMock).toHaveBeenCalledTimes(1);
  });
});
