import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChangeOrderTermsEditor } from '../change-order-terms-editor';

const mutate = jest.fn();
const mutateAsync = jest.fn();

const terms = {
  process_description: 'Existing process',
  hourly_rate_cents: 17_500,
  minimum_fee_cents: 25_000,
  approval_required: true,
};

jest.mock('@patina/supabase', () => ({
  useProposalChangeOrderTerms: () => ({ data: terms, isLoading: false }),
  useUpsertChangeOrderTerms: () => ({
    mutate,
    mutateAsync,
    isPending: false,
    isError: false,
  }),
}));

describe('ChangeOrderTermsEditor autosave integrity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mutate.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({});
  });

  afterEach(() => jest.useRealTimers());

  it('merges rapid field changes into one complete terms write', async () => {
    render(<ChangeOrderTermsEditor proposalId="proposal-1" />);
    const description = screen.getByRole('textbox');
    const [hourly] = screen.getAllByRole('spinbutton');

    fireEvent.change(description, { target: { value: 'Written estimate first' } });
    fireEvent.change(hourly, { target: { value: '225' } });

    await act(async () => {
      jest.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      processDescription: 'Written estimate first',
      hourlyRateCents: 22_500,
      minimumFeeCents: 25_000,
      approvalRequired: true,
    });
  });

  it('flushes the latest value on blur without waiting 800ms', async () => {
    render(<ChangeOrderTermsEditor proposalId="proposal-1" />);
    const description = screen.getByRole('textbox');
    fireEvent.change(description, { target: { value: 'Final client terms' } });
    fireEvent.blur(description);
    await act(async () => Promise.resolve());

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ processDescription: 'Final client terms' }),
    );
  });

  it('persists the final edit during immediate navigation/unmount', async () => {
    const { unmount } = render(<ChangeOrderTermsEditor proposalId="proposal-1" />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Never drop this sentence' },
    });
    unmount();
    await act(async () => Promise.resolve());

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ processDescription: 'Never drop this sentence' }),
    );
  });

  it('surfaces failed writes inline and keeps the final draft retryable', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('terms write failed'));
    render(<ChangeOrderTermsEditor proposalId="proposal-1" />);
    const description = screen.getByRole('textbox');
    fireEvent.change(description, { target: { value: 'Retryable terms' } });
    fireEvent.blur(description);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('terms write failed');

    fireEvent.blur(description);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });
});
