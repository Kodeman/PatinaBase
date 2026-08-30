import type { ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileShellProvider, useMobileShell } from './mobile-shell';
import { MobileSheets } from './mobile-sheets';
import { useDocumentTime } from '@/hooks/document-time-provider';

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


const mockPause = jest.fn();
const mockResume = jest.fn();
const mockManualLog = jest.fn().mockResolvedValue(undefined);

let mockMarginQuery: {
  data: Array<Record<string, unknown>>;
} = { data: [] };
let mockCoordinationQuery: {
  data: Array<Record<string, unknown>> | undefined;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
} = { data: [] };

let mockTimeState = {
  heldProjectId: 'project-1' as string | null,
  running: true,
  paused: false,
  elapsedSeconds: 3_900,
  pause: mockPause,
  resume: mockResume,
  manualLog: mockManualLog,
};

type TestMediaRecord = {
  query: string;
  matches: boolean;
  listeners: Set<(event: MediaQueryListEvent) => void>;
};

let testMediaRecords: TestMediaRecord[] = [];
let testViewportWidth = 1280;

function matchesViewportQuery(query: string, width: number) {
  const min = query.match(/min-width:\s*(\d+)px/);
  const max = query.match(/max-width:\s*(\d+)px/);
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
}

function installViewportMatchMedia(width: number) {
  testMediaRecords = [];
  testViewportWidth = width;
  window.matchMedia = jest.fn((query: string) => {
    const record: TestMediaRecord = {
      query,
      matches: matchesViewportQuery(query, testViewportWidth),
      listeners: new Set(),
    };
    testMediaRecords.push(record);

    return {
      get matches() {
        return record.matches;
      },
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => record.listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => record.listeners.delete(listener),
      dispatchEvent: jest.fn(() => true),
    } as unknown as MediaQueryList;
  });
}

function setViewportWidth(width: number) {
  testViewportWidth = width;
  for (const record of testMediaRecords) {
    const next = matchesViewportQuery(record.query, width);
    if (next === record.matches) continue;
    record.matches = next;
    const event = { matches: next, media: record.query } as MediaQueryListEvent;
    for (const listener of record.listeners) listener(event);
  }
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => mockMarginQuery,
}));

jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@patina/supabase', () => ({
  // W5-C2 — the Margin sheet's inline nudge.
  useSendDecisionReminder: () => ({ mutate: jest.fn(), isPending: false }),
  useCoordinationItems: () => mockCoordinationQuery,
  // The mobile spine summary counts handoffs alongside margin items (I114).
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  // W5-R1: useMarginSheet's line-label lookup — this file seeds no
  // line-anchored margin items, so an empty list is enough.
  useProjectFFEItems: () => ({ data: [] }),
  isProjectArtifactApproval: (item: { approval_contract?: string | null }) =>
    item.approval_contract === 'project_artifact_v1',
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => mockTimeState,
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

