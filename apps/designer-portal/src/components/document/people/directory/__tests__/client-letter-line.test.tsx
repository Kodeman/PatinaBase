import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientLetterLine, rowCopy } from '../client-letter-line';

let status: unknown = null;
let flagValue = { value: true, isLoading: false };
let queryIsError = false;
const mutateAsync = jest.fn();
let mutationPending = false;
let deliveryByRef: Record<string, unknown> = {};

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => flagValue }));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useClientInvitationStatus: () => ({ data: status, isLoading: false, isError: queryIsError }),
  useInviteAndLinkClient: () => ({ mutateAsync, isPending: mutationPending }),
  useEmailDelivery: () => ({ byRef: deliveryByRef, isLoading: false, isError: false }),
}));

const bounced = (recipient: string | null = 'dave@okonkwo.net') => ({
  logId: 'log-1',
  refId: 'i1',
  recipient,
  state: 'bounced' as const,
  status: 'bounced' as const,
  sentAt: '2026-09-08T14:00:00.000Z',
  deliveredAt: null,
  bouncedAt: '2026-09-08T14:05:00.000Z',
  bounceType: 'permanent',
  bounceReason: 'no such mailbox',
  delayedAt: null,
  lastEvent: 'email.bounced',
  lastEventAt: '2026-09-08T14:05:00.000Z',
  createdAt: '2026-09-08T14:00:00.000Z',
});

function renderLine(props: {
  designerClientId: string;
  clientName: string | null;
  clientEmail?: string | null;
}) {
  const qc = new QueryClient();
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <ClientLetterLine {...props} />
      </QueryClientProvider>,
    ),
  };
}

