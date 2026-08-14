import { fireEvent, render, screen, within } from '@testing-library/react';
import { ScheduleThreadPanel } from './schedule-thread-panel';

// The panel reads useResolvedSchedule + useInstallWindow itself (React Query
// hooks); these tests render without a QueryClientProvider, so both doors
// are stubbed the same way install-window-ceremony.test.tsx stubs them.
let phaseRows: Array<{ id: string; name: string }> = [];
let milestoneRows: Array<{ id: string; name: string }> = [];
let resolvedSchedule: {
  phases: Array<{
    id: string;
    start: string | null;
    end: string | null;
    lane: 'main' | 'thread';
    anchored: boolean;
    source: string;
    slackDays: number | null;
    governingAnchorId: string | null;
    origin: string;
  }>;
  milestones: Array<{
    id: string;
    phaseId: string;
    date: string | null;
    anchored: boolean;
    derivedStatus: string;
  }>;
} | null = null;
let scheduleLoading = false;
let scheduleError = false;
let installWindowData: { starts_on: string } | null = null;
let installLoading = false;
let installError = false;

jest.mock('@patina/supabase', () => ({
  useResolvedSchedule: () => ({
    phases: phaseRows,
    milestones: milestoneRows,
    resolved: resolvedSchedule,
    isLoading: scheduleLoading,
    isError: scheduleError,
  }),
  useInstallWindow: () => ({
    data: installWindowData,
    isLoading: installLoading,
    isError: installError,
  }),
}));

function seedSchedule() {
  phaseRows = [{ id: 'p1', name: 'Schematic Design' }];
  milestoneRows = [{ id: 'm1', name: 'Client sign-off' }];
  resolvedSchedule = {
    phases: [
      {
        id: 'p1',
        start: '2026-08-20',
        end: '2026-08-28',
        lane: 'main',
        anchored: false,
        source: 'chain',
        slackDays: null,
        governingAnchorId: null,
        origin: 'none',
      },
    ],
    milestones: [
      { id: 'm1', phaseId: 'p1', date: '2026-09-02', anchored: false, derivedStatus: 'upcoming' },
    ],
  };
  installWindowData = { starts_on: '2026-10-26' };
}

const renderPanel = (onSet = jest.fn(), onBack = jest.fn()) => {
  render(
    <ScheduleThreadPanel projectId="project-1" today="2026-08-14" onSet={onSet} onBack={onBack} />,
  );
  return { onSet, onBack };
};

beforeEach(() => {
  scheduleLoading = false;
  scheduleError = false;
  installLoading = false;
  installError = false;
  seedSchedule();
});

describe('ScheduleThreadPanel', () => {
  it('shows a loading register while either read is in flight', () => {
    scheduleLoading = true;
    renderPanel();
    expect(screen.getByText('Reading the schedule')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument();
  });

  it('shows an error state and still offers Back when a read fails', () => {
    scheduleError = true;
    const { onBack } = renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('The schedule could not be read.');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('lists Today, phase begins/ends, the milestone, and the install start as anchors', () => {
    renderPanel();
    const group = screen.getByRole('group', { name: 'Anchor' });
    const labels = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels.some((l) => l?.includes('Today'))).toBe(true);
    expect(labels.some((l) => l?.includes('Schematic Design begins'))).toBe(true);
    expect(labels.some((l) => l?.includes('Schematic Design ends'))).toBe(true);
    expect(labels.some((l) => l?.includes('Client sign-off'))).toBe(true);
    expect(labels.some((l) => l?.includes('Install begins'))).toBe(true);
  });

  it('defaults the selection to Today and reads the consequence off it', () => {
    renderPanel();
    // 2026-08-14 is a Friday — a workday, so by=0/lasts=1 starts and
    // finishes the same day.
    expect(screen.getByText(/Starts Fri, Aug 14/)).toBeVisible();
  });

  it('selecting a different anchor chip updates the sentence and the consequence', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Client sign-off/ }));

    expect(screen.getByRole('button', { name: /Client sign-off/ })).toHaveAttribute('aria-pressed', 'true');
    // 2026-09-02 is a Wednesday — a workday.
    expect(screen.getByText(/Starts Wed, Sep 2/)).toBeVisible();
  });

  it('the BY stepper advances the anchor by workdays and updates the consequence', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Client sign-off/ }));
    expect(screen.getByText(/Starts Wed, Sep 2/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Increase workdays after anchor' }));
    // Sep 2 (Wed) + 1 workday = Sep 3 (Thu).
    expect(screen.getByText(/Starts Thu, Sep 3/)).toBeVisible();
  });

  it('the LASTS stepper is floored at 1 and cannot be decreased below it', () => {
    renderPanel();
    const decreaseLasts = screen.getByRole('button', { name: 'Decrease workdays the task lasts' });
    expect(decreaseLasts).toBeDisabled();
  });

  it('the BY stepper is floored at 0 and cannot be decreased below it', () => {
    renderPanel();
    const decreaseBy = screen.getByRole('button', { name: 'Decrease workdays after anchor' });
    expect(decreaseBy).toBeDisabled();
  });

  it('SET fires onSet with exactly the placement the sentence describes', () => {
    const { onSet } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Client sign-off/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase workdays after anchor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase workdays the task lasts' }));

    // anchor Sep 2 (Wed) + by=1 → starts Sep 3 (Thu); lasts=2 → due Sep 4 (Fri).
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onSet).toHaveBeenCalledWith({ startsOn: '2026-09-03', dueDate: '2026-09-04' });
  });

  it('BACK fires onBack without touching the selection', () => {
    const { onBack } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to Today alone when the project has no other schedule data, and SET still works off it', () => {
    phaseRows = [];
    milestoneRows = [];
    resolvedSchedule = { phases: [], milestones: [] };
    installWindowData = null;
    const { onSet } = renderPanel();

    const group = screen.getByRole('group', { name: 'Anchor' });
    expect(within(group).getAllByRole('button')).toHaveLength(1);
    expect(within(group).getByRole('button')).toHaveTextContent('Today');
    expect(screen.getByRole('button', { name: 'Set' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    // 2026-08-14 is a Friday — by=0/lasts=1 starts and finishes the same day.
    expect(onSet).toHaveBeenCalledWith({ startsOn: '2026-08-14', dueDate: '2026-08-14' });
  });
});
