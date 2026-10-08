import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StandingSheet } from '../standing-sheet';
import { MobileBar } from './mobile-bar';
import { MobileSheets } from './mobile-sheets';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  useMobilePrimaryAction,
  useMobileSecondaryAction,
  type MobileActiveDoc,
  type MobilePrimaryAction,
  type MobileSecondaryAction,
} from './mobile-shell';
import { MOBILE_ACTION_PRIORITY } from './lifecycle-mobile-action';

/** W5-R4(a) — `MobileSheets` now hosts the margin's note composer, so the tree
 *  needs a query client the way every other act surface does. */
const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={testQueryClient}>
      <MobileShellProvider>{children}</MobileShellProvider>
    </QueryClientProvider>
  );
}


let mockPathname = '/doc/proj-1';
let mockCallSheetOn = true;
const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@patina/supabase', () => ({
  // W5-C2 — the Margin sheet's inline nudge.
  useSendDecisionReminder: () => ({ mutate: jest.fn(), isPending: false }),
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
  // The sections sheet (MobileSheets) needs these too — it computes its
  // margin summary unconditionally, whichever sheet kind is open.
  useCoordinationItems: () => ({ data: [] }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  // W5-R1: useMarginSheet's line-label lookup — this file's suites never
  // seed margin items with a line anchor, so an empty list is enough.
  useProjectFFEItems: () => ({ data: [] }),
  isProjectArtifactApproval: () => false,
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockCallSheetOn }),
}));

// D-B54 — the whole defect lived here. This file used to pin `offer: null`
// for every case, so the bar's yield branch never rendered once and the
// cross-project state the designer is actually in was never executed. The
// stub now carries the RAW pair the provider reasons over and derives the
// answer with the provider's OWN exported rule, so a change to that rule goes
// red here rather than being re-stated (and re-blessed) by a hand-copied
// formula in the mock.
let mockOffer: { entryId: string; projectId: string } | null = null;
let mockHeldProjectId: string | null = null;

jest.mock('@/hooks/document-time-provider', () => {
  const actual = jest.requireActual('@/hooks/document-time-provider');
  return {
    useDocumentTime: () => ({
      inHandToday: 0,
      running: false,
      paused: false,
      elapsedSeconds: 0,
      offer: mockOffer,
      heldProjectId: mockHeldProjectId,
      offerOwnsEdge: actual.offerOwnsThumbEdge(mockOffer, mockHeldProjectId),
    }),
  };
});

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: [] }),
}));

jest.mock('../overlays/post-sheet', () => ({
  openPost: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('../account/mobile-account-header', () => ({
  MobileAccountHeader: () => null,
}));

jest.mock('../account/account-sheet', () => ({
  openAccount: jest.fn(),
}));

jest.mock('../command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('../margin-bodies', () => ({
  MarginItemBody: () => null,
}));

const heldDocument: MobileActiveDoc = {
  projectId: 'proj-1',
  proposalId: null,
  clientName: 'Vandersteen',
  title: 'Vandersteen residence',
  sections: [
    { key: 'project', label: 'Project', state: 'active', sub: 'In the project' },
  ],
};

function HoldDocument({ doc }: { doc: MobileActiveDoc | null }) {
  useMobileActiveDoc(doc);
  return null;
}

function Registration({ action }: { action: MobilePrimaryAction | null }) {
  useMobilePrimaryAction(action);
  return null;
}

function mountBar({
  doc = heldDocument,
  action = null,
}: {
  doc?: MobileActiveDoc | null;
  action?: MobilePrimaryAction | null;
} = {}) {
  return render(
    <TestProviders>
      <HoldDocument doc={doc} />
      <Registration action={action} />
      <MobileBar />
    </TestProviders>,
  );
}

function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));
  return within(screen.getByRole('group', { name: 'More studio actions' }));
}

