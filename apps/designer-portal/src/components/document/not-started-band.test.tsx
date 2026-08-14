import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ProjectRosterRow } from '@patina/supabase';

let mockOwnedBoards: Record<string, unknown>;
let mockFrozenBoards: Record<string, unknown>;
let mockPlanRoom: Record<string, unknown>;
let mockFfeItems: Record<string, unknown>;

jest.mock('@patina/supabase', () => ({
  useProjectOwnedBoards: () => mockOwnedBoards,
  useProjectBoards: () => mockFrozenBoards,
  usePlanRoom: () => mockPlanRoom,
  useProjectFFEItems: () => mockFfeItems,
}));

// The double carries the one behaviour this band has to keep alive: the room
// is the only listener for the Add-to-project sheet's board intent.
jest.mock('./project-mood-boards', () => {
  const React = require('react') as typeof import('react');
  return {
    ProjectMoodBoards: () => {
      const [creating, setCreating] = React.useState(false);
      React.useEffect(() => {
        const open = () => setCreating(true);
        window.addEventListener('document:new-project-board', open);
        return () => window.removeEventListener('document:new-project-board', open);
      }, []);
      return React.createElement(
        'section',
        null,
        React.createElement('h2', null, 'Mood boards'),
        React.createElement('div', null, 'Mood boards section'),
        creating ? React.createElement('div', null, 'Board creator') : null,
      );
    },
  };
});
jest.mock('./roster/kickoff-band', () => ({
  KickoffBand: () => <div>Kickoff band</div>,
  kickoffNoteKey: (projectId: string) => `kickoff:${projectId}`,
}));
jest.mock('./plans/plan-room-band', () => ({ PlanRoomBand: () => <div>Plan room band</div> }));

import { NotStartedBand } from './not-started-band';

const rosterOf = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `roster-${i}` })) as unknown as ProjectRosterRow[];

beforeEach(() => {
  window.localStorage.clear();
  mockOwnedBoards = { data: [] };
  mockFrozenBoards = { data: [] };
  mockPlanRoom = { data: { sheets: [], prints: [], issues: [] } };
  mockFfeItems = { data: [] };
});

describe('NotStartedBand', () => {
  it('collapses all four empty rooms into one line with their doorways', () => {
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    expect(screen.getByText('Not started ·')).toBeVisible();
    expect(screen.getByRole('button', { name: 'mood boards' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'plan room' })).toHaveAttribute(
      'href',
      '/doc/doc-1/plans',
    );
    expect(screen.getByRole('link', { name: 'spec book' })).toHaveAttribute(
      'href',
      '/doc/project-1/spec-book',
    );
    expect(screen.getByRole('button', { name: 'call sheet' })).toBeVisible();
    expect(screen.getByText('— Open one →')).toBeVisible();
    expect(screen.queryByText('Mood boards section')).not.toBeInTheDocument();
    expect(screen.queryByText('Kickoff band')).not.toBeInTheDocument();
    expect(screen.queryByText('Plan room band')).not.toBeInTheDocument();
  });

  it('omits the call sheet from the line when the flag is off', () => {
    render(
      <NotStartedBand
        projectId="project-1"
        routeId="doc-1"
        callSheetEnabled={false}
        rosterRows={[]}
      />,
    );

    expect(screen.getByText('Not started ·')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'call sheet' })).not.toBeInTheDocument();
  });

  it.each([
    ['mood boards', () => (mockOwnedBoards = { data: [{ id: 'b1', status: 'active' }] })],
    ['plan room', () => (mockPlanRoom = { data: { sheets: [{ id: 's1' }] } })],
    ['spec book', () => (mockFfeItems = { data: [{ id: 'i1' }] })],
  ])('mounts the individual bands the moment %s holds something', (_name, arrange) => {
    arrange();
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
    expect(screen.getByText('Mood boards section')).toBeVisible();
    expect(screen.getByText('Kickoff band')).toBeVisible();
    expect(screen.getByText('Plan room band')).toBeVisible();
  });

  it('mounts the individual bands while the kickoff band still has something to ask', () => {
    render(
      <NotStartedBand
        projectId="project-1"
        routeId="doc-1"
        callSheetEnabled
        rosterRows={rosterOf(1)}
      />,
    );

    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
    expect(screen.getByText('Kickoff band')).toBeVisible();
  });

  it('collapses a staffed call sheet the kickoff band has already retired', () => {
    render(
      <NotStartedBand
        projectId="project-1"
        routeId="doc-1"
        callSheetEnabled
        rosterRows={rosterOf(4)}
      />,
    );

    expect(screen.getByText('Not started ·')).toBeVisible();
    // A sheet with four names on it is not one of the rooms this line speaks for.
    expect(screen.queryByRole('button', { name: 'call sheet' })).not.toBeInTheDocument();
  });

  it('collapses once the kickoff band has been dismissed for good', () => {
    window.localStorage.setItem('patina:margin-note:kickoff:project-1', '1');

    render(
      <NotStartedBand
        projectId="project-1"
        routeId="doc-1"
        callSheetEnabled
        rosterRows={rosterOf(1)}
      />,
    );

    expect(screen.getByText('Not started ·')).toBeVisible();
  });

  it('holds a quiet placeholder while a source has not answered yet', () => {
    mockPlanRoom = { data: undefined };
    const { container } = render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    expect(container.querySelector('[data-not-started-band-pending]')).not.toBeNull();
    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
    expect(screen.queryByText('Plan room band')).not.toBeInTheDocument();
    expect(screen.queryByText('Mood boards section')).not.toBeInTheDocument();
  });

  it('falls through to the bands when a source fails rather than holding forever', () => {
    mockPlanRoom = { data: undefined, isError: true };
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    expect(screen.getByText('Not started ·')).toBeVisible();
  });

  it('opens the mood-board room in place rather than firing at no listener', () => {
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mood boards' }));

    expect(screen.getByText('Mood boards section')).toBeVisible();
    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
  });

  it('moves focus to the revealed room instead of dropping it on the body', () => {
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mood boards' }));

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mood boards' }));
  });

  it('opens the board creator when the collapsed line catches the sheet’s board intent', () => {
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('document:new-project-board'));
    });

    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
    expect(screen.getByText('Board creator')).toBeVisible();
  });

  it('holds a board intent fired before its reads answered until the room is listening', () => {
    mockPlanRoom = { data: undefined };
    const { rerender } = render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('document:new-project-board'));
    });
    expect(screen.queryByText('Board creator')).not.toBeInTheDocument();

    mockPlanRoom = { data: { sheets: [], prints: [], issues: [] } };
    rerender(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    expect(screen.getByText('Board creator')).toBeVisible();
  });

  it('reaches the call sheet through the page-level open event', () => {
    const listener = jest.fn();
    window.addEventListener('document:open-call-sheet', listener);
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'call sheet' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: 'picker' });
    window.removeEventListener('document:open-call-sheet', listener);
  });
});
