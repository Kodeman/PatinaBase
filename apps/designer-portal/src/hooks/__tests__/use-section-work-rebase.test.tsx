/**
 * SQ-1004 (SQ-1001 #1): a tick then an untick of one task, both patched before
 * either settles, must end on what the server holds. Runs the real
 * useToggleSectionTask (its own apply/invert/merge) through the real helper
 * against deferred project_tasks UPDATEs.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

type Reply = { data: unknown; error: { message: string } | null };
const mockWrites: Array<(reply: Reply) => void> = [];

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  createBrowserClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: () => new Promise<Reply>((resolve) => mockWrites.push(resolve)),
          }),
        }),
      }),
    }),
  }),
}));

import { docKeys } from '@patina/supabase';
import { useToggleSectionTask, type SectionTask } from '../use-section-work';

const projectId = 'p-1';
const key = docKeys.sectionTasks(projectId);

const task = (patch: Partial<SectionTask>): SectionTask => ({
  id: 't-1',
  project_id: projectId,
  section_key: 'project' as SectionTask['section_key'],
  title: 'Order samples',
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
  field_capture_id: null,
  ...patch,
});
const refused: Reply = { data: null, error: { message: 'refused' } };

async function tickThenUntick() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(key, [task({})]);
  const { result } = renderHook(() => useToggleSectionTask(projectId, { optimistic: true }), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  const row = () => client.getQueryData<SectionTask[]>(key)?.[0];

  // The caller passes the status the row shows at the click.
  let tick!: Promise<unknown>;
  let untick!: Promise<unknown>;
  act(() => {
    tick = result.current.mutateAsync({ id: 't-1', status: 'todo' }).catch((e: unknown) => e);
  });
  await waitFor(() => expect(row()?.status).toBe('done'));
  act(() => {
    untick = result.current.mutateAsync({ id: 't-1', status: 'done' }).catch((e: unknown) => e);
  });
  await waitFor(() => expect(row()?.status).toBe('todo'));
  await waitFor(() => expect(mockWrites).toHaveLength(1));
  return { row, tick, untick };
}

beforeEach(() => {
  mockWrites.length = 0;
});

describe('useToggleSectionTask: same-scope tick then untick (SQ-1004)', () => {
  it('both fail: the task ends at todo, as the server holds', async () => {
    const { row, tick, untick } = await tickThenUntick();

    await act(async () => {
      mockWrites[0](refused);
      await tick;
    });
    expect(row()?.status).toBe('todo');

    await waitFor(() => expect(mockWrites).toHaveLength(2));
    await act(async () => {
      mockWrites[1](refused);
      await untick;
    });
    expect(row()).toEqual(task({ status: 'todo', completed_at: null }));
  });

  it('the tick fails and the untick succeeds: the task ends at the untick receipt', async () => {
    const { row, tick, untick } = await tickThenUntick();

    await act(async () => {
      mockWrites[0](refused);
      await tick;
    });
    await waitFor(() => expect(mockWrites).toHaveLength(2));
    await act(async () => {
      mockWrites[1]({ data: task({ status: 'todo', completed_at: null }), error: null });
      await untick;
    });
    expect(row()).toEqual(task({ status: 'todo', completed_at: null }));
  });

  it('the tick succeeds and the untick fails: the task ends at the tick receipt', async () => {
    const { row, tick, untick } = await tickThenUntick();
    const ticked = task({ status: 'done', completed_at: '2026-10-14T12:00:00Z' });

    await act(async () => {
      mockWrites[0]({ data: ticked, error: null });
      await tick;
    });
    // The untick is still pending, so its patch stays on over the receipt.
    expect(row()?.status).toBe('todo');

    await waitFor(() => expect(mockWrites).toHaveLength(2));
    await act(async () => {
      mockWrites[1](refused);
      await untick;
    });
    expect(row()).toEqual(ticked);
  });
});
