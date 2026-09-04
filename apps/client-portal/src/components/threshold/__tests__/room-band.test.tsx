import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import type { ClientSelection } from '@/lib/commercial-documents';
import type { RoomBandModel, ThresholdMark } from '@/lib/threshold/derive';

import { RoomBand } from '../room-band';

// ── Fixtures — the library & lounge, 5 August 2026 ──────────────────────────

function selection(over: Partial<ClientSelection> = {}): ClientSelection {
  return {
    id: 'sel-sconces',
    kind: 'furnishings',
    name: 'Brass library sconces',
    roomId: 'room-library',
    roomName: 'Library & lounge',
    quantity: 2,
    clientUnitPriceCents: 117000,
    clientLineTotalCents: 234000,
    itemType: 'lighting',
    logisticsStatus: 'specified' as FFEStageKey,
    tradeJourney: null,
    allowance: null,
    instrument: {
      documentId: 'doc-7',
      proposalId: 'prop-7',
      name: 'Furnishings authorization No. 7',
      executedAt: null,
    },
    productId: null,
    imageUrl: null,
    docCode: 'FA-07',
    ...over,
  };
}

const DOOR_MARK: ThresholdMark = {
  id: 'door:prop-7',
  kind: 'door',
  roomId: 'room-library',
  label: 'Furnishings authorization No. 7',
  anchor: 'door',
  proposalId: 'prop-7',
  amountCents: 689000,
};

function band(over: Partial<RoomBandModel> = {}): RoomBandModel {
  const pieces = over.pieces ?? [
    selection(),
    selection({
      id: 'sel-runner',
      name: 'Kilim runner',
      clientUnitPriceCents: 166000,
      clientLineTotalCents: 166000,
      quantity: 1,
      logisticsStatus: 'delivered' as FFEStageKey,
      instrument: {
        documentId: 'doc-7',
        proposalId: 'prop-7',
        name: 'Furnishings authorization No. 7',
        executedAt: '2026-06-19T00:00:00Z',
      },
    }),
  ];
  return {
    roomId: 'room-library',
    name: 'Library & lounge',
    anchor: 'room-room-library',
    totalCents: 2490000,
    pieces,
    marks: [DOOR_MARK],
    ...over,
  };
}

describe('RoomBand', () => {
  it('names the room in a real heading and anchors the section', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);

    const heading = screen.getByRole('heading', { level: 2, name: 'Library & lounge' });
    expect(heading).toBeInTheDocument();

    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'room-room-library');
    expect(section).toHaveAttribute('data-threshold-unit', 'room-room-library');
  });

  it('carries the lintel ledger sentence off the band figures', () => {
    render(<RoomBand band={band()} projectId="proj-1" />);

    const lintel = screen.getByTestId('room-band-lintel');
    expect(lintel).toHaveTextContent('$24,900 agreed');
    expect(lintel).toHaveTextContent('two pieces');
    expect(lintel).toHaveTextContent('one door waits on your name');
  });

  it('suppresses the ledger sentence when the band carries no figures', () => {
    render(
      <RoomBand
        band={band({ pieces: [], marks: [], totalCents: 0 })}
        projectId="proj-1"
      />,
    );

    expect(screen.queryByTestId('room-band-ledger')).not.toBeInTheDocument();
  });

  it('draws the room from its name and pieces — dashed footprints unsigned, drawn once signed', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);

    const drawing = screen.getByTestId('room-band-drawing');
    expect(drawing).toHaveAttribute('viewBox');
    expect(container.querySelector('[data-footprint="sel-sconces"]')).toHaveAttribute(
      'data-footprint-state',
      'dashed',
    );
    expect(container.querySelector('[data-footprint="sel-runner"]')).toHaveAttribute(
      'data-footprint-state',
      'drawn',
    );
  });

  it('rules the floor line of settled type when the band has receipts', () => {
    render(<RoomBand band={band()} projectId="proj-1" />);

    expect(screen.getByTestId('room-band-floorline')).toHaveTextContent(/^Settled here — /);
  });

  it('renders every piece as a tracking row with its stamp and its stamp detail line', () => {
    render(<RoomBand band={band()} projectId="proj-1" />);

    const rows = screen.getAllByTestId('tracking-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('tracking-row-stamp')).toHaveLength(2);
    expect(screen.getAllByTestId('room-band-piece-stamp-detail')[0]).toHaveTextContent(
      'Furnishings authorization No. 7',
    );
  });

  it('lifts a piece on click and unfolds its record with the six stops, the current one marked', () => {
    render(<RoomBand band={band()} projectId="proj-1" />);

    const lift = screen.getByRole('button', { name: /Brass library sconces/ });
    expect(lift).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('threshold-journey')).not.toBeInTheDocument();

    fireEvent.click(lift);

    expect(lift).toHaveAttribute('aria-expanded', 'true');
    const record = screen.getByTestId('room-band-record');
    expect(record).toHaveTextContent('$2,340');

    const journey = within(record).getByTestId('threshold-journey');
    const stops = within(journey).getAllByRole('listitem');
    expect(stops).toHaveLength(6);
    expect(stops.map((stop) => stop.textContent)).toEqual([
      'Agreed',
      'Released to maker',
      'In production',
      'In transit',
      'Received',
      'Installed',
    ]);
    expect(stops[0]).toHaveAttribute('aria-current', 'step');

    fireEvent.click(lift);
    expect(lift).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('room-band-record')).not.toBeInTheDocument();
  });

  it('renders the lintel alone when the room holds no pieces', () => {
    render(<RoomBand band={band({ pieces: [] })} projectId="proj-1" />);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByTestId('room-band-pieces')).not.toBeInTheDocument();
    expect(screen.queryByTestId('room-band-floorline')).not.toBeInTheDocument();
  });

  it('hosts room-scoped gates in its children slot', () => {
    render(
      <RoomBand band={band()} projectId="proj-1">
        <p data-testid="a-gate">a gate</p>
      </RoomBand>,
    );

    expect(screen.getByTestId('a-gate')).toBeInTheDocument();
  });
});
