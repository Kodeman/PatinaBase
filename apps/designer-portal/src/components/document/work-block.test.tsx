import { fireEvent, render, screen } from '@testing-library/react';
import { WorkBlock } from './work-block';

const tasksRefetch = jest.fn();
const gatesRefetch = jest.fn();
let tasksQuery: Record<string, unknown>;
let gatesQuery: Record<string, unknown>;
let createTaskMutate: jest.Mock;

// D-B49 — the three READS moved to the FF&E region root (`ffe-section.tsx`),
// which is mounted at every density, so the block no longer calls them: it
// takes `tasks`, `gates`, `loggedMinutes` and the loading/error/retry triple as
// props. `tasksQuery`/`gatesQuery` below are still the suite's fixtures — they
// are now fed through `renderWork` rather than through a hook mock, which is
// exactly what the rule asks a body to do. The MUTATIONS stay hooks.
jest.mock('@/hooks/use-section-work', () => ({
  gateState: () => 'requested',
  useCreateSectionTask: () => ({ mutate: (...args: unknown[]) => createTaskMutate(...args) }),
  useToggleSectionTask: () => ({ mutate: jest.fn() }),
}));

// A lightweight stand-in for the real Folio: two buttons that fire the SAME
// onCommit shapes a day-pick / span-pick would, plus the footerExtra slot so
// the "Place it in the schedule" link still renders. Real Folio interaction
// (grid clicks, presets, keyboard roving) is covered by folio-calendar's own
// suite — this file only proves work-block wires the commit shapes correctly
// and contains its own Enter presses.
jest.mock('./date', () => ({
  FolioPopover: ({ children }: { children: React.ReactNode }) => <div data-testid="folio-popover">{children}</div>,
  FolioCalendar: ({
    onCommit,
    footerExtra,
  }: {
    onCommit: (selection: { kind: 'day'; date: string } | { kind: 'span'; start: string; end: string }) => void;
    footerExtra?: React.ReactNode;
  }) => (
    <div data-testid="folio-calendar">
      <button type="button" onClick={() => onCommit({ kind: 'day', date: '2026-08-20' })}>
        commit-day
      </button>
      <button
        type="button"
        onClick={() => onCommit({ kind: 'span', start: '2026-08-25', end: '2026-08-28' })}
      >
        commit-span
      </button>
      <button
        type="button"
        onClick={() => onCommit({ kind: 'span', start: '2026-08-20', end: '2026-08-20' })}
      >
        commit-same-day-span
      </button>
      {footerExtra}
    </div>
  ),
}));

jest.mock('./schedule-thread-panel', () => ({
  ScheduleThreadPanel: () => <div data-testid="schedule-thread-panel" />,
}));

const renderWork = (clientUserId: string | null = null) =>
  render(
    <WorkBlock
      projectId="project-1"
      sectionKey="project"
      sectionLabel="Project"
      clientUserId={clientUserId}
      clientName="Avery"
      tasks={tasksQuery.data as never}
      gates={gatesQuery.data as never}
      loggedMinutes={0}
      workLoading={
        Boolean(tasksQuery.isLoading) || Boolean(gatesQuery.isLoading)
      }
      workError={Boolean(tasksQuery.isError) || Boolean(gatesQuery.isError)}
      onRetryWork={() => {
        (tasksQuery.refetch as () => void)();
        (gatesQuery.refetch as () => void)();
      }}
    />,
  );

const baseTask = {
  id: 't0',
  project_id: 'project-1',
  section_key: 'project',
  title: 'Existing task',
  status: 'todo',
  due_date: null,
  starts_on: null,
  completed_at: null,
  estimate_minutes: null,
  sort_order: 0,
  owner: 'designer',
  owner_party_id: null,
  blocked_by_item_id: null,
  seq_after_task_id: null,
};

