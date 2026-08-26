import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StudioDrawer } from './studio-drawer';
import { openFeedbackSheet } from './feedback/feedback-sheet';

const mockPush = jest.fn();
let mockUnseenFeedback: Array<{ id: string }> = [];

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: mockUnseenFeedback }),
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({ inHandToday: 0 }),
}));

jest.mock('@/lib/help-system/use-sheet-surface-key', () => ({
  useSheetSurfaceKey: jest.fn(),
}));

jest.mock('@/lib/document/room-origin', () => ({
  rememberRoomOrigin: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
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
  HoursLedger: () => <div>Hours ledger</div>,
}));

jest.mock('./feedback/feedback-ledger', () => ({
  FeedbackLedger: () => <div>Feedback ledger</div>,
}));

jest.mock('./feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
}));

jest.mock('./account/account-nameplate', () => ({
  AccountNameplate: () => <div>Designer account</div>,
}));

describe('StudioDrawer', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUnseenFeedback = [];
    jest.mocked(openFeedbackSheet).mockClear();
    window.localStorage.clear();
  });

  it('keeps Rooms direct and gathers sheet ledgers behind one doorway', () => {
    render(<StudioDrawer />);

    const drawer = screen.getByRole('navigation', { name: 'Studio drawer' });
    expect(drawer).toHaveClass('min-[1180px]:grid');
    expect(screen.getByRole('button', { name: 'Library' })).toHaveClass(
      'min-h-11',
    );
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'The Scans' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Orders' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    const menu = screen.getByRole('group', { name: 'Ledgers' });
    expect(within(menu).getByRole('button', { name: 'Orders' })).toHaveFocus();
    expect(within(menu).getByRole('button', { name: 'Accounts' })).toHaveClass(
      'min-h-11',
    );
    expect(
      within(menu).getByRole('button', { name: 'Hours' }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('button', { name: 'Feedback' }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).getByRole('button', { name: 'Leave a note' }),
    ).toBeInTheDocument();
  });

  it('F11 — closing a books-menu sheet returns focus to Ledgers once the opening row has unmounted', async () => {
    render(<StudioDrawer />);

    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    const ordersRow = screen.getByRole('button', { name: 'Orders' });
    ordersRow.focus();
    fireEvent.click(ordersRow);

    // Opening the sheet closes the books menu, so the row DocSheet captured as
    // the pre-open activeElement is gone by the time it restores.
    expect(
      screen.queryByRole('button', { name: 'Orders' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Orders' })).toBeInTheDocument();

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
    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }));

    expect(
      screen.getByRole('dialog', { name: 'Accounts' }),
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

  it('offers feedback contextually from the books hub', () => {
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave a note' }));

    expect(openFeedbackSheet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('C-AP-05 — prints Find anything ⌘K as a door of its own', () => {
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

  it('carries the shipped-feedback signal into the single feedback entrance', () => {
    mockUnseenFeedback = [{ id: 'feedback-1' }];
    render(<StudioDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Ledgers' }));

    expect(
      screen.getByRole('button', { name: /Leave a note.*Shipped/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Feedback' }),
    ).not.toBeInTheDocument();
  });
});
