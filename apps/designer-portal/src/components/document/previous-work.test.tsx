import { fireEvent, render, screen } from '@testing-library/react';
import { PreviousWork } from './previous-work';

describe('PreviousWork', () => {
  it('is closed by default and exposes an accessible disclosure', () => {
    render(<PreviousWork count={3}><div>Brief recap</div></PreviousWork>);
    const button = screen.getByRole('button', { name: 'Previous work · 3 complete' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeInTheDocument();
    expect(screen.queryByText('Brief recap')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Brief recap')).toBeInTheDocument();
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeVisible();
  });

  it('leaves the line alone when no approval is awaiting publish', () => {
    render(
      <PreviousWork count={3} approvalsAwaitingPublish={0}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(screen.getByRole('button', { name: 'Previous work · 3 complete' })).toBeVisible();
  });

  it('carries the drafted approvals on the same line when there are any', () => {
    render(
      <PreviousWork count={4} approvalsAwaitingPublish={1}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(
      screen.getByRole('button', {
        name: 'Previous work · 4 complete + Client approvals · 1 awaiting publish',
      }),
    ).toBeVisible();
  });
});
