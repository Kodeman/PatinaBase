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

import { ProjectProgress, TheRoad, type ProjectProgressProps } from '../the-road';

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
    expect(screen.getByRole('heading', { level: 2, name: 'Orders in progress' })).toBeInTheDocument();
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

    expect(screen.getByText('No orders in progress.')).toBeInTheDocument();
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
    expect(screen.queryByText('No orders in progress.')).not.toBeInTheDocument();
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
    expect(screen.queryByText('No orders in progress.')).not.toBeInTheDocument();
    expect(screen.getByTestId('road-orders-closed')).toHaveTextContent('Flatweave rug');
  });
});

/* ── CPUX-06 · A17 — Project progress, one source at a time ──────────────── */

const SOFA_ASK = { anchor: 'approval-d1', label: 'Living room sofa, edition 2' };

function progress(overrides: Partial<ProjectProgressProps> = {}): ProjectProgressProps {
  return {
    now: 'Procurement',
    nextMilestone: { title: 'Living room installation', targetDate: '2027-01-22' },
    projectedCompletionDate: null,
    waiting: { status: 'ready', value: SOFA_ASK },
    update: { status: 'ready', value: { sentAt: '2026-10-16T15:00:00Z' } },
    pastUpdatesAnchor: 'previously',
    ...overrides,
  };
}

describe('ProjectProgress', () => {
  it('reads Now, Next, the target, the current update and the open ask off their sources', () => {
    render(<ProjectProgress {...progress()} />);
    expect(screen.getByRole('heading', { name: 'Project progress' })).toBeInTheDocument();
    expect(screen.getByTestId('progress-now')).toHaveTextContent('NowProcurement');
    expect(screen.getByTestId('progress-next')).toHaveTextContent('NextLiving room installation');
    expect(screen.getByTestId('progress-target')).toHaveTextContent(
      'Target date22 January 2027A target, not a confirmed date.',
    );
    expect(screen.getByTestId('progress-update')).toHaveTextContent('Sent 16 October 2026');
    expect(screen.getByRole('link', { name: 'Read the update' })).toHaveAttribute('href', '#note');
    const waiting = screen.getByTestId('progress-waiting');
    expect(waiting).toHaveTextContent('Waiting on youYour response to Living room sofa, edition 2.');
    expect(within(waiting).getByRole('link', { name: SOFA_ASK.label })).toHaveAttribute(
      'href',
      '#approval-d1',
    );
    expect(screen.getByTestId('project-progress').textContent).not.toMatch(/%|complete/i);
  });

  it('says no stage is shown when the read succeeded with none', () => {
    render(<ProjectProgress {...progress({ now: null })} />);
    expect(screen.getByTestId('progress-now')).toHaveTextContent('No project stage is shown here yet.');
  });

  it('with no milestone, Next names the open ask — and never infers a stage', () => {
    render(<ProjectProgress {...progress({ nextMilestone: null })} />);
    expect(screen.getByTestId('progress-next')).toHaveTextContent(
      'Your response to Living room sofa, edition 2.',
    );
    expect(screen.queryByTestId('progress-target')).toBeNull();
  });

  it('with no milestone and nothing open, Next says the designer will share it', () => {
    render(
      <ProjectProgress
        {...progress({ nextMilestone: null, waiting: { status: 'ready', value: null } })}
      />,
    );
    expect(screen.getByTestId('progress-next')).toHaveTextContent(
      'Your designer will share the next step here.',
    );
    expect(screen.getByTestId('progress-waiting')).toHaveTextContent(
      'Nothing is waiting on you right now.',
    );
  });

  it('a milestone with no date is not confirmed; a projected completion is a labelled target', () => {
    const { rerender } = render(
      <ProjectProgress {...progress({ nextMilestone: { title: 'Living room installation' } })} />,
    );
    expect(screen.getByTestId('progress-target')).toHaveTextContent('Target dateDate not confirmed');

    rerender(
      <ProjectProgress
        {...progress({ nextMilestone: null, projectedCompletionDate: '2027-03-01' })}
      />,
    );
    expect(screen.getByTestId('progress-target')).toHaveTextContent(
      'Target completion1 March 2027A target, not a confirmed date.',
    );
  });

  it('no standing note is not "no updates ever": past updates stay one link away', () => {
    render(<ProjectProgress {...progress({ update: { status: 'ready', value: null } })} />);
    expect(screen.getByTestId('progress-update')).toHaveTextContent(
      'No current designer update is shown here.',
    );
    expect(screen.getByRole('link', { name: 'Past updates' })).toHaveAttribute('href', '#previously');
  });

  it('a failed note read says so with a usable Retry, and keeps the rest of the summary', () => {
    const onRetry = jest.fn();
    render(<ProjectProgress {...progress({ update: { status: 'error', onRetry } })} />);
    expect(screen.getByTestId('progress-update-error')).toHaveTextContent(
      'We couldn’t load the current designer update.',
    );
    expect(screen.queryByText('No current designer update is shown here.')).toBeNull();
    expect(screen.getByTestId('progress-now')).toHaveTextContent('Procurement');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says nothing is waiting only once the ask reads have answered', () => {
    const { rerender } = render(
      <ProjectProgress {...progress({ waiting: { status: 'loading' } })} />,
    );
    expect(screen.queryByTestId('progress-waiting')).toBeNull();
    expect(screen.queryByText('Nothing is waiting on you right now.')).toBeNull();

    const onRetry = jest.fn();
    rerender(<ProjectProgress {...progress({ waiting: { status: 'error', onRetry } })} />);
    expect(screen.getByTestId('progress-waiting-error')).toHaveTextContent(
      'We couldn’t check what is waiting on you.',
    );
    expect(screen.queryByText('Nothing is waiting on you right now.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('TheRoad — the Progress destination', () => {
  it('stands at #road with the summary and no orders drawn until they have something to say', () => {
    const { container } = render(
      <TheRoad progress={progress()} showOrders={false} pieces={[]} />,
    );
    const road = container.querySelector('#road')!;
    expect(road).toHaveAccessibleName('Project progress');
    expect(screen.getByTestId('project-progress')).toBeInTheDocument();
    expect(screen.queryByTestId('road-drawing')).toBeNull();
    expect(screen.queryByText('No orders in progress.')).toBeNull();
  });

  it('keeps the orders under the summary when they draw', () => {
    render(<TheRoad progress={progress()} pieces={[CREDENZA]} />);
    expect(screen.getByRole('heading', { name: 'Orders in progress' })).toBeInTheDocument();
    expect(screen.getByTestId('road-drawing')).toBeInTheDocument();
  });
});
