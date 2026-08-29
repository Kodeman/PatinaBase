import { fireEvent, render, screen } from '@testing-library/react';
import { PreviousWork } from './previous-work';

describe('PreviousWork', () => {
  it('is closed by default and exposes an accessible disclosure', () => {
    render(<PreviousWork count={3}><div>Brief recap</div></PreviousWork>);
    const button = screen.getByRole('button', { name: 'Open the record' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('The record')).toBeInTheDocument();
    expect(screen.getByText('3 complete')).toBeInTheDocument();
    expect(screen.queryByText('Brief recap')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Fold ↑' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Brief recap')).toBeInTheDocument();
  });

  it('leaves the line alone when no approval is awaiting publish', () => {
    render(
      <PreviousWork count={3} approvalsAwaitingPublish={0} onOpenApprovals={jest.fn()}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(screen.getByText('3 complete')).toBeInTheDocument();
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

    // The disclosure toggle promises only what its body holds.
    const disclosure = screen.getByRole('button', { name: 'Open the record' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    const door = screen.getByRole('button', {
      name: 'Client approvals · 1 awaiting publish →',
    });
    fireEvent.click(door);
    expect(openApprovals).toHaveBeenCalledTimes(1);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });

  // W2 (C-2) — `record` root must ALWAYS be emitted, empty body when
  // `count === 0` (this used to return null).
  describe('the record root (W2 C-2)', () => {
    it('always emits the region root, even with nothing settled', () => {
      const { container } = render(<PreviousWork count={0}>{null}</PreviousWork>);

      const root = container.querySelector('[data-index-region="record"]');
      expect(root).not.toBeNull();
      expect(root).toHaveAttribute('aria-label', 'The record');
    });

    it('prints the empty status line and is not a press target at count 0', () => {
      render(<PreviousWork count={0}>{null}</PreviousWork>);

      expect(screen.getByText('The record')).toBeInTheDocument();
      expect(screen.getByText('Nothing settled yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /open the record/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /fold/i })).not.toBeInTheDocument();
    });

    it('marks the root and prints the count line with N settled bars', () => {
      const { container } = render(
        <PreviousWork count={2}>
          <div>Brief recap</div>
        </PreviousWork>,
      );

      const root = container.querySelector('[data-index-region="record"]');
      expect(root).not.toBeNull();
      expect(root).toHaveAttribute('aria-label', 'The record');
      expect(screen.getByText('2 complete')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open the record' })).toBeInTheDocument();
    });
  });
});
