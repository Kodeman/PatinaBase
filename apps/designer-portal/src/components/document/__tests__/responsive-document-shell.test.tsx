import { useEffect, useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { DocSpine } from '../doc-spine';
import { ResponsiveMarginRail } from '../margin-rail';
import { MobileBar } from '../mobile/mobile-bar';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  useMobilePrimaryAction,
  type MobileActiveDoc,
} from '../mobile/mobile-shell';
import { DocSheet } from '../overlays/doc-sheet';
import { DocLetterhead } from '../doc-letterhead';
import { JobTicket } from '../job-ticket';
import { RoomLensProvider, useRoomLens } from '../room-lens-context';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { MoneyLadder, MoneyRung } from '@/lib/document/money-ladder';
import {
  deriveTicket,
  deriveTicketHead,
  deriveTicketIdentity,
  deriveTicketSeam,
  type TicketInput,
  type TicketLine,
} from '@/lib/document/ticket-derivation';

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/proj-1',
}));

// Only the bar's three counters are stubbed; every other export stays real so
// the margin rail below still reads the hooks it actually uses.
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true }),
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    inHandToday: 0,
    running: false,
    paused: false,
    elapsedSeconds: 0,
    offer: null,
  }),
}));

jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('../feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('../strata-mark', () => ({
  StrataMark: ({ label }: { label?: string }) => (
    <span data-testid="strata-mark" aria-label={label} />
  ),
}));

jest.mock('../spine-timer', () => ({
  SpineTimer: () => <div data-testid="spine-timer">Timer</div>,
  CompactSpineTimerDoorway: () => (
    <button
      type="button"
      data-testid="compact-spine-timer"
      className="hidden min-[1180px]:flex min-[1440px]:hidden"
    >
      Compact timer
    </button>
  ),
}));

jest.mock('@/lib/document/fill-state', () => ({
  fillStateAtSection: () => ({ kind: 'empty' }),
}));

const sections: SpineSection[] = [
  { key: 'brief', label: 'Brief', state: 'settled', sub: 'Settled' },
  {
    key: 'discovery',
    label: 'Discovery',
    state: 'active',
    sub: 'In discovery',
  },
  { key: 'direction', label: 'Direction', state: 'future', sub: '—' },
];

