import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StudioDrawer } from './studio-drawer';
import {
  hoursMemberScopePending,
  openHoursForMember,
} from '@/lib/document/open-hours-scope';

let mockNativeHours = false;

const mockPush = jest.fn();
const mockPrefetch = jest.fn();
const mockRouter = { push: mockPush, prefetch: mockPrefetch };
const mockOpenTimer = jest.fn();
let mockUnseenFeedback: Array<{ id: string }> = [];
let mockPathname = '/desk';
let mockInHandToday = 0;
// W2 (F-3 route 1): the drawer takes the presence channel's key off the held
// document and calls `useDocumentPresence` itself — there is no `others` prop
// any more, so the hook is what these three cases drive.
let mockPresenceOthers: string[] = [];

// Return teaching's in-place and act notes: jest cannot load @patina/help-system
// behind the real hook, and nothing here is taught.
jest.mock('@/hooks/use-teaching-note', () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
}));

// The drawer's clock is the timer's doorway from W1 (`spine-timer.tsx` is
// deleted), so `StudioDrawer` reads `useMobileShell`. In the app it is always
// inside `MobileShellProvider` (app/(document)/layout.tsx); here the hook is
// mocked so the drawer can be rendered on its own, as every case below does.
jest.mock('./mobile/mobile-shell', () => ({
  useMobileShell: () => ({ openTimer: mockOpenTimer }),
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: mockUnseenFeedback }),
  useClients: () => ({ data: [] }),
  useCreateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useUpdateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useTimeEntryLedger: () => ({ data: [] }),
  useProjectPricingStudio: () => ({ isSuccess: true, data: 'studio-1' }),
  useStampProjectPricingStudio: () => ({ mutateAsync: jest.fn() }),
  useStudioHoursRollup: () => ({ data: [] }),
  filterProjectUnbilledEntries: () => [],
  isInvoiceEligibleTimeEntry: () => false,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: [], refetch: jest.fn() }),
}));

jest.mock('@/hooks/use-viewer-studio', () => ({
  useViewerStudio: () => ({
    organizations: [],
    studio: { id: 'studio-1', name: 'Studio' },
    candidates: [],
    selectStudio: jest.fn(),
    isOwnerOrAdmin: true,
    isSettled: true,
  }),
  useInternalTimeStudio: () => ({ studio: null }),
}));

jest.mock('./time-capture', () => ({
  ...jest.requireActual('./time-capture'),
  useBillableIntent: () => ({ isSettled: false }),
  RateRoleChip: () => null,
  BillablePill: () => null,
}));

jest.mock('./commercial/project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => null,
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    inHandToday: mockInHandToday,
    heldEngagementId: 'engagement-1',
  }),
}));

jest.mock('@/hooks/use-document-presence', () => ({
  useDocumentPresence: () => mockPresenceOthers,
}));

jest.mock('@/lib/help-system/use-sheet-surface-key', () => ({
  useSheetSurfaceKey: jest.fn(),
}));

jest.mock('@/lib/document/room-origin', () => ({
  rememberRoomOrigin: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionInvoked: jest.fn(),
    time: { scopeViewed: jest.fn() },
    wayfinding: {
      roomEntered: jest.fn(),
      doorOpened: jest.fn(),
    },
  },
}));

// F11 — DocSheet is deliberately NOT mocked here: the focus-restore fix lives
// in doc-sheet.tsx and studio-drawer.tsx only wires it up, so the real restore
// must run for the test below.

jest.mock('./overlays/post-sheet', () => ({
  PostSheet: () => null,
  openPost: jest.fn(),
}));

jest.mock('./orders-ledger', () => ({
  OrdersLedger: () => <div>Orders ledger</div>,
}));

jest.mock('./accounts/accounts-book', () => ({
  AccountsBook: () => <div>Accounts book</div>,
}));

