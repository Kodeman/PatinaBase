import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RfqResponseForm } from '../rfq-response-form';
import { submitRfqResponse } from '../actions';

jest.mock('../actions', () => ({ submitRfqResponse: jest.fn() }));

describe('RfqResponseForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses a submit with no number', () => {
    render(<RfqResponseForm token="tok" existingResponse={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send your number' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter what/i);
    expect(submitRfqResponse).not.toHaveBeenCalled();
  });

  it('submits an amount and note, then shows the saved amount back', async () => {
    (submitRfqResponse as jest.Mock).mockResolvedValue({
      status: 'saved',
      amountCents: 415_000,
      respondedAt: '2026-07-09T00:00:00Z',
    });
    render(<RfqResponseForm token="tok" existingResponse={null} />);
    fireEvent.change(screen.getByLabelText('Your number'), { target: { value: '4,150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send your number' }));
    await waitFor(() =>
      expect(submitRfqResponse).toHaveBeenCalledWith('tok', {
        amountCents: 415_000,
        note: null,
      }),
    );
    expect(await screen.findByText('Your number is in.')).toBeInTheDocument();
    expect(screen.getByText(/\$4,150/)).toBeInTheDocument();
  });

  it('pre-fills and re-submits an existing response as an update', async () => {
    (submitRfqResponse as jest.Mock).mockResolvedValue({
      status: 'replayed',
      amountCents: 715_000,
      respondedAt: null,
    });
    render(
      <RfqResponseForm
        token="tok"
        existingResponse={{ amountCents: 715_000, note: 'Includes delivery', respondedAt: null }}
      />,
    );
    expect(screen.getByLabelText('Your number')).toHaveValue('7150');
    fireEvent.click(screen.getByRole('button', { name: 'Update your number' }));
    await waitFor(() =>
      expect(submitRfqResponse).toHaveBeenCalledWith('tok', {
        amountCents: 715_000,
        note: 'Includes delivery',
      }),
    );
    expect(await screen.findByText('Your number is in.')).toBeInTheDocument();
  });

  it('reads bid_locked as a win for this party, without inviting a retry or implying they lost', async () => {
    // bid_locked fires when THIS party's own number was the one selected —
    // the copy must not read as "someone else got it."
    (submitRfqResponse as jest.Mock).mockResolvedValue({ status: 'bid_locked' });
    render(<RfqResponseForm token="tok" existingResponse={null} />);
    fireEvent.change(screen.getByLabelText('Your number'), { target: { value: '4,150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send your number' }));
    expect(await screen.findByText(/your number was chosen/i)).toBeInTheDocument();
    expect(screen.queryByText(/already been awarded/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send your number/i })).not.toBeInTheDocument();
  });

  it('reads as closed once the bidding window has closed', async () => {
    (submitRfqResponse as jest.Mock).mockResolvedValue({ status: 'bid_window_closed' });
    render(<RfqResponseForm token="tok" existingResponse={null} />);
    fireEvent.change(screen.getByLabelText('Your number'), { target: { value: '4,150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send your number' }));
    expect(
      await screen.findByText('This request is closed — the work has been awarded.'),
    ).toBeInTheDocument();
  });

  it('surfaces an invalid outcome without exposing the raw RPC failure', async () => {
    (submitRfqResponse as jest.Mock).mockResolvedValue({ status: 'invalid' });
    render(<RfqResponseForm token="tok" existingResponse={null} />);
    fireEvent.change(screen.getByLabelText('Your number'), { target: { value: '4,150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send your number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/refresh the page/i);
  });

  it('never renders another party’s bid or a scope price, even if the caller passed one in', async () => {
    // RfqResponseForm's own props are just `token` and `existingResponse` —
    // there is no legitimate way for another party's bid or a scope price to
    // reach it. That made the old version of this test unfalsifiable: it
    // asserted the absence of a string ('Hardwick Supply') the component had
    // no path to ever render, so it would still pass even if the component
    // started reading arbitrary extra props. This forces extra fields onto
    // the props (the same defensive-DTO pattern page.test.tsx uses) and
    // asserts the actual figures those fields carry — which WOULD appear in
    // the DOM if the component ever read them — never show up.
    (submitRfqResponse as jest.Mock).mockResolvedValue({
      status: 'saved',
      amountCents: 415_000,
      respondedAt: null,
    });
    const leaked = {
      token: 'tok',
      existingResponse: { amountCents: 715_000, note: null, respondedAt: null },
      clientPriceCents: 999_900,
      bids: [{ partyDisplayName: 'Hardwick Supply', amountCents: 555_500 }],
    } as unknown as Parameters<typeof RfqResponseForm>[0];
    const { container } = render(<RfqResponseForm {...leaked} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update your number' }));
    await waitFor(() => expect(submitRfqResponse).toHaveBeenCalled());

    expect(container).not.toHaveTextContent('Hardwick Supply');
    // clientPriceCents (999_900) — formatted ($9,999) or raw (999900).
    expect(container).not.toHaveTextContent('$9,999');
    expect(container).not.toHaveTextContent('999900');
    // bids[0].amountCents (555_500) — formatted ($5,555) or raw (555500).
    expect(container).not.toHaveTextContent('$5,555');
    expect(container).not.toHaveTextContent('555500');
  });
});
