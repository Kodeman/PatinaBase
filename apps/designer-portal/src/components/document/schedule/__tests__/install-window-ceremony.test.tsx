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

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useInstallWindow: () => ({ data: windowRow, isError: false }),
  useResolvedSchedule: () => ({
    phases: phaseRows,
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
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
    expect(face.getByRole('group', { name: 'Impact' })).toHaveAttribute(
      'data-schedule-impact',
      'computed',
    );

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
    expect(face.getByRole('group', { name: 'Impact' })).toHaveAttribute(
      'data-schedule-impact',
      'uncomputable',
    );

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
      starts_on: '2026-06-01',
      ends_on: '2026-06-05',
      phase_id: 'p-install',
    };
    phaseRows = ANCHORED_CHAIN;
    render(<InstallWindowCeremony projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Release the window' }));
    const face = sheet();
    expect(face.getByText('Is the window released?')).toBeInTheDocument();

    const impact = face.getByRole('group', { name: 'Impact' });
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
    expect(face.getByRole('group', { name: 'Impact' })).toHaveAttribute(
      'data-schedule-impact',
      'uncomputable',
    );

    fireEvent.click(face.getByRole('button', { name: 'Release the window' }));
    await waitFor(() => expect(release).toHaveBeenCalled());
    expect(release.mock.calls[0][0].disclosedImpact).toBeNull();
  });
});