function NestedSheetFixture() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open nested sheet
      </button>
      <DocSheet open={open} onClose={() => setOpen(false)} title="Nested sheet">
        <button type="button">Nested action</button>
      </DocSheet>
    </>
  );
}

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia({
  compact,
  full,
}: {
  compact: boolean;
  full: boolean;
}) {
  const state = { compact, full };
  const listeners = new Set<MediaListener>();
  window.matchMedia = jest.fn((query: string) => {
    return {
      get matches() {
        return query.includes('1440px') ? state.full : state.compact;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) =>
        listeners.delete(listener),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList;
  });

  return {
    setMode(next: { compact: boolean; full: boolean }) {
      state.compact = next.compact;
      state.full = next.full;
      listeners.forEach((listener) =>
        listener({ matches: next.full } as MediaQueryListEvent),
      );
    },
  };
}

describe('quiet responsive document shell', () => {
  beforeEach(() => {
    installMatchMedia({ compact: true, full: false });
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('exposes a compact index at 1180px and the full labelled spine at 1440px', () => {
    const onJump = jest.fn();
    render(<DocSpine sections={sections} others={[]} onJump={onJump} />);

    const spine = screen.getByRole('complementary', { name: 'Document spine' });
    expect(spine).toHaveAttribute(
      'data-spine-regime',
      'sheet-below-1180-narrow-to-1439-full-from-1440',
    );
    expect(spine).toHaveClass(
      'min-[1180px]:block',
      'min-[1180px]:box-border',
      'min-[1180px]:overflow-x-hidden',
      'min-[1180px]:w-full',
      'min-[1180px]:px-3',
      'min-[1440px]:w-auto',
    );

    expect(screen.getByRole('link', { name: 'Put down document' })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to Brief: Settled' }),
    );
    expect(onJump).toHaveBeenCalledWith('brief');
    expect(
      screen.getByRole('button', { name: 'Jump to Discovery: In discovery' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Direction/ }),
    ).not.toBeInTheDocument();

    expect(screen.queryByTestId('spine-timer')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('compact-spine-timer'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-spine-timer-regime]'),
    ).not.toBeInTheDocument();
  });

  it('opens the laptop margin as a labelled, keyboard-contained sheet', async () => {
    render(
      <ResponsiveMarginRail>
        <button type="button">Last margin action</button>
      </ResponsiveMarginRail>,
    );

    const trigger = screen.getByRole('button', { name: 'Margin' });
    const panel = document.querySelector<HTMLElement>('[data-margin-panel]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('data-margin-mode', 'sheet');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'In the margin' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('aria-hidden', 'false');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Close margin' }),
      ).toHaveFocus(),
    );

    const close = screen.getByRole('button', { name: 'Close margin' });
    const last = screen.getByRole('button', { name: 'Last margin action' });
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Escape' });
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('locks background scrolling until Escape, backdrop close, or unmount', async () => {
    document.body.style.overflow = 'scroll';
    const { container, unmount } = render(
      <ResponsiveMarginRail>
        <p>Margin content</p>
      </ResponsiveMarginRail>,
    );

    const trigger = screen.getByRole('button', { name: 'Margin' });
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'In the margin' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));

    fireEvent.click(trigger);
    const backdrop = container.querySelector<HTMLButtonElement>(
      'button[aria-hidden="true"]',
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLButtonElement);
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));

    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores background scrolling when the sheet settles into the full rail', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: false });
    render(
      <ResponsiveMarginRail>
        <p>Margin content</p>
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    expect(document.body.style.overflow).toBe('hidden');

    act(() => media.setMode({ compact: true, full: true }));

    await screen.findByRole('complementary', { name: 'Margin' });
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));
  });

  it('settles the same margin content into a labelled rail on wide screens', async () => {
    installMatchMedia({ compact: true, full: true });
    render(
      <ResponsiveMarginRail>
        <p>Margin content</p>
      </ResponsiveMarginRail>,
    );

    const rail = await screen.findByRole('complementary', { name: 'Margin' });
    expect(rail).toHaveAttribute('data-margin-mode', 'rail');
    expect(rail).toHaveAttribute('aria-hidden', 'false');
    expect(rail).toHaveClass('min-[1440px]:sticky', 'min-[1440px]:col-start-3');
  });

  it('lets a nested document sheet own Escape before closing the margin', async () => {
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    const margin = document.querySelector<HTMLElement>('[data-margin-panel]')!;
    expect(margin).toHaveAttribute('role', 'dialog');
    expect(margin).toHaveAttribute('aria-hidden', 'true');
    expect(margin).not.toHaveAttribute('aria-modal');
    expect(
      screen.getByRole('dialog', { name: 'Nested sheet' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested action' }), {
      key: 'Escape',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Nested sheet' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(margin).toHaveAttribute('aria-hidden', 'false'));
    expect(margin).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(margin, { key: 'Escape' });
    await waitFor(() => expect(margin).toHaveAttribute('aria-hidden', 'true'));
  });

  it('keeps scrolling locked when a nested sheet survives the full-rail transition', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: false });
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    expect(document.body.style.overflow).toBe('hidden');
    expect(
      screen.getByRole('dialog', { name: 'Nested sheet' }),
    ).toBeInTheDocument();

    act(() => media.setMode({ compact: true, full: true }));

    await screen.findByRole('complementary', { name: 'Margin' });
    expect(
      screen.getByRole('dialog', { name: 'Nested sheet' }),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested action' }), {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Nested sheet' }),
      ).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('reopens the compact margin beneath a portalled sheet on the 1440→1439 transition', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: true });
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    await screen.findByRole('complementary', { name: 'Margin' });
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    const nested = screen.getByRole('dialog', { name: 'Nested sheet' });
    await waitFor(() => expect(nested).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');

    act(() => media.setMode({ compact: true, full: false }));

    const margin = document.querySelector<HTMLElement>('[data-margin-panel]')!;
    expect(margin).toHaveAttribute('data-margin-mode', 'sheet');
    expect(margin).toHaveAttribute('aria-hidden', 'true');
    expect(margin).toHaveAttribute('inert');
    expect(margin).not.toHaveAttribute('aria-modal');
    expect(nested).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(nested).not.toBeInTheDocument());
    await screen.findByRole('dialog', { name: 'In the margin' });
    expect(margin).toHaveAttribute('aria-hidden', 'false');
    expect(margin).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(margin).toHaveAttribute('aria-hidden', 'true'));
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps a portalled margin sheet reachable below 1180 without a stale lock', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: false });
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    const nested = screen.getByRole('dialog', { name: 'Nested sheet' });
    const margin = document.querySelector<HTMLElement>('[data-margin-panel]');
    expect(margin).not.toBeNull();
    await waitFor(() => expect(nested).toHaveFocus());

    act(() => media.setMode({ compact: false, full: false }));

    expect(margin).toHaveAttribute('aria-hidden', 'true');
    expect(margin).toHaveAttribute('inert');
    expect(nested).toBeInTheDocument();
    expect(margin).not.toContainElement(nested);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(nested).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('scroll');
  });
});

