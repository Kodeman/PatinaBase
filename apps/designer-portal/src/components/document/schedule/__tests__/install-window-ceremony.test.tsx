import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

import {
  InstallWindowCeremony,
  installWindowFace,
} from '../install-window-ceremony';

const CHAIN: PhaseRow[] = [
  phase({ id: 'p-design', name: 'Design development', sort_order: 0 }),
  phase({
    id: 'p-install',
    name: 'Installation',
    phase_key: 'installation',
    sort_order: 1,
    duration_days: 7,
    follows_phase_id: 'p-design',
  }),
];

const ANCHORED_CHAIN: PhaseRow[] = [
  CHAIN[0],
  phase({
    id: 'p-install',
    name: 'Installation',
    phase_key: 'installation',
    sort_order: 1,
    duration_days: 7,
    follows_phase_id: 'p-design',
    anchor_date: '2026-06-01',
  }),
];

const sheet = () => within(screen.getByRole('dialog'));

/** The IMPACT block itself. It sits inside a `GatePartBlock part="impact"`
 *  that carries the group name, so it is found by its own data attribute. */
const impactBlock = (): HTMLElement => {
  const el = screen.getByRole('dialog').querySelector('[data-schedule-impact]');
  if (!el) throw new Error('no IMPACT block on this face');
  return el as HTMLElement;
};

const submitButton = (name: string) =>
  sheet().getByRole('button', { name }) as HTMLButtonElement;

describe('installWindowFace', () => {
  it('asks to hold when no window stands', () => {
    expect(installWindowFace(null)).toBe('hold');
    expect(installWindowFace(undefined)).toBe('hold');
  });

  it('asks to confirm a held window and to release a confirmed one', () => {
    expect(installWindowFace({ state: 'held' } as never)).toBe('confirm');
    expect(installWindowFace({ state: 'confirmed' } as never)).toBe('release');
  });
});

