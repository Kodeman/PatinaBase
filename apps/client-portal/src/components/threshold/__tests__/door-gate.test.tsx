import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CommercialDocumentKind } from '@patina/types';

import type { NoteModel, ThresholdMark } from '@/lib/threshold/derive';

import { consentLineFor, signLabelFor } from '../consent-copy';
import { HOLD_MS } from '../instruments/scored-action';

// ── Boundaries ──────────────────────────────────────────────────────────────
// The leaf reads one bundle (the paper's own line items) and posts to the
// shipped sign route. Mock the module the component actually imports; a
// near-miss silently no-ops (patina-testing).

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
  invalidateSignedCommercialDocument: jest.fn().mockResolvedValue(undefined),
}));

// The other four answers live in their own file, with their own suite
// (door-acts.test.tsx). Here they are a witness to the mount, to what the door
// hands them, to the leaf taking them with it when it opens — and to the door
// hearing a decline come back.
jest.mock('../door-acts', () => ({
  __esModule: true,
  DoorActs: ({
    proposalId,
    kind,
    validUntil,
    onDeclined,
  }: {
    proposalId: string;
    kind: string | null;
    validUntil?: string | null;
    onDeclined?: () => void;
  }) => (
    <div
      data-testid="door-acts-stub"
      data-kind={kind ?? 'unresolved'}
      data-valid-until={validUntil ?? ''}
    >
      {proposalId}
      <button type="button" onClick={() => onDeclined?.()}>
        stub decline
      </button>
    </div>
  ),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  proposalClientEvents: { signed: jest.fn() },
  makingEvents: {
    gateFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import {
  invalidateSignedCommercialDocument,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { makingEvents, proposalClientEvents } from '@/lib/analytics/events';

import { DoorGate, type DoorProposal } from '../door-gate';

const bundleMock = useClientCommercialDocument as jest.Mock;

const MARK: ThresholdMark = {
  id: 'door:prop-7',
  kind: 'door',
  roomId: 'room-library',
  label: 'Furnishings authorization No. 7',
  anchor: 'door',
  proposalId: 'prop-7',
  amountCents: 689000,
};

const PROPOSAL: DoorProposal = {
  id: 'prop-7',
  title: 'Furnishings authorization No. 7',
  totalAmountCents: 689000,
  sentAt: '2026-08-04',
  updatedAt: '2026-08-04',
  kind: 'furnishings_authorization',
};

const NOTE: NoteModel = {
  id: 'note-1',
  body: 'Three last pieces for the library — sign and I’ll have them ordered by Friday.',
  sentAt: '2026-08-04',
  enclosures: [{ kind: 'proposal', id: 'prop-7' }],
};

function bundleFor(kind: CommercialDocumentKind) {
  return {
    isLoading: false,
    isError: false,
    data: {
      document: { kind },
      furnishings:
        kind === 'furnishings_authorization'
          ? {
              checkpointId: null,
              depositRequiredCents: 344500,
              depositPaidCents: 0,
              items: [
                {
                  description: 'Brass library sconces',
                  quantity: 2,
                  clientUnitPriceCents: 117000,
                  currency: 'USD',
                  roomName: 'Library & lounge',
                  clientLineTotalCents: 234000,
                },
                {
                  description: 'Wool drapery',
                  quantity: 1,
                  clientUnitPriceCents: 289000,
                  currency: 'USD',
                  roomName: 'Library & lounge',
                  clientLineTotalCents: 289000,
                },
                {
                  description: 'Kilim runner',
                  quantity: 1,
                  clientUnitPriceCents: 166000,
                  currency: 'USD',
                  roomName: 'Library & lounge',
                  clientLineTotalCents: 166000,
                },
              ],
            }
          : null,
      tradeScope:
        kind === 'trade_scope'
          ? { party: { displayName: 'Prairie Coat Painting' }, draws: [{ amountCents: 144000 }] }
          : null,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function reduceMotion(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderGate(props: Partial<React.ComponentProps<typeof DoorGate>> = {}) {
  return render(
    <DoorGate
      mark={MARK}
      proposal={PROPOSAL}
      note={NOTE}
      projectId="proj-1"
      studioName="Quist Interiors"
      {...props}
    />,
    { wrapper },
  );
}

function signWith(name = 'Harper Vale') {
  fireEvent.change(screen.getByLabelText('Type your full name'), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

const signAction = () => screen.getByRole('button', { name: /^Sign/ });

/**
 * The act is held now, not tapped (P-18): press, wait the hold out, release.
 * Fake time covers the hold itself and is handed back before the signature
 * request's promises are flushed, so the swing timers stay real.
 */
async function holdSign({ faked = false } = {}) {
  const target = signAction();
  if (!faked) jest.useFakeTimers();
  fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
  act(() => {
    jest.advanceTimersByTime(HOLD_MS);
  });
  // A test that installed its own fake clock keeps it: the swing and the
  // receipt's crossfade are what it came to measure.
  if (!faked) jest.useRealTimers();
  await act(async () => {
    fireEvent.pointerUp(target);
  });
}

describe('DoorGate', () => {
  beforeEach(() => {
    bundleMock.mockReturnValue(bundleFor('furnishings_authorization'));
    reduceMotion(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: 'proj-1' }),
    }) as unknown as typeof fetch;
  });

  it('anchors the first door at #door and never dims while it is shut', () => {
    const { container } = renderGate();
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'door');
    expect(section).toHaveAttribute('data-threshold-unit', 'door');
    expect(section).toHaveAttribute('data-never-dim');
    expect(section).not.toHaveAttribute('data-dimmable');
  });

  it('anchors a second door at its own mark id, with no colon in it', () => {
    const { container } = renderGate({ first: false });
    expect(container.querySelector('section')).toHaveAttribute('id', 'door-door-prop-7');
  });

  it('draws the leaf shut with the note pinned to it and the paper printed on it', () => {
    renderGate();

    expect(screen.getByTestId('door-leaf')).toBeInTheDocument();
    expect(screen.getByTestId('door-note-pin')).toHaveTextContent(
      'Three last pieces for the library',
    );
    expect(screen.getByText('Brass library sconces')).toBeInTheDocument();
    expect(screen.getByText('Kilim runner')).toBeInTheDocument();
    expect(screen.getByTestId('door-total')).toHaveTextContent('$6,890');
  });

  it('quotes and attributes the pinned note, so it is not the page speaking', () => {
    renderGate();
    const pin = screen.getByTestId('door-note-pin');
    expect(pin.textContent ?? '').toContain('“');
    expect(pin.textContent ?? '').toContain('”');
    expect(pin).toHaveTextContent('— Quist Interiors');
  });

  it('capitalizes the pieces caption the way The Making does', () => {
    renderGate();
    expect(screen.getByTestId('door-total')).toHaveTextContent(
      'Three pieces order the moment you sign.',
    );
  });

  it('arms the act only once a name is typed and the line is ticked', () => {
    renderGate();
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('checkbox'));
    expect(signAction()).not.toHaveAttribute('aria-disabled');

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'H' },
    });
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
  });

  it('is not armed by whitespace alone', () => {
    renderGate();
    signWith('   ');
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not offer the act before the paper is drawn', () => {
    bundleMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    renderGate();

    signWith();
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('door-hint')).toHaveTextContent('Drawing this paper.');
  });

  it('does not offer the act when the paper could not be read', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    renderGate();

    signWith();
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('door-hint')).toHaveTextContent('could not be drawn');
  });

  it('signs on a ruled line with the date beside it, and says so once', () => {
    renderGate();

    const rule = screen.getByTestId('door-sign-name');
    expect(rule).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Type your full name')).toBe(rule);
    expect(screen.getByTestId('door-sign-name-date')).toHaveClass('font-mono');

    // The electronic-signature sentence lives on the rule now. It is printed
    // ONCE on the paper: the hint below the act no longer repeats it.
    const notice = screen.getAllByText(
      'Your typed name acts as your electronic signature.',
    );
    expect(notice).toHaveLength(1);
    expect(notice[0]).toBe(screen.getByTestId('door-sign-name-notice'));
    expect(screen.getByTestId('door-hint')).toHaveTextContent(
      'Type your full name and tick the line to sign.',
    );
  });

  it('is the terminal tier, and says what signing does in every state', () => {
    renderGate();
    const said =
      'Signing records your name on this paper and returns it to Quist Interiors. ' +
      'The deposit of $3,445.00 becomes payable; signing does not pay it.';

    expect(signAction()).toHaveClass('da-terminal');
    // unavailable — nothing typed, nothing ticked
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('door-consequence')).toHaveTextContent(said);

    // and armed
    signWith();
    expect(screen.getByTestId('door-consequence')).toHaveTextContent(said);
  });

  it('sends an unmet activation to the rule rather than nowhere', () => {
    renderGate();
    fireEvent.click(signAction());

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('door-sign-name')).toHaveFocus();
    expect(screen.getByTestId('gate_sign-status')).toHaveTextContent(
      'Type your full name and tick the line to sign.',
    );
  });

  it('takes the act and its sentence away once the paper is signed', async () => {
    renderGate();
    signWith();
    await holdSign();

    expect(screen.queryByRole('button', { name: /^Sign/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('door-consequence')).not.toBeInTheDocument();
  });

  it('takes the signature on a hold, never on a tap', async () => {
    renderGate();
    signWith();

    // A tap is a press and the click trailing it; neither signs.
    fireEvent.pointerDown(signAction(), { clientX: 4, clientY: 4 });
    fireEvent.pointerUp(signAction());
    fireEvent.click(signAction());
    expect(global.fetch).not.toHaveBeenCalled();

    // Released before the hold is out: nothing is signed, and nothing is said.
    jest.useFakeTimers();
    fireEvent.pointerDown(signAction(), { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    fireEvent.pointerUp(signAction());
    act(() => {
      jest.advanceTimersByTime(HOLD_MS * 2);
    });
    jest.useRealTimers();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await holdSign();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('names the gesture, and docks the act on a narrow viewport', () => {
    const { container } = renderGate();

    const said = signAction().getAttribute('aria-describedby');
    expect(said).toBeTruthy();
    expect(container.textContent).toContain('Press and hold to sign.');

    // The primary act docks. (The clearance the other four answers are given
    // at the same width is pinned in door-acts.test.tsx, which renders the
    // real component rather than this file's stub.)
    const dock = container.querySelector('[data-hold-dock]');
    expect(dock).toHaveClass('max-[600px]:sticky');
    expect(dock).toHaveClass('max-[600px]:bottom-0');
    // It sits on the leaf, not inside the gate — sticky needs room to travel.
    expect(screen.getByTestId('spine-gate-act')).not.toContainElement(
      dock as HTMLElement,
    );
    expect(screen.getByTestId('door-leaf')).toContainElement(dock as HTMLElement);
  });

  it('replaces the leaf with a one-line lintel receipt on signing (reduced motion)', async () => {
    const onSigned = jest.fn();
    renderGate({ onSigned });

    signWith();
    await holdSign();

    await waitFor(() => {
      expect(screen.queryByTestId('door-leaf')).not.toBeInTheDocument();
    });

    const receipt = screen.getByTestId('door-receipt');
    expect(receipt).toHaveTextContent('Furnishings authorization No. 7');
    expect(receipt).toHaveTextContent('signed');
    // RULED 2026-09-05 (P-19): the receipt says what is true — the studio holds
    // her name — and never that anyone countersigns.
    expect(receipt).toHaveTextContent('Quist Interiors has your signature. You’ll have a copy.');
    expect(receipt).not.toHaveTextContent('countersign');

    // P-26. "You'll have a copy" is a promise one line above; this is where
    // it is kept. A new tab, because the door has just swung on a page she
    // may still be reading.
    const keep = within(screen.getByTestId('door-keep-a-copy')).getByRole('link', {
      name: 'Keep a copy',
    });
    expect(keep).toHaveAttribute('href', '/proposals/prop-7/record');
    expect(keep).toHaveAttribute('target', '_blank');
    expect(keep).toHaveAttribute('rel', 'noopener noreferrer');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/proposals/prop-7/sign',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(invalidateSignedCommercialDocument).toHaveBeenCalled());
    expect(proposalClientEvents.signed).toHaveBeenCalledWith({
      proposalId: 'prop-7',
      signedByName: 'Harper Vale',
    });
    expect(makingEvents.gateFollowed).toHaveBeenCalledWith({
      projectId: 'proj-1',
      proposalId: 'prop-7',
      kind: 'furnishings_authorization',
    });
    expect(onSigned).toHaveBeenCalledTimes(1);
  });

  it('hangs the other four answers on the leaf while the paper is still asking', () => {
    renderGate();
    expect(screen.getByTestId('door-acts-stub')).toHaveTextContent('prop-7');
  });

  it('takes the acts away with the leaf once it opens on her name', async () => {
    renderGate();
    signWith();
    await holdSign();
    await waitFor(() => {
      expect(screen.queryByTestId('door-acts-stub')).not.toBeInTheDocument();
    });
  });

  it('hands the acts a null kind rather than calling an unresolved paper legacy', () => {
    bundleMock.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    renderGate({ proposal: { ...PROPOSAL, kind: undefined } });

    expect(screen.getByTestId('door-acts-stub')).toHaveAttribute('data-kind', 'unresolved');
  });

  it('carries the paper’s own valid_until down to the acts', () => {
    renderGate({ proposal: { ...PROPOSAL, validUntil: '2026-08-30T00:00:00Z' } });

    expect(screen.getByTestId('door-acts-stub')).toHaveAttribute(
      'data-valid-until',
      '2026-08-30T00:00:00Z',
    );
  });

  it('disarms the signature block on the date the acts withdrew', () => {
    // The old page held every act back under ONE `isActionable`. A block that
    // still says "Ready when you are." past `valid_until` offers a signature
    // /api/proposals/[id]/sign refuses on the same date.
    renderGate({ proposal: { ...PROPOSAL, validUntil: '2020-01-01T00:00:00Z' } });

    expect(screen.getByLabelText('Type your full name')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('door-hint')).toHaveTextContent(
      'This paper is past its date. Ask your studio to reissue it.',
    );
  });

  it('stops asking for her name once she has declined the paper', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'stub decline' }));

    expect(screen.getByText('Shut. You declined it.')).toBeInTheDocument();
    expect(screen.getByLabelText('Type your full name')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('door-hint')).toHaveTextContent(
      'You declined this paper. Your studio has been told.',
    );
  });

  it('stops claiming never-dim once it has been signed', async () => {
    const { container } = renderGate();
    signWith();
    await holdSign();
    await waitFor(() => {
      expect(container.querySelector('section')).not.toHaveAttribute('data-never-dim');
    });
  });

  it('measures the doorway, then releases it to zero so the collapse interpolates', async () => {
    jest.useFakeTimers();
    reduceMotion(false);
    const height = jest
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(480);

    renderGate();
    signWith();

    // Shut: no ceiling at all, so nothing clips the leaf at rest.
    expect(screen.getByTestId('door-way').style.maxHeight).toBe('');

    await holdSign({ faked: true });

    // Pinned to the measured height, and the leaf is mid-swing.
    expect(screen.getByTestId('door-way').style.maxHeight).toBe('480px');
    expect(screen.getByTestId('door-leaf')).toHaveAttribute('data-door-state', 'swinging');
    expect(screen.getByTestId('door-way')).toHaveAttribute('aria-hidden', 'true');

    // Next frame: released to zero, which is now a length-to-length transition.
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('door-way').style.maxHeight).toBe('0px');
    expect(screen.getByTestId('door-leaf')).toBeInTheDocument();

    // The collapse completes and the doorway goes.
    act(() => {
      jest.advanceTimersByTime(520);
    });
    expect(screen.queryByTestId('door-way')).not.toBeInTheDocument();
    expect(screen.queryByTestId('door-leaf')).not.toBeInTheDocument();
    expect(screen.getByTestId('door-receipt')).toHaveTextContent('Quist Interiors has your signature. You’ll have a copy.');

    height.mockRestore();
    jest.useRealTimers();
  });

  /**
   * `W2-01`. `onSign` used to AWAIT the invalidation before it set `signedAt`
   * or started the swing. The refetch takes the signed paper out of the papers
   * the Threshold draws doors from, so the whole section unmounted about 40 ms
   * after the POST answered — measured at frame resolution in the round-2 walk:
   * `door-way` was already gone at the first sample, `door-receipt` never
   * appeared on three signatures, and the leaf never entered `swinging`.
   */
  it('starts the swing before the refetch, and waits the leaf out before asking for it', async () => {
    jest.useFakeTimers();
    reduceMotion(false);
    let releaseInvalidation: () => void = () => {};
    (invalidateSignedCommercialDocument as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseInvalidation = resolve;
        }),
    );

    renderGate();
    signWith();
    await holdSign({ faked: true });

    // The leaf is already moving and the receipt is already drawn, with the
    // refetch not so much as asked for.
    expect(screen.getByTestId('door-leaf')).toHaveAttribute('data-door-state', 'swinging');
    expect(screen.getByTestId('door-receipt')).toBeInTheDocument();
    expect(invalidateSignedCommercialDocument).not.toHaveBeenCalled();

    // The swing runs to its end on its own.
    await act(async () => {
      jest.advanceTimersByTime(520);
    });
    expect(screen.getByTestId('door-receipt')).toHaveTextContent('Quist Interiors has your signature. You’ll have a copy.');
    expect(invalidateSignedCommercialDocument).toHaveBeenCalledTimes(1);

    releaseInvalidation();
    jest.useRealTimers();
  });

  it('does not call a signed paper a refusal when the refetch after it fails', async () => {
    reduceMotion(true);
    (invalidateSignedCommercialDocument as jest.Mock).mockRejectedValue(
      new Error('network'),
    );

    renderGate();
    signWith();
    await holdSign();

    await waitFor(() => expect(invalidateSignedCommercialDocument).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('door-receipt')).toBeInTheDocument();
  });

  it('inks the receipt from nothing, so the crossfade has something to run', async () => {
    jest.useFakeTimers();
    renderGate();
    signWith();

    await holdSign({ faked: true });
    expect(screen.getByTestId('door-receipt')).toHaveStyle({ opacity: '0' });

    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('door-receipt')).toHaveStyle({ opacity: '1' });
    jest.useRealTimers();
  });

  it('surfaces the pending-retry recovery instead of losing it to a route', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: 'proj-1',
        notificationDelivery: { state: 'pending_retry' },
      }),
    }) as unknown as typeof fetch;
    renderGate();

    signWith();
    await holdSign();

    expect(screen.getByTestId('door-delivery-pending')).toHaveTextContent(
      'Your signature remains recorded, but confirmation delivery is still pending. You can retry safely.',
    );

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ notificationDelivery: { state: 'delivered' } }),
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resend confirmation notice/i }));
    });
    expect(screen.getByText('Confirmation delivery is confirmed.')).toBeInTheDocument();
  });

  it('says nothing about delivery when it was delivered', async () => {
    renderGate();
    signWith();
    await holdSign();
    expect(screen.queryByTestId('door-delivery-pending')).not.toBeInTheDocument();
  });

  it.each([
    ['not_signable', 'not open for signing'],
    ['proposal_expired', 'expired'],
    ['unauthorized', 'Sign in again'],
  ])('turns the API token %s into a sentence, keeping the leaf', async (token, fragment) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: token }),
    }) as unknown as typeof fetch;
    renderGate();

    signWith();
    await holdSign();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(fragment);
    expect(alert).not.toHaveTextContent(token);
    expect(screen.getByTestId('door-leaf')).toBeInTheDocument();
  });

  it('survives a network failure without losing the leaf or the act', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
    renderGate();

    signWith();
    await holdSign();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('door-leaf')).toBeInTheDocument();
    expect(signAction()).not.toHaveAttribute('aria-disabled');
  });

  it('never prints a bare "AI" anywhere on the leaf', () => {
    const { container } = renderGate();
    expect(container.textContent ?? '').not.toMatch(/\bAI\b/);
  });
});

