/**
 * Tests for the proposals segment error boundary (app/proposals/error.tsx)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import ProposalsError from '../error';

function makeError(digest?: string) {
  const error = new Error('boom') as Error & { digest?: string };
  if (digest) error.digest = digest;
  return error;
}

describe('ProposalsError', () => {
  let reset: jest.Mock;

  beforeEach(() => {
    reset = jest.fn();
  });

  it('renders proposal-specific error copy', () => {
    render(<ProposalsError error={makeError()} reset={reset} />);
    expect(screen.getByText(/couldn.t display this proposal/i)).toBeInTheDocument();
  });

  it('does not falsely claim the designer was already notified', () => {
    render(<ProposalsError error={makeError()} reset={reset} />);
    expect(screen.queryByText(/designer has been notified/i)).not.toBeInTheDocument();
  });

  it('calls reset when "Try again" is clicked', () => {
    render(<ProposalsError error={makeError()} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('links back to the proposals list', () => {
    render(<ProposalsError error={makeError()} reset={reset} />);
    const link = screen.getByRole('link', { name: /proposals/i });
    expect(link).toHaveAttribute('href', '/proposals');
  });

  it('logs the error to the console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = makeError();
    render(<ProposalsError error={error} reset={reset} />);
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), error);
    consoleSpy.mockRestore();
  });
});
