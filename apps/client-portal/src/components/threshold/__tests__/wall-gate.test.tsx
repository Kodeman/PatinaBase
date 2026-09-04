import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import type { ClientSelection } from '@/lib/commercial-documents';
import type { ThresholdMark } from '@/lib/threshold/derive';

// ── Boundaries ──────────────────────────────────────────────────────────────
// The acceptance logic is The Making's, lifted: one bundle read for the draws,
// one mutation for the act. Mock the module the component imports.

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
  useAcceptTradeScope: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: {
    gateFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import {
  useAcceptTradeScope,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { makingEvents } from '@/lib/analytics/events';

import { WallGate } from '../wall-gate';

const bundleMock = useClientCommercialDocument as jest.Mock;
const acceptMock = useAcceptTradeScope as jest.Mock;

const MARK: ThresholdMark = {
  id: 'wall:sel-paint',
  kind: 'wall',
  roomId: 'room-hall',
  label: 'Interior painting, library & stair hall',
  anchor: 'wall',
  proposalId: 'prop-ts-2',
  amountCents: 720000,
};

const SELECTION: ClientSelection = {
  id: 'sel-paint',
  kind: 'trade',
  name: 'Interior painting, library & stair hall',
  roomId: 'room-hall',
  roomName: 'Entry & stair hall',
  quantity: 1,
  clientUnitPriceCents: 720000,
  clientLineTotalCents: 720000,
  itemType: 'trade',
  logisticsStatus: 'specified' as FFEStageKey,
  tradeJourney: 'substantially_complete',
  allowance: null,
  instrument: {
    documentId: 'doc-ts-2',
    proposalId: 'prop-ts-2',
    name: 'Trade scope — interior painting',
    executedAt: '2026-06-19T00:00:00Z',
  },
  productId: null,
  imageUrl: null,
  docCode: 'TS-02',
};

const BUNDLE = {
  data: {
    furnishings: null,
    tradeScope: {
      party: { displayName: 'Prairie Coat Painting', company: null, trade: 'Painting' },
      draws: [
        {
          id: 'd1',
          label: 'Deposit',
          percentage: null,
          amountCents: 288000,
          sortOrder: 0,
          gatesOnAcceptance: false,
          invoiceId: 'inv-1',
          invoiceStatus: 'paid',
          invoicePaidCents: 288000,
        },
        {
          id: 'd2',
          label: 'Final',
          percentage: null,
          amountCents: 144000,
          sortOrder: 1,
          gatesOnAcceptance: true,
          invoiceId: null,
          invoiceStatus: null,
          invoicePaidCents: 0,
        },
      ],
    },
  },
};

let mutateAsync: jest.Mock;

function renderGate(props: Partial<React.ComponentProps<typeof WallGate>> = {}) {
  return render(
    <WallGate mark={MARK} selection={SELECTION} projectId="proj-1" {...props} />,
  );
}

describe('WallGate', () => {
  beforeEach(() => {
    mutateAsync = jest.fn().mockResolvedValue(undefined);
    bundleMock.mockReturnValue(BUNDLE);
    acceptMock.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('anchors at #wall and never dims', () => {
    const { container } = renderGate();
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'wall');
    expect(section).toHaveAttribute('data-threshold-unit', 'wall');
    expect(section).toHaveAttribute('data-never-dim');
  });

  it('anchors a second wall at its own mark id', () => {
    const { container } = renderGate({ first: false });
    expect(container.querySelector('section')).toHaveAttribute('id', 'wall-wall:sel-paint');
  });

  it('draws the hatched wall with a square notch cut into it', () => {
    renderGate();
    expect(screen.getByTestId('wall-drawing')).toBeInTheDocument();
    expect(screen.getByTestId('wall-hatch')).toBeInTheDocument();
    expect(screen.getByTestId('wall-notched')).toBeInTheDocument();
  });

  it('binds the acceptance to the selection’s own proposal', () => {
    renderGate();
    expect(acceptMock).toHaveBeenCalledWith('prop-ts-2', 'proj-1');
  });

  it('carries The Making’s draws caption verbatim', () => {
    renderGate();
    expect(screen.getByTestId('spine-gate-caption')).toHaveTextContent(
      'One draw is paid. The draw of $1,440 releases on your acceptance.',
    );
  });

  it('refuses to accept without a typed name', async () => {
    renderGate();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Type your full name to accept the finished work.',
    );
  });

  it('accepts, heals the hatching and stamps what was released', async () => {
    const onAccepted = jest.fn();
    renderGate({ onAccepted });

    fireEvent.change(screen.getByTestId('accept-trade-scope-name'), {
      target: { value: 'Harper Vale' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    });

    expect(mutateAsync).toHaveBeenCalledWith('Harper Vale');
    expect(makingEvents.gateFollowed).toHaveBeenCalledWith({
      projectId: 'proj-1',
      proposalId: 'prop-ts-2',
      kind: 'trade_acceptance',
    });

    const stamp = screen.getByTestId('wall-stamp');
    expect(stamp).toHaveTextContent('Accepted');
    expect(stamp).toHaveTextContent('$1,440 released');
    expect(stamp).toHaveTextContent('Prairie Coat Painting');
    expect(screen.getByTestId('wall-hatch')).toHaveAttribute('data-wall-state', 'settled');
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refused acceptance', async () => {
    mutateAsync.mockRejectedValue(new Error('The scope is not complete.'));
    renderGate();

    fireEvent.change(screen.getByTestId('accept-trade-scope-name'), {
      target: { value: 'Harper Vale' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('The scope is not complete.');
    expect(screen.queryByTestId('wall-stamp')).not.toBeInTheDocument();
  });
});
