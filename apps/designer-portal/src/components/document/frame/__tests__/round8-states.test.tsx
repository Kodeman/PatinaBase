import { fireEvent, render, screen } from '@testing-library/react';
import { Round8DocumentState } from '../round8-states';

jest.mock('@/components/loading', () => ({ DocumentSkeleton: () => <div data-testid="geometry" /> }));

describe('round-8 unresolved identity', () => {
  it('reserves the existing document skeleton and announces the read', () => {
    render(<Round8DocumentState state="loading" />);
    expect(screen.getByRole('main', { name: 'Loading document' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Picking up the document');
    expect(screen.getByTestId('geometry')).toBeInTheDocument();
  });
  it('announces a failed read and retries only on an explicit press', () => {
    const retry = jest.fn();
    render(<Round8DocumentState state="error" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The read failed');
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('does not disclose whether an unavailable identity exists', () => {
    render(<Round8DocumentState state="missing" />);
    expect(screen.getByRole('heading', { name: 'This document is not available.' })).toBeVisible();
    expect(screen.getByText(/may no longer have access/)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Studio' })).toHaveAttribute('href', '/desk');
  });
});
