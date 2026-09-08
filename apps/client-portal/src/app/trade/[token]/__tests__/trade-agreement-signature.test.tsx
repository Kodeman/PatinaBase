import { act, fireEvent, render, screen } from '@testing-library/react';
import { TradeAgreementSignature } from '../trade-agreement-signature';
import { signTradeAgreement } from '../actions';
import { HOLD_MS } from '@/components/threshold/instruments/scored-action';

jest.mock('../actions', () => ({ signTradeAgreement: jest.fn() }));
jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const token = 'a'.repeat(64);

const act_ = () => screen.getByRole('button', { name: /sign this agreement/i });
const nameField = () => screen.getByTestId('trade-agreement-signed-name');

/** Hold the act for its full length, on fake time, then hand real time back. */
async function hold() {
  jest.useFakeTimers();
  fireEvent.pointerDown(act_(), { clientX: 4, clientY: 4 });
  await act(async () => {
    jest.advanceTimersByTime(HOLD_MS);
  });
  jest.useRealTimers();
  // Let the transition's promise settle on real time.
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * jsdom's own location cannot navigate, so the reload the unknown-answer path
 * performs is observed rather than executed.
 */
const reload = jest.fn();
const realLocation = window.location;

describe('TradeAgreementSignature', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...realLocation, reload },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: realLocation,
    });
  });

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('stays unarmed until there is a name, and says nothing about it', () => {
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    expect(act_()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('arms once a full name is typed and signs on a completed hold', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({
      status: 'saved',
      signedName: 'Dana Hall',
      signedAt: '2026-09-07T15:04:00Z',
    });
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });
    expect(act_()).not.toHaveAttribute('aria-disabled');

    await hold();

    expect(signTradeAgreement).toHaveBeenCalledWith(token, { signedName: 'Dana Hall' });
    expect(screen.getByTestId('trade-agreement-receipt')).toBeInTheDocument();
    expect(screen.getByText('Signed.')).toBeInTheDocument();
    expect(screen.getByText(/Dana Hall · 7 September 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign this agreement/i })).not.toBeInTheDocument();
  });

  it('does not sign on a released hold that never reached its length', async () => {
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });

    jest.useFakeTimers();
    fireEvent.pointerDown(act_(), { clientX: 4, clientY: 4 });
    await act(async () => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    fireEvent.pointerUp(act_());
    await act(async () => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();

    expect(signTradeAgreement).not.toHaveBeenCalled();
  });

  it('carries the electronic-signature sentence on the line', () => {
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    expect(screen.getByTestId('trade-agreement-signed-name-notice')).toHaveTextContent(
      'Your typed name acts as your electronic signature.',
    );
  });

  it('shows the settled receipt and no form at all when the agreement is already signed', () => {
    render(
      <TradeAgreementSignature
        token={token}
        existingSignature={{ signedName: 'Dana Hall', signedAt: '2026-09-06T11:00:00Z' }}
      />,
    );
    expect(screen.getByText('Signed.')).toBeInTheDocument();
    expect(screen.getByText(/Dana Hall · 6 September 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign this agreement/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('trade-agreement-signed-name')).not.toBeInTheDocument();
  });

  it('settles a replay on the ORIGINAL receipt, never an error', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({
      status: 'already_signed',
      signedName: 'Dana Hall',
      signedAt: '2026-09-06T11:00:00Z',
    });
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });
    await hold();

    expect(screen.getByText('Signed.')).toBeInTheDocument();
    expect(screen.getByText(/Dana Hall · 6 September 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('settles a nameless replay on the date alone, never on the name just typed (N3)', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({
      status: 'already_signed',
      signedName: null,
      signedAt: '2026-09-06T11:00:00Z',
    });
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Someone Else' } });
    await hold();

    const receipt = screen.getByTestId('trade-agreement-receipt');
    expect(receipt).toHaveTextContent('Signed.');
    expect(receipt).toHaveTextContent('6 September 2026');
    expect(receipt).not.toHaveTextContent('Someone Else');
  });

  it('inks nothing and reloads when the answer says neither signed nor refused (N2)', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({ status: 'unknown' });
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });
    await hold();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('trade-agreement-receipt')).not.toBeInTheDocument();
    expect(screen.queryByText('Signed.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reads a withdrawn agreement as its own sentence, pointing at the studio', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({ status: 'agreement_void' });
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });
    await hold();

    expect(
      screen.getByText('This agreement was withdrawn. Your studio can send a new one.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign this agreement/i })).not.toBeInTheDocument();
  });

  it('reads a dead link as one plain sentence, never a raw failure', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({ status: 'invalid' });
    render(<TradeAgreementSignature token={token} existingSignature={null} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });
    await hold();

    expect(screen.getByRole('alert')).toHaveTextContent('This link is no longer active.');
    // The act stays on the page: nothing was settled.
    expect(screen.getByRole('button', { name: /sign this agreement/i })).toBeInTheDocument();
  });

  it('never renders another party’s number or the client’s money, even if the caller passed one in (R13)', async () => {
    (signTradeAgreement as jest.Mock).mockResolvedValue({
      status: 'saved',
      signedName: 'Dana Hall',
      signedAt: null,
    });
    const leaked = {
      token,
      existingSignature: null,
      clientPriceCents: 8_413_400,
      bids: [{ contactDisplayName: 'Ridgeline Millwork', amountCents: 4_100_000 }],
    } as unknown as Parameters<typeof TradeAgreementSignature>[0];
    const { container } = render(<TradeAgreementSignature {...leaked} />);
    fireEvent.change(nameField(), { target: { value: 'Dana Hall' } });
    await hold();

    expect(container).not.toHaveTextContent('Ridgeline Millwork');
    expect(container).not.toHaveTextContent('8413400');
    expect(container).not.toHaveTextContent('$84,134');
    expect(container).not.toHaveTextContent('4100000');
  });
});