describe('the More menu · In this document (F49)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('leads with the document group, then the register', () => {
    mountBar();
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));
    const menu = screen.getByRole('group', { name: 'More studio actions' });

    const group = within(menu).getByRole('group', {
      name: 'In this document',
    });
    expect(
      Array.from(group.querySelectorAll('a, button')).map((row) =>
        row.textContent?.replace('→', ''),
      ),
    ).toEqual(['Plan room', 'Spec book', 'Boards', 'Call sheet']);

    const labels = Array.from(menu.querySelectorAll('a, button')).map((row) =>
      row.textContent?.replace('→', ''),
    );
    expect(labels.slice(0, 5)).toEqual([
      'Plan room',
      'Spec book',
      'Boards',
      'Call sheet',
      'Find anything⌘K',
    ]);
  });

  it('routes the plan room and the spec book at this project', () => {
    mountBar();
    const menu = openMore();

    expect(menu.getByRole('link', { name: 'Plan room' })).toHaveAttribute(
      'href',
      '/doc/proj-1/plans',
    );
    expect(menu.getByRole('link', { name: 'Spec book' })).toHaveAttribute(
      'href',
      '/doc/proj-1/spec-book',
    );
  });

  it('routes Boards at the destination B1-L4 built, under that one name', () => {
    mountBar();
    const menu = openMore();

    expect(menu.getByRole('link', { name: 'Boards' })).toHaveAttribute(
      'href',
      '/doc/proj-1/boards',
    );
    expect(menu.queryByText('Mood boards')).toBeNull();
  });

  it('opens the call sheet through the doorway the surface already listens on', () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);
    mountBar();
    fireEvent.click(openMore().getByRole('button', { name: 'Call sheet' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:open-call-sheet', opened);
  });

  // The `call-sheet` flag is retired (rulings §6): the row is always there,
  // and the case that asserted its absence with the flag off is gone with it.

  it('prints no document group off a document', () => {
    mockPathname = '/desk';
    mountBar({ doc: null });
    const menu = openMore();
    expect(menu.queryByRole('group', { name: 'In this document' })).toBeNull();
    expect(menu.getByText('Find anything')).toBeInTheDocument();
  });
});

describe('the Margin door (D-B30)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('leads "In this document" with "Margin · N" from activeDoc.marginCount, above Plan room', () => {
    mountBar({ doc: { ...heldDocument, marginCount: 3 } });
    const menu = openMore();
    const group = menu.getByRole('group', { name: 'In this document' });
    const labels = Array.from(group.querySelectorAll('a, button')).map((row) =>
      row.textContent?.replace('→', ''),
    );
    expect(labels[0]).toBe('Margin · 3');
    expect(labels.indexOf('Margin · 3')).toBeLessThan(labels.indexOf('Plan room'));
  });

  it('stands even off a project — margin items are not project-keyed like the four doors', () => {
    mountBar({
      doc: { ...heldDocument, projectId: null, marginCount: 1 },
    });
    const menu = openMore();
    expect(menu.getByRole('button', { name: 'Margin · 1' })).toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Plan room' })).toBeNull();
  });

  it('is absent when marginCount is unknown (null) — never printed as "Margin · null"', () => {
    mountBar({ doc: { ...heldDocument, marginCount: null } });
    const menu = openMore();
    expect(menu.queryByText(/^Margin ·/)).toBeNull();
  });

  it('is never a fourth bar item — it lives only inside More, not in the visible bar', () => {
    mountBar({ doc: { ...heldDocument, marginCount: 5 } });
    const bar = screen.getByTestId('mobile-bar');
    expect(within(bar).queryByText(/^Margin ·/)).toBeNull();
  });
});

describe('the More menu · Find anything ⌘K (F49 blocker)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('is a 44px menu row, not a fourth target on the bar', () => {
    mountBar();
    const bar = screen.getByTestId('mobile-bar');
    expect(within(bar).queryByText('Find anything')).toBeNull();

    const row = openMore()
      .getByText('Find anything')
      .closest('button') as HTMLButtonElement;
    expect(row).toHaveAttribute('data-mobile-find-anything');
    expect(row).toHaveClass('min-h-11');
    expect(row.textContent).toBe('Find anything⌘K');
  });

  it('opens the register and closes the menu', () => {
    const opened = jest.fn();
    window.addEventListener('document:open-command-bar', opened);
    mountBar();
    fireEvent.click(
      openMore().getByText('Find anything').closest('button') as HTMLElement,
    );
    expect(opened).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('group', { name: 'More studio actions' }),
    ).toBeNull();
    window.removeEventListener('document:open-command-bar', opened);
  });
});

describe('the More menu · Ledgers (C20)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('calls the books Ledgers, as the drawer and the Desk do', () => {
    mountBar();
    const menu = openMore();
    expect(menu.getByText('Ledgers')).toBeInTheDocument();
    expect(menu.queryByText('Studio books')).toBeNull();
  });
});