/**
 * 390 — the thumb edge carries three things and no more: where she is, the one
 * elected act, and More. A fourth 44x44 target is what made the act truncate.
 */
describe('the 390 bar', () => {
  const held: MobileActiveDoc = {
    projectId: 'proj-1',
    proposalId: null,
    clientName: 'Vandersteen',
    title: 'Vandersteen residence',
    sections: [
      {
        key: 'project',
        label: 'Project',
        state: 'active',
        sub: 'In the project',
      },
    ],
  };

  function Bar() {
    useMobileActiveDoc(held);
    useMobilePrimaryAction({
      actionKey: 'pick-the-fabric',
      surfaceKey: 'open-document',
      regionKey: 'red-letter',
      label: 'Pick the fabric for the Okonkwo sofa',
      target: { kind: 'press', onPress: jest.fn() },
    });
    return <MobileBar />;
  }

  it('carries the context, the elected act and More — nothing else', () => {
    render(
      <MobileShellProvider>
        <Bar />
      </MobileShellProvider>,
    );

    const bar = screen.getByTestId('mobile-bar');
    expect(bar).toHaveClass('min-[1180px]:hidden');
    const controls = Array.from(bar.querySelectorAll('button, a'));
    expect(controls).toHaveLength(3);

    const [context, act, more] = controls;
    expect(context).toHaveAccessibleName(
      'Open sections, current section Project',
    );
    expect(act).toHaveAttribute('data-action-key', 'pick-the-fabric');
    expect(act.querySelector('.da-label')?.textContent).toBe(
      'Pick the fabric for the Okonkwo sofa',
    );
    expect(more).toHaveAccessibleName('More studio actions');
  });
});

/**
 * B1 — the ticket is mounted by the DOCUMENT, so project, install and care read
 * identically; and the room lens now survives every width (B2), which makes the
 * put-down affordance the thing that has to be proved. A hold taken at 1440 and
 * carried to 390 must be releasable from the ticket's expanded Rooms row AND
 * from the letterhead — I136's released-on-resize clause was written to prevent
 * a hold with nothing on screen able to clear it, and this is what replaces it.
 *
 * The composition below is page.tsx's own, element for element: letterhead,
 * the sentinel the sticky seam observes, then the ticket.
 */
type WidthListener = (event: MediaQueryListEvent) => void;

/** A matchMedia that answers min-/max-width against one real number, so a
 *  resize can be simulated in both directions the ticket reads. */
function installWidthMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<{ query: string; listener: WidthListener }>();
  const test = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    if (min && width < Number(min[1])) return false;
    if (max && width > Number(max[1])) return false;
    return true;
  };
  window.matchMedia = jest.fn(
    (query: string) =>
      ({
        get matches() {
          return test(query);
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: WidthListener) => {
          listeners.add({ query, listener });
        },
        removeEventListener: (_type: string, listener: WidthListener) => {
          for (const entry of listeners) {
            if (entry.listener === listener) listeners.delete(entry);
          }
        },
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }) as unknown as MediaQueryList,
  );
  return {
    resizeTo(next: number) {
      width = next;
      listeners.forEach(({ query, listener }) =>
        listener({ matches: test(query) } as MediaQueryListEvent),
      );
    },
  };
}

const TICKET_ROOMS = [
  { id: 'living', name: 'Living room' },
  { id: 'dining', name: 'Dining room' },
];

const ticketRung = (
  cents: number | null,
  note: string,
  word: string,
): MoneyRung => ({ cents, note, word });

const ticketLadder = (): MoneyLadder => ({
  budget: ticketRung(null, 'nothing approved yet', 'budget'),
  plan: ticketRung(null, 'no working budget yet', 'plan'),
  authorized: ticketRung(null, 'nothing executed yet', 'authorized'),
  moved: ticketRung(null, 'nothing in motion yet', 'moved'),
  owed: ticketRung(null, 'nothing owed yet', 'owed'),
  notDrawn: ticketRung(null, 'nothing standing undrawn', 'not drawn'),
});

const TICKET_LINES: TicketLine[] = [
  { stamp: 'ordered', roomId: 'living', specified: true },
  { stamp: 'ordered', roomId: 'living', specified: true },
  { stamp: 'delivered', roomId: 'dining', specified: true },
];

