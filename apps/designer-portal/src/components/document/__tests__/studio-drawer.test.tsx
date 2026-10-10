/**
 * US-19 F6 / SQ-715 — `Keys ?` sits beside `Find anything ⌘K` in the studio
 * drawer, one row on the room links' line at the same 44px height (R22's
 * stacked column overflowed the 60px bar and was replaced 2026-10-09), and
 * THE POST holds one line.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';

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

describe('StudioDrawer — Keys beside Find anything (F6, SQ-715)', () => {
  it('prints Keys ? beside Find anything ⌘K on one row, same line, same height', () => {
    render(<StudioDrawer />);
    const find = findAnything();
    const keys = screen.getByRole('button', { name: 'Keys (?)' });

    const stack = find.parentElement as HTMLElement;
    expect(stack).toHaveAttribute('data-drawer-find-stack');
    // One row centred on the room links' line — never the stacked column.
    expect(stack).toHaveClass('flex', 'items-center');
    expect(stack).not.toHaveClass('flex-col');
    expect(find.nextElementSibling).toBe(keys);
    // The same 44px target as the room links beside them.
    const library = screen.getByRole('button', { name: 'Library' });
    for (const control of [find, keys, library]) {
      expect(control).toHaveClass('min-h-11', 'py-2');
    }
    // The key stays printed at every width; the word, like Find's, goes
    // first below 1440 and the accessible names carry the act.
    expect(keys).toHaveTextContent('?');
    expect(within(keys).getByText('Keys')).toHaveClass('hidden', 'min-[1440px]:inline');
    expect(within(find).getByText('Find anything')).toHaveClass('hidden', 'min-[1440px]:inline');
    expect(within(find).getByText('⌘K')).toBeInTheDocument();
  });

  it('keeps the right zone at its own width so the row cannot print over it', () => {
    render(<StudioDrawer />);
    expect(screen.getByRole('navigation', { name: 'Studio drawer' })).toHaveClass(
      'grid-cols-[1fr_auto_minmax(max-content,1fr)]',
    );
  });

  it('opens Keys from its row', () => {
    render(<StudioDrawer />);
    const opened = jest.fn();
    window.addEventListener(KEYS_SHEET_EVENT, opened);
    fireEvent.click(screen.getByRole('button', { name: 'Keys (?)' }));
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
    expect(screen.getByRole('navigation', { name: 'Studio drawer' })).toHaveClass(
      'grid-cols-[1fr_auto_1fr]',
    );
  });
});
