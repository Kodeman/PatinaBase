import { fireEvent, render, screen } from '@testing-library/react';
import { PreviousWork } from './previous-work';

describe('PreviousWork', () => {
  it('is closed by default and exposes an accessible disclosure', () => {
    render(<PreviousWork count={3}><div>Brief recap</div></PreviousWork>);
    const button = screen.getByRole('button', { name: 'The record · 3 complete' });
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
      <PreviousWork count={3} approvalsAwaitingPublish={0} onOpenApprovals={jest.fn()}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(screen.getByRole('button', { name: 'The record · 3 complete' })).toBeVisible();
    expect(screen.queryByText(/Client approvals/)).not.toBeInTheDocument();
  });

  it('says nothing about approvals until the read has answered', () => {
    render(
      <PreviousWork count={3} approvalsAwaitingPublish={null} onOpenApprovals={jest.fn()}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(screen.queryByText(/Client approvals/)).not.toBeInTheDocument();
  });

  it('carries the drafted approvals as a door, not as content of the disclosure', () => {
    const openApprovals = jest.fn();
    render(
      <PreviousWork count={4} approvalsAwaitingPublish={1} onOpenApprovals={openApprovals}>
        <div>Brief recap</div>
      </PreviousWork>,
    );

    // The disclosure's accessible name promises only what its body holds.
    const disclosure = screen.getByRole('button', { name: 'The record · 4 complete' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    const door = screen.getByRole('button', {
      name: 'Client approvals · 1 awaiting publish →',
    });
    fireEvent.click(door);
    expect(openApprovals).toHaveBeenCalledTimes(1);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });
});
