import { fireEvent, render, screen } from '@testing-library/react';
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

jest.mock('./project-mood-boards', () => ({
  ProjectMoodBoards: () => <div>Mood boards section</div>,
}));
jest.mock('./roster/kickoff-band', () => ({ KickoffBand: () => <div>Kickoff band</div> }));
jest.mock('./plans/plan-room-band', () => ({ PlanRoomBand: () => <div>Plan room band</div> }));

import { NotStartedBand } from './not-started-band';

const roster = [{ id: 'roster-1' }] as unknown as ProjectRosterRow[];

beforeEach(() => {
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

  it('mounts the individual bands once the call sheet has a name on it', () => {
    render(
      <NotStartedBand
        projectId="project-1"
        routeId="doc-1"
        callSheetEnabled
        rosterRows={roster}
      />,
    );

    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
    expect(screen.getByText('Kickoff band')).toBeVisible();
  });

  it('holds the line while a source has not answered yet', () => {
    mockPlanRoom = { data: undefined };
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
    expect(screen.getByText('Plan room band')).toBeVisible();
  });

  it('opens the mood-board room in place rather than firing at no listener', () => {
    render(
      <NotStartedBand projectId="project-1" routeId="doc-1" callSheetEnabled rosterRows={[]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mood boards' }));

    expect(screen.getByText('Mood boards section')).toBeVisible();
    expect(screen.queryByText('Not started ·')).not.toBeInTheDocument();
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
