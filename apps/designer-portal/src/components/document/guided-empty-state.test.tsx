import { fireEvent, render, screen } from '@testing-library/react';
import { GuidedEmptyState } from './guided-empty-state';

describe('GuidedEmptyState', () => {
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
});