jest.mock('./hours-ledger', () => ({
  HoursLedger: (props: Record<string, unknown>) => {
    if (!mockNativeHours) return <div>Hours ledger</div>;
    const { HoursLedger } = jest.requireActual('./hours-ledger');
    return <HoursLedger {...props} />;
  },
}));

jest.mock('./account/account-nameplate', () => ({
  AccountNameplate: () => <div>Designer account</div>,
}));

describe('StudioDrawer', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPrefetch.mockClear();
    mockOpenTimer.mockClear();
    mockPathname = '/desk';
    mockInHandToday = 0;
    mockPresenceOthers = [];
    mockUnseenFeedback = [];
    window.localStorage.clear();
  });

  it('SQ-1013 — prefetches every room door on mount, so a door opens without a server round trip', () => {
    render(<StudioDrawer />);

    expect(mockPrefetch.mock.calls.map(([href]) => href).sort()).toEqual([
      '/library',
      '/people',
      '/rooms',
    ]);
  });

  it('keeps Rooms direct and gathers sheet ledgers behind one doorway', () => {
    render(<StudioDrawer />);

    const drawer = screen.getByRole('navigation', { name: 'Studio drawer' });
    expect(drawer).toHaveClass('min-[1180px]:grid');
    expect(screen.getByRole('button', { name: 'Resource library' })).toHaveClass(
      'min-h-11',
    );
    expect(screen.getByRole('button', { name: 'Studio contacts' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Measured rooms' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Purchase orders' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    const menu = screen.getByRole('group', { name: 'Ledgers' });
    expect(within(menu).getByRole('button', { name: 'Purchase orders' })).toHaveFocus();
    expect(within(menu).getByRole('button', { name: 'Studio accounts' })).toHaveClass(
      'min-h-11',
    );
    expect(
      within(menu).getByRole('button', { name: 'Timesheets' }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('button', { name: 'Feedback' }),
    ).not.toBeInTheDocument();
    // Feedback left the books hub entirely — the Tester widget owns it now.
    expect(
      within(menu).queryByRole('button', { name: 'Share feedback' }),
    ).not.toBeInTheDocument();
  });

  it("US-28 — More carries Studio contacts' three rooms, each to its own address", () => {
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    const rooms = screen.getByRole('group', { name: 'From Studio contacts' });
    expect(
      within(rooms)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Client relations', 'Studio marketing', 'Keep in touch']);
    fireEvent.click(within(rooms).getByRole('button', { name: 'Keep in touch' }));
    expect(mockPush).toHaveBeenCalledWith('/people?view=nurture');
    expect(
      screen.queryByRole('group', { name: 'From Studio contacts' }),
    ).not.toBeInTheDocument();
  });

  it('SQ-856 — the crumb holds one line on a track sized to it, and the doors wrap instead', () => {
    mockPathname = '/rooms';
    render(<StudioDrawer />);

    const drawer = screen.getByRole('navigation', { name: 'Studio drawer' });
    // Neither side zone can be squeezed below its content: at 1280–1440 the
    // left track used to get ~54–79px and the crumb 0px.
    expect(drawer).toHaveClass(
      'grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)]',
    );
    // It grows upward from the edge when the doors wrap, never past it.
    expect(drawer).toHaveClass('min-h-[60px]');
    expect(drawer).not.toHaveClass('h-[60px]');

    const crumb = drawer.querySelector('[data-drawer-crumb]')!;
    expect(crumb).toHaveTextContent('Measured rooms');
    expect(crumb).toHaveClass('whitespace-nowrap');
    // A 0px span that may break anywhere stood one letter per line.
    expect(crumb).not.toHaveClass('break-words');
    expect(crumb).not.toHaveClass('min-w-0');
    expect(crumb).not.toHaveClass('truncate');

    expect(drawer.querySelector('[data-drawer-doors]')).toHaveClass('flex-wrap');
  });

  it('SQ-856 — publishes its own height for the paper inset, and takes it back off', () => {
    const rect = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 111, width: 1440 } as DOMRect);
    const { unmount } = render(<StudioDrawer />);
    expect(
      document.documentElement.style.getPropertyValue('--doc-drawer-height'),
    ).toBe('111px');
    unmount();
    expect(
      document.documentElement.style.getPropertyValue('--doc-drawer-height'),
    ).toBe('');
    rect.mockRestore();
  });

  it('SQ-856 — prints the TESTER mark its place in the dock row', () => {
    render(<StudioDrawer />);
    const drawer = screen.getByRole('navigation', { name: 'Studio drawer' });
    expect(drawer.querySelector('[data-tester-slot="drawer"]')).toHaveClass(
      'contents',
    );
  });

  it('F11 — closing a books-menu sheet returns focus to Ledgers once the opening row has unmounted', async () => {
    render(<StudioDrawer />);

    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    const ordersRow = screen.getByRole('button', { name: 'Purchase orders' });
    ordersRow.focus();
    fireEvent.click(ordersRow);

    // Opening the sheet closes the books menu, so the row DocSheet captured as
    // the pre-open activeElement is gone by the time it restores.
    expect(
      screen.queryByRole('button', { name: 'Purchase orders' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Purchase orders' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ledgers' })).toHaveFocus(),
    );
  });

  it('puts the most recently opened book first on the next visit', async () => {
    const first = render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Studio accounts' }));

    expect(
      screen.getByRole('dialog', { name: 'Studio accounts' }),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem('patina.document.recentStudioBook'),
    ).toBe('accounts');

    first.unmount();
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));

    await waitFor(() => {
      const items = within(
        screen.getByRole('group', { name: 'Ledgers' }),
      ).getAllByRole('button');
      expect(items[0]).toHaveAccessibleName(/Accounts.*Recent/i);
    });
  });

  it('US-28 S6 — the Ledgers popover is square, on the paper-doc stock with the card edge', () => {
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    const menu = screen.getByRole('group', { name: 'Ledgers' });
    expect(menu).toHaveClass('popover');
    expect(menu.className).not.toMatch(/rounded|bg-\[var\(--bg-surface\)\]/);
  });

  it('no longer carries a feedback doorway — the Tester widget owns it', () => {
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));

    expect(
      screen.queryByRole('button', { name: /Share feedback/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Feedback' }),
    ).not.toBeInTheDocument();
  });

  // US-25 fix-now 12 — the Desk header prints its own `Find anything`, so
  // the drawer does not print a second one there.
  it('prints no second Find anything on the Desk', () => {
    mockPathname = '/desk';
    render(<StudioDrawer />);
    expect(
      screen.queryByRole('button', { name: 'Find anything (⌘K), from the studio drawer' }),
    ).not.toBeInTheDocument();
  });

  it('C-AP-05 — prints Find anything ⌘K as a door of its own', () => {
    mockPathname = '/doc/doc-1';
    const opened = jest.fn();
    window.addEventListener('document:open-command-bar', opened);
    render(<StudioDrawer />);

    // The printed words are unchanged; only the accessible NAME distinguishes
    // this door from the Desk header's own "Find anything" act, which shares
    // the page with it at 1280.
    const door = screen.getByRole('button', {
      name: 'Find anything (⌘K), from the studio drawer',
    });
    expect(door).toHaveTextContent('Find anything');
    expect(door).toHaveTextContent('⌘K');
    expect(
      screen.queryByRole('button', { name: 'Find anything' }),
    ).not.toBeInTheDocument();
    expect(door).toHaveClass('min-h-11');

    fireEvent.click(door);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:open-command-bar', opened);
  });

  it('W1 — the in-hand clock is the timer doorway, at every width', () => {
    mockPathname = '/doc/doc-1';
    mockInHandToday = 47;
    render(<StudioDrawer />);

    const doorway = screen.getByRole('button', {
      name: 'Open time controls, in hand 47 min',
    });
    expect(doorway).toHaveAttribute('data-drawer-timer-doorway');
    expect(doorway).toHaveTextContent('In hand today');
    expect(doorway).toHaveTextContent('47 min');
    expect(doorway).toHaveClass('min-h-11');

    fireEvent.click(doorway);
    expect(mockOpenTimer).toHaveBeenCalledTimes(1);
  });

  it('W1 — hands free prints no doorway: there is no clock to open', () => {
    render(<StudioDrawer />);

    expect(screen.getByText('No active timer')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Open time controls/i }),
    ).not.toBeInTheDocument();
  });

  it('W1/F-3 — prints nothing about presence while she is alone in the document', () => {
    render(<StudioDrawer />);

    expect(document.querySelector('[data-drawer-presence]')).toBeNull();
    expect(screen.queryByText(/^You and/)).not.toBeInTheDocument();
    // The rail's old line said so out loud; the drawer does not.
    expect(screen.queryByText(/Just you/)).not.toBeInTheDocument();
  });

  it('W1/F-3 — names the other person in the account zone, once there is one', () => {
    mockPresenceOthers = ['Marit'];
    render(<StudioDrawer />);

    expect(
      document.querySelector('[data-drawer-presence]'),
    ).toHaveTextContent('You and Marit');
  });

  it('W1/F-3 — counts the others past one rather than listing them', () => {
    mockPresenceOthers = ['Marit', 'Tomas'];
    render(<StudioDrawer />);

    expect(
      document.querySelector('[data-drawer-presence]'),
    ).toHaveTextContent('You and 2 others');
  });

  it('keeps the feedback doorway out of Ledgers even with shipped notes unseen', () => {
    mockUnseenFeedback = [{ id: 'feedback-1' }];
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));

    // Unseen shipped notes used to badge a "Leave a note" row here; the row and
    // its badge both moved to the Tester pill.
    const menu = screen.getByRole('group', { name: 'Ledgers' });
    expect(
      within(menu).queryByRole('button', { name: /Share feedback/i }),
    ).not.toBeInTheDocument();
  });
});

