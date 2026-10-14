/**
 * US-34 F16 — a tick answers the press at once and stays truthful. It is
 * pending-only (no optimistic ✓): the row is `aria-busy` from the press until
 * its receipt is in the cache (the row's status turns over in `tasks`), a
 * second press while busy is swallowed, a refused write ends the hold, and
 * the row is a 44px target that says its state through `aria-pressed`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WorkBlock } from '../work-block';

const mockToggle = jest.fn();

jest.mock('@/hooks/use-field-capture-photos', () => ({
  useFieldCapturePhotoPaths: () => ({ data: {} }),
}));

jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: () => ({ data: {} }),
}));

jest.mock('@/hooks/use-section-work', () => ({
  gateState: () => 'requested',
  useCreateSectionTask: () => ({ mutate: jest.fn() }),
  useToggleSectionTask: () => ({
    mutate: jest.fn(),
    mutateAsync: (...args: unknown[]) => mockToggle(...args),
  }),
}));

jest.mock('../date', () => ({
  FolioPopover: () => null,
  FolioCalendar: () => null,
}));

jest.mock('../schedule-thread-panel', () => ({
  ScheduleThreadPanel: () => null,
}));

type Status = 'todo' | 'done';

const task = (id: string, status: Status) => ({
  id,
  project_id: 'project-1',
  section_key: 'install',
  title: `Hang ${id}`,
  status,
  due_date: null,
  starts_on: null,
  completed_at: null,
  estimate_minutes: null,
  sort_order: 0,
  owner: 'designer',
  owner_party_id: null,
  blocked_by_item_id: null,
  seq_after_task_id: null,
  field_capture_id: null,
});

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const block = (rows: ReturnType<typeof task>[]) => (
  <WorkBlock
    projectId="project-1"
    sectionKey="install"
    sectionLabel="Install"
    clientUserId={null}
    clientName="Avery"
    tasks={rows as never}
    gates={[]}
    loggedMinutes={0}
    workLoading={false}
    workError={false}
    onRetryWork={() => {}}
  />
);

const row = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  jest.useFakeTimers();
  mockToggle.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('WorkBlock tick (F16)', () => {
  it('is a 44px row that says its state through aria-pressed', () => {
    render(block([task('a', 'todo'), task('b', 'done')]));
    expect(row(/Hang a/)).toHaveClass('min-h-[44px]');
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'false');
    expect(row(/Hang b/)).toHaveAttribute('aria-pressed', 'true');
    expect(row(/Hang a/)).not.toHaveAttribute('aria-busy');
  });

  it('is aria-busy while the write is pending and ignores a second press', () => {
    const write = deferred();
    mockToggle.mockReturnValue(write.promise);
    render(block([task('a', 'todo')]));

    fireEvent.click(row(/Hang a/));
    expect(row(/Hang a/)).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(row(/Hang a/));
    fireEvent.click(row(/Hang a/));
    expect(mockToggle).toHaveBeenCalledTimes(1);
    // Pending-only: the ✓ never shows before the server has it.
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('stays busy after the write until the receipt turns the row over', async () => {
    const write = deferred();
    mockToggle.mockReturnValue(write.promise);
    const { rerender } = render(block([task('a', 'todo')]));

    fireEvent.click(row(/Hang a/));
    await act(async () => {
      write.resolve();
    });
    // The write answered, but the cache still holds the old status.
    expect(row(/Hang a/)).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(row(/Hang a/));
    expect(mockToggle).toHaveBeenCalledTimes(1);

    rerender(block([task('a', 'done')]));
    expect(row(/Hang a/)).not.toHaveAttribute('aria-busy');
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true');

    mockToggle.mockReturnValue(deferred().promise);
    fireEvent.click(row(/Hang a/));
    expect(mockToggle).toHaveBeenCalledTimes(2);
  });

  it('ends the hold at once when the write is refused', async () => {
    const write = deferred();
    mockToggle.mockReturnValue(write.promise);
    render(block([task('a', 'todo')]));

    fireEvent.click(row(/Hang a/));
    await act(async () => {
      write.reject(new Error('refused'));
    });
    expect(row(/Hang a/)).not.toHaveAttribute('aria-busy');
  });

  it('never holds a row for good when the refetch does not turn it over', async () => {
    const write = deferred();
    mockToggle.mockReturnValue(write.promise);
    render(block([task('a', 'todo')]));

    fireEvent.click(row(/Hang a/));
    await act(async () => {
      write.resolve();
    });
    expect(row(/Hang a/)).toHaveAttribute('aria-busy', 'true');
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(row(/Hang a/)).not.toHaveAttribute('aria-busy');
  });

  it('holds only the pressed row', () => {
    mockToggle.mockReturnValue(deferred().promise);
    render(block([task('a', 'todo'), task('b', 'todo')]));

    fireEvent.click(row(/Hang a/));
    expect(row(/Hang b/)).not.toHaveAttribute('aria-busy');
    fireEvent.click(row(/Hang b/));
    expect(mockToggle).toHaveBeenCalledTimes(2);
    expect(row(/Hang a/)).toHaveAttribute('aria-busy', 'true');
    expect(row(/Hang b/)).toHaveAttribute('aria-busy', 'true');
  });
});