describe('InstallWindowCeremony', () => {
  beforeEach(() => {
    hold.mockReset().mockResolvedValue('window-1');
    confirm.mockReset().mockResolvedValue('window-1');
    release.mockReset().mockResolvedValue('window-1');
    windowRow = null;
    phaseRows = CHAIN;
    windowPending = false;
    windowError = false;
    scheduleLoading = false;
    scheduleError = false;
  });

  // ── HOLD ─────────────────────────────────────────────────────────────────

  it('holds a window from a date range, and states that a hold moves nothing', async () => {
    render(<InstallWindowCeremony projectId="project-1" />);
    expect(screen.getByText('No window is held.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hold a window' }));
    const face = sheet();
    expect(
      face.getByText('Which week does the install hold?'),
    ).toBeInTheDocument();
    expect(face.getByText(/Holding moves nothing/)).toBeInTheDocument();

    fireEvent.change(face.getByLabelText('The window opens'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(face.getByLabelText('The window closes'), {
      target: { value: '2026-06-05' },
    });
    fireEvent.click(face.getByRole('button', { name: 'Hold the window' }));

    await waitFor(() =>
      expect(hold).toHaveBeenCalledWith({
        projectId: 'project-1',
        startsOn: '2026-06-01',
        endsOn: '2026-06-05',
      }),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  // ── CONFIRM ──────────────────────────────────────────────────────────────

  it('confirms a held window with the computed impact', async () => {
    windowRow = {
      id: 'window-1',
      state: 'held',
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: null,
    };
    render(<InstallWindowCeremony projectId="project-1" />);
    expect(screen.getByText(/held, not committed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm the window' }));
    const face = sheet();
    expect(face.getByText('Is this window committed?')).toBeInTheDocument();
    expect(impactBlock()).toHaveAttribute('data-schedule-impact', 'computed');
    // The confirm face states ITS effect. Printing the hold face's disclaimer
    // here would be a false statement about the act being consented to.
    expect(impactBlock()).not.toHaveTextContent(/Holding moves nothing/);

    fireEvent.click(face.getByRole('button', { name: 'Confirm the window' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const passed = confirm.mock.calls[0][0];
    expect(passed.windowId).toBe('window-1');
    expect(passed.disclosedImpact).toMatchObject({
      kind: 'phase-anchor',
      anchorDate: '2026-06-01',
    });
    expect(typeof passed.disclosedImpact.sentence).toBe('string');
  });

  it('confirms with a null impact when the effect cannot be computed', async () => {
    windowRow = {
      id: 'window-1',
      state: 'held',
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: null,
    };
    phaseRows = [];
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm the window' }));
    const face = sheet();
    expect(impactBlock()).toHaveAttribute('data-schedule-impact', 'uncomputable');
    expect(impactBlock()).not.toHaveTextContent(/Holding moves nothing/);

    fireEvent.click(face.getByRole('button', { name: 'Confirm the window' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0].disclosedImpact).toBeNull();
  });

  it('releases a held window as bookkeeping, with no stated impact', async () => {
    windowRow = {
      id: 'window-1',
      state: 'held',
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: null,
    };
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm the window' }));
    fireEvent.click(
      sheet().getByRole('button', { name: 'Release this window instead' }),
    );

    await waitFor(() => expect(release).toHaveBeenCalled());
    expect(release.mock.calls[0][0].disclosedImpact).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  // ── RELEASE ──────────────────────────────────────────────────────────────

  it('releases a confirmed window with the impact of unpinning (I126)', async () => {
    windowRow = {
      id: 'window-1',
      state: 'confirmed',
      anchored: true,
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: 'p-install',
    };
    phaseRows = ANCHORED_CHAIN;
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Release the window' }));
    const face = sheet();
    expect(face.getByText('Is the window released?')).toBeInTheDocument();

    const impact = impactBlock();
    expect(impact).toHaveAttribute('data-schedule-impact', 'computed');
    expect(impact).toHaveTextContent(/Removing the anchor returns Installation/);

    fireEvent.change(face.getByLabelText('Why the window is released'), {
      target: { value: 'The crew moved' },
    });
    fireEvent.click(face.getByRole('button', { name: 'Release the window' }));

    await waitFor(() => expect(release).toHaveBeenCalled());
    const passed = release.mock.calls[0][0];
    expect(passed).toMatchObject({
      windowId: 'window-1',
      reason: 'The crew moved',
    });
    expect(passed.disclosedImpact).toMatchObject({
      kind: 'phase-anchor',
      anchorDate: '2026-06-01',
    });
  });

  it('releases with a null impact when the unpinning cannot be computed', async () => {
    windowRow = {
      id: 'window-1',
      state: 'confirmed',
      anchored: true,
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: 'p-install',
    };
    // The confirmed phase carries no anchor, so there is nothing to unpin and
    // no honest effect to state.
    phaseRows = CHAIN;
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Release the window' }));
    const face = sheet();
    expect(impactBlock()).toHaveAttribute('data-schedule-impact', 'uncomputable');

    fireEvent.click(face.getByRole('button', { name: 'Release the window' }));
    await waitFor(() => expect(release).toHaveBeenCalled());
    expect(release.mock.calls[0][0].disclosedImpact).toBeNull();
  });

  // ── THE GATING STATES ────────────────────────────────────────────────────
  // R110's consent gate lives in these four answers. Stubbing them green is
  // what let a mid-read click ship a downgrade.

  it('waits for the schedule before it will let a confirmation be consented to', () => {
    windowRow = {
      id: 'window-1',
      state: 'held',
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: null,
    };
    // A read in flight returns no phases, so the target is unresolvable too —
    // the reading state must still win, or the sheet states a fact about a
    // chain nobody has looked at.
    scheduleLoading = true;
    phaseRows = [];
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm the window' }));
    expect(impactBlock()).toHaveAttribute('data-schedule-impact', 'reading');
    expect(impactBlock()).toHaveTextContent(/Reading the schedule/);
    expect(submitButton('Confirm the window')).toBeDisabled();
  });

  it('refuses consent, and says so, when the schedule read failed', () => {
    windowRow = {
      id: 'window-1',
      state: 'held',
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: null,
    };
    scheduleError = true;
    phaseRows = [];
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm the window' }));
    expect(impactBlock()).toHaveAttribute('data-schedule-impact', 'unavailable');
    expect(submitButton('Confirm the window')).toBeDisabled();
  });

  it('states the contradiction before consent when the target is already anchored', () => {
    windowRow = {
      id: 'window-1',
      state: 'held',
      starts_on: '2026-09-07',
      ends_on: '2026-09-11',
      phase_id: null,
    };
    // 00475 proposes whenever the date differs from a committed anchor, however
    // well it was disclosed — so the sheet must not narrate a move.
    phaseRows = ANCHORED_CHAIN;
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm the window' }));
    expect(impactBlock()).toHaveAttribute('data-schedule-impact', 'contradicts');
    expect(impactBlock()).toHaveTextContent(/contradicts the anchor committed for/);
    expect(impactBlock()).toHaveTextContent(/it does not move the date/);
  });

  it('says a window that pinned nothing removes nothing', () => {
    windowRow = {
      id: 'window-1',
      state: 'confirmed',
      anchored: false,
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: 'p-install',
    };
    phaseRows = ANCHORED_CHAIN;
    render(<InstallWindowCeremony projectId="project-1" />);

    expect(screen.getByText(/date proposed, not pinned/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release the window' }));
    expect(impactBlock()).toHaveTextContent(/never pinned a date/);
  });

  // ── THE SUMMARY ROW'S OWN READ ───────────────────────────────────────────

  it('does not claim no window is held while the window read is in flight', () => {
    windowPending = true;
    render(<InstallWindowCeremony projectId="project-1" />);
    expect(screen.getByText(/Reading the install window/)).toBeInTheDocument();
    expect(screen.queryByText('No window is held.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold a window' })).not.toBeInTheDocument();
  });

  it('says a failed window read failed rather than vanishing', () => {
    windowError = true;
    render(<InstallWindowCeremony projectId="project-1" />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold a window' })).not.toBeInTheDocument();
  });
});