describe('StudioDrawer — zero shadows (US-28 S1, V20 U-Q12)', () => {
  it('casts no shadow: no elevation class and no shadow utility', () => {
    render(<StudioDrawer />);

    const bar = screen.getByRole('navigation', { name: 'Studio drawer' });
    expect(bar).not.toHaveClass('doc-elevated');
    expect(bar.className).not.toMatch(/(^|[\s:])(drop-)?shadow(-|\s|$)/);
  });
});


describe('Hours lazy body', () => {
  const nativeLazy = React.lazy;
  afterEach(() => {
    jest.restoreAllMocks();
    mockNativeHours = false;
    hoursMemberScopePending.userId = null;
    hoursMemberScopePending.name = null;
  });

  it.each(['project', 'ordinary', 'other book', 'unmount'])(
    'discards an abandoned lazy member handoff before the next %s open',
    async (nextOpen) => {
      mockNativeHours = true;
      let resolve!: () => void;
      const gate = new Promise<void>((done) => { resolve = done; });
      jest.spyOn(React, 'lazy').mockImplementation((load) => nativeLazy(() => gate.then(load)));
      const view = render(<StudioDrawer />);

      act(() => openHoursForMember('member-A', 'Teammate A'));
      expect(screen.getByRole('status')).toHaveTextContent('Loading hours');
      expect(hoursMemberScopePending.userId).toBe('member-A');
      if (nextOpen === 'other book') {
        act(() => window.dispatchEvent(new CustomEvent('document:open-ledger', {
          detail: 'orders',
        })));
        expect(screen.getByText('Orders ledger')).toBeInTheDocument();
      } else if (nextOpen === 'unmount') {
        view.unmount();
        render(<StudioDrawer />);
      } else {
        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Timesheets' }), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      }

      act(() => window.dispatchEvent(new CustomEvent('document:open-ledger', {
        detail: nextOpen === 'ordinary' ? 'hours' : {
          name: 'hours', context: { projectId: 'project-B' },
        },
      })));
      await act(async () => resolve());
      const lens = await screen.findByRole('group', { name: 'Time ledger scope' });
      // Native HoursLedger's memberScope is null, and its landingScope comes
      // from this open, not from the abandoned person's module handoff.
      expect(within(lens).queryByRole('button', { name: 'Teammate A' })).not.toBeInTheDocument();
      expect(within(lens).getByRole('button', {
        name: nextOpen === 'ordinary' ? 'My time' : 'This project',
      })).toHaveAttribute('aria-current', 'true');
    },
  );

  it('keeps a delayed member landing and switches the mounted sheet to the next member', async () => {
    mockNativeHours = true;
    let resolve!: () => void;
    const gate = new Promise<void>((done) => { resolve = done; });
    jest.spyOn(React, 'lazy').mockImplementation((load) => nativeLazy(() => gate.then(load)));
    render(<StudioDrawer />);
    act(() => openHoursForMember('member-A', 'Teammate A'));
    const panel = screen.getByRole('dialog', { name: 'Timesheets' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading hours');
    await act(async () => resolve());
    const lens = await screen.findByRole('group', { name: 'Time ledger scope' });
    expect(within(lens).getByRole('button', { name: 'Teammate A' })).toHaveAttribute('aria-current', 'true');
    act(() => openHoursForMember('member-B', 'Teammate B'));
    expect(screen.getByRole('dialog', { name: 'Timesheets' })).toBe(panel);
    expect(within(lens).queryByRole('button', { name: 'Teammate A' })).not.toBeInTheDocument();
    expect(within(lens).getByRole('button', { name: 'Teammate B' })).toHaveAttribute('aria-current', 'true');
    expect(hoursMemberScopePending).toEqual({ userId: null, name: null });
  });

  it('keeps the shell and opening focus through loading to loaded, then returns to its opener', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((done) => { resolve = done; });
    const loads = jest.fn();
    jest.spyOn(React, 'lazy').mockImplementation((load) => nativeLazy(() => {
      loads();
      return gate.then(load);
    }));
    render(<StudioDrawer />);
    expect(loads).not.toHaveBeenCalled();
    const opener = screen.getByRole('button', { name: 'Ledgers' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: /^Timesheets/ }));
    const panel = screen.getByRole('dialog', { name: 'Timesheets' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading hours');
    await waitFor(() => expect(panel).toHaveFocus());
    await act(async () => resolve());
    expect(panel).toContainElement(await screen.findByText('Hours ledger'));
    expect(panel).toHaveFocus();
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('contains a rejected chunk in the same shell and retries with a fresh loader', async () => {
    let reject!: (error: Error) => void;
    let resolveRetry!: () => void;
    const first = new Promise<void>((_resolve, fail) => { reject = fail; });
    const retry = new Promise<void>((done) => { resolveRetry = done; });
    let attempt = 0;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(React, 'lazy').mockImplementation((load) => nativeLazy(() => {
      const gate = attempt++ === 0 ? first : retry;
      return gate.then(load);
    }));
    render(<StudioDrawer />);
    const opener = screen.getByRole('button', { name: 'Ledgers' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: /^Timesheets/ }));
    const panel = screen.getByRole('dialog', { name: 'Timesheets' });
    await act(async () => reject(new Error('ChunkLoadError')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hours could not be loaded.');
    expect(screen.getByRole('dialog', { name: 'Timesheets' })).toBe(panel);
    const retryButton = screen.getByRole('button', { name: 'Try again' });
    retryButton.focus();
    fireEvent.click(retryButton);
    expect(screen.getByRole('status')).toHaveTextContent('Loading hours');
    expect(panel).toContainElement(document.activeElement as HTMLElement);
    await act(async () => resolveRetry());
    expect(panel).toContainElement(await screen.findByText('Hours ledger'));
    expect(attempt).toBe(2);
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