describe('R9 / lens-4 §B.8 — dated prose, never a badge and never an absence', () => {
  it('names the four states', () => {
    expect(rowCopy({ state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Letter sent 8 Sept',
      action: null,
    });
    expect(rowCopy({ state: 'opened', at: '2026-09-09T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Opened 9 Sept',
      action: null,
    });
    expect(rowCopy({ state: 'accepted', at: '2026-09-09T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Signed in 9 Sept',
      action: null,
    });
    expect(rowCopy({ state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Link lapsed 15 Sept',
      action: 'write-again',
    });
  });

  it('names the state where no letter was ever written', () => {
    expect(rowCopy(null)).toEqual({
      text: 'On your roster · no letter sent',
      action: 'write-to',
    });
  });

  it('never phrases a state as an absence or a duration', () => {
    for (const state of ['sent', 'opened', 'accepted', 'lapsed'] as const) {
      const { text } = rowCopy({ state, at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' });
      expect(text).not.toMatch(/hasn't|has not|not yet|still|days ago|ago/i);
    }
  });
});

describe('ClientLetterLine', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    flagValue = { value: true, isLoading: false };
    queryIsError = false;
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ designerClientId: 'dc1', kind: 'invite' });
    mutationPending = false;
    deliveryByRef = {};
  });

  it('renders nothing while the flag is still answering', () => {
    flagValue = { value: false, isLoading: true };
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    const { container } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing at all when the flag is off', () => {
    flagValue = { value: false, isLoading: false };
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    const { container } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(container).toBeEmptyDOMElement();
  });

  it('prints the dated line with no pill, dot or colour', () => {
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('Letter sent 8 Sept');
    expect(line.querySelector('svg')).toBeNull();
    expect(line.className).not.toMatch(/rounded-full|bg-(red|green|amber)/);
  });

  it('offers Write again beside a lapsed link, and resends once', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const button = screen.getByRole('button', { name: 'Write again' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/clients/invite/resend');
    expect(JSON.parse(init.body)).toEqual({ invitationId: 'i1' });
  });

  it('R10 — says how long to wait rather than pretending it worked', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'too_soon' }),
    });
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    expect(
      await screen.findByText('A letter went out within the hour. You can write again after that.'),
    ).toBeInTheDocument();
  });

  it('says the letter went, without a badge', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
  });

  it('invalidates the status cache on a successful resend, so the row does not go stale', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    const { qc } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    await screen.findByText('A fresh letter is on its way.');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['client-invitation-status', 'dc1'] }),
    );
  });

  it('clears the delivery log too, so a bounced word does not outlive the resend', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    deliveryByRef = { i1: bounced() };
    const { qc } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    await screen.findByText('A fresh letter is on its way.');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['email-delivery'] }),
    );
  });

  it('does not invalidate the status cache when the resend fails', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    const { qc } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    await screen.findByText('Could not send it just now.');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('offers Write to {given} beside the no-letter row', () => {
    status = null;
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('On your roster · no letter sent · Write to Dave');
  });

  it('still offers a way in when the client has no name on file', () => {
    status = null;
    renderLine({ designerClientId: 'dc1', clientName: null });
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('On your roster · no letter sent · Write the letter');
  });

  it('says nothing rather than misreading a failed read as no letter sent', () => {
    status = null;
    queryIsError = true;
    const { container } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * The trailing act on a roster row with no letter. It used to be a <span>: the
 * one state that needs a way in was the one state that had none.
 */
describe('Write to {given} is an act', () => {
  beforeEach(() => {
    status = null;
    flagValue = { value: true, isLoading: false };
    queryIsError = false;
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ designerClientId: 'dc1', kind: 'invite' });
    mutationPending = false;
    deliveryByRef = {};
  });

  it('renders as a button, and only in the no-letter state', () => {
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(screen.getByRole('button', { name: 'Write to Dave' })).toBeInTheDocument();
    expect(screen.queryByTestId('client-letter-compose')).not.toBeInTheDocument();
  });

  it('offers no act once the letter has gone', () => {
    status = { state: 'sent', at: '2026-09-09T14:00:00.000Z', invitationId: 'i1' };
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(screen.getByTestId('client-letter-line')).toHaveTextContent('Letter sent 9 Sept');
    expect(screen.queryByRole('button', { name: /^Write to/ })).not.toBeInTheDocument();
  });

  it('opens the same field the add-person sheet uses', () => {
    renderLine({
      designerClientId: 'dc1',
      clientName: 'Dave Okonkwo',
      clientEmail: 'dave@okonkwo.net',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Write to Dave' }));
    expect(screen.getByTestId('client-letter-compose')).toBeInTheDocument();
    expect(screen.getByTestId('letter-line-facts')).toHaveTextContent(
      'DAVE OKONKWO · dave@okonkwo.net',
    );
    expect(screen.getByLabelText('A line for Dave')).toBeInTheDocument();
  });

  it('sends through the invite-and-link mutation, reusing the roster row', async () => {
    const { qc } = renderLine({
      designerClientId: 'dc1',
      clientName: 'Dave Okonkwo',
      clientEmail: 'dave@okonkwo.net',
    });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Write to Dave' }));
    fireEvent.change(screen.getByLabelText('A line for Dave'), {
      target: { value: '  Second probe of the first letter.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        designerClientId: 'dc1',
        letter: true,
        note: 'Second probe of the first letter.',
      }),
    );
    expect(await screen.findByText('Your letter is on its way.')).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['client-invitation-status', 'dc1'] }),
    );
    // The field folds away once the letter is gone.
    expect(screen.queryByTestId('client-letter-compose')).not.toBeInTheDocument();
  });

  it('sends with no line at all rather than an empty one', async () => {
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    fireEvent.click(screen.getByRole('button', { name: 'Write to Dave' }));
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        designerClientId: 'dc1',
        letter: true,
        note: undefined,
      }),
    );
  });

  it('says it could not send, and leaves the field standing', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'));
    const { qc } = renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Write to Dave' }));
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    expect(await screen.findByText('Could not send it just now.')).toBeInTheDocument();
    expect(screen.getByTestId('client-letter-compose')).toBeInTheDocument();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('Not now closes the field without sending', () => {
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    fireEvent.click(screen.getByRole('button', { name: 'Write to Dave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('client-letter-compose')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

/**
 * 00591 — the letter's own delivery. The RPC states stay authoritative; the
 * delivery word replaces the line's text only when the mail needs the studio.
 */
describe('the letter that did not arrive', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    flagValue = { value: true, isLoading: false };
    queryIsError = false;
    mutateAsync.mockReset();
    mutationPending = false;
    deliveryByRef = {};
  });

  it('keeps the RPC prose while the mail is behaving', () => {
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    deliveryByRef = {};
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(screen.getByTestId('client-letter-line')).toHaveTextContent('Letter sent 8 Sept');
    expect(screen.queryByTestId('delivery-word')).not.toBeInTheDocument();
  });

  it('replaces the prose when the letter bounced', () => {
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    deliveryByRef = { i1: bounced() };
    renderLine({
      designerClientId: 'dc1',
      clientName: 'Dave Okonkwo',
      clientEmail: 'dave@okonkwo.net',
    });
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent("Bounced 8 Sept — didn't reach dave@okonkwo.net");
    expect(line).not.toHaveTextContent('Letter sent 8 Sept');
  });

  it('falls back to the row’s own address when the log carries none', () => {
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    deliveryByRef = { i1: bounced(null) };
    renderLine({
      designerClientId: 'dc1',
      clientName: 'Dave Okonkwo',
      clientEmail: 'dave@okonkwo.net',
    });
    expect(screen.getByTestId('client-letter-line')).toHaveTextContent(
      "Bounced 8 Sept — didn't reach dave@okonkwo.net",
    );
  });

  it('keeps Write again beside a lapsed link that also bounced', () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    deliveryByRef = { i1: bounced() };
    renderLine({ designerClientId: 'dc1', clientName: 'Dave Okonkwo' });
    expect(screen.getByRole('button', { name: 'Write again' })).toBeInTheDocument();
  });
});
