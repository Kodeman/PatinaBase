/**
 * US-34 N3 / SQ-1010 — the coordination tick (lab P6's "The work") with
 * `optimistic-ink` on, through the real hooks and a real QueryClient. The
 * press flips `aria-pressed` in its own task, while the write is still
 * unanswered: no server response and no polling. Tick and untick take the
 * same path, so both flip at the same step.
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CoordinationWork } from '../coordination-work';

const mockUpdate = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'optimistic-ink', isLoading: false }),
}));

jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return {
    ...actual,
    useCaptureMediaUrls: () => ({ data: {} }),
    getSessionUserId: async () => 'user-1',
    createBrowserClient: () => ({
      from: () => ({
        update: (patch: unknown) => ({
          eq: (_column: string, id: string) => ({
            select: () => ({ maybeSingle: () => mockUpdate(id, patch) }),
          }),
        }),
      }),
    }),
  };
});

jest.mock('../task-dep-line', () => ({ OwnerChip: () => null, TaskDepLine: () => null }));
jest.mock('@/hooks/use-field-capture-photos', () => ({
  useFieldCapturePhotoPaths: () => ({ data: {} }),
}));
jest.mock('../../date', () => ({ FolioPopover: () => null, FolioCalendar: () => null }));
jest.mock('../../schedule-thread-panel', () => ({ ScheduleThreadPanel: () => null }));

const KEY = ['section-tasks', 'project-1'];

const task = (id: string, status: 'todo' | 'done') => ({
  id,
  project_id: 'project-1',
  section_key: 'project',
  title: `Order ${id}`,
  status,
  due_date: null,
  starts_on: null,
  completed_at: status === 'done' ? '2026-10-14T12:00:00.000Z' : null,
  estimate_minutes: null,
  sort_order: 0,
  owner: 'designer',
  owner_party_id: null,
  blocked_by_item_id: null,
  seq_after_task_id: null,
  field_capture_id: null,
});

function Harness() {
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => [], staleTime: Infinity });
  return <CoordinationWork projectId="project-1" items={[]} tasks={data as never} parties={[]} />;
}

function mount(rows: ReturnType<typeof task>[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(KEY, rows);
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness />, { wrapper: wrap });
}

const tick = () => screen.getByRole('button', { name: 'Mark "Order a" done' });

/**
 * The press and its microtasks (onMutate patches the cache there), then one
 * zero-delay task: TanStack hands observers their updates on setTimeout(0).
 * No waitFor.
 */
async function press() {
  await act(async () => {
    fireEvent.click(tick());
  });
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  // Every write stays unanswered for the whole test.
  mockUpdate.mockReset().mockReturnValue(new Promise(() => {}));
});

describe('CoordinationWork tick with optimistic-ink (SQ-1010)', () => {
  it('the tick flips aria-pressed on the press, before any server response', async () => {
    mount([task('a', 'todo')]);
    expect(tick()).toHaveAttribute('aria-pressed', 'false');

    await press();

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'done' }));
    expect(tick()).toHaveAttribute('aria-pressed', 'true');
    expect(tick()).toHaveAttribute('aria-busy', 'true');
  });

  it('the untick flips at the same step', async () => {
    mount([task('a', 'done')]);
    expect(tick()).toHaveAttribute('aria-pressed', 'true');

    await press();

    expect(mockUpdate).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'todo' }));
    expect(tick()).toHaveAttribute('aria-pressed', 'false');
    expect(tick()).toHaveAttribute('aria-busy', 'true');
  });
});
