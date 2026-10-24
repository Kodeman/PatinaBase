import { createElement, type ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

const mockToast = jest.fn();
const mockLog = jest.fn();
jest.mock('../../lib/error-handler', () => ({
  handleApiError: (error: unknown) => error,
  logError: (...args: unknown[]) => mockLog(...args),
  showErrorToast: (...args: unknown[]) => mockToast(...args),
  isAuthError: () => false,
  isNetworkError: () => false,
}));

let mockBoard = { id: 'b1', project_id: null, proposal_id: 'q1', cover_image_url: 'https://cdn/old.jpg', status: 'active', updated_at: '2026-10-01' };
let mockFailure: Error | null = null;
const mockReads = jest.fn();
const mockSupabase = {
  from: (table: string) => {
    let patch: Record<string, unknown> | null = null;
    const query: any = {};
    const filters: Record<string, unknown> = {};
    for (const method of ['select', 'not', 'or', 'in']) query[method] = () => query;
    query.eq = (key: string, value: unknown) => { filters[key] = value; return query; };
    query.update = (updates: Record<string, unknown>) => { patch = updates; return query; };
    query.single = async () => {
      mockBoard = { ...mockBoard, ...patch };
      return { data: mockBoard, error: null };
    };
    query.then = (resolve: (value: unknown) => unknown) => {
      mockReads(table);
      return Promise.resolve({
        data: table === 'proposal_boards' && mockBoard.status === 'active' && mockBoard.cover_image_url &&
          Object.entries(filters).every(([key, value]) => mockBoard[key as keyof typeof mockBoard] === value) ? [mockBoard] : [],
        error: mockFailure,
      }).then(resolve);
    };
    return query;
  },
};
jest.mock('../../../../../packages/supabase/src/client', () => ({ createBrowserClient: () => mockSupabase }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => mockSupabase,
  boardOwnerQueryKeys: jest.requireActual('../../../../../packages/supabase/src/hooks/use-boards').boardOwnerQueryKeys,
  signBoardMediaValue: jest.requireActual('../../../../../packages/supabase/src/lib/board-storage').signBoardMediaValue,
  signProjectWorkingBoardRow: jest.requireActual('../../../../../packages/supabase/src/hooks/use-boards').signProjectWorkingBoardRow,
}));

import { useUpsertBoard } from '../../../../../packages/supabase/src/hooks/use-boards';
import { nextSubjectQueryClient } from '@/lib/react-query';
import { useCommissionPlates } from '../use-commission-plates';
import { CommissionSpread } from '@/components/document/studio/commission-spread';

const jobs = [{ jobId: 'p1', projectId: 'p1', proposalId: 'q1' }];
const featured = { jobId: 'p1', name: 'Lake House', personLine: 'Client', stage: 'Design', href: '/doc/p1', itemCount: 1 };

function studio() {
  const { plates, isPending } = useCommissionPlates(jobs);
  return createElement('div', { 'data-pending': isPending }, createElement(CommissionSpread, {
    job: featured, plate: plates.get('p1'), onLeave: () => {}, attention: null,
  }));
}

describe('commission plates under the real client policy', () => {
  let client: ReturnType<typeof nextSubjectQueryClient>;
  let wrapper: ({ children }: { children: ReactNode }) => ReturnType<typeof createElement>;
  beforeEach(() => {
    mockBoard = { id: 'b1', project_id: null, proposal_id: 'q1', cover_image_url: 'https://cdn/old.jpg', status: 'active', updated_at: '2026-10-01' };
    mockFailure = null;
    client = nextSubjectQueryClient();
    wrapper = ({ children }) => createElement(QueryClientProvider, { client }, children);
  });
  afterEach(() => client.clear());

  it.each([
    { label: 'edited', change: { coverImageUrl: 'https://cdn/new.jpg' }, expected: 'https://cdn/new.jpg' },
    { label: 'cleared', change: { coverImageUrl: null }, expected: undefined },
    { label: 'archived', change: { status: 'archived' as const }, expected: undefined },
  ])('refreshes the $label board cover on Studio return via native useUpsertBoard', async ({ change, expected }) => {
    expect(client.getDefaultOptions().queries).toMatchObject({ staleTime: 300000, refetchOnWindowFocus: false });
    const first = renderHook(() => useCommissionPlates(jobs), { wrapper });
    await waitFor(() => expect(first.result.current.plates.get('p1')?.url).toBe('https://cdn/old.jpg'));
    first.unmount();
    const mutation = renderHook(() => useUpsertBoard(), { wrapper });
    await act(async () => { await mutation.result.current.mutateAsync({ boardId: 'b1', proposalId: 'q1', ...change }); });
    const returned = renderHook(() => useCommissionPlates(jobs), { wrapper });
    await waitFor(() => expect(returned.result.current.plates.get('p1')?.url).toBe(expected));
    expect(mockReads.mock.calls.filter(([table]) => table === 'proposal_boards').length).toBeGreaterThan(1);
  });

  it('logs an optional plate read failure without a toast and renders the name fallback', async () => {
    mockFailure = new Error('optional cover read failed');
    const view = render(createElement(studio), { wrapper });
    await waitFor(() => expect(mockLog).toHaveBeenCalledWith(mockFailure, expect.anything()));
    await waitFor(() => expect(view.container.firstChild).toHaveAttribute('data-pending', 'false'));
    expect(mockToast).not.toHaveBeenCalled();
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.getAllByText('Lake House').length).toBeGreaterThan(0);
  });
});