describe('the elected act at 390', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  // OD-11 / DL-05 — the guide and the red letter no longer register here: the
  // band's line 2 is the one printing of those acts at every width. The slot
  // itself is a studio-wide contract and stays, held by the lifecycle
  // registrants (priority 10), which is the act this case now elects.
  it('prints in full — the label wraps, it never truncates', () => {
    mountBar({
      action: {
        actionKey: 'mark-proposal-signed',
        surfaceKey: 'open-document',
        regionKey: 'proposal-watch-actions',
        label: 'Mark the Okonkwo agreement signed',
        target: { kind: 'press', onPress: jest.fn() },
      },
    });

    const act = screen.getByRole('button', {
      name: 'Mark the Okonkwo agreement signed',
    });
    expect(act.className).toContain('[&_.da-label]:whitespace-normal');
    expect(act.className).not.toContain('truncate');
    expect(act.className).not.toContain('max-w-[9rem]');
    expect(act.querySelector('.da-label')?.textContent).toBe(
      'Mark the Okonkwo agreement signed',
    );
  });
});

// D5 (VISION.md:50) — the centre slot's dwell-timer fallback ("Today" /
// "In hand" + elapsed, or "Hands free") is gone. A timer that watches her is
// not a tool; the "Time in hand … review or adjust" row in More stays,
// because that one she opens.
describe('the centre slot with no primary action (D5, VISION.md:50)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('renders nothing — no dwell timer, no "Today", no "Hands free", no elapsed string', () => {
    mountBar();

    const bar = screen.getByTestId('mobile-bar');
    expect(within(bar).queryByText('Today')).toBeNull();
    expect(within(bar).queryByText('In hand')).toBeNull();
    expect(within(bar).queryByText('Hands free')).toBeNull();
    expect(within(bar).queryByText(/^\d+:\d{2}$/)).toBeNull();
    expect(within(bar).queryByText(/^\d+\s*min$/)).toBeNull();
  });

  it('leaves the rest of the bar unchanged when a primary action IS registered', () => {
    mountBar({
      action: {
        actionKey: 'mark-proposal-signed',
        surfaceKey: 'open-document',
        regionKey: 'proposal-watch-actions',
        label: 'Mark the Okonkwo agreement signed',
        target: { kind: 'press', onPress: jest.fn() },
      },
    });

    const bar = screen.getByTestId('mobile-bar');
    expect(
      within(bar).getByRole('button', { name: 'Mark the Okonkwo agreement signed' }),
    ).toBeInTheDocument();
    expect(within(bar).queryByText('Today')).toBeNull();
    expect(within(bar).queryByText('Hands free')).toBeNull();
  });

  it('the More row still renders "Time in hand … review or adjust" — that timer stays, she opens it', () => {
    mountBar();
    const menu = openMore();
    expect(
      menu.getByText(/review or adjust/),
    ).toBeInTheDocument();
    expect(menu.getByText('Time in hand')).toBeInTheDocument();
  });
});

describe('the left zone · household and the current stop (OD-11, A-08)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('prints the household, not the active section, on the second line', () => {
    mountBar();
    const doorway = screen.getByRole('button', { name: 'Open sections' });
    expect(within(doorway).getByText('Vandersteen')).toBeInTheDocument();
    expect(within(doorway).queryByText('Project')).toBeNull();
  });

  it('falls back to the document title when there is no household name', () => {
    mountBar({ doc: { ...heldDocument, clientName: '' } });
    const doorway = screen.getByRole('button', { name: 'Open sections' });
    expect(
      within(doorway).getByText('Vandersteen residence'),
    ).toBeInTheDocument();
  });

  it('omits the third line and reads "Open sections" with no reading index', () => {
    mountBar();
    const bar = screen.getByTestId('mobile-bar');
    expect(bar).toHaveAttribute('data-reading-index', '');
    expect(screen.queryByText(/^At /)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open sections' }),
    ).toBeInTheDocument();
  });

  it('prints "At <stop>" and publishes data-reading-index once a stop is held', () => {
    mountBar({ doc: { ...heldDocument, readingIndex: 'ffe' } });
    const bar = screen.getByTestId('mobile-bar');
    expect(bar).toHaveAttribute('data-reading-index', 'ffe');
    expect(screen.getByText('At Pieces')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open sections, at Pieces' }),
    ).toBeInTheDocument();
  });

  it('names every stop with the running index labels (one-voice off)', () => {
    // Under `one-voice` the approvals stop takes D7's short place word; that
    // case is pinned in the FR2 block below.
    mockCallSheetOn = false;
    (
      [
        ['approvals', 'At Client approvals', 'Open sections, at Client approvals'],
        ['schedule', 'At Schedule', 'Open sections, at Schedule'],
        ['money', 'At Money', 'Open sections, at Money'],
      ] as const
    ).forEach(([readingIndex, line, ariaLabel]) => {
      const { unmount } = mountBar({
        doc: { ...heldDocument, readingIndex },
      });
      expect(screen.getByText(line)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: ariaLabel }),
      ).toBeInTheDocument();
      unmount();
    });
  });
});

