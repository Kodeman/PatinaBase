/**
 * Tests for the root segment error boundary (app/error.tsx)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import RootError from '../error';

function makeError(digest?: string) {
  const error = new Error('boom') as Error & { digest?: string };
  if (digest) error.digest = digest;
  return error;
}

describe('RootError', () => {
  let reset: jest.Mock;

  beforeEach(() => {
    reset = jest.fn();
  });

  it('renders calm, client-facing error copy', () => {
    render(<RootError error={makeError()} reset={reset} />);
    expect(
      screen.getByText(/something went wrong loading this page/i)
    ).toBeInTheDocument();
  });

  it('calls reset when "Try again" is clicked', () => {
    render(<RootError error={makeError()} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('links back to the projects list', () => {
    render(<RootError error={makeError()} reset={reset} />);
    const link = screen.getByRole('link', { name: /back to your projects/i });
    expect(link).toHaveAttribute('href', '/projects');
  });

  it('logs the error to the console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = makeError();
    render(<RootError error={error} reset={reset} />);
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), error);
    consoleSpy.mockRestore();
  });
});