// ── Every kind of paper comes through this door ──────────────────────────────

describe('DoorGate — per commercial kind', () => {
  beforeEach(() => {
    reduceMotion(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: 'proj-1' }),
    }) as unknown as typeof fetch;
  });

  it.each([
    ['furnishings_authorization', 'Sign authorization'],
    ['trade_scope', 'Sign and authorize'],
    ['design_services', 'Sign and accept'],
    ['service_addendum', 'Sign and accept'],
    ['legacy', 'Sign and accept'],
  ] as const)('carries the route’s consent and act label for %s', (kind, label) => {
    bundleMock.mockReturnValue(bundleFor(kind));
    renderGate({ proposal: { ...PROPOSAL, kind } });

    expect(screen.getByText(consentLineFor(kind))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    expect(signLabelFor(kind)).toBe(label);
  });

  it.each(['trade_scope', 'design_services', 'service_addendum', 'legacy'] as const)(
    'prints no furnishings line wording on a %s door',
    (kind) => {
      bundleMock.mockReturnValue(bundleFor(kind));
      const { container } = renderGate({ proposal: { ...PROPOSAL, kind } });

      expect(screen.queryByTestId('door-lines')).not.toBeInTheDocument();
      expect(screen.queryByTestId('door-total')).not.toBeInTheDocument();
      expect(container.textContent ?? '').not.toContain(
        'the named lines at the quantities and client prices shown',
      );
      expect(container.textContent ?? '').not.toContain('pieces order the moment you sign');
    },
  );

  it('gives a design-services door the countersign consent, not the furnishings one', () => {
    bundleMock.mockReturnValue(bundleFor('design_services'));
    renderGate({ proposal: { ...PROPOSAL, kind: 'design_services' } });

    expect(
      screen.getByText(/my signature alone does not authorize work until the studio countersigns/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('door-summary')).toHaveTextContent(
      'The agreement becomes effective only after the studio countersigns.',
    );
  });

  it('reads the deposit off the trade scope’s first draw, as The Making does', () => {
    bundleMock.mockReturnValue(bundleFor('trade_scope'));
    renderGate({ proposal: { ...PROPOSAL, kind: 'trade_scope' } });

    expect(screen.getByTestId('spine-gate-deposit')).toHaveTextContent('$1,440 on signing');
  });

  it('falls back to the bundle’s own kind when the proposal does not carry one', () => {
    bundleMock.mockReturnValue(bundleFor('trade_scope'));
    const { kind: _dropped, ...withoutKind } = PROPOSAL;
    renderGate({ proposal: withoutKind });

    expect(screen.getByText(consentLineFor('trade_scope'))).toBeInTheDocument();
  });

  it('names the kind of instrument on the leaf', () => {
    bundleMock.mockReturnValue(bundleFor('design_services'));
    renderGate({ proposal: { ...PROPOSAL, kind: 'design_services' } });

    expect(screen.getByTestId('spine-gate-vitals')).toHaveTextContent(
      'Design services agreement',
    );
  });
});

