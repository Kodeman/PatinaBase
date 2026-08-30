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

import { fireEvent, render, screen } from '@testing-library/react';
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
jest.mock('@patina/supabase', () => ({
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
