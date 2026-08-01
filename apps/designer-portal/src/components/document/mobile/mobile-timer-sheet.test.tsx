import type { ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MobileShellProvider, useMobileShell } from './mobile-shell';
import { MobileSheets } from './mobile-sheets';
import { CompactSpineTimerDoorway } from '../spine-timer';

const mockPause = jest.fn();
const mockResume = jest.fn();
const mockManualLog = jest.fn().mockResolvedValue(undefined);

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
  useMarginItems: () => ({ data: [] }),
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
    <>
      <button type="button" data-studio-books-doorway>
        Studio books doorway
      </button>
      <div data-full-spine-timer>
        <button type="button" data-action-key="open-manual-time-entry">
          Full timer log
        </button>
      </div>
    </>
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

  it('opens a focus-contained, scroll-locked sheet and restores its doorway on Escape', async () => {
    render(
      <MobileShellProvider>
        <CompactSpineTimerDoorway />
        <SheetState />
        <MobileSheets />
      </MobileShellProvider>,
    );

    const doorway = screen.getByRole('button', {
      name: 'Open time controls, In hand, 1h05 elapsed',
    });
    expect(doorway).toHaveAttribute(
      'data-spine-timer-regime',
      'compact-only-1180-1439',
    );
    expect(doorway).toHaveClass(
      'hidden',
      'min-[1180px]:flex',
      'min-[1440px]:hidden',
      'min-h-11',
    );
    expect(doorway).toHaveTextContent('1h05');
    expect(screen.getByTestId('sheet-state')).toHaveTextContent('closed');

    fireEvent.click(doorway);

    expect(screen.getByTestId('sheet-state')).toHaveTextContent('timer');
    const timerSheet = screen.getByRole('dialog', { name: 'Time in hand' });
    expect(timerSheet).toHaveAttribute('id', 'mobile-timer-sheet');
    expect(timerSheet).toHaveAttribute(
      'data-mobile-sheet-regime',
      'through-1439',
    );
    expect(timerSheet).toHaveClass('min-[1440px]:hidden');
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
      <MobileShellProvider>
        <OpenDrawer />
        <MobileSheets />
      </MobileShellProvider>,
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

  it('closes a drawer when 1180px ends its regime without restoring hidden focus', async () => {
    setViewportWidth(1179);
    render(
      <MobileShellProvider>
        <OpenDrawer />
        <DesktopFocusFallbacks />
        <SheetState />
        <MobileSheets />
      </MobileShellProvider>,
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

  it('closes the compact timer at 1440px and does not resurrect it on return', async () => {
    setViewportWidth(1439);
    render(
      <MobileShellProvider>
        <CompactSpineTimerDoorway />
        <DesktopFocusFallbacks />
        <SheetState />
        <MobileSheets />
      </MobileShellProvider>,
    );

    const doorway = screen.getByRole('button', {
      name: 'Open time controls, In hand, 1h05 elapsed',
    });
    const fullTimerLog = screen.getByRole('button', {
      name: 'Full timer log',
    });
    fullTimerLog.style.display = 'none';
    doorway.focus();
    fireEvent.click(doorway);
    const timerDialog = screen.getByRole('dialog', { name: 'Time in hand' });
    await waitFor(() =>
      expect(
        timerDialog.querySelector('[data-mobile-sheet-panel]'),
      ).toHaveFocus(),
    );
    expect(document.body.style.overflow).toBe('hidden');

    doorway.style.display = 'none';
    fullTimerLog.style.display = '';
    act(() => setViewportWidth(1440));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Time in hand' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('sheet-state')).toHaveTextContent('closed');
    expect(document.body.style.overflow).toBe('');
    expect(doorway).not.toHaveFocus();
    await waitFor(() => expect(fullTimerLog).toHaveFocus());

    act(() => setViewportWidth(1439));
    expect(
      screen.queryByRole('dialog', { name: 'Time in hand' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the timer open when compact chrome gives way to the mobile edge', async () => {
    render(
      <MobileShellProvider>
        <CompactSpineTimerDoorway />
        <MobileTimerFallbackDoorway />
        <MobileSheets />
      </MobileShellProvider>,
    );

    const compactDoorway = screen.getByRole('button', {
      name: 'Open time controls, In hand, 1h05 elapsed',
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
      <MobileShellProvider>
        <CompactSpineTimerDoorway />
        <MobileTimerFallbackDoorway />
        <MobileSheets />
      </MobileShellProvider>,
    );

    const compactDoorway = screen.getByRole('button', {
      name: 'Open time controls, In hand, 1h05 elapsed',
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
      <MobileShellProvider>
        <OpenDrawer />
        <DesktopFocusFallbacks />
        <MobileSheets />
      </MobileShellProvider>,
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
      <MobileShellProvider>
        <CompactSpineTimerDoorway />
      </MobileShellProvider>,
    );

    expect(
      screen.queryByRole('button', { name: /Open time controls/i }),
    ).not.toBeInTheDocument();
  });
});
