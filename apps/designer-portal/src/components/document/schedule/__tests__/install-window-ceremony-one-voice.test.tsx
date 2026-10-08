/**
 * US-19 FR2 499-8 (11) — under `one-voice` the hold's control is the act's
 * one name, `Hold a window` (D1 own-act table), never `Hold the window`.
 * one-voice off keeps today's submit label.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';

let mockOneVoice = true;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));

const hold = jest.fn();
const confirm = jest.fn();
const release = jest.fn();

const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

type PhaseRow = {
  id: string;
  name: string;
  phase_key: string | null;
  lane: string;
  sort_order: number;
  duration_days: number | null;
  duration_weeks: number | null;
  follows_phase_id: string | null;
  anchor_date: string | null;
  start_date: string | null;
  target_end_date: string | null;
  status: string;
};

const phase = (over: Partial<PhaseRow> & { id: string }): PhaseRow => ({
  name: 'Phase',
  phase_key: null,
  lane: 'main',
  sort_order: 0,
  duration_days: 14,
  duration_weeks: null,
  follows_phase_id: null,
  anchor_date: null,
  start_date: null,
  target_end_date: null,
  status: 'pending',
  ...over,
});

// The ceremony reads the resolver and its own window row through React Query.
// These tests render without a QueryClientProvider, so both doors are stubbed.
let windowRow: Record<string, unknown> | null = null;
let phaseRows: PhaseRow[] = [];
// Both reads' gating states are fixtures too — the four-state ScheduleImpact
// exists for these, so stubbing them permanently green would test past the
// only thing it is for.
let windowPending = false;
let windowError = false;
let scheduleLoading = false;
let scheduleError = false;

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useInstallWindow: () => ({
    data: windowRow,
    isPending: windowPending,
    isError: windowError,
  }),
  useResolvedSchedule: () => ({
    phases: phaseRows,
    milestones: [],
    resolved: null,
    isLoading: scheduleLoading,
    isError: scheduleError,
  }),
  useHoldInstallWindow: () => mutation(hold),
  useConfirmInstallWindow: () => mutation(confirm),
  useReleaseInstallWindow: () => mutation(release),
}));

// The Folio is a frozen, independently-tested instrument (lane A2) — this
// suite is not the place to re-verify its own click choreography. What
// matters HERE is that the ceremony trusts the shape SET hands back rather
// than re-validating it: the mock's "Mock folio set" button hands back
// exactly `mockFolioSpan`, whatever it is, so a span the type system already
// guarantees ordered (`FolioSelection` — start<=end) reaches `hold` verbatim.
type MockSpan = { start: string; end: string };
let mockFolioSpan: MockSpan = { start: '2026-06-01', end: '2026-06-05' };

jest.mock('@/components/document/date', () => ({
  __esModule: true,
  FolioPopover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FolioCalendar: ({
    onCommit,
  }: {
    onCommit: (selection: { kind: 'span'; start: string; end: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCommit({ kind: 'span', start: mockFolioSpan.start, end: mockFolioSpan.end })
      }
    >
      Mock folio set
    </button>
  ),
  folioReadout: (
    draft: { mode: 'span'; anchor: string | null; end: string | null },
  ) => ` ${draft.anchor} — ${draft.end}`,
}));

import { InstallWindowCeremony } from '../install-window-ceremony';

const sheet = () => within(screen.getByRole('dialog'));

describe('The hold control’s name (499-8 · 11)', () => {
  beforeEach(() => {
    mockOneVoice = true;
    windowRow = null;
    phaseRows = [];
    windowPending = false;
    windowError = false;
    scheduleLoading = false;
    scheduleError = false;
  });

  it('names the sheet’s hold control Hold a window, and Hold the window prints nowhere', () => {
    render(<InstallWindowCeremony projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hold a window' }));
    expect(sheet().getByRole('button', { name: 'Hold a window' })).toBeInTheDocument();
    expect(screen.queryByText('Hold the window')).not.toBeInTheDocument();
  });

  it('keeps Hold the window with one-voice off', () => {
    mockOneVoice = false;
    render(<InstallWindowCeremony projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hold a window' }));
    expect(sheet().getByRole('button', { name: 'Hold the window' })).toBeInTheDocument();
  });
});
