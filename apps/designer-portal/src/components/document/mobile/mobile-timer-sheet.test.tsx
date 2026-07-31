import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('compact-spine timer doorway', () => {
  beforeEach(() => {
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

  it('exists only in compact-spine classes and opens the shared timer sheet', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mockPause).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '+ Log manually' }));
    expect(screen.getByLabelText('Minutes')).toHaveClass(
      'doc-type-control',
      'min-h-11',
    );
    expect(screen.getByLabelText('Activity')).toHaveClass(
      'doc-type-control',
      'min-h-11',
    );
  });

  it('keeps every non-timer sheet below 1180', () => {
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
