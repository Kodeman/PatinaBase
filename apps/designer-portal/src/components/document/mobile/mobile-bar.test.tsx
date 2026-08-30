import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileBar } from './mobile-bar';
import { MobileSheets } from './mobile-sheets';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  useMobilePrimaryAction,
  type MobileActiveDoc,
  type MobilePrimaryAction,
} from './mobile-shell';

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

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    inHandToday: 0,
    running: false,
    paused: false,
    elapsedSeconds: 0,
    offer: null,
  }),
}));

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: [] }),
}));

jest.mock('../overlays/post-sheet', () => ({
  openPost: jest.fn(),
}));

jest.mock('../feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
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

  it('drops the call sheet row when its flag is off', () => {
    mockCallSheetOn = false;
    mountBar();
    const menu = openMore();
    expect(menu.queryByRole('button', { name: 'Call sheet' })).toBeNull();
    expect(menu.getByRole('link', { name: 'Plan room' })).toBeInTheDocument();
  });

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

  it('names every stop with the running index labels', () => {
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

  it('drops the call sheet door when its flag is off, keeping the other three', () => {
    mockCallSheetOn = false;
    mountBarAndSheets();
    openSections();
    const panel = sectionsPanel();
    expect(within(panel).queryByRole('button', { name: 'Call sheet' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Plan room' })).toBeInTheDocument();
  });

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