jest.mock('../document-action', () => ({
  DocumentAction: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: ReactNode;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button type="button" disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  ),
  DocumentActionRow: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

function SheetState() {
  const { sheet } = useMobileShell();
  return <output data-testid="sheet-state">{sheet?.kind ?? 'closed'}</output>;
}

function OpenDrawer() {
  const { openDrawer } = useMobileShell();
  return (
    <button type="button" onClick={openDrawer}>
      Open drawer
    </button>
  );
}

function OpenProjectSpine() {
  const { setActiveDoc, openSpine } = useMobileShell();
  return (
    <button
      type="button"
      onClick={() => {
        setActiveDoc({
          projectId: 'project-1',
          proposalId: null,
          clientName: 'Client',
          title: 'Project',
          sections: [],
        });
        openSpine();
      }}
    >
      Open project spine
    </button>
  );
}

// D-B30/W5-R1: the classification notice and the item list moved out of the
// spine sheet into the Margin sheet — this stub opens that one instead.
function OpenProjectMargin() {
  const { setActiveDoc, openMargin } = useMobileShell();
  return (
    <button
      type="button"
      onClick={() => {
        setActiveDoc({
          projectId: 'project-1',
          proposalId: null,
          clientName: 'Client',
          title: 'Project',
          sections: [],
        });
        openMargin();
      }}
    >
      Open project margin
    </button>
  );
}

// W1 — `spine-timer.tsx` and its `CompactSpineTimerDoorway` are deleted
// (OD-16). The studio drawer's `In hand today` clock is the timer's doorway at
// EVERY width now, so this stub carries that button's shipped shape — its
// `data-drawer-timer-doorway` hook and its accessible name — and the sheet's
// focus-return contract is still proved against the selector the product
// actually publishes. It is guarded on a held project, as the drawer's own
// `holding && inHandToday > 0` is.
function DrawerTimerDoorway() {
  const { openTimer } = useMobileShell();
  const { heldProjectId } = useDocumentTime();
  if (!heldProjectId) return null;
  return (
    <button
      type="button"
      data-drawer-timer-doorway
      aria-label="Open time controls, in hand 1h05"
      onClick={openTimer}
    >
      In hand today
    </button>
  );
}

function MobileTimerFallbackDoorway() {
  const { openTimer } = useMobileShell();
  return (
    <nav data-mobile-edge-owner="document-bar">
      <button
        type="button"
        aria-label="More studio actions"
        onClick={openTimer}
      >
        More
      </button>
    </nav>
  );
}

function DesktopFocusFallbacks() {
  return (
    <button type="button" data-studio-books-doorway>
      Studio books doorway
    </button>
  );
}

describe('compact-spine timer doorway', () => {
  beforeEach(() => {
    installViewportMatchMedia(1280);
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    mockPause.mockClear();
    mockResume.mockClear();
    mockManualLog.mockClear();
    mockMarginQuery = { data: [] };
    mockCoordinationQuery = { data: [] };
    mockTimeState = {
      heldProjectId: 'project-1',
      running: true,
      paused: false,
      elapsedSeconds: 3_900,
      pause: mockPause,
      resume: mockResume,
      manualLog: mockManualLog,
    };
  });

  // W1-L1 evicts the compact spine timer doorway (`spine-timer.tsx` is
  // deleted this wave); below 1180 the mobile bar owns the only timer
  // doorway — `MobileTimerFallbackDoorway` below already stands in for it
  // elsewhere in this file (see the responsive-handoff tests further down).
  it('opens a focus-contained, scroll-locked sheet from the mobile bar doorway, restoring focus on Escape, with no spine-timer regime anywhere', async () => {
    render(
      <TestProviders>
        <MobileTimerFallbackDoorway />
        <SheetState />
        <MobileSheets />
      </TestProviders>,
    );

    const doorway = screen.getByRole('button', {
      name: 'More studio actions',
    });
    expect(document.querySelector('[data-spine-timer-regime]')).toBeNull();
    expect(screen.getByTestId('sheet-state')).toHaveTextContent('closed');

    fireEvent.click(doorway);

    expect(screen.getByTestId('sheet-state')).toHaveTextContent('timer');
    const timerSheet = screen.getByRole('dialog', { name: 'Time in hand' });
    expect(timerSheet).toHaveAttribute('id', 'mobile-timer-sheet');
    expect(timerSheet).toHaveAttribute(
      'data-mobile-sheet-regime',
      'every-width',
    );
    expect(timerSheet).not.toHaveClass('min-[1440px]:hidden');
    expect(timerSheet).not.toHaveClass('min-[1180px]:hidden');
    expect(document.body.style.overflow).toBe('hidden');

    const panel = timerSheet.querySelector<HTMLElement>(
      '[data-mobile-sheet-panel]',
    );
    expect(panel).not.toBeNull();
    await waitFor(() => expect(panel).toHaveFocus());

    const pause = screen.getByRole('button', { name: 'Pause' });
    const manual = screen.getByRole('button', { name: '+ Log manually' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(pause).toHaveFocus();
    manual.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(pause).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(manual).toHaveFocus();

    fireEvent.click(pause);
    expect(mockPause).toHaveBeenCalledTimes(1);
    fireEvent.click(manual);
    expect(screen.getByLabelText('Minutes')).toHaveClass(
      'doc-type-control',
      'min-h-11',
    );
    expect(screen.getByLabelText('Activity')).toHaveClass(
      'doc-type-control',
      'min-h-11',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('sheet-state')).toHaveTextContent('closed');
    expect(
      screen.queryByRole('dialog', { name: 'Time in hand' }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(doorway).toHaveFocus());
  });

  it('keeps every non-timer sheet below 1180', () => {
    setViewportWidth(390);
    render(
      <TestProviders>
        <OpenDrawer />
        <MobileSheets />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    const drawer = screen.getByRole('dialog');
    expect(drawer).toHaveAttribute(
      'data-mobile-sheet-regime',
      'below-1180-only',
    );
    expect(drawer).toHaveClass('min-[1180px]:hidden');
    expect(drawer).not.toHaveClass('min-[1440px]:hidden');
    expect(screen.getByRole('button', { name: /Orders/i })).toHaveClass(
      'focus-visible:outline-[var(--color-clay)]',
    );
  });

  it.each([
    ['loading', { isLoading: true }, 'status'],
    ['error', { isError: true }, 'alert'],
  ] as const)(
    'withholds decision bodies and announces %s classification in the Margin sheet (D-B30/W5-R1)',
    (_state, queryState, role) => {
      setViewportWidth(320);
      mockMarginQuery = {
        data: [
          {
            kind: 'decision',
            item_id: 'stage-2',
            project_id: 'project-1',
            proposal_id: null,
            anchor_kind: 'letterhead',
            anchor_id: null,
            state: 'pending',
            title: 'Stage-2 approval',
            detail: '',
            ts: '2026-08-11T12:00:00.000Z',
            payload: {},
          },
          {
            kind: 'message',
            item_id: 'message-1',
            project_id: 'project-1',
            proposal_id: null,
            anchor_kind: 'letterhead',
            anchor_id: null,
            state: 'open',
            title: 'Client message',
            detail: '',
            ts: '2026-08-11T12:00:00.000Z',
            payload: {},
          },
        ],
      };
      mockCoordinationQuery = { data: undefined, ...queryState };

      render(
        <TestProviders>
          <OpenProjectMargin />
          <MobileSheets />
        </TestProviders>,
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Open project margin' }),
      );

      expect(screen.getByRole(role)).toBeVisible();
      expect(screen.queryByText('Stage-2 approval')).not.toBeInTheDocument();
      expect(screen.getByText('Client message')).toBeVisible();
    },
  );

  it('closes a drawer when 1180px ends its regime without restoring hidden focus', async () => {
    setViewportWidth(1179);
    render(
      <TestProviders>
        <OpenDrawer />
        <DesktopFocusFallbacks />
        <SheetState />
        <MobileSheets />
      </TestProviders>,
    );

    const opener = screen.getByRole('button', { name: 'Open drawer' });
    const desktopDoorway = screen.getByRole('button', {
      name: 'Studio books doorway',
    });
    desktopDoorway.style.display = 'none';
    opener.focus();
    fireEvent.click(opener);
    const drawer = screen.getByRole('dialog');
    await waitFor(() =>
      expect(drawer.querySelector('[data-mobile-sheet-panel]')).toHaveFocus(),
    );
    expect(document.body.style.overflow).toBe('hidden');

    opener.style.display = 'none';
    desktopDoorway.style.display = '';
    act(() => setViewportWidth(1180));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('sheet-state')).toHaveTextContent('closed');
    expect(document.body.style.overflow).toBe('');
    expect(opener).not.toHaveFocus();
    await waitFor(() => expect(desktopDoorway).toHaveFocus());

    act(() => setViewportWidth(1179));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // W1 rewrite. This case used to assert the reverse — "closes the compact
  // timer at 1440px and does not resurrect it on return" — because
  // `spine-timer.tsx` owned Pause and `+ Log` above 1439. That file is deleted
  // (OD-16) and the sheet is now the ONLY home of those two acts, opened by the
  // studio drawer's clock at every width. So the assertion inverts: crossing
  // 1440 must NOT close it, and Escape must still return focus to the doorway.
  it('keeps the timer open across 1440px — the sheet has no width regime left', async () => {
    setViewportWidth(1439);
    render(
      <TestProviders>
        <DrawerTimerDoorway />
        <DesktopFocusFallbacks />
        <SheetState />
        <MobileSheets />
      </TestProviders>,
    );

    const doorway = screen.getByRole('button', {
      name: 'Open time controls, in hand 1h05',
    });
    doorway.focus();
    fireEvent.click(doorway);
    const timerDialog = screen.getByRole('dialog', { name: 'Time in hand' });
    await waitFor(() =>
      expect(
        timerDialog.querySelector('[data-mobile-sheet-panel]'),
      ).toHaveFocus(),
    );
    expect(document.body.style.overflow).toBe('hidden');

    act(() => setViewportWidth(1440));

    expect(
      screen.getByRole('dialog', { name: 'Time in hand' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sheet-state')).toHaveTextContent('timer');
    expect(document.body.style.overflow).toBe('hidden');

    // Pause and the manual-log door are reachable at 1440 — the whole reason
    // the ceiling came off.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '+ Log manually' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Time in hand' }),
      ).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(doorway).toHaveFocus());
  });

  it('keeps the timer open when compact chrome gives way to the mobile edge', async () => {
    render(
      <TestProviders>
        <DrawerTimerDoorway />
        <MobileTimerFallbackDoorway />
        <MobileSheets />
      </TestProviders>,
    );

    const compactDoorway = screen.getByRole('button', {
      name: 'Open time controls, in hand 1h05',
    });
    const mobileMore = screen.getByRole('button', {
      name: 'More studio actions',
    });
    mobileMore.style.display = 'none';
    fireEvent.click(compactDoorway);
    const dialog = screen.getByRole('dialog', { name: 'Time in hand' });
    await waitFor(() =>
      expect(dialog.querySelector('[data-mobile-sheet-panel]')).toHaveFocus(),
    );

    compactDoorway.style.display = 'none';
    mobileMore.style.display = '';
    act(() => setViewportWidth(1179));
    expect(dialog).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(mobileMore).toHaveFocus());
  });

  it('hands a mobile-opened timer to the compact doorway after crossing 1180px', async () => {
    setViewportWidth(1179);
    render(
      <TestProviders>
        <DrawerTimerDoorway />
        <MobileTimerFallbackDoorway />
        <MobileSheets />
      </TestProviders>,
    );

    const compactDoorway = screen.getByRole('button', {
      name: 'Open time controls, in hand 1h05',
    });
    const mobileMore = screen.getByRole('button', {
      name: 'More studio actions',
    });
    compactDoorway.style.display = 'none';
    fireEvent.click(mobileMore);
    const dialog = screen.getByRole('dialog', { name: 'Time in hand' });
    await waitFor(() =>
      expect(dialog.querySelector('[data-mobile-sheet-panel]')).toHaveFocus(),
    );

    mobileMore.style.display = 'none';
    compactDoorway.style.display = '';
    act(() => setViewportWidth(1180));
    expect(dialog).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(compactDoorway).toHaveFocus());
  });

  it('does not steal focus from a replacement modal during responsive cleanup', async () => {
    setViewportWidth(1179);
    render(
      <TestProviders>
        <OpenDrawer />
        <DesktopFocusFallbacks />
        <MobileSheets />
      </TestProviders>,
    );

    const opener = screen.getByRole('button', { name: 'Open drawer' });
    const desktopDoorway = screen.getByRole('button', {
      name: 'Studio books doorway',
    });
    desktopDoorway.style.display = 'none';
    fireEvent.click(opener);
    await waitFor(() =>
      expect(
        screen.getByRole('dialog').querySelector('[data-mobile-sheet-panel]'),
      ).toHaveFocus(),
    );

    const replacement = document.createElement('div');
    replacement.setAttribute('role', 'dialog');
    replacement.setAttribute('aria-modal', 'true');
    replacement.setAttribute('tabindex', '-1');
    replacement.setAttribute('aria-label', 'Replacement sheet');
    document.body.appendChild(replacement);
    replacement.focus();

    opener.style.display = 'none';
    desktopDoorway.style.display = '';
    act(() => setViewportWidth(1180));

    await waitFor(() =>
      expect(
        document.querySelector('[data-mobile-sheet-kind="drawer"]'),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(replacement).toHaveFocus());
    expect(desktopDoorway).not.toHaveFocus();
    replacement.remove();
  });

  it('publishes no compact timer doorway without a held project', () => {
    mockTimeState = { ...mockTimeState, heldProjectId: null };
    render(
      <TestProviders>
        <DrawerTimerDoorway />
      </TestProviders>,
    );

    expect(
      screen.queryByRole('button', { name: /Open time controls/i }),
    ).not.toBeInTheDocument();
  });
});