function mountBarAndSheets({
  doc = heldDocument,
  ladderValues,
}: {
  doc?: MobileActiveDoc | null;
  ladderValues?: Record<string, string>;
} = {}) {
  return render(
    <TestProviders>
      <HoldDocument doc={doc} />
      <MobileBar />
      <MobileSheets ladderValues={ladderValues} />
    </TestProviders>,
  );
}

function openSections() {
  fireEvent.click(screen.getByRole('button', { name: /^Open sections/ }));
}

function sectionsPanel() {
  const dialog = screen.getByRole('dialog', {
    name: 'Sections of this document',
  });
  return dialog.querySelector('[data-mobile-sheet-panel]') as HTMLElement;
}

describe('the sections sheet · the ladder for the open spread (W2, OD-14, reconciliation §13)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
    mockRouterPush.mockClear();
    // MobileSheets closes itself above 1179px (every kind but the timer) — a
    // regime effect this suite's phone-viewport tests all sit below.
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('names itself "Sections of this document" — every sheet kind carries an accessible name', () => {
    mountBarAndSheets();
    openSections();
    expect(
      screen.getByRole('dialog', { name: 'Sections of this document' }),
    ).toBeInTheDocument();
  });

  it('prints Put down first, then one row per ladder stop of the open spread, each min-h-11', () => {
    mountBarAndSheets();
    openSections();
    const panel = sectionsPanel();
    const rows = within(panel).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Put down');
    expect(rows[0]).toHaveClass('min-h-11');

    [
      'Client approvals',
      'Schedule',
      'Pieces',
      'Money',
      'Closing the book',
      'The record',
    ].forEach((label) => {
      const row = within(panel).getByRole('button', { name: label });
      expect(row).toHaveClass('min-h-11');
    });
  });

  it('prints the ladder value when integration hands one, the name alone when not', () => {
    mountBarAndSheets({ ladderValues: { ffe: '36 lines · 1 damaged' } });
    openSections();
    const panel = sectionsPanel();
    const piecesRow = within(panel).getByRole('button', { name: /Pieces/ });
    expect(within(piecesRow).getByText('36 lines · 1 damaged')).toBeInTheDocument();

    const scheduleRow = within(panel).getByRole('button', { name: 'Schedule' });
    expect(scheduleRow).toHaveTextContent('Schedule');
  });

  it('marks the reading stop aria-current, and no other stop', () => {
    mountBarAndSheets({ doc: { ...heldDocument, readingIndex: 'money' } });
    openSections();
    const panel = sectionsPanel();
    expect(
      within(panel).getByRole('button', { name: 'Money' }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      within(panel).getByRole('button', { name: 'Schedule' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('prints the four project doors under "Filed with this job", routing each', () => {
    mountBarAndSheets();
    openSections();
    const panel = sectionsPanel();
    expect(within(panel).getByText('Filed with this job')).toBeInTheDocument();
    // D-B8/F62 — one name for one thing: the sheet's third door says `Boards`.
    ['Plan room', 'Spec book', 'Boards', 'Call sheet'].forEach((label) => {
      expect(
        within(panel).getByRole('button', { name: label }),
      ).toHaveClass('min-h-11');
    });

    fireEvent.click(within(panel).getByRole('button', { name: 'Plan room' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/doc/proj-1/plans');
  });

  // W7-R1 §3 — the SAME glyphs the rail's doors carry, on the same rows. The
  // Margin row and the stop rows are not doors and get none.
  it('gives each door row the rail’s own glyph, and no other row one (W7-R1 §3)', () => {
    mountBarAndSheets();
    openSections();
    const panel = sectionsPanel();
    for (const label of ['Plan room', 'Spec book', 'Boards', 'Call sheet']) {
      const row = within(panel).getByRole('button', { name: label });
      const svg = row.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('width', '14');
      expect(svg).toHaveAttribute('stroke-width', '1.5');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(row).toHaveClass('gap-[8px]', 'min-h-11');
      // The word is still the label; the icon adds nothing to it.
      expect(row).toHaveAccessibleName(label);
    }
    // A stop row is not a door.
    const stop = within(panel).getByRole('button', { name: /^Pieces/ });
    expect(stop.querySelector('svg')).toBeNull();
  });

  it('routes Spec book and Boards at this project', () => {
    const first = mountBarAndSheets();
    openSections();
    fireEvent.click(
      within(sectionsPanel()).getByRole('button', { name: 'Spec book' }),
    );
    expect(mockRouterPush).toHaveBeenCalledWith('/doc/proj-1/spec-book');
    first.unmount();

    mockRouterPush.mockClear();
    mountBarAndSheets();
    openSections();
    fireEvent.click(
      within(sectionsPanel()).getByRole('button', { name: 'Boards' }),
    );
    expect(mockRouterPush).toHaveBeenCalledWith('/doc/proj-1/boards');
  });

  it('opens the call sheet through the doorway the surface already listens on', () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);
    mountBarAndSheets();
    openSections();
    fireEvent.click(
      within(sectionsPanel()).getByRole('button', { name: 'Call sheet' }),
    );
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:open-call-sheet', opened);
  });

  // Flag retired (rulings §6) — the door stands for every studio.

  it('prints no ladder and no doors off a project (OD-8: nothing to open)', () => {
    mountBarAndSheets({
      doc: { ...heldDocument, projectId: null, sections: [] },
    });
    openSections();
    const panel = sectionsPanel();
    expect(within(panel).queryByText('Filed with this job')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Pieces/ })).toBeNull();
    // Put down still prints — putting the document down never depends on a
    // project being behind it.
    expect(within(panel).getByText('Put down', { exact: false })).toBeInTheDocument();
  });
});

describe('the bar publishes its own height (D-B47)', () => {
  const HTML_VAR = '--doc-mobile-bar-height';
  let rect: jest.SpyInstance;

  function barHeight(height: number) {
    rect = jest
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height, top: 0, bottom: height } as DOMRect);
  }

  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    document.documentElement.style.removeProperty(HTML_VAR);
  });

  afterEach(() => {
    rect?.mockRestore();
    document.documentElement.style.removeProperty(HTML_VAR);
  });

  function published() {
    return document.documentElement.style.getPropertyValue(HTML_VAR);
  }

  it('writes its measured box on mount — the paper insets by what is actually there', () => {
    // The lead measured 93px at 390: three lines in the left zone and an act
    // whose label wraps to two by ruling.
    barHeight(93);
    mountBar();
    expect(published()).toBe('93px');
  });

  it('never publishes under the 72px reserve the paper was written against', () => {
    barHeight(40);
    mountBar();
    expect(published()).toBe('72px');
  });

  it('publishes nothing where the bar is not laid out — the desktop inset is untouched', () => {
    // `min-[1180px]:hidden` at 1440, or the log offer owning the edge: no box,
    // no claim on the paper's foot.
    barHeight(0);
    mountBar();
    expect(published()).toBe('');
  });

  it('takes the property back with it on unmount', () => {
    barHeight(93);
    const { unmount } = mountBar();
    expect(published()).toBe('93px');
    unmount();
    expect(published()).toBe('');
  });
});

