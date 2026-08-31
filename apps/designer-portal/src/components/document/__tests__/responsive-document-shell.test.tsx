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
import { LensBand } from '../lens-band';
import { RoomLensProvider, useRoomLens } from '../room-lens-context';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { MoneyLadder, MoneyRung } from '@/lib/document/money-ladder';
import {
  deriveTicket,
  type TicketInput,
  type TicketLine,
} from '@/lib/document/ticket-derivation';
import {
  deriveLensBand,
  type LensBandModel,
  type LensSpreadKind,
} from '@/lib/document/lens-band-derivation';
import type { LadderSegment } from '@/lib/document/lens-ladder-derivation';

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
    render(<DocSpine sections={sections} onJump={jest.fn()} />);

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
    // W7-R1 §1 — the seven-mark arc and its per-section jumps are retired: the
    // head prints ONE inert progress mark and the ladder is the navigation.
    expect(screen.queryByRole('button', { name: /^Jump to/ })).toBeNull();
    expect(screen.queryAllByRole('list')).toHaveLength(0);
    expect(screen.getAllByTestId('strata-mark')).toHaveLength(1);

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
    // OD-11 (W1-L3): the sections door names the reading STOP, not the
    // section — `held` above carries no `readingIndex`, so it names none.
    expect(context).toHaveAccessibleName('Open sections');
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

/* ── R127 Wave 3 (W3-L5) ────────────────────────────────────────────────────
 * The job ticket is deleted. Its two claims on this paper move: the eight rows
 * on three spreads become the BAND's two lines on three spreads, and the room
 * lens — whose only path into the tree ran through the ticket's Rooms row and
 * its chips — is now reached from the LADDER's room sub-rungs, which carry the
 * same `data-room-chip` and the same `aria-pressed` the chips did (proposal §9).
 * ─────────────────────────────────────────────────────────────────────────── */

/** The stage the band names on each project-kind spread (reconciliation, "What
 *  prints"). The band never prints the current STOP — that is the ladder's and
 *  the paper's own head. */
const SPREAD_STAGE: Record<
  'project' | 'install' | 'care',
  { word: string; index: { position: number; of: number } }
> = {
  project: { word: 'Procurement & Orders', index: { position: 4, of: 6 } },
  install: { word: 'Installation & Styling', index: { position: 5, of: 6 } },
  care: { word: 'Completion', index: { position: 6, of: 6 } },
};

/** Where she is standing while these cases run — Pieces, so the ladder prints
 *  its room rungs (Override 2) and line 1 can be proved never to name it. */
const READING_STOP = {
  key: 'ffe' as const,
  label: 'Pieces',
  countLine: '3 lines · 2 rooms',
};

/** The band's model for a spread, composed the way `page.tsx` composes it
 *  (C-5): the same specimen the ticket read, through `deriveTicket` for the
 *  exceptions and `deriveLensBand` for the two lines. */
function bandModelFor(section: 'project' | 'install' | 'care'): LensBandModel {
  const stage = SPREAD_STAGE[section];
  return deriveLensBand({
    spreadKind: section as LensSpreadKind,
    ticket: deriveTicket(ticketInputFor(section)),
    needs: [],
    guide: { text: 'Name the phases for this project', act: null },
    household: 'Vandersteen residence',
    stageWord: stage.word,
    stageIndex: stage.index,
    installDate: 'Sep 15',
    moneyFigure: null,
    proposalInvestment: null,
    sentDate: null,
    readingStop: READING_STOP,
  });
}

/** The Pieces stop as the ladder prints it, with this specimen's two rooms as
 *  its sub-rungs. `held` is the room lens's own answer, so pressing a rung and
 *  reading it back is the same round trip the ticket's chips used to make. */
function piecesSegment(heldRoomId: string | null): LadderSegment {
  return {
    key: 'ffe',
    name: 'Pieces',
    value: '3 LINES · 2 ROOMS',
    narrowValue: '3 LINES · 2 ROOMS',
    countLine: READING_STOP.countLine,
    fallback: null,
    extent: 3,
    mounted: true,
    floorPx: 45,
    narrowFloorPx: 45,
    rooms: TICKET_ROOMS.map((room) => ({
      ...room,
      held: room.id === heldRoomId,
    })),
  };
}