function ticketInputFor(section: SectionKey): TicketInput {
  return {
    section,
    phase: null,
    rooms: { settled: true, list: TICKET_ROOMS },
    pieces: { settled: true, lines: TICKET_LINES },
    drawings: { settled: true, sheetCount: 0 },
    boards: { settled: true, count: 0 },
    money: {
      settled: true,
      failed: false,
      ladder: ticketLadder(),
      owedDays: null,
      undrawnKind: null,
      owedSince: null,
    },
    dates: { settled: true, schedule: null },
    people: { settled: true, callSheetEnabled: true, rosterCount: 0 },
  };
}

function TicketPaper({ section }: { section: SectionKey }) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const input = ticketInputFor(section);
  const rows = deriveTicket(input);
  const heldRoomName =
    TICKET_ROOMS.find((room) => room.id === heldRoomId)?.name ?? null;

  return (
    <>
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement & Orders"
        inHandRoomName={heldRoomName}
        onReleaseRoom={heldRoomId ? () => toggleRoom(heldRoomId) : null}
      />
      <JobTicket
        rows={rows}
        seam={deriveTicketSeam(rows, deriveTicketIdentity(input))}
        head={deriveTicketHead(input)}
        onOpenLeaf={jest.fn()}
        routes={{}}
        onUnfoldRegion={jest.fn()}
        onOpenCallSheet={jest.fn()}
      />
    </>
  );
}

function renderTicketPaper(section: SectionKey) {
  return render(
    <RoomLensProvider>
      <TicketPaper section={section} />
    </RoomLensProvider>,
  );
}

const ticketRow = (key: string) =>
  document.querySelector<HTMLElement>(`[data-ticket-row="${key}"]`);

const roomChip = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-room-chip="${id}"]`);

describe('the ticket, mounted by the document', () => {
  beforeEach(() => {
    installWidthMatchMedia(1440);
  });

  it.each([
    ['project' as const, 'The job · Project'],
    ['install' as const, 'The job · Install'],
    ['care' as const, 'The job · Care'],
  ])('mounts on a %s spread with the same eight rows', (section, identity) => {
    renderTicketPaper(section);

    const ticket = document.querySelector('[data-job-ticket]');
    expect(ticket).not.toBeNull();
    expect(ticket).toHaveAttribute('data-unfolded', 'true');
    expect(document.querySelectorAll('[data-ticket-row]')).toHaveLength(8);
    expect(
      Array.from(document.querySelectorAll('[data-ticket-row]')).map((row) =>
        row.getAttribute('data-ticket-row'),
      ),
    ).toEqual([
      'rooms',
      'pieces',
      'drawings',
      'spec',
      'boards',
      'money',
      'dates',
      'people',
    ]);
    expect(screen.getByText(identity)).toBeInTheDocument();
    // The document's own facts, not the Project spread's: install and care read
    // the same three lines this specimen carries.
    expect(ticketRow('pieces')).toHaveTextContent('2 ordered · 1 delivered');
  });
});

describe('a room in hand, carried down the widths', () => {
  it('survives 1440 → 1280 → 390 with a release reachable at each', () => {
    const media = installWidthMatchMedia(1440);
    renderTicketPaper('project');

    fireEvent.click(ticketRow('rooms')!.querySelector('button')!);
    fireEvent.click(roomChip('living')!);

    // 1440 — the letterhead names it, and both controls are on screen.
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Put down Living room' }),
    ).toBeInTheDocument();

    // 1280 — the width that used to drop the hold on the floor.
    act(() => media.resizeTo(1280));
    expect(
      screen.getByRole('button', { name: 'Put down Living room' }),
    ).toBeInTheDocument();
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'true');

    // 390 — the ticket rests as the seam, so the letterhead is the release
    // that is already on screen; unfolding brings the chip back.
    act(() => media.resizeTo(390));
    expect(document.querySelector('[data-job-ticket]')).not.toHaveAttribute(
      'data-unfolded',
    );
    expect(
      screen.getByRole('button', { name: 'Put down Living room' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unfold ↓' }));
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'true');
  });

  it('puts the room down from the ticket, and from the letterhead', () => {
    const media = installWidthMatchMedia(1440);
    renderTicketPaper('project');

    fireEvent.click(ticketRow('rooms')!.querySelector('button')!);
    fireEvent.click(roomChip('living')!);
    fireEvent.click(roomChip('living')!);
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByRole('button', { name: 'Put down Living room' }),
    ).not.toBeInTheDocument();

    // Taken again and carried to the phone: the letterhead alone puts it down.
    fireEvent.click(roomChip('living')!);
    act(() => media.resizeTo(390));
    fireEvent.click(
      screen.getByRole('button', { name: 'Put down Living room' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Put down Living room' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-in-hand-room]')).toBeNull();
  });
});