/* ── THE COMPOSED DOOR (Wave 2, P6) ──────────────────────────────────────────
   An agreement composed from parts says what it actually authorizes on the
   consent line, and an attachment it requires her to acknowledge is a gate on
   the act rather than a line under it. The composer's own outputs are pinned
   in consent-copy.test.ts; what is pinned here is that the door reads the
   bundle's parts, that the ticks gate the hold, and that the keys reach the
   sign route. ────────────────────────────────────────────────────────────── */

const PER_PHASE_LINE =
  'I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.';

function composedBundle(parts: unknown[]) {
  return {
    isLoading: false,
    isError: false,
    data: {
      document: { kind: 'design_services' as const },
      furnishings: null,
      tradeScope: null,
      parts,
    },
  };
}

const MONEY_PARTS = [
  {
    id: 'p1',
    position: 1,
    kind: 'schedule',
    variant: 'per_phase',
    partKey: 'patina.per_phase',
    title: 'Per-phase fee',
    payload: {
      phases: [
        { key: 'concept', label: 'Concept', cents: 350000 },
        { key: 'documentation', label: 'Documentation', cents: 450000 },
      ],
    },
    required: true,
  },
  {
    id: 'p2',
    position: 2,
    kind: 'schedule',
    variant: 'retainer',
    partKey: 'patina.retainer',
    title: 'Retainer',
    payload: { cents: 500000, creditRule: 'non_refundable' },
    required: false,
  },
];