describe('WorkBlock query states', () => {
  beforeEach(() => {
    tasksRefetch.mockReset();
    gatesRefetch.mockReset();
    createTaskMutate = jest.fn();
    tasksQuery = { data: [], isLoading: false, isError: false, refetch: tasksRefetch };
    gatesQuery = { data: [], isLoading: false, isError: false, refetch: gatesRefetch };
  });

  it('does not show a false empty prompt while work is loading', () => {
    tasksQuery.isLoading = true;
    renderWork();
    expect(screen.getByText('Reading the work')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add the first task' })).not.toBeInTheDocument();
  });

  it('shows a retry instead of a false empty prompt when a read fails', () => {
    gatesQuery.isError = true;
    renderWork();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(tasksRefetch).toHaveBeenCalledTimes(1);
    expect(gatesRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Add the first task' })).not.toBeInTheDocument();
  });

  it('guides only after both reads succeed empty', () => {
    renderWork();
    expect(screen.getByRole('button', { name: 'Add the first task' })).toBeVisible();
  });

  it('does not offer new legacy section sign-off creation', () => {
    renderWork('client-1');
    expect(
      screen.queryByRole('button', { name: /request sign-off/i }),
    ).not.toBeInTheDocument();
  });
});

describe('WorkBlock date capture (Date Instruments D2)', () => {
  beforeEach(() => {
    createTaskMutate = jest.fn();
    tasksQuery = { data: [baseTask], isLoading: false, isError: false, refetch: tasksRefetch };
    gatesQuery = { data: [], isLoading: false, isError: false, refetch: gatesRefetch };
  });

  const openCaptureRow = () => {
    renderWork();
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }));
    fireEvent.change(screen.getByPlaceholderText('What needs doing'), {
      target: { value: 'New task' },
    });
  };

  it('shows a mono placeholder chip before any date is picked', () => {
    openCaptureRow();
    expect(screen.getByRole('button', { name: 'Due date' })).toHaveTextContent('date');
  });

  it('a day pick mutates {dueDate, startsOn: null}', () => {
    openCaptureRow();
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByText('commit-day'));

    // The popover closed and the chip now reads the picked day.
    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Due date' })).toHaveTextContent('Aug 20');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: '2026-08-20', startsOn: null }),
    );
  });

  it('a span pick mutates {startsOn, dueDate} to the window bounds', () => {
    openCaptureRow();
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByText('commit-span'));

    expect(screen.getByRole('button', { name: 'Due date' })).toHaveTextContent('Aug 25 – 28');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: '2026-08-28', startsOn: '2026-08-25' }),
    );
  });

  it('a same-day span collapses to a day pick: mutates {dueDate, startsOn: null}, chip shows one date', () => {
    openCaptureRow();
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByText('commit-same-day-span'));

    // The chip reads a single date, never "Aug 20 – 20".
    const chip = screen.getByRole('button', { name: 'Due date' });
    expect(chip).toHaveTextContent('Aug 20');
    expect(chip.textContent).not.toContain('–');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: '2026-08-20', startsOn: null }),
    );
  });

  it('renders a span task row as "due <start> – <end>"', () => {
    tasksQuery = {
      data: [{ ...baseTask, starts_on: '2026-08-25', due_date: '2026-08-28' }],
      isLoading: false,
      isError: false,
      refetch: tasksRefetch,
    };
    renderWork();
    expect(screen.getByText(/due Aug 25 – Aug 28/)).toBeVisible();
  });

  it('single-date rendering is unchanged for a plain due date', () => {
    tasksQuery = {
      data: [{ ...baseTask, starts_on: null, due_date: '2026-08-28' }],
      isLoading: false,
      isError: false,
      refetch: tasksRefetch,
    };
    renderWork();
    expect(screen.getByText(/due Aug 28/)).toBeVisible();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('the "Place it in the schedule" link swaps to the Thread panel in the same popover', () => {
    openCaptureRow();
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByText('Place it in the schedule'));

    expect(screen.getByTestId('schedule-thread-panel')).toBeVisible();
    expect(screen.queryByTestId('folio-calendar')).not.toBeInTheDocument();
    // The popover itself never unmounted — same wrapper, swapped content.
    expect(screen.getByTestId('folio-popover')).toBeVisible();
  });

  it('Enter inside the mocked Folio does not save the row', () => {
    openCaptureRow();
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));

    fireEvent.keyDown(screen.getByText('commit-day'), { key: 'Enter', bubbles: true });

    expect(createTaskMutate).not.toHaveBeenCalled();
    // The row is still mid-capture — no task got saved out from under it.
    expect(screen.getByPlaceholderText('What needs doing')).toHaveValue('New task');
  });
});
