import { fireEvent, render, screen } from '@testing-library/react';
import MoodBoardError from './error';

describe('MoodBoardError', () => {
  it('calls reset from the primary act', () => {
    const reset = jest.fn();
    const error = Object.assign(new Error('board write failed'), { digest: 'abc123' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<MoodBoardError error={error} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reopen board' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the muted digest and heading, and logs the error', () => {
    const reset = jest.fn();
    const error = Object.assign(new Error('board write failed'), { digest: 'abc123' });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<MoodBoardError error={error} reset={reset} />);

    expect(screen.getByText('The board hit a snag')).toBeVisible();
    expect(screen.getByText('abc123')).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