/**
 * D-B54 — who owns the thumb edge.
 *
 * Kody saw NO navigation at all on prod at 390: opening a document while a
 * timer ran on another project chained that timer out into a log offer, the
 * bar yielded the edge on a bare `offer`, and `LogStrip` refused to paint an
 * offer belonging to a different project — both returned null and the phone
 * had no bottom chrome. The two components now read ONE boolean the provider
 * derives, so they cannot answer the question differently.
 */
describe('the thumb edge’s one owner (D-B54)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
    mockOffer = null;
    mockHeldProjectId = null;
  });

  afterEach(() => {
    mockOffer = null;
    mockHeldProjectId = null;
  });

  it('RENDERS the bar while a CROSS-PROJECT offer stands — the strip will not paint it', () => {
    // Kody's screen, stated in the two raw facts the provider reasons over: a
    // chained-out timer on project A while document B is in hand. `LogStrip`
    // refuses this offer, so a bar that yielded to it would leave the phone
    // with no bottom chrome at all.
    mockOffer = { entryId: 'entry-a', projectId: 'project-a' };
    mockHeldProjectId = 'project-b';
    mountBar();
    expect(screen.getByTestId('mobile-bar')).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-mobile-edge-owner]'),
    ).toHaveLength(1);
  });

  it('yields the edge to an offer on the project IN HAND — the strip is about to paint it', () => {
    mockOffer = { entryId: 'entry-a', projectId: 'project-a' };
    mockHeldProjectId = 'project-a';
    mountBar();
    expect(screen.queryByTestId('mobile-bar')).toBeNull();
    expect(document.querySelectorAll('[data-mobile-edge-owner]')).toHaveLength(
      0,
    );
  });

  it('yields the edge to an offer with NOTHING held — the Desk, where it resurfaces', () => {
    mockOffer = { entryId: 'entry-a', projectId: 'project-a' };
    mockHeldProjectId = null;
    mountBar();
    expect(screen.queryByTestId('mobile-bar')).toBeNull();
  });
});

