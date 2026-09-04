import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { NoteModel, ThresholdMark, ThresholdProposal } from '@/lib/threshold/derive';

// ── Boundaries ──────────────────────────────────────────────────────────────
// The leaf reads one bundle (the paper's own line items) and posts to the
// shipped sign route. Mock the module the component actually imports; a
// near-miss silently no-ops (patina-testing).

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
  invalidateSignedCommercialDocument: jest.fn().mockResolvedValue(undefined),
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
import { proposalClientEvents } from '@/lib/analytics/events';

import { DoorGate } from '../door-gate';

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

const PROPOSAL: ThresholdProposal = {
  id: 'prop-7',
  title: 'Furnishings authorization No. 7',
  totalAmountCents: 689000,
  sentAt: '2026-08-04T15:00:00Z',
  updatedAt: '2026-08-04T15:00:00Z',
};

const NOTE: NoteModel = {
  id: 'note-1',
  body: 'Three last pieces for the library — sign and I’ll have them ordered by Friday.',
  sentAt: '2026-08-04T15:00:00Z',
  enclosures: [{ kind: 'proposal', id: 'prop-7' }],
};

const BUNDLE = {
  data: {
    furnishings: {
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
    },
    tradeScope: null,
  },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

describe('DoorGate', () => {
  beforeEach(() => {
    bundleMock.mockReturnValue(BUNDLE);
    reduceMotion(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: 'proj-1' }),
    }) as unknown as typeof fetch;
  });

  it('anchors the first door at #door and never dims', () => {
    const { container } = renderGate();
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'door');
    expect(section).toHaveAttribute('data-threshold-unit', 'door');
    expect(section).toHaveAttribute('data-never-dim');
  });

  it('anchors a second door at its own mark id', () => {
    const { container } = renderGate({ first: false });
    expect(container.querySelector('section')).toHaveAttribute('id', 'door-door:prop-7');
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

  it('arms SIGN only once a name is typed and the line is ticked', () => {
    renderGate();

    const sign = screen.getByRole('button', { name: /sign/i });
    expect(sign).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    expect(sign).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(sign).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'H' },
    });
    expect(sign).toBeDisabled();
  });

  it('replaces the leaf with a one-line lintel receipt on signing (reduced motion)', async () => {
    const onSigned = jest.fn();
    renderGate({ onSigned });

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(screen.getByRole('checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign/i }));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('door-leaf')).not.toBeInTheDocument();
    });

    const receipt = screen.getByTestId('door-receipt');
    expect(receipt).toHaveTextContent('Furnishings authorization No. 7');
    expect(receipt).toHaveTextContent('signed');
    expect(receipt).toHaveTextContent('Quist Interiors countersigns');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/proposals/prop-7/sign',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidateSignedCommercialDocument).toHaveBeenCalled();
    expect(proposalClientEvents.signed).toHaveBeenCalledWith({
      proposalId: 'prop-7',
      signedByName: 'Harper Vale',
    });
    expect(onSigned).toHaveBeenCalledTimes(1);
  });

  it('holds the leaf through the swing before the doorway collapses (motion allowed)', async () => {
    jest.useFakeTimers();
    reduceMotion(false);
    renderGate();

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(screen.getByRole('checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign/i }));
    });

    expect(screen.getByTestId('door-leaf')).toHaveAttribute('data-door-state', 'swinging');

    act(() => {
      jest.advanceTimersByTime(520);
    });

    expect(screen.queryByTestId('door-leaf')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('surfaces a refused signature without losing the leaf', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'This proposal is no longer open.' }),
    }) as unknown as typeof fetch;
    renderGate();

    fireEvent.change(screen.getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('This proposal is no longer open.');
    expect(screen.getByTestId('door-leaf')).toBeInTheDocument();
  });

  it('never prints a bare "AI" anywhere on the leaf', () => {
    const { container } = renderGate();
    expect(container.textContent ?? '').not.toMatch(/\bAI\b/);
  });
});
