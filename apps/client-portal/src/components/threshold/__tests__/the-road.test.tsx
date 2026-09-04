import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import type { RoadPieceModel } from '@/lib/threshold/derive';

import { TheRoad } from '../the-road';

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

  it('says so plainly when nothing is on the road', () => {
    render(<TheRoad pieces={[]} />);

    expect(screen.getByText('Nothing on the road.')).toBeInTheDocument();
    expect(screen.queryByTestId('road-pieces')).not.toBeInTheDocument();
  });
});
