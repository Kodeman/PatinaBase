import { act, fireEvent, render, screen } from '@testing-library/react';
import { PaymentMilestonesBuilder } from '../payment-milestones-builder';

const mutate = jest.fn();
const mutateAsync = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProposalPaymentMilestones: () => ({
    data: [
      {
        id: 'milestone-1',
        label: 'New Milestone',
        percentage: 0,
        amount_cents: 0,
        trigger_condition: null,
      },
    ],
    isLoading: false,
  }),
  useAddPaymentMilestone: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdatePaymentMilestone: () => ({
    mutate,
    mutateAsync,
    isPending: false,
  }),
  useRemovePaymentMilestone: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { scopeUpdated: jest.fn() },
}));

describe('PaymentMilestonesBuilder persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mutate.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists rapid edits to different fields as one complete milestone update', async () => {
    const { container } = render(
      <PaymentMilestonesBuilder
        proposalId="proposal-1"
        totalCents={1_320_000}
      />,
    );

    const label = container.querySelector('input[type="text"]');
    if (!label) throw new Error('milestone label input was not rendered');

    fireEvent.change(label, {
      target: { value: 'Project deposit' },
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '100' },
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      milestoneId: 'milestone-1',
      proposalId: 'proposal-1',
      updates: {
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    });
  });

  it('flushes pending row edits on blur instead of waiting for the poll cycle', async () => {
    const { container } = render(
      <PaymentMilestonesBuilder
        proposalId="proposal-1"
        totalCents={1_320_000}
      />,
    );

    const label = container.querySelector('input[type="text"]');
    if (!label) throw new Error('milestone label input was not rendered');
    fireEvent.change(label, { target: { value: 'Project deposit' } });
    fireEvent.blur(label);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      milestoneId: 'milestone-1',
      proposalId: 'proposal-1',
      updates: { label: 'Project deposit' },
    });
  });

  it('flushes pending payment edits during immediate unmount', async () => {
    const { container, unmount } = render(
      <PaymentMilestonesBuilder
        proposalId="proposal-1"
        totalCents={1_320_000}
      />,
    );

    const label = container.querySelector('input[type="text"]');
    if (!label) throw new Error('milestone label input was not rendered');
    fireEvent.change(label, { target: { value: 'Final deposit wording' } });
    unmount();

    await act(async () => Promise.resolve());
    expect(mutateAsync).toHaveBeenCalledWith({
      milestoneId: 'milestone-1',
      proposalId: 'proposal-1',
      updates: { label: 'Final deposit wording' },
    });
  });

  it('announces deterministic saving and saved feedback', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    mutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { container } = render(
      <PaymentMilestonesBuilder
        proposalId="proposal-1"
        totalCents={1_320_000}
      />,
    );
    const label = container.querySelector('input[type="text"]');
    if (!label) throw new Error('milestone label input was not rendered');

    fireEvent.change(label, { target: { value: 'Project deposit' } });
    fireEvent.blur(label);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saving payment schedule…',
    );

    await act(async () => {
      resolveSave({});
      await Promise.resolve();
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Payment schedule saved',
    );
  });

  it('keeps failed fields retryable and announces the error inline', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('network unavailable'));
    const { container } = render(
      <PaymentMilestonesBuilder
        proposalId="proposal-1"
        totalCents={1_320_000}
      />,
    );
    const label = container.querySelector('input[type="text"]');
    if (!label) throw new Error('milestone label input was not rendered');

    fireEvent.change(label, { target: { value: 'Project deposit' } });
    fireEvent.blur(label);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'network unavailable Your client preview was not updated.',
    );

    await act(async () => {
      fireEvent.blur(label);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });
});
