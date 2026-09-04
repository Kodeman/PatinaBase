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
  const agreedCents = over.agreedCents ?? 2490000;
  return {
    roomId: 'room-library',
    name: 'Library & lounge',
    anchor: 'room-room-library',
    totalCents: agreedCents,
    targetCents: 2380000,
    agreedCents,
    varianceLine: 'about eleven hundred past its target',
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
    expect(lintel).toHaveTextContent(
      '$24,900 agreed against $23,800 planned — about eleven hundred past its target',
    );
    expect(lintel).toHaveTextContent('two pieces');
    expect(lintel).toHaveTextContent('one door waits on your name');
  });

  it('states the agreed figure alone when the room carries no target', () => {
    render(
      <RoomBand
        band={band({ targetCents: null, varianceLine: null })}
        projectId="proj-1"
      />,
    );

    const ledger = screen.getByTestId('room-band-ledger');
    expect(ledger).toHaveTextContent('$24,900 agreed');
    expect(ledger).not.toHaveTextContent('planned');
  });

  it('suppresses the ledger sentence when the band carries no figures', () => {
    render(
      <RoomBand
        band={band({
          pieces: [],
          marks: [],
          agreedCents: 0,
          targetCents: null,
          varianceLine: null,
        })}
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

  it('rules a floor, a wall and the door opening, on a drawing 140 units deep', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);

    const drawing = screen.getByTestId('room-band-drawing');
    expect(drawing).toHaveAttribute('viewBox', '0 0 1000 140');
    expect(drawing.className.baseVal ?? drawing.getAttribute('class')).toContain('max-h-[140px]');
    expect(screen.getByTestId('room-band-floor')).toBeInTheDocument();
    // The opening is struck on the left-hand side — the side the plan key
    // marks its doors on — and carried out as a dashed threshold. Both wall
    // faces STOP at the head (y = 104 - 52), and the head closes between them,
    // or the wall would be a stub standing over a gap.
    expect(screen.getByTestId('room-band-wall')).toHaveAttribute('y2', '52');
    expect(screen.getByTestId('room-band-wall-outer')).toHaveAttribute('y2', '52');
    const head = screen.getByTestId('room-band-door-head');
    // The mock's own wall thickness: faces at x=28 and x=42.
    expect(head).toHaveAttribute('x1', '28');
    expect(head).toHaveAttribute('x2', '42');
    expect(head).toHaveAttribute('y1', '52');
    expect(screen.getByTestId('room-band-threshold')).toHaveAttribute('stroke-dasharray', '2 4');
    // Line work and no closed outline: the old rectangle read as an empty box.
    expect(container.querySelectorAll('svg line')).toHaveLength(5);
    expect(container.querySelectorAll('svg rect')).toHaveLength(2);
  });

  it('spaces the footprints evenly and sizes them by quantity', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);

    const feet = Array.from(container.querySelectorAll('[data-footprint]')).map((foot) => ({
      x: Number(foot.getAttribute('x')),
      w: Number(foot.getAttribute('width')),
    }));
    expect(feet).toHaveLength(2);
    // Two of the sconces, one runner: the pair takes more floor than the one.
    expect(feet[0].w).toBeGreaterThan(feet[1].w);
    // Evenly spaced: one slot — (944 - 42) / 2 — between the two centres.
    const centres = feet.map((foot) => foot.x + foot.w / 2);
    expect(Math.abs(centres[1] - centres[0] - 451)).toBeLessThanOrEqual(1);
  });

  it('letters each footprint with the piece’s own name, in 11px mono', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);

    const labels = Array.from(container.querySelectorAll('[data-footprint-label]'));
    expect(labels.map((label) => label.textContent)).toEqual([
      'Brass library sconces',
      'Kilim runner',
    ]);
    for (const label of labels) {
      expect(label).toHaveAttribute('font-size', '11');
      expect(label.getAttribute('class')).toContain('font-mono');
    }
  });

  it('draws an 80-unit outline with the room’s name inside when nothing stands here', () => {
    const { container } = render(
      <RoomBand band={band({ pieces: [], agreedCents: 0, marks: [] })} projectId="proj-1" />,
    );

    const drawing = screen.getByTestId('room-band-drawing');
    expect(drawing).toHaveAttribute('viewBox', '0 0 1000 80');
    expect(screen.getByTestId('room-band-drawing-name')).toHaveTextContent('Library & lounge');
    expect(container.querySelectorAll('[data-footprint]')).toHaveLength(0);
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

    const lift = screen.getByRole('button', {
      name: 'Brass library sconces — open its record',
    });
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

  it('keeps the lift control free of flow content, with a name of its own', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);

    for (const button of Array.from(container.querySelectorAll('button'))) {
      expect(button.querySelector('div, p, ul, ol, dl, section')).toBeNull();
    }
    expect(
      screen.getByRole('button', { name: 'Kilim runner — open its record' }),
    ).toBeInTheDocument();
  });

  it('opts into dimming', () => {
    const { container } = render(<RoomBand band={band()} projectId="proj-1" />);
    expect(container.querySelector('section')).toHaveAttribute('data-dimmable');
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
