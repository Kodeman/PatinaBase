import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientLetterLine, rowCopy } from '../client-letter-line';

let status: unknown = null;
let flagValue = { value: true, isLoading: false };
let queryIsError = false;

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => flagValue }));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useClientInvitationStatus: () => ({ data: status, isLoading: false, isError: queryIsError }),
}));

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
  });

  it('renders nothing while the flag is still answering', () => {
    flagValue = { value: false, isLoading: true };
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    const { container } = render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing at all when the flag is off', () => {
    flagValue = { value: false, isLoading: false };
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    const { container } = render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints the dated line with no pill, dot or colour', () => {
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('Letter sent 8 Sept');
    expect(line.querySelector('svg')).toBeNull();
    expect(line.className).not.toMatch(/rounded-full|bg-(red|green|amber)/);
  });

  it('offers Write again beside a lapsed link, and resends once', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
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
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    expect(
      await screen.findByText('A letter went out within the hour. You can write again after that.'),
    ).toBeInTheDocument();
  });

  it('says the letter went, without a badge', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
  });

  it('offers Write to {given} beside the no-letter row', () => {
    status = null;
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('On your roster · no letter sent · Write to Dave');
  });

  it('still offers a way in when the client has no name on file', () => {
    status = null;
    render(<ClientLetterLine designerClientId="dc1" clientName={null} />);
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('On your roster · no letter sent · Write the letter');
  });

  it('says nothing rather than misreading a failed read as no letter sent', () => {
    status = null;
    queryIsError = true;
    const { container } = render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    expect(container).toBeEmptyDOMElement();
  });
});
