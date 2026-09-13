/**
 * The sections sheet's press, at 390 — the one region jump that did not go
 * through the page's handler.
 *
 * D-B18 fixes the landing order for every region press: unfold, force every
 * region from the top of the paper through the target to full in one flushed
 * commit, THEN scroll, so the y the scroll reads is the y it lands on. The
 * ladder and the band both route through the page's `jumpToRegion`; this sheet
 * mounts in `(document)/layout.tsx`, above the page, and was still calling
 * `requestRegionUnfold` + `scrollToRegion` itself — a press that scrolled to a
 * stop the lens had never been asked to promote.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileSheets } from '../mobile/mobile-sheets';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  useMobileShell,
  type MobileActiveDoc,
} from '../mobile/mobile-shell';

/** W5-R4(a) — `MobileSheets` hosts the margin's note composer now. */
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


jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/proj-1',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockCaptureProjects: Array<{ id: string; name: string; status: string }> = [
  { id: 'project-1', name: 'Whitfield House', status: 'active' },
  { id: 'project-2', name: 'Ashford Heights', status: 'active' },
];
let mockMyRateRoles: string[] = ['lead_designer'];

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => ({ data: null, isLoading: false }),
  commercialDocumentKeys: { authority: (id: string) => ['project-authority', id] },
  fetchProjectBillingAuthority: jest.fn().mockResolvedValue(null),
}));

jest.mock('@patina/supabase', () => ({
  // W3 (HT-14) — the timer sheet's project picker when nothing is held, and
  // HT-41's role chip. Both read through @patina/supabase.
  useTimeCaptureProjects: () => ({ data: mockCaptureProjects }),
  useMyRateRoles: () => ({ data: mockMyRateRoles }),
  useSendDecisionReminder: () => ({ mutate: jest.fn(), isPending: false }),
  useCoordinationItems: () => ({ data: [] }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  // W5-L3: `useMarginSheet` (mobile-sheets.tsx) reads the FF&E lines to name
  // a line-anchored margin row's own line.
  useProjectFFEItems: () => ({ data: [] }),
  isProjectArtifactApproval: () => false,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true }),
}));

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: [] }),
}));

const mockManualLog = jest.fn();
let mockHeldProjectId: string | null = null;
jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    heldProjectId: mockHeldProjectId,
    inHandToday: 0,
    running: false,
    paused: false,
    elapsedSeconds: 0,
    offer: null,
    pause: jest.fn(),
    resume: jest.fn(),
    manualLog: mockManualLog,
  }),
}));

jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('../account/mobile-account-header', () => ({
  MobileAccountHeader: () => null,
}));
jest.mock('../account/account-sheet', () => ({ openAccount: jest.fn() }));
jest.mock('../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../margin-bodies', () => ({ MarginItemBody: () => null }));

const mockRequestRegionUnfold = jest.fn();
const mockScrollToRegion = jest.fn();

jest.mock('@/lib/document/document-index', () => ({
  ...jest.requireActual('@/lib/document/document-index'),
  requestRegionUnfold: (...args: unknown[]) => mockRequestRegionUnfold(...args),
}));

jest.mock('@/hooks/use-document-running-index', () => ({
  scrollToRegion: (...args: unknown[]) => mockScrollToRegion(...args),
}));

const heldDocument: MobileActiveDoc = {
  projectId: 'proj-1',
  proposalId: null,
  clientName: 'Vandersteen',
  title: 'Vandersteen residence',
  sections: [
    { key: 'project', label: 'Project', state: 'active', sub: 'In the project' },
  ],
  // Required since W4: an optional handler made a press a silent no-op where
  // the pre-D-B18 code at least scrolled.
  onJumpRegion: () => {},
};

function HoldDocument({ doc }: { doc: MobileActiveDoc }) {
  useMobileActiveDoc(doc);
  return null;
}

function Opener() {
  const { openSpine } = useMobileShell();
  return (
    <button type="button" onClick={openSpine}>
      open sections
    </button>
  );
}

function mountSheet(doc: MobileActiveDoc) {
  const view = render(
    <TestProviders>
      <HoldDocument doc={doc} />
      <Opener />
      <MobileSheets />
    </TestProviders>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'open sections' }));
  return view;
}

