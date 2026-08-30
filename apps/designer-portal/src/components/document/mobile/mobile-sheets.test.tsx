import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import type { WorkflowGate } from '@/lib/document/workflow-gate';
import { MobileBar } from './mobile-bar';
import { MobileSheets } from './mobile-sheets';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  type MobileActiveDoc,
} from './mobile-shell';

let mockItems: MarginItemRow[] = [];
let mockGates: WorkflowGate[] = [];
const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/proj-1',
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
  useCoordinationItems: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
  }),
  isProjectArtifactApproval: () => false,
}));

jest.mock('@/components/document/margin-handoff-item', () => ({
  useHandoffGates: () => ({
    gates: mockGates,
    handoffsById: new Map(),
    isError: false,
  }),
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
jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: mockItems }),
}));
jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('../feedback/feedback-sheet', () => ({ openFeedbackSheet: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('../account/mobile-account-header', () => ({
  MobileAccountHeader: () => null,
}));
jest.mock('../account/account-sheet', () => ({ openAccount: jest.fn() }));
jest.mock('../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../margin-bodies', () => ({ MarginItemBody: () => null }));

const heldDocument: MobileActiveDoc = {
  projectId: 'proj-1',
  proposalId: null,
  clientName: 'Vandersteen',
  title: 'Vandersteen residence',
  sections: [
    { key: 'project', label: 'Project', state: 'active', sub: 'In the project' },
  ],
};

function row(overrides: Partial<MarginItemRow>): MarginItemRow {
  return {
    kind: 'decision',
    item_id: 'item-1',
    project_id: 'proj-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'pending',
    title: 'A decision',
    detail: '',
    ts: '2026-08-01T00:00:00Z',
    payload: {},
    ...overrides,
  };
}

function gate(overrides: Partial<WorkflowGate>): WorkflowGate {
  return {
    id: 'gate-1',
    sourceKind: 'project_approval',
    sourceId: 'src-1',
    sourceState: 'pending',
    projectId: 'proj-1',
    canonicalStageKey: null,
    lane: 'With Marta',
    studioLane: false,
    terms: 'Awaiting a pick',
    provenance: '',
    dueAt: null,
    overdue: { isOverdue: false, days: 0 },
    act: null,
    ...overrides,
  };
}

function HoldDocument({ doc }: { doc: MobileActiveDoc | null }) {
  useMobileActiveDoc(doc);
  return null;
}

function mountBarAndSheets({
  doc = heldDocument,
  marginCount = null,
}: {
  doc?: MobileActiveDoc | null;
  marginCount?: number | null;
} = {}) {
  return render(
    <MobileShellProvider>
      <HoldDocument doc={doc ? { ...doc, marginCount } : null} />
      <MobileBar />
      <MobileSheets />
    </MobileShellProvider>,
  );
}

function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));
  return within(screen.getByRole('group', { name: 'More studio actions' }));
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

function marginPanel() {
  const dialog = screen.getByRole('dialog', { name: 'The margin' });
  return dialog.querySelector('[data-mobile-sheet-panel]') as HTMLElement;
}

beforeEach(() => {
  mockItems = [];
  mockGates = [];
  mockRouterPush.mockClear();
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

describe('the Margin sheet (D-B30)', () => {
  it('the door prints "Margin · N" as the first row of More, above Plan room', () => {
    mockItems = [row({ item_id: 'a' }), row({ item_id: 'b', anchor_kind: 'section' })];
    mountBarAndSheets({ marginCount: 2 });
    const menu = openMore();
    const group = menu.getByRole('group', { name: 'In this document' });
    const labels = Array.from(group.querySelectorAll('a, button')).map((el) =>
      el.textContent?.replace('→', ''),
    );
    expect(labels[0]).toBe('Margin · 2');
    expect(labels.indexOf('Margin · 2')).toBeLessThan(labels.indexOf('Plan room'));
  });

  it('opens the Margin sheet and names itself "The margin"', () => {
    mockItems = [row({ item_id: 'a' })];
    mountBarAndSheets({ marginCount: 1 });
    fireEvent.click(openMore().getByRole('button', { name: 'Margin · 1' }));
    expect(screen.getByRole('dialog', { name: 'The margin' })).toBeInTheDocument();
  });

  it('lists every item the hook yields, each with a stamp, title, owner, and one inline act', () => {
    mockItems = [
      row({ item_id: 'a', title: 'Primary bedroom approval', state: 'overdue' }),
      row({
        item_id: 'b',
        kind: 'invoice',
        anchor_kind: 'section',
        title: 'Invoice 2026-114',
        state: 'draft',
      }),
    ];
    mountBarAndSheets({ marginCount: 2 });
    fireEvent.click(openMore().getByRole('button', { name: 'Margin · 2' }));
    const panel = marginPanel();
    const rows = panel.querySelectorAll('[data-margin-row]');
    expect(rows).toHaveLength(2);
    rows.forEach((r) => {
      expect(r.querySelector('[data-margin-row-act]')).not.toBeNull();
    });
    expect(within(panel).getByText('Primary bedroom approval')).toBeInTheDocument();
    expect(within(panel).getByText('Invoice 2026-114')).toBeInTheDocument();
    expect(within(panel).getByText('Send a nudge')).toBeInTheDocument();
    expect(within(panel).getByText('Review & send invoice')).toBeInTheDocument();
  });

  it('prints the overdue count in the head when at least one item or gate is overdue', () => {
    mockItems = [row({ item_id: 'a', state: 'overdue' })];
    mountBarAndSheets({ marginCount: 1 });
    fireEvent.click(openMore().getByRole('button', { name: 'Margin · 1' }));
    expect(within(marginPanel()).getByText('1 overdue')).toBeInTheDocument();
  });

  it('lists handoff gates as read-only rows beside the items', () => {
    mockGates = [gate({ id: 'g1', lane: 'With Marta', terms: 'Awaiting a pick' })];
    mountBarAndSheets({ marginCount: 1 });
    fireEvent.click(openMore().getByRole('button', { name: 'Margin · 1' }));
    expect(
      within(marginPanel()).getByText('With Marta · Awaiting a pick'),
    ).toBeInTheDocument();
  });

  it('tapping the row opens the margin-item sheet', () => {
    mockItems = [row({ item_id: 'a', title: 'Primary bedroom approval' })];
    mountBarAndSheets({ marginCount: 1 });
    fireEvent.click(openMore().getByRole('button', { name: 'Margin · 1' }));
    fireEvent.click(screen.getByText('Primary bedroom approval'));
    expect(screen.getByRole('dialog', { name: 'Margin item' })).toBeInTheDocument();
  });

  it('Escape returns focus to the door', async () => {
    // Selecting any More row focuses the More button before its action runs
    // (`closeThen`, mobile-bar.tsx) — the same mechanic the drawer/timer/
    // spine/margin-item sheets already rely on — so the captured focus
    // `restoreSheetFocus` restores to is that button, not the row (which
    // unmounts with the menu the moment it is chosen).
    mockItems = [row({ item_id: 'a' })];
    mountBarAndSheets({ marginCount: 1 });
    const door = openMore().getByRole('button', { name: 'Margin · 1' });
    fireEvent.click(door);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: 'The margin' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'More studio actions' }),
      ).toHaveFocus(),
    );
  });

  it('prints no door and no count off a document', () => {
    mountBarAndSheets({ doc: null });
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));
    expect(screen.queryByText(/^Margin ·/)).toBeNull();
  });
});

describe('the Sections sheet no longer carries the margin (D-B30)', () => {
  it('the spine sheet prints no "In the margin" section', () => {
    mockItems = [row({ item_id: 'a' })];
    mockGates = [gate({ id: 'g1' })];
    mountBarAndSheets({ marginCount: 2 });
    openSections();
    const panel = sectionsPanel();
    expect(within(panel).queryByText(/In the margin/)).toBeNull();
    expect(within(panel).queryByText('With Marta · Awaiting a pick')).toBeNull();
  });
});