/**
 * US-19 D7 — the dock as the Document publishes it under `one-voice`: Next at
 * the top priority in the centre, the ruled acts leading More in their order,
 * and Message held there (D3) when no client is linked.
 */
describe('the dock · Next centre and More order (US-19 D7)', () => {
  function Secondary({ action }: { action: MobileSecondaryAction }) {
    useMobileSecondaryAction(action);
    return null;
  }
  function Primary({
    action,
    priority,
  }: {
    action: MobilePrimaryAction;
    priority: number;
  }) {
    useMobilePrimaryAction(action, { priority });
    return null;
  }
  const press = (label: string, actionKey = label): MobilePrimaryAction => ({
    actionKey,
    surfaceKey: 'open-document',
    regionKey: 'test',
    label,
    target: { kind: 'press', onPress: jest.fn() },
  });
  const repair = jest.fn();
  const RULED: MobileSecondaryAction[] = [
    {
      actionKey: 'message-family',
      label: 'Message the client',
      onPress: jest.fn(),
      held: { reason: 'Link a client first.', repair: { label: 'Link a client', onPress: repair } },
    },
    { actionKey: 'preview-as-client', label: "Preview the client's copy", onPress: jest.fn() },
    { actionKey: 'sharing-settings', label: 'Sharing', onPress: jest.fn() },
    { actionKey: 'open-call-sheet', label: 'Call sheet', onPress: jest.fn() },
    { actionKey: 'set-dates', label: 'Set dates', onPress: jest.fn() },
    { actionKey: 'set-budget-band', label: 'Set a budget band', onPress: jest.fn() },
    { actionKey: 'keys', label: 'Keys', onPress: jest.fn() },
  ].map((act, order) => ({ ...act, order }));

  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
    mockOffer = null;
    mockHeldProjectId = null;
    repair.mockClear();
  });

  function mountDock() {
    return render(
      <TestProviders>
        <HoldDocument doc={heldDocument} />
        <Primary action={press('Open the project')} priority={MOBILE_ACTION_PRIORITY.lifecycle} />
        <Primary action={press('Record the payment', 'next:pay')} priority={MOBILE_ACTION_PRIORITY.next} />
        {/* Registered out of order: the bar orders by the act's place. */}
        {[...RULED].reverse().map((act) => (
          <Secondary key={act.actionKey} action={act} />
        ))}
        <MobileBar />
      </TestProviders>,
    );
  }

  it('the centre is the act at the top priority, above a lifecycle act', () => {
    mountDock();
    const bar = screen.getByTestId('mobile-bar');
    expect(within(bar).getByRole('button', { name: 'Record the payment' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Open the project' })).toBeNull();
  });

  it('leads More with the ruled acts, in order, and keeps one Call sheet door', () => {
    mountDock();
    const menu = openMore();
    const rows = menu
      .getAllByRole('button')
      .map((button) => button.textContent?.replace(/[→↗]/g, '').trim());
    expect(rows.slice(0, 8)).toEqual([
      'Message the client',
      'Link a client',
      "Preview the client's copy",
      'Sharing',
      'Call sheet',
      'Set dates',
      'Set a budget band',
      'Keys',
    ]);
    expect(rows.filter((row) => row?.includes('Call sheet'))).toHaveLength(1);
  });

  it('holds Message: aria-disabled, its reason beneath, the repair beside it', () => {
    mountDock();
    const menu = openMore();
    const message = menu.getByRole('button', { name: 'Message the client' });
    expect(message).toHaveAttribute('aria-disabled', 'true');
    expect(message).not.toHaveAttribute('disabled');
    expect(message).toHaveFocus();
    const reason = document.getElementById(message.getAttribute('aria-describedby')!);
    expect(reason).toHaveTextContent('Link a client first.');

    fireEvent.click(message);
    expect(RULED[0].onPress).not.toHaveBeenCalled();

    fireEvent.click(menu.getByRole('button', { name: 'Link a client' }));
    expect(repair).toHaveBeenCalledTimes(1);
  });

  // US-19 FR3 F3-6 — a linked household with no login: More reads what the
  // letterhead reads, the login as the reason and `Invite {first}` the repair.
  it('reads a no-login hold as the letterhead does: `Elena has no login yet.` · `Invite Elena`', () => {
    const invite = jest.fn();
    render(
      <TestProviders>
        <HoldDocument doc={heldDocument} />
        <Secondary
          action={{
            actionKey: 'message-family',
            label: 'Message Elena',
            order: 0,
            onPress: jest.fn(),
            held: {
              reason: 'Elena has no login yet.',
              repair: { label: 'Invite Elena', onPress: invite },
            },
          }}
        />
        <Secondary action={{ actionKey: 'keys', label: 'Keys', order: 1, onPress: jest.fn() }} />
        <MobileBar />
      </TestProviders>,
    );
    const menu = openMore();
    const message = menu.getByRole('button', { name: 'Message Elena' });
    expect(message).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById(message.getAttribute('aria-describedby')!)).toHaveTextContent(
      /^Elena has no login yet\.$/,
    );
    expect(menu.queryByText('Link a client first.')).toBeNull();
    fireEvent.click(menu.getByRole('button', { name: 'Invite Elena' }));
    expect(invite).toHaveBeenCalledTimes(1);
  });
});