const ATTACHMENT_PARTS = [
  {
    id: 'p3',
    position: 3,
    kind: 'attachment',
    variant: null,
    partKey: 'studio.lead_paint_notice',
    title: 'the lead-paint notice',
    payload: { body: 'A notice.', acknowledgeRequired: true },
    required: false,
  },
  {
    id: 'p4',
    position: 4,
    kind: 'attachment',
    variant: null,
    partKey: 'studio.care_guide',
    title: 'the care guide',
    payload: { body: 'A guide.', acknowledgeRequired: false },
    required: false,
  },
];

describe('DoorGate — the composed agreement', () => {
  beforeEach(() => {
    reduceMotion(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: 'proj-1' }),
    }) as unknown as typeof fetch;
  });

  function renderComposed(parts: unknown[]) {
    bundleMock.mockReturnValue(composedBundle(parts));
    return renderGate({ proposal: { ...PROPOSAL, kind: 'design_services' } });
  }

  it('reads the consent line off the parts, not off the kind alone', () => {
    renderComposed(MONEY_PARTS);

    expect(screen.getByTestId('door-consent-line')).toHaveTextContent(PER_PHASE_LINE);
    // The legacy line named the seven facets; a per-phase agreement has none
    // of the terms it asserted.
    expect(screen.getByTestId('door-consent-line')).not.toHaveTextContent(
      'the signed role rates',
    );
  });

  it('keeps today’s line for a parts-less agreement', () => {
    renderComposed([]);

    expect(screen.getByTestId('door-consent-line')).toHaveTextContent(
      consentLineFor('design_services'),
    );
  });

  it('stops the summary above it naming terms this paper does not carry', () => {
    renderComposed(MONEY_PARTS);

    const summary = screen.getByTestId('door-summary');
    // The frozen sentence told her she was accepting role rates, a ceiling and
    // a retainer. This agreement is per-phase: it has none of the first two,
    // and the consent line below names the retainer it does have.
    expect(summary).not.toHaveTextContent('signed role rates');
    expect(summary).not.toHaveTextContent('design authorization ceiling');
    expect(summary).toHaveTextContent(
      'The agreement becomes effective only after the studio countersigns.',
    );
  });

  it('leaves the summary untouched on an agreement with no parts', () => {
    renderComposed([]);

    expect(screen.getByTestId('door-summary')).toHaveTextContent(
      'By signing, you accept the services, signed role rates, design authorization ceiling, retainer, and terms in',
    );
  });

  it('asks about the attachments it must, and only those', () => {
    renderComposed([...MONEY_PARTS, ...ATTACHMENT_PARTS]);

    const acks = screen.getAllByTestId('door-attachment-ack');
    expect(acks).toHaveLength(1);
    expect(acks[0]).toHaveAttribute('data-part-key', 'studio.lead_paint_notice');
    expect(acks[0]).toHaveTextContent('I received the lead-paint notice.');
  });

  it('offers no acknowledgment at all when no attachment asks for one', () => {
    renderComposed([...MONEY_PARTS, ATTACHMENT_PARTS[1]]);

    expect(screen.queryAllByTestId('door-attachment-ack')).toHaveLength(0);
    expect(screen.getByTestId('door-hint')).toHaveTextContent(
      'Type your full name and tick the line to sign.',
    );
  });

  it('holds the act back until every attachment is ticked, and says so', () => {
    renderComposed([...MONEY_PARTS, ...ATTACHMENT_PARTS]);

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(screen.getByLabelText(PER_PHASE_LINE));

    expect(signAction()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('door-hint')).toHaveTextContent(
      'Tick each attachment you received, type your full name, and tick the line to sign.',
    );

    fireEvent.click(screen.getByLabelText('I received the lead-paint notice.'));

    expect(signAction()).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('door-hint')).toHaveTextContent('Ready when you are.');
  });

  it('carries the acknowledged keys to the sign route', async () => {
    renderComposed([...MONEY_PARTS, ...ATTACHMENT_PARTS]);

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(screen.getByLabelText(PER_PHASE_LINE));
    fireEvent.click(screen.getByLabelText('I received the lead-paint notice.'));

    await holdSign();

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      signedByName: 'Harper Vale',
      attachmentsAcknowledged: ['studio.lead_paint_notice'],
    });
  });

  it('sends an empty acknowledgment list when the agreement asks for none', async () => {
    renderComposed(MONEY_PARTS);

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(screen.getByLabelText(PER_PHASE_LINE));

    await holdSign();

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      signedByName: 'Harper Vale',
      attachmentsAcknowledged: [],
    });
  });

  /* ── THE DEPOSIT IS OFFERED, NEVER ASKED FOR FIRST (Wave 3, P13 · R15) ────
     Everything below is about ORDER and about what a failure looks like. The
     offer cannot exist before the signature: the route mints it only after
     the signature RPC has returned, and the door only stores it after
     `setSignedAt` and `onSigned` have run. And when it does not exist, the
     page is exactly the page it would have been — the signature never
     acquires an error it did not cause. ──────────────────────────────────── */
  describe('the deposit offer', () => {
    const OFFER = {
      invoiceId: 'inv-deposit',
      amountCents: 841340,
      label: 'Deposit at signing',
      payPath: `/pay/${'b'.repeat(64)}`,
    };

    beforeEach(() => {
      bundleMock.mockReturnValue({
        isLoading: false,
        isError: false,
        data: {
          document: { kind: 'design_build' },
          furnishings: null,
          tradeScope: null,
          parts: [],
          serviceTerms: { currency: 'USD' },
          designBuild: {
            // Five rows: four draws and the retainage release, as the
            // Halvorsen schedule carries them.
            draws: [0, 1, 2, 3, 4].map((n) => ({ drawKey: `d${n}` })),
            retainageHeldCents: 378603,
            subs: [],
          },
        },
      });
    });

    function answerWith(depositOffer: unknown) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ projectId: null, depositOffer }),
      }) as unknown as typeof fetch;
    }

    it('is nowhere on the page before she signs', () => {
      answerWith(OFFER);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });

      expect(screen.queryByTestId('deposit-offer')).not.toBeInTheDocument();
    });

    it('stands under the receipt once the signature is recorded', async () => {
      answerWith(OFFER);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });
      signWith();
      await holdSign();

      await waitFor(() => {
        expect(screen.getByTestId('deposit-offer')).toBeInTheDocument();
      });
      expect(screen.getByTestId('door-receipt')).toBeInTheDocument();
      expect(screen.getByTestId('deposit-offer')).toHaveTextContent('$8,413.40');
      expect(screen.getByRole('link', { name: 'Pay the deposit' })).toHaveAttribute(
        'href',
        `/pay/${'b'.repeat(64)}`,
      );
    });

    /* The route answers `ok: true` with a null offer when the second call
       failed. The signature stands, the receipt inks, and nothing on the page
       says a word about money that did not happen. */
    it('says nothing at all when the route could not mint one', async () => {
      answerWith(null);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });
      signWith();
      await holdSign();

      await waitFor(() => {
        expect(screen.getByTestId('door-receipt')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('deposit-offer')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('door-receipt')).toHaveTextContent('has your signature');
    });

    it('says nothing on a paper that has no deposit to offer', async () => {
      answerWith(undefined);
      renderGate();
      signWith();
      await holdSign();

      await waitFor(() => {
        expect(screen.getByTestId('door-receipt')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('deposit-offer')).not.toBeInTheDocument();
    });

    /* RC-6, said as a test rather than as a promise: the offer takes no part
       in the act's armed state. The act is disabled before her name and tick,
       and armed after, whether or not an offer will ever come back. */
    it('takes no part in whether the act is armed', () => {
      answerWith(OFFER);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });

      expect(signAction()).toHaveAttribute('aria-disabled', 'true');
      signWith();
      expect(signAction()).not.toHaveAttribute('aria-disabled');
      expect(screen.queryByTestId('deposit-offer')).not.toBeInTheDocument();
    });

    it('reports the turnkey gate under its own kind', async () => {
      answerWith(OFFER);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });
      signWith();
      await holdSign();

      expect(makingEvents.gateFollowed).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'design_build' }),
      );
    });
  });

  /* ── R50 · W3R2-02 — THE RECEIPT SURVIVES A RELOAD ───────────────────────
     Everything above is about the visit she signed in, and that visit was all
     the post-signature region ever had: `signedAt` and the offer both lived in
     this component's memory, so a reload took the receipt, KEEP A COPY, the
     deposit offer and the pay link with it. The walk reloaded and read
     "Nothing waits for your name."

     These cases are the door on the NEXT visit: no signature made here, no
     fetch, the bundle alone. ─────────────────────────────────────────────── */
  describe('a paper she signed on an earlier visit', () => {
    function signedBundle(depositOffer: unknown) {
      bundleMock.mockReturnValue({
        isLoading: false,
        isError: false,
        data: {
          document: { kind: 'design_build' },
          furnishings: null,
          tradeScope: null,
          parts: [],
          serviceTerms: { currency: 'USD' },
          signatures: [
            {
              party: 'client',
              signerName: 'Harper Vale',
              signedAt: '2026-09-08T15:04:00.000Z',
              documentFingerprint: 'abc',
            },
          ],
          designBuild: {
            draws: [0, 1, 2, 3, 4].map((n) => ({ drawKey: `d${n}` })),
            retainageHeldCents: 378603,
            subs: [],
            depositOffer,
          },
        },
      });
    }

    it('stands open on her name, with the receipt and the copy she keeps', () => {
      signedBundle(null);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });

      expect(screen.getByText('Open. It opened on your name.')).toBeInTheDocument();
      expect(screen.getByTestId('door-receipt')).toHaveTextContent(
        'has your signature',
      );
      expect(screen.getByTestId('door-keep-a-copy')).toBeInTheDocument();
    });

    it('re-derives the deposit offer from the row, not from this session', () => {
      signedBundle({
        invoiceId: 'inv-deposit',
        amountCents: 841340,
        label: 'Deposit at signing',
        payToken: 'b'.repeat(64),
      });
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });

      expect(screen.getByTestId('deposit-offer')).toHaveTextContent('$8,413.40');
      expect(screen.getByRole('link', { name: 'Pay the deposit' })).toHaveAttribute(
        'href',
        `/pay/${'b'.repeat(64)}`,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('offers nothing once the bundle says the deposit is settled', () => {
      signedBundle(null);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });

      expect(screen.queryByTestId('deposit-offer')).not.toBeInTheDocument();
      expect(screen.getByTestId('door-receipt')).toBeInTheDocument();
    });

    it('never asks for a name she has already given', () => {
      signedBundle(null);
      renderGate({ proposal: { ...PROPOSAL, kind: 'design_build' } });

      expect(screen.queryByLabelText('Type your full name')).not.toBeInTheDocument();
      expect(screen.queryByTestId('door-acts-stub')).not.toBeInTheDocument();
    });
  });
});