function BandPaper({ section }: { section: 'project' | 'install' | 'care' }) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const heldRoomName =
    TICKET_ROOMS.find((room) => room.id === heldRoomId)?.name ?? null;

  return (
    <>
      <DocLetterhead title="Vandersteen residence" vitals="Procurement & Orders" />
      {/* C-1 — the room in hand and its release live at the rail head; C-3/C-4
          — the rungs that take a room in hand live on the ladder inside it.
          The spine is rendered here so the hold's two printings (the rail's
          line, the rung's `aria-pressed`) can be asserted together. */}
      <DocSpine
        sections={[]}
        household="Vandersteen"
        segments={[piecesSegment(heldRoomId)]}
        activeKey="ffe"
        onToggleRoom={toggleRoom}
        roomInHand={
          heldRoomId && heldRoomName
            ? { id: heldRoomId, name: heldRoomName }
            : null
        }
        onReleaseRoom={toggleRoom}
      />
      {/* The band pins itself off its own sentinel (C-04): `passSentinel()`
          is s1+, where line 1 prints. At s0 it yields to the letterhead 60px
          above; that case is asserted below, with the observer left silent. */}
      <LensBand
        model={bandModelFor(section)}
        readingStop={READING_STOP}
        docId="doc-1"
      />
    </>
  );
}

function renderBandPaper(section: 'project' | 'install' | 'care') {
  return render(
    <RoomLensProvider>
      <BandPaper section={section} />
    </RoomLensProvider>,
  );
}

const bandLine = (n: '1' | '2') =>
  document.querySelector<HTMLElement>(`[data-lens-line="${n}"]`);