describe('the sections sheet · the region press (D-B18)', () => {
  beforeEach(() => {
    mockRequestRegionUnfold.mockClear();
    mockScrollToRegion.mockClear();
    // The sheet closes itself above 1179px; these are phone-viewport presses.
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

  it('routes a stop press through the page handler, so the lens promotes ahead of the landing', () => {
    const onJumpRegion = jest.fn();
    mountSheet({ ...heldDocument, onJumpRegion });

    fireEvent.click(screen.getByRole('button', { name: /pieces/i }));

    expect(onJumpRegion).toHaveBeenCalledWith('ffe');
    // The handler owns the whole order — the sheet must not run half of it
    // itself, or the scroll happens twice and the second one reads a stale y.
    expect(mockRequestRegionUnfold).not.toHaveBeenCalled();
    expect(mockScrollToRegion).not.toHaveBeenCalled();
  });

  it('never scrolls behind the page — no half of the order survives in the sheet', () => {
    // D-B18's grep: `scrollToRegion(` may be called from the page's handler and
    // defined in the running-index hook, nowhere else. The sheet routes the
    // whole press through `onJumpRegion` and runs no step of the order itself,
    // or the scroll happens twice and the second one reads a stale y.
    const onJumpRegion = jest.fn();
    mountSheet({ ...heldDocument, onJumpRegion });

    fireEvent.click(screen.getByRole('button', { name: /pieces/i }));

    expect(onJumpRegion).toHaveBeenCalledTimes(1);
    expect(mockRequestRegionUnfold).not.toHaveBeenCalled();
    expect(mockScrollToRegion).not.toHaveBeenCalled();
  });
});

/**
 * HT-14 — the phone's manual form with NOTHING in hand.
 *
 * The shipped behaviour was the worst available: the sheet is reachable
 * ungated from the mobile bar, the form accepted minutes and an activity,
 * `manualLog` early-returned on `!doc`, and the sheet CLEARED ITSELF as though
 * it had saved. The hour was simply gone. Never a silent success.
 */
describe('the mobile timer sheet with nothing held (HT-14)', () => {
  function OpenTimer() {
    const { openTimer } = useMobileShell();
    return (
      <button type="button" onClick={openTimer}>
        open timer
      </button>
    );
  }

  function mountTimer() {
    const view = render(
      <TestProviders>
        <OpenTimer />
        <MobileSheets />
      </TestProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open timer' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Log manually' }));
    return view;
  }

  beforeEach(() => {
    mockManualLog.mockReset();
    mockManualLog.mockResolvedValue({
      id: 'typed',
      project_id: 'project-2',
      duration_minutes: 20,
      billable: false,
      activity: null,
      rate_source: 'none',
      rate_role: null,
    });
    mockHeldProjectId = null;
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

  it('asks which document the hour belongs to, and refuses to save until told', () => {
    mountTimer();

    expect(screen.getByLabelText('Document')).toBeInTheDocument();
    expect(screen.getByText('Nothing in hand')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '20' } });
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeDisabled();
    expect(mockManualLog).not.toHaveBeenCalled();
  });

  it('logs against the picked document and only then clears', async () => {
    mountTimer();

    fireEvent.change(screen.getByLabelText('Document'), {
      target: { value: 'project-2' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

    await waitFor(() => expect(mockManualLog).toHaveBeenCalledTimes(1));
    expect(mockManualLog).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-2',
        minutes: 20,
        billable: false,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('Minutes')).not.toBeInTheDocument(),
    );
  });

  it('says why rather than clearing when the write is refused', async () => {
    mockManualLog.mockRejectedValue(new Error('permission denied'));
    mountTimer();

    fireEvent.change(screen.getByLabelText('Document'), {
      target: { value: 'project-2' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/);
    // The form is STILL THERE with the hour in it — nothing was cleared.
    expect(screen.getByLabelText('Minutes')).toHaveValue(20);
  });

  it('uses the held document without a picker when one IS in hand', () => {
    mockHeldProjectId = 'proj-1';
    mountTimer();

    expect(screen.queryByLabelText('Document')).not.toBeInTheDocument();
    expect(screen.getByText(/In hand/)).toBeInTheDocument();
  });
});
