import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

const mockGetSupabase = jest.fn();
jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return { ...actual, createBrowserClient: () => mockGetSupabase() };
});
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return { ...actual, useMutation: (options: unknown) => options };
});

import { useToggleSectionTask } from '../use-section-work';
import { docKeys, projectWorkflowQueryKey } from '@patina/supabase';

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe('section-work invalidation', () => {
  it('invalidates no more than three active keys and refetches a stale Desk on mount', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const calls: Record<string, number> = { tasks: 0, engagement: 0, workflow: 0, desk: 0 };
    const observe = (key: readonly unknown[], slot: keyof typeof calls) =>
      new QueryObserver(client, {
        queryKey: key,
        staleTime: Infinity,
        queryFn: async () => { calls[slot] += 1; return calls[slot]; },
      });
    client.setQueryData(docKeys.sectionTasks('p1'), 0);
    client.setQueryData(docKeys.engagement('p1'), 0);
    client.setQueryData(projectWorkflowQueryKey('p1'), 0);
    client.setQueryData(docKeys.desk(), 0);
    const task = observe(docKeys.sectionTasks('p1'), 'tasks');
    const engagement = observe(docKeys.engagement('p1'), 'engagement');
    const workflow = observe(projectWorkflowQueryKey('p1'), 'workflow');
    const desk = observe(docKeys.desk(), 'desk');
    const unsubscribers = [task, engagement, workflow, desk].map((observer) => observer.subscribe(() => undefined));

    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useToggleSectionTask('p1'), { wrapper: wrapper(client) });
    const mutationOptions = result.current as unknown as { onSuccess: () => void };
    mutationOptions.onSuccess();
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: docKeys.sectionTasks('p1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: docKeys.engagement('p1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: docKeys.desk(), refetchType: 'none' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectWorkflowQueryKey('p1') });

    await waitFor(() => {
      expect(calls.tasks).toBe(1);
      expect(calls.engagement).toBe(1);
      expect(calls.workflow).toBe(1);
    });
    expect(calls.tasks + calls.engagement + calls.workflow).toBeLessThanOrEqual(3);
    expect(calls.desk).toBe(0);

    unsubscribers[3]();
    const deskOnNavigation = observe(docKeys.desk(), 'desk');
    const unsubscribeDeskOnNavigation = deskOnNavigation.subscribe(() => undefined);
    await waitFor(() => expect(calls.desk).toBe(1));

    unsubscribeDeskOnNavigation();
    unsubscribers.slice(0, 2).forEach((unsubscribe) => unsubscribe());
    client.clear();
  });
});