// C-04 — the band owns the sentinel's observer, so the pin is only reachable
// through it; the global jsdom mock never fires.
let sentinelCallback: IntersectionObserverCallback | null = null;
function installSentinelObserver() {
  sentinelCallback = null;
  window.IntersectionObserver = jest.fn(
    (callback: IntersectionObserverCallback) => {
      sentinelCallback = callback;
      return {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
        takeRecords: () => [],
        root: null,
        rootMargin: '',
        thresholds: [],
      };
    },
  ) as unknown as typeof IntersectionObserver;
}
/** The sentinel has scrolled out of the frame — the band pins (s1+). */
function passSentinel() {
  act(() => {
    sentinelCallback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

const roomChip = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-room-chip="${id}"]`);

describe('the band, mounted by the document', () => {
  const originalIO = window.IntersectionObserver;
  beforeEach(() => {
    installWidthMatchMedia(1440);
    installSentinelObserver();
  });
  afterEach(() => {
    window.IntersectionObserver = originalIO;
  });

  it.each([
    ['project' as const, 'PROCUREMENT & ORDERS 4 OF 6'],
    ['install' as const, 'INSTALLATION & STYLING 5 OF 6'],
    ['care' as const, 'COMPLETION 6 OF 6'],
  ])(
    'mounts on a %s spread and prints the same two lines',
    (section, stagePhrase) => {
      // Was "mounts on a %s spread with the same eight rows". The rows are
      // gone with the ticket; what the case held — one map, identical in shape
      // on all three project-kind spreads, mounted by the document rather than
      // the section — is now the band's TWO LINES, and it is held here.
      renderBandPaper(section);
      passSentinel();

      const band = document.querySelector('[data-lens-band]');
      expect(band).not.toBeNull();
      expect(band).toHaveAttribute('data-lens-open', 'false');
      expect(document.querySelectorAll('[data-lens-band]')).toHaveLength(1);
      expect(document.querySelectorAll('[data-lens-line="1"]')).toHaveLength(1);
      expect(document.querySelectorAll('[data-lens-line="2"]')).toHaveLength(1);

      // Line 1 — the household and the stage this spread stands in, and the
      // dated fact where the spread has one (care has none after install).
      expect(bandLine('1')).toHaveTextContent('VANDERSTEEN RESIDENCE');
      expect(bandLine('1')).toHaveTextContent(stagePhrase);
      if (section === 'care') {
        expect(bandLine('1')!.textContent).not.toContain('INSTALL');
      } else {
        expect(bandLine('1')).toHaveTextContent('INSTALL SEP 15');
      }

      // The current stop's name is NEVER on line 1, at any width or spread —
      // the paper's own head and the ladder carry it (OD-1).
      expect(bandLine('1')!.textContent).not.toContain('Pieces');
      expect(bandLine('1')!.textContent).not.toContain('PIECES');

      // Line 2 — nothing stands on this specimen, so the stage's guide
      // sentence speaks, and it is the one live region on the document.
      expect(bandLine('2')).toHaveTextContent('Name the phases for this project');
      expect(bandLine('2')).toHaveAttribute('aria-live', 'polite');
      expect(bandLine('2')).toHaveAttribute('data-lens-line2-kind', 'guide');
    },
  );

  it('yields line 1 to the letterhead at s0, and keeps line 2', () => {
    // The other half of "two lines per spread": in flow at s0 the letterhead
    // 60px above prints the household, the stage and the date, so line 1's
    // left slot yields entirely and only what the letterhead does not print
    // survives on the right.
    render(
      <RoomLensProvider>
        <LensBand
          model={bandModelFor('project')}
          readingStop={READING_STOP}
          docId="doc-1"
        />
      </RoomLensProvider>,
    );

    expect(document.querySelector('[data-lens-band]')).toHaveAttribute(
      'data-lens-open',
      'true',
    );
    const identity = document.querySelector('[data-lens-identity]')!;
    expect(identity.textContent).toBe('');
    expect(bandLine('1')!.textContent).not.toContain('PROCUREMENT');
    expect(bandLine('2')).toHaveTextContent('Name the phases for this project');
  });
});

describe('a room in hand, carried down the widths', () => {
  // W1 re-point (C-1) and W3 re-point (C-3/C-4). These two cases used to reach
  // the room lens through the ticket's Rooms row and its chips; the ticket is
  // deleted, and the only path to taking a room in hand is now the ladder's
  // room sub-rung, which carries the same `data-room-chip` and `aria-pressed`.
  // The rail head still owns the naming (`IN HAND · LIVING ROOM`, inside
  // `[data-spine-head]`) and the release (`Put down the room`). The release
  // assertions are unchanged in substance — only the act they press moved.
  const railHead = () =>
    document.querySelector<HTMLElement>('[data-spine-head]');
  const releaseAct = () =>
    screen.queryByRole('button', { name: 'Put down the room' });

  it('survives 1440 → 1280 → 390 with a release reachable at each', () => {
    const media = installWidthMatchMedia(1440);
    renderBandPaper('project');

    fireEvent.click(roomChip('living')!);

    // 1440 — the rail head names it, and both controls are on screen.
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'true');
    expect(railHead()).toHaveTextContent('In hand · Living room');
    expect(releaseAct()).toBeInTheDocument();

    // 1280 — the width that used to drop the hold on the floor. The 136px rail
    // prints words, so the head carries the same two lines it does at 1440.
    act(() => media.resizeTo(1280));
    expect(railHead()).toHaveTextContent('In hand · Living room');
    expect(releaseAct()).toBeInTheDocument();
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'true');

    // 390 — the rail is display:none below 1180 and the ladder rides inside
    // it, so the rung is on the paper but not on the screen (a CSS fact jsdom
    // cannot render, so it is not asserted here; `quiet-responsive-shell.spec.ts`
    // holds it, and D13's sections sheet is the index at this width). What is
    // asserted is what the case was always for: the hold itself survived the
    // trip down, and the release is still reachable from the rail head.
    act(() => media.resizeTo(390));
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'true');
    expect(releaseAct()).toBeInTheDocument();
  });

  it('puts the room down from the rung, and from the rail head', () => {
    installWidthMatchMedia(1440);
    renderBandPaper('project');

    fireEvent.click(roomChip('living')!);
    fireEvent.click(roomChip('living')!);
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'false');
    expect(releaseAct()).not.toBeInTheDocument();

    // Taken again: the rail head alone puts it down.
    fireEvent.click(roomChip('living')!);
    expect(releaseAct()).toBeInTheDocument();
    fireEvent.click(releaseAct()!);

    expect(releaseAct()).not.toBeInTheDocument();
    expect(roomChip('living')).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[data-spine-room-in-hand]')).toBeNull();
    // The letterhead's old printing is gone for good.
    expect(document.querySelector('[data-in-hand-room]')).toBeNull();
  });
});
