/**
 * US-34 F16 — the coordination tick: a 44px target around the 13px stamp,
 * `aria-pressed` on a free tick (never on a blocked one, which opens its
 * blocker), and `aria-busy` with a swallowed second press while pending.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CoordinationWork } from '../coordination-work';

const mockToggle = jest.fn();
const mockBlocked = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

jest.mock('@/hooks/use-section-work', () => ({
  useCreateSectionTask: () => ({ mutate: jest.fn() }),
  useToggleSectionTask: () => ({
    mutate: jest.fn(),
    mutateAsync: (...args: unknown[]) => mockToggle(...args),
  }),
}));

jest.mock('@/lib/document/coordination-derivation', () => ({
  isBlocked: (task: { id: string }) => mockBlocked(task),
}));

jest.mock('../task-dep-line', () => ({
  OwnerChip: () => null,
  TaskDepLine: () => null,
}));

// The work block's own grammar (folio, field photos) is not under test here;
// only its exported tick hook is used by CoordinationWork.
jest.mock('@/hooks/use-field-capture-photos', () => ({
  useFieldCapturePhotoPaths: () => ({ data: {} }),
}));
jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: () => ({ data: {} }),
}));
jest.mock('../../date', () => ({
  FolioPopover: () => null,
  FolioCalendar: () => null,
}));
jest.mock('../../schedule-thread-panel', () => ({
  ScheduleThreadPanel: () => null,
}));

const task = (id: string, status: 'todo' | 'done') => ({
  id,
  project_id: 'project-1',
  section_key: 'project',
  title: `Order ${id}`,
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

const free = { any: false, byItem: false, bySeq: false, blockingItemId: null };

const work = (rows: ReturnType<typeof task>[]) => (
  <CoordinationWork projectId="project-1" items={[]} tasks={rows as never} parties={[]} />
);

beforeEach(() => {
  mockToggle.mockReset();
  mockBlocked.mockReset().mockReturnValue(free);
});

describe('CoordinationWork tick (F16)', () => {
  it('is a 44px target in a 44px row, with aria-pressed', () => {
    render(work([task('a', 'todo'), task('b', 'done')]));
    const tick = screen.getByRole('button', { name: 'Mark "Order a" done' });
    expect(tick).toHaveClass('h-[44px]', 'w-[44px]');
    expect(tick.closest('div')).toHaveClass('min-h-[44px]');
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Mark "Order b" done' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('is aria-busy while pending and ignores a second press', async () => {
    let resolve!: () => void;
    mockToggle.mockReturnValue(new Promise<void>((res) => (resolve = res)));
    const { rerender } = render(work([task('a', 'todo')]));
    const tick = () => screen.getByRole('button', { name: 'Mark "Order a" done' });

    fireEvent.click(tick());
    expect(tick()).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(tick());
    expect(mockToggle).toHaveBeenCalledTimes(1);

    await act(async () => resolve());
    expect(tick()).toHaveAttribute('aria-busy', 'true');
    rerender(work([task('a', 'done')]));
    expect(tick()).not.toHaveAttribute('aria-busy');
    expect(tick()).toHaveAttribute('aria-pressed', 'true');
  });

  it('a blocked tick is no toggle: no aria-pressed, and it writes nothing', () => {
    mockBlocked.mockReturnValue({ any: true, byItem: false, bySeq: true, blockingItemId: null });
    render(work([task('a', 'todo')]));
    const tick = screen.getByRole('button', { name: '"Order a" is blocked' });
    expect(tick).not.toHaveAttribute('aria-pressed');
    fireEvent.click(tick);
    expect(mockToggle).not.toHaveBeenCalled();
  });
});
