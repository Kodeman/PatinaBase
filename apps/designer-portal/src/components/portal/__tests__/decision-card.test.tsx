import { render, screen, fireEvent } from '@testing-library/react';
import { DecisionCard } from '../decision-card';

const DAY_MS = 86_400_000;

/**
 * The card uses `deadlineVariant(...)` which compares due-date against `new Date()`.
 * Tests build dueDate strings relative to "now" so we don't depend on a freeze.
 */
function daysFromNow(days: number): string {
  // Add a small offset so Math.ceil((due - now) / DAY) lands on `days` even after a tiny delay.
  return new Date(Date.now() + days * DAY_MS + 1000).toISOString();
}

describe('DecisionCard', () => {
  it('renders the title', () => {
    render(<DecisionCard title="Pick a fabric" />);
    expect(screen.getByText('Pick a fabric')).toBeInTheDocument();
  });

  it('shows sage band for a due date 10 days out and is not overdue', () => {
    const { container } = render(
      <DecisionCard title="t" status="pending" dueDate={daysFromNow(10)} />
    );
    const card = container.querySelector('[data-band]') as HTMLElement;
    expect(card).toHaveAttribute('data-band', 'sage');
    expect(card).toHaveAttribute('data-overdue', 'false');
  });

  it('shows gold band for a due date 5 days out', () => {
    const { container } = render(
      <DecisionCard title="t" status="pending" dueDate={daysFromNow(5)} />
    );
    const card = container.querySelector('[data-band]') as HTMLElement;
    expect(card).toHaveAttribute('data-band', 'gold');
    expect(card).toHaveAttribute('data-overdue', 'false');
  });

  it('shows terracotta band for a due date 1 day out and is not overdue', () => {
    const { container } = render(
      <DecisionCard title="t" status="pending" dueDate={daysFromNow(1)} />
    );
    const card = container.querySelector('[data-band]') as HTMLElement;
    expect(card).toHaveAttribute('data-band', 'terracotta');
    expect(card).toHaveAttribute('data-overdue', 'false');
  });

  it('shows terracotta band and overdue=true for a date 3 days in the past', () => {
    const { container } = render(
      <DecisionCard title="t" status="pending" dueDate={daysFromNow(-3)} />
    );
    const card = container.querySelector('[data-band]') as HTMLElement;
    expect(card).toHaveAttribute('data-band', 'terracotta');
    expect(card).toHaveAttribute('data-overdue', 'true');
  });

  it('shows decided band and "Resolved" text when status=responded', () => {
    const { container } = render(
      <DecisionCard title="t" status="responded" dueDate={daysFromNow(-3)} />
    );
    const card = container.querySelector('[data-band]') as HTMLElement;
    expect(card).toHaveAttribute('data-band', 'decided');
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  describe('Send Reminder button', () => {
    it('does not render when not overdue', () => {
      const onSendReminder = jest.fn();
      render(
        <DecisionCard
          title="t"
          status="pending"
          dueDate={daysFromNow(5)}
          onSendReminder={onSendReminder}
        />
      );
      expect(screen.queryByRole('button', { name: /send reminder/i })).not.toBeInTheDocument();
    });

    it('does not render when status is not pending', () => {
      const onSendReminder = jest.fn();
      render(
        <DecisionCard
          title="t"
          status="responded"
          dueDate={daysFromNow(-3)}
          onSendReminder={onSendReminder}
        />
      );
      expect(screen.queryByRole('button', { name: /send reminder/i })).not.toBeInTheDocument();
    });

    it('does not render when onSendReminder is not provided', () => {
      render(<DecisionCard title="t" status="pending" dueDate={daysFromNow(-3)} />);
      expect(screen.queryByRole('button', { name: /send reminder/i })).not.toBeInTheDocument();
    });

    it('renders when status=pending, overdue, and onSendReminder provided; click invokes the callback', () => {
      const onSendReminder = jest.fn();
      render(
        <DecisionCard
          title="t"
          status="pending"
          dueDate={daysFromNow(-3)}
          onSendReminder={onSendReminder}
        />
      );
      const btn = screen.getByRole('button', { name: /send reminder/i });
      fireEvent.click(btn);
      expect(onSendReminder).toHaveBeenCalledTimes(1);
    });

  });

  it('shows "5d left" for a due date 5 days from now (ISO string)', () => {
    render(<DecisionCard title="t" status="pending" dueDate={daysFromNow(5)} />);
    expect(screen.getByTestId('deadline-pill')).toHaveTextContent('left');
  });

  it('shows overdue label for a due date 3 days ago (ISO string)', () => {
    render(<DecisionCard title="t" status="pending" dueDate={daysFromNow(-3)} />);
    expect(screen.getByTestId('deadline-pill')).toHaveTextContent('overdue');
  });

  it('shows "No deadline" when dueDate is undefined', () => {
    render(<DecisionCard title="t" status="pending" dueDate={undefined} />);
    expect(screen.getByTestId('deadline-pill')).toHaveTextContent('No deadline');
  });

  it('shows "Resolved" badge for responded status, no deadline pill', () => {
    render(<DecisionCard title="t" status="responded" dueDate={daysFromNow(-3)} />);
    expect(screen.queryByTestId('deadline-pill')).not.toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('renders the type badge label when decisionType=material', () => {
    render(<DecisionCard title="t" decisionType="material" />);
    expect(screen.getByText(/Material/i)).toBeInTheDocument();
  });
});
