/**
 * WP-01.8 — the Desk page mounts exactly one body for the renderer latch:
 * nothing but Today's quiet frames while it is pending, the legacy Desk when
 * it resolves legacy (the renderer-off path), the round-8 studio when it
 * resolves round 8. Never both.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, type Ref } from 'react';
import { JobHead } from '@/components/document/paper/job-head';
import { readPaperOrigin } from '@/lib/document/paper/paper-origin';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
let mockBodyGate: Promise<void> | null = null;
import { markDeskReturn, takeDeskReturn } from '@/lib/document/paper/paper-origin';

let mockHydrated = true;
const mockAnchorId = 'studio-attention-task_due:project:proj-1';
function mockDeskBody(props: { deskRoot: Ref<HTMLElement>; arrivalRoot: boolean }) {
  return props.arrivalRoot ? <main ref={props.deskRoot}><button id={mockAnchorId}>Open Holloway Den</button></main> : null;
}

const mockRenderer = { current: { renderer: 'pending' } as { renderer: string; source?: string } };
const mockRound8Props = jest.fn();

jest.mock('@/hooks/use-paper-renderer', () => ({
  usePaperRenderer: () => mockRenderer.current,
}));
// Keep React.lazy and Suspense real; only the loaded body is stubbed.
jest.mock('@/components/document/studio/round8-desk', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    if (mockBodyGate) throw mockBodyGate;
    mockRound8Props(props);
    return <div data-testid="round8-desk">{mockDeskBody(props as Parameters<typeof mockDeskBody>[0])}</div>;
  },
}));
jest.mock('@/components/document/frame/legacy-desk-body', () => ({
  LegacyDeskBody: (props: Parameters<typeof mockDeskBody>[0]) => <div data-testid="legacy-desk">{mockDeskBody(props)}</div>,
}));
jest.mock('@/components/loading', () => ({
  useLoadingRegister: () => false,
  DeskTodaySkeleton: () => <div data-testid="desk-skeleton" />,
}));

// Everything else the Desk page reads, inert (recent-boards-strip.test.tsx's set).
jest.mock('@patina/supabase', () => ({
  useRecentBoards: () => ({ data: [], isPending: false }),
  useStudioUnbilledTime: () => ({ data: [], isPending: false }),
  useRunningTimer: () => ({ data: undefined, isPending: false }),
  useProfile: () => ({ data: undefined }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio', name: 'Middle West Studio' }] }),
  useOrganizationMembers: () => ({ data: [] }),
  useProjectLeads: () => ({ data: new Map(), isSuccess: true }),
  useNeedStates: () => ({ data: new Map() }),
  useTeammateActed: () => ({ data: new Map(), isSuccess: true }),
  useBoardsReactionRollup: () => ({ data: undefined, isPending: false }),
}));
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: {
      folders: [],
      chips: [],
      live: [{ engagement_id: 'eng-1', project_id: 'proj-1', title: 'Holloway Den', active_section: 'project' }],
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Leah' } }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => mockHydrated }));
jest.mock('@/hooks/use-viewer-studio', () => ({ useViewerStudio: () => ({ isSettled: true }) }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false, isLoading: false }) }));
jest.mock('@/hooks/use-teaching-note', () => ({
  useReturnNote: () => ({ note: null, bind: null, sinceLine: null, decided: true }),
}));
jest.mock('@/components/document/command-bar', () => ({
  openCommandBar: jest.fn(),
  captureLeadPending: { value: false },
  openProjectPending: { value: false },
}));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: { deskRendered: jest.fn() } }));
jest.mock('@/components/document/margin-note', () => ({ MarginNote: () => null }));
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  START_DESK_WALKTHROUGH_EVENT: 'document:start-desk-walkthrough',
  clearDeskWalkthroughLater: jest.fn(),
  useDeskWalkthroughOffer: () => false,
  useSuppressDeskFirstTouch: () => false,
}));
jest.mock('@/components/document/arrival/arrival-mount', () => ({ useArrivalWaiting: () => false }));
jest.mock('@/lib/help-system/use-document-surface', () => ({ useDocumentSurface: jest.fn() }));

import DeskPage from '../../../../app/(document)/desk/page';
import { resetDeskVisit } from '@/components/document/desk-arbiter';

beforeEach(() => {
  mockHydrated = true;
  mockBodyGate = null;
  window.scrollY = 0;
  window.sessionStorage.clear();
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
  resetDeskVisit();
  mockRound8Props.mockClear();
});

describe.each(['round8', 'legacy'])('Desk explicit return (%s)', (renderer) => {
  it('restores the opener once the root latches without popstate and consumes the intent', async () => {
    mockRenderer.current = { renderer };
    mockHydrated = false;
    window.sessionStorage.setItem('patina.desk.place', JSON.stringify({ y: 0, anchor: 'old-row' }));
    markDeskReturn({ docId: 'proj-1', focusId: mockAnchorId, anchorId: 'old-row' });
    const view = render(<DeskPage />);
    await screen.findByTestId(renderer === 'round8' ? 'round8-desk' : 'legacy-desk');
    expect(screen.queryByRole('button', { name: 'Open Holloway Den' })).not.toBeInTheDocument();
    mockHydrated = true;
    view.rerender(<DeskPage />);
    expect(screen.getByRole('button', { name: 'Open Holloway Den' })).toHaveFocus();
    expect(takeDeskReturn()).toBeNull();
    view.unmount();
    render(<DeskPage />);
    expect(await screen.findByRole('button', { name: 'Open Holloway Den' })).not.toHaveFocus();
  });

  it('does not restore a held place on an unrelated visit without a return intent', async () => {
    mockRenderer.current = { renderer };
    window.sessionStorage.setItem('patina.desk.place', JSON.stringify({ y: 0, anchor: mockAnchorId }));
    render(<DeskPage />);
    expect(await screen.findByRole('button', { name: 'Open Holloway Den' })).not.toHaveFocus();
    expect(takeDeskReturn()).toBeNull();
  });

  it('scrolls to the origin anchor when no held Desk offset exists', async () => {
    mockRenderer.current = { renderer };
    mockHydrated = false;
    markDeskReturn({ docId: 'proj-1', focusId: null, anchorId: mockAnchorId });
    const view = render(<DeskPage />);
    await screen.findByTestId(renderer === 'round8' ? 'round8-desk' : 'legacy-desk');
    mockHydrated = true;
    view.rerender(<DeskPage />);
    const anchor = screen.getByRole('button', { name: 'Open Holloway Den' });
    expect(anchor).toHaveFocus();
    expect(anchor.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(takeDeskReturn()).toBeNull();
  });
});

describe.each(['round8', 'legacy'])('Desk mount-owned return (%s)', (renderer) => {
  beforeEach(() => { mockRenderer.current = { renderer }; });
  const mark = () => markDeskReturn({ docId: 'proj-1', focusId: mockAnchorId, anchorId: null });
  const hold = (anchor = mockAnchorId, y = 900) => window.sessionStorage.setItem('patina.desk.place', JSON.stringify({ y, anchor }));

  it('discards an abandoned loading visit before a later unrelated Desk mount', async () => {
    hold(); mark(); mockHydrated = false;
    const view = render(<DeskPage />);
    await screen.findByTestId(renderer === 'round8' ? 'round8-desk' : 'legacy-desk');
    view.unmount();
    mockHydrated = true;
    render(<DeskPage />);
    expect(await screen.findByRole('button', { name: 'Open Holloway Den' })).not.toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(takeDeskReturn()).toBeNull();
  });

  it('treats a deep-link Studio return as a fresh arrival, not an old Desk offset', async () => {
    hold();
    const job = render(<JobHead returnTo={{ href: '/desk', label: 'Studio' }} origin={readPaperOrigin('deep-job')} jobName="Deep job" />);
    fireEvent.click(screen.getByRole('link', { name: 'Studio' }));
    job.unmount();
    render(<DeskPage />);
    expect(await screen.findByRole('button', { name: 'Open Holloway Den' })).not.toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(['focusin', 'keydown', 'pointerdown', 'wheel', 'touchstart'])('yields to reader %s before the arrival root latches', async (event) => {
    hold(); mark(); mockHydrated = false;
    const content = <><button>Reader control</button><DeskPage /></>;
    const view = render(content);
    await screen.findByTestId(renderer === 'round8' ? 'round8-desk' : 'legacy-desk');
    const reader = screen.getByRole('button', { name: 'Reader control' });
    if (event === 'focusin') act(() => reader.focus());
    else fireEvent(window, new Event(event));
    mockHydrated = true;
    view.rerender(<><button>Reader control</button><DeskPage /></>);
    expect(screen.getByRole('button', { name: 'Open Holloway Den' })).not.toHaveFocus();
    if (event === 'focusin') expect(reader).toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls A into view instead of borrowing B’s held offset', async () => {
    hold('job-B-control', 0); mark();
    render(<DeskPage />);
    const anchor = await screen.findByRole('button', { name: 'Open Holloway Den' });
    expect(anchor).toHaveFocus();
    expect(anchor.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('does not overwrite the held offset during StrictMode cleanup before the root latches', async () => {
    hold(); mark(); mockHydrated = false;
    const view = render(<StrictMode><DeskPage /></StrictMode>);
    await screen.findByTestId(renderer === 'round8' ? 'round8-desk' : 'legacy-desk');
    expect(JSON.parse(window.sessionStorage.getItem('patina.desk.place')!)).toEqual({ y: 900, anchor: mockAnchorId });
    view.unmount();
    expect(JSON.parse(window.sessionStorage.getItem('patina.desk.place')!)).toEqual({ y: 900, anchor: mockAnchorId });
  });

  it('ignores a Studio intent older than fifteen seconds before the first Desk mount', async () => {
    hold(); mark();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 15001);
    render(<DeskPage />);
    expect(await screen.findByRole('button', { name: 'Open Holloway Den' })).not.toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
    clock.mockRestore();
  });

  it('keeps plain Back restoration and gives an explicit intent precedence over it', async () => {
    hold('popstate-row', 0);
    window.history.replaceState(null, '', '/desk');
    fireEvent.popState(window);
    mark();
    const first = render(<DeskPage />);
    const anchor = await screen.findByRole('button', { name: 'Open Holloway Den' });
    expect(anchor).toHaveFocus();
    expect(anchor.scrollIntoView).toHaveBeenCalled();
    first.unmount();
    hold(mockAnchorId, 640);
    fireEvent.popState(window);
    render(<DeskPage />);
    expect(await screen.findByRole('button', { name: 'Open Holloway Den' })).toHaveFocus();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'auto' });
  });

  it('drops a pending plain Back place when the reader focuses before readiness', async () => {
    hold();
    window.history.replaceState(null, '', '/desk');
    fireEvent.popState(window);
    mockHydrated = false;
    const view = render(<><button>Reader control</button><DeskPage /></>);
    await screen.findByTestId(renderer === 'round8' ? 'round8-desk' : 'legacy-desk');
    const reader = screen.getByRole('button', { name: 'Reader control' });
    act(() => reader.focus());
    mockHydrated = true;
    view.rerender(<><button>Reader control</button><DeskPage /></>);
    expect(reader).toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

it('starts the return deadline only after a late lazy Desk body commits', async () => {
  jest.useFakeTimers();
  mockRenderer.current = { renderer: 'round8' };
  let resolve!: () => void;
  mockBodyGate = new Promise<void>((done) => { resolve = done; });
  markDeskReturn({ docId: 'proj-1', focusId: mockAnchorId, anchorId: null });
  const view = render(<DeskPage />);
  expect(screen.getByTestId('desk-skeleton')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(3100); });
  mockBodyGate = null;
  await act(async () => { resolve(); });
  expect(screen.getByRole('button', { name: 'Open Holloway Den' })).toHaveFocus();
  view.unmount();
  jest.useRealTimers();
});

describe('desk/page.tsx — one body per renderer decision', () => {
  it('mounts neither body while the latch is pending', () => {
    mockRenderer.current = { renderer: 'pending' };
    render(<DeskPage />);
    expect(screen.getByTestId('desk-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-desk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('round8-desk')).not.toBeInTheDocument();
  });

  it('mounts the legacy Desk, and only it, when the renderer is off (legacy)', () => {
    mockRenderer.current = { renderer: 'legacy', source: 'override' };
    render(<DeskPage />);
    expect(screen.getByTestId('legacy-desk')).toBeInTheDocument();
    expect(screen.queryByTestId('round8-desk')).not.toBeInTheDocument();
    expect(mockRound8Props).not.toHaveBeenCalled();
  });

  it('mounts the round-8 studio, and only it, on the same reads when the renderer is round 8', async () => {
    mockRenderer.current = { renderer: 'round8', source: 'override' };
    render(<DeskPage />);
    expect(await screen.findByTestId('round8-desk')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-desk')).not.toBeInTheDocument();
    const props = mockRound8Props.mock.calls.at(-1)![0];
    expect(props.studioName).toBe('Middle West Studio');
    expect(props.live).toEqual([expect.objectContaining({ engagement_id: 'eng-1' })]);
    expect(props.roster.groups.flatMap((group: { lines: unknown[] }) => group.lines)).toHaveLength(1);
    expect(typeof props.holdPlace).toBe('function');
  });
});
