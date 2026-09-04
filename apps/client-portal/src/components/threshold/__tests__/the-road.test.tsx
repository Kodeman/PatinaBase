import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import type { RoadPieceModel } from '@/lib/threshold/derive';
import type { RoadOrderModel } from '@/lib/threshold/road-orders';

// The road now also carries the pieces she bought herself, and that act owns a
// mutation hook — mock the module it comes from.
jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useStartDirectOrderCheckout: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
}));

import { useStartDirectOrderCheckout } from '@patina/supabase';

import { TheRoad } from '../the-road';

const LAMP: RoadOrderModel = {
  id: 'ord-1',
  name: 'Brass floor lamp',
  quantity: 1,
  amountCents: 42_000,
  currency: 'USD',
  stageIndex: 0,
  payable: true,
};

const CREDENZA: RoadPieceModel = {
  selectionId: 'sel-credenza',
  name: 'Walnut credenza',
  roomId: 'room-library',
  roomName: 'Library & lounge',
  logisticsStatus: 'production' as FFEStageKey,
  stageIndex: 2,
};

const CHAIRS: RoadPieceModel = {
  selectionId: 'sel-chairs',
  name: 'Pair of reading chairs',
  roomId: null,
  roomName: '',
  logisticsStatus: 'shipped' as FFEStageKey,
  stageIndex: 3,
};

describe('TheRoad', () => {
  it('anchors at #road and names what it is', () => {
    const { container } = render(<TheRoad pieces={[CREDENZA, CHAIRS]} />);

    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'road');
    expect(section).toHaveAttribute('data-threshold-unit', 'road');
    expect(screen.getByRole('heading', { level: 2, name: 'The road' })).toBeInTheDocument();
    expect(screen.getByTestId('road-lintel')).toHaveTextContent('What is not home yet');
  });

  it('rules the road in the fixture’s six stops', () => {
    render(<TheRoad pieces={[CREDENZA]} />);

    const stops = screen.getAllByTestId('road-stop');
    expect(stops).toHaveLength(6);
    expect(stops.map((stop) => stop.getAttribute('data-stop'))).toEqual([
      'Agreed',
      'Released to maker',
      'In production',
      'In transit',
      'Received',
      'Installed',
    ]);
  });

  it('draws each piece at its own stop', () => {
    const { container } = render(<TheRoad pieces={[CREDENZA, CHAIRS]} />);

    expect(
      container.querySelector('[data-road-piece="sel-credenza"]'),
    ).toHaveAttribute('data-stop-index', '2');
    expect(container.querySelector('[data-road-piece="sel-chairs"]')).toHaveAttribute(
      'data-stop-index',
      '3',
    );
  });

  it('lifts a piece into its record, and lowers it again', () => {
    render(<TheRoad pieces={[CREDENZA]} />);

    const lift = screen.getByRole('button', { name: /Walnut credenza/ });
    expect(lift).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(lift);

    const record = screen.getByTestId('road-record');
    const journey = within(record).getByTestId('threshold-journey');
    const stops = within(journey).getAllByRole('listitem');
    expect(stops).toHaveLength(6);
    expect(stops[2]).toHaveAttribute('aria-current', 'step');

    fireEvent.click(lift);
    expect(screen.queryByTestId('road-record')).not.toBeInTheDocument();
  });

  it('fans two pieces sharing a stop apart instead of stacking them', () => {
    const alsoInProduction: RoadPieceModel = {
      ...CREDENZA,
      selectionId: 'sel-console',
      name: 'Oak console',
    };
    const { container } = render(
      <TheRoad pieces={[CREDENZA, alsoInProduction]} />,
    );

    const first = container.querySelector('[data-road-piece="sel-credenza"]');
    const second = container.querySelector('[data-road-piece="sel-console"]');
    expect(first).toHaveAttribute('data-stop-index', '2');
    expect(second).toHaveAttribute('data-stop-index', '2');
    expect(first?.getAttribute('x')).not.toEqual(second?.getAttribute('x'));
  });

  it('opts into dimming', () => {
    const { container } = render(<TheRoad pieces={[CREDENZA]} />);
    expect(container.querySelector('section')).toHaveAttribute('data-dimmable');
  });

  it('stays silent about a room a piece has not got', () => {
    render(<TheRoad pieces={[CHAIRS]} />);
    expect(screen.queryByText(/no room named/)).not.toBeInTheDocument();
  });

  it('says so plainly when nothing is on the road', () => {
    render(<TheRoad pieces={[]} />);

    expect(screen.getByText('Nothing on the road.')).toBeInTheDocument();
    expect(screen.queryByTestId('road-pieces')).not.toBeInTheDocument();
  });

  it('carries the pieces she bought herself, and counts them among what is in motion', () => {
    (useStartDirectOrderCheckout as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });

    render(<TheRoad pieces={[CREDENZA]} orders={[LAMP]} />);

    expect(screen.getByTestId('road-lintel')).toHaveTextContent(
      'What is not home yet · two pieces in motion',
    );
    expect(screen.getByTestId('road-orders')).toBeInTheDocument();
    expect(screen.getByText(/Brass floor lamp/)).toBeInTheDocument();
  });

  it('is a road with nothing on it only when neither kind of piece is moving', () => {
    (useStartDirectOrderCheckout as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });

    render(<TheRoad pieces={[]} orders={[LAMP]} />);
    expect(screen.queryByText('Nothing on the road.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('road-pieces')).not.toBeInTheDocument();
    expect(screen.getByTestId('road-orders')).toBeInTheDocument();
  });

  it('never says nothing is on the road above a piece that is not coming', () => {
    (useStartDirectOrderCheckout as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });

    render(
      <TheRoad
        pieces={[]}
        orders={[]}
        closedOrders={[
          {
            id: 'ord-9',
            name: 'Flatweave rug',
            amountCents: 180_000,
            currency: 'USD',
            word: 'Refunded',
            raisedAt: '2026-08-01T10:00:00Z',
            houseless: false,
          },
        ]}
      />,
    );

    // The empty-state sentence and the list under it contradicted each other:
    // silence never has to take anything back.
    expect(screen.queryByText('Nothing on the road.')).not.toBeInTheDocument();
    expect(screen.getByTestId('road-orders-closed')).toHaveTextContent('Flatweave rug');
  });
});