/**
 * US-19 FR2 (`one-voice`) — the phone's More and its left zone, as design
 * review 2 found them at 390: F2-5 (More ran 949px tall at top −221 with
 * `overflow: hidden`, so its first four rows were unreachable), F2-8 (the Esc
 * that put More back also put the paper down to the Desk), F2-15 (the
 * no-login suffix and `AT CLIENT APPROVALS` in the dock).
 */
describe('the phone at 390 under one-voice (FR2 F2-5, F2-8, F2-15)', () => {
  function Secondary({ action }: { action: MobileSecondaryAction }) {
    useMobileSecondaryAction(action);
    return null;
  }

  /** The band's door, moved into More by the 390 measure (D2), opening the
   *  real standing sheet the way `OPEN_STANDING_SHEET_EVENT` does. */
  function StandingDoor() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Secondary
          action={{
            actionKey: 'standing',
            label: 'Standing · 2',
            order: 0,
            onPress: () => setOpen(true),
          }}
        />
        <StandingSheet open={open} onClose={() => setOpen(false)} items={[]} grouped />
      </>
    );
  }

  const RULED_ROWS: MobileSecondaryAction[] = [
    { actionKey: 'preview-as-client', label: "Preview the client's copy", onPress: jest.fn() },
    { actionKey: 'keys', label: 'Keys', onPress: jest.fn() },
  ].map((act, order) => ({ ...act, order: order + 1 }));

  /** The paper's own Esc (page.tsx): a bare Esc puts the paper down. */
  const putDown = jest.fn();
  const paperEsc = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (document.querySelector('[role="dialog"]')) return;
    putDown();
  };

  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
    mockOffer = null;
    mockHeldProjectId = null;
    putDown.mockClear();
    document.addEventListener('keydown', paperEsc);
  });
  afterEach(() => {
    document.removeEventListener('keydown', paperEsc);
  });

  function mountPhone(doc: MobileActiveDoc = heldDocument) {
    return render(
      <TestProviders>
        <HoldDocument doc={doc} />
        <StandingDoor />
        {RULED_ROWS.map((act) => (
          <Secondary key={act.actionKey} action={act} />
        ))}
        <MobileBar />
      </TestProviders>,
    );
  }

  it('F2-5: More is a scroll container no taller than the viewport above the dock', () => {
    mountPhone();
    openMore();
    const menu = screen.getByRole('group', { name: 'More studio actions' });
    expect(menu).toHaveAttribute('data-mobile-more-scroll');
    expect(menu).toHaveClass(
      'max-h-[calc(100dvh_-_var(--doc-mobile-bar-height,72px)_-_16px)]',
    );
    expect(menu).toHaveClass('overflow-y-auto');
    expect(menu).not.toHaveClass('overflow-hidden');
  });

  it('F2-5: More opens on its first row, scrolled to the top, every time', () => {
    mountPhone();
    openMore();
    let menu = screen.getByRole('group', { name: 'More studio actions' });
    const first = within(menu).getByRole('button', { name: 'Standing · 2' });
    expect(first).toHaveFocus();
    expect(menu.scrollTop).toBe(0);

    // Scrolled down and put back, it reopens on the first row again.
    menu.scrollTop = 400;
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    openMore();
    menu = screen.getByRole('group', { name: 'More studio actions' });
    expect(menu.scrollTop).toBe(0);
    expect(within(menu).getByRole('button', { name: 'Standing · 2' })).toHaveFocus();
  });

  it('flag off: More keeps today’s box', () => {
    mockCallSheetOn = false;
    mountPhone();
    openMore();
    const menu = screen.getByRole('group', { name: 'More studio actions' });
    expect(menu).toHaveClass('overflow-hidden');
    expect(menu).not.toHaveAttribute('data-mobile-more-scroll');
  });

  it('F2-8: the Esc that puts More back is More’s alone — the paper stays up', () => {
    mountPhone();
    openMore();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'More studio actions' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More studio actions' })).toHaveFocus();
    expect(putDown).not.toHaveBeenCalled();
  });

  it('F2-8: Esc from the standing sheet returns to More’s door, never to the Desk', async () => {
    mountPhone();
    fireEvent.click(openMore().getByRole('button', { name: 'Standing · 2' }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('Standing · 0');

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'More studio actions' })).toHaveFocus(),
    );
    expect(putDown).not.toHaveBeenCalled();
  });

  it('F2-15: the dock never prints the no-login suffix', () => {
    mountPhone({ ...heldDocument, clientName: 'Elena Marlowe (no-login household)' });
    const doorway = screen.getByRole('button', { name: 'Open sections' });
    expect(within(doorway).getByText('Elena Marlowe')).toBeInTheDocument();
    expect(doorway.textContent).not.toMatch(/no-login/);
  });

  // FR6 F6-7 (D14) supersedes FR4 Fix 2's `the client`: a client-less paper
  // names no household, and the left prints the place word alone.
  it.each([
    ['the seed’s `Client User`', 'Client User'],
    ['Halloran: document_state’s `Client` fallback', 'Client'],
  ])('F6-7: %s prints no household; the left reads `At approvals`', (_case, clientName) => {
    mountPhone({ ...heldDocument, title: 'Halloran House', clientName, readingIndex: 'approvals' });
    const doorway = screen.getByRole('button', { name: 'Open sections, at Client approvals' });
    expect(doorway.textContent).toBe('In this documentAt approvals');
    expect(doorway.textContent).not.toMatch(/the client|Client User|Halloran/);
  });

  it('FR4 Fix 2: a real household prints whole', () => {
    mountPhone({ ...heldDocument, clientName: 'The Ashfords (no-login household)' });
    const doorway = screen.getByRole('button', { name: 'Open sections' });
    expect(within(doorway).getByText('The Ashfords')).toBeInTheDocument();
  });

  it('F2-15: the approvals stop reads `At approvals`; the door keeps its full name', () => {
    mountPhone({ ...heldDocument, readingIndex: 'approvals' });
    expect(screen.getByText('At approvals')).toBeInTheDocument();
    expect(screen.queryByText('At Client approvals')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open sections, at Client approvals' }),
    ).toBeInTheDocument();
  });

  it('F2-15 flag off: the left zone is unchanged', () => {
    mockCallSheetOn = false;
    mountPhone({
      ...heldDocument,
      clientName: 'Elena Marlowe (no-login household)',
      readingIndex: 'approvals',
    });
    expect(screen.getByText('Elena Marlowe (no-login household)')).toBeInTheDocument();
    expect(screen.getByText('At Client approvals')).toBeInTheDocument();
  });
});
