/**
 * Tests for the root layout catch-all error boundary (app/global-error.tsx)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import GlobalError from '../global-error';

function makeError(digest?: string) {
  const error = new Error('boom') as Error & { digest?: string };
  if (digest) error.digest = digest;
  return error;
}

describe('GlobalError', () => {
  let reset: jest.Mock;

  beforeEach(() => {
    reset = jest.fn();
  });

  it('renders calm error copy', () => {
    render(<GlobalError error={makeError()} reset={reset} />);
    expect(
      screen.getByRole('heading', { name: /something went wrong/i })
    ).toBeInTheDocument();
  });

  it('calls reset when "Try again" is clicked', () => {
    render(<GlobalError error={makeError()} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs the error to the console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = makeError();
    render(<GlobalError error={error} reset={reset} />);
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), error);
    consoleSpy.mockRestore();
  });
});
