/**
 * US-19 F6 / R22 — `Keys ?` is its own row directly beneath `Find anything ⌘K`
 * in the studio drawer, at every width; the two stand as one column so neither
 * reaches the right zone, and THE POST holds one line.
 */
import { fireEvent, render, screen } from '@testing-library/react';

let mockAskThePaper = true;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'ask-the-paper' ? mockAskThePaper : false,
  }),
}));

jest.mock('@/hooks/use-teaching-note', () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../mobile/mobile-shell', () => ({
  useMobileShell: () => ({ openTimer: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({ inHandToday: 0, heldEngagementId: 'engagement-1' }),
}));

jest.mock('@/hooks/use-document-presence', () => ({ useDocumentPresence: () => [] }));

jest.mock('@/lib/help-system/use-sheet-surface-key', () => ({ useSheetSurfaceKey: jest.fn() }));

jest.mock('@/lib/document/room-origin', () => ({ rememberRoomOrigin: jest.fn() }));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { wayfinding: { roomEntered: jest.fn(), doorOpened: jest.fn() } },
}));

jest.mock('../overlays/post-sheet', () => ({ PostSheet: () => null, openPost: jest.fn() }));
jest.mock('../orders-ledger', () => ({ OrdersLedger: () => null }));
jest.mock('../accounts/accounts-book', () => ({ AccountsBook: () => null }));
jest.mock('../hours-ledger', () => ({ HoursLedger: () => null }));
jest.mock('../account/account-nameplate', () => ({ AccountNameplate: () => null }));

import { StudioDrawer } from '../studio-drawer';
import { KEYS_SHEET_EVENT } from '../overlays/keys-sheet';

const findAnything = () =>
  screen.getByRole('button', { name: 'Find anything (⌘K), from the studio drawer' });

beforeEach(() => {
  mockAskThePaper = true;
  window.localStorage.clear();
});

describe('StudioDrawer — Keys beneath Find anything (F6, R22)', () => {
  it('prints Keys ? as its own row directly beneath Find anything ⌘K, in one column', () => {
    render(<StudioDrawer />);
    const find = findAnything();
    const keys = screen.getByRole('button', { name: /^Keys/ });

    const stack = find.parentElement as HTMLElement;
    expect(stack).toHaveAttribute('data-drawer-find-stack');
    expect(stack).toHaveClass('flex', 'flex-col');
    expect(find.nextElementSibling).toBe(keys);
    expect(keys).toHaveTextContent('?');
    // Both rows share the bar; each keeps a 24px target.
    expect(keys).toHaveClass('min-h-6');
    expect(find).toHaveClass('min-h-8');
  });

  it('opens Keys from its row', () => {
    render(<StudioDrawer />);
    const opened = jest.fn();
    window.addEventListener(KEYS_SHEET_EVENT, opened);
    fireEvent.click(screen.getByRole('button', { name: /^Keys/ }));
    window.removeEventListener(KEYS_SHEET_EVENT, opened);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('holds THE POST to one line', () => {
    render(<StudioDrawer />);
    const label = screen.getByText(/^the post$/i);
    expect(label).toHaveClass('whitespace-nowrap');
  });

  it('flag off — no Keys row, and Find anything keeps its own 44px target', () => {
    mockAskThePaper = false;
    render(<StudioDrawer />);
    expect(screen.queryByRole('button', { name: /^Keys/ })).not.toBeInTheDocument();
    expect(findAnything()).toHaveClass('min-h-11');
    expect(findAnything().parentElement).toHaveClass('contents');
  });
});
