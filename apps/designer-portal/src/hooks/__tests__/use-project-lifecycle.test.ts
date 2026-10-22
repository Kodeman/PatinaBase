import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useCloseProject, useSetProjectStatus } from '../use-project-lifecycle';
import { PressBand } from '@/components/document/press-band';
import { CURRENT_ROW, PENDING_ROW, listEnvelope } from '@/components/document/__fixtures__/client-editions';

const mockRpc = jest.fn();
const mockReadEditions = jest.fn();

jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return {
    ...actual,
    createBrowserClient: () => ({ rpc: mockRpc }),
    useClientEditions: (projectId: string) => {
      const { useQuery } = jest.requireActual('@tanstack/react-query');
      return useQuery({
        queryKey: actual.clientEditionsKey(projectId),
        queryFn: mockReadEditions,
        staleTime: Infinity,
      });
    },
    useClientEditionSourceUrls: () => ({ data: {} }),
    useClientEditorialAssets: () => ({ data: [] }),
    useSetProjectShowMakers: () => ({ mutate: jest.fn() }),
    useUndoClientEdition: () => ({ mutate: jest.fn(), error: null }),
    useApproveClientEdition: () => ({ mutate: jest.fn(), error: null }),
    useHoldClientEdition: () => ({ mutate: jest.fn(), error: null }),
  };
});
jest.mock('@/components/document/press-band-preview', () => ({
  ...jest.requireActual('@/components/document/press-band-preview'),
  PressBandPreview: () => null,
}));

const { normalizeClientEditions, clientEditionsKey } = jest.requireActual('@patina/supabase');

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(clientEditionsKey('p-1'), normalizeClientEditions(listEnvelope([PENDING_ROW, CURRENT_ROW])));
  mockReadEditions.mockResolvedValue(normalizeClientEditions({ ...listEnvelope([PENDING_ROW, CURRENT_ROW]), projectClosed: true }));
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => { jest.clearAllMocks(); mockRpc.mockResolvedValue({ data: null, error: null }); });

describe('lifecycle changes refresh a populated edition cache and mounted Press band', () => {
  it.each(['close', 'archive'] as const)('%s invalidates client editions immediately and the band becomes read-only', async (transition) => {
    const { client, wrapper } = setup();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const hooks = renderHook(() => ({ close: useCloseProject(), status: useSetProjectStatus('p-1') }), { wrapper });
    render(React.createElement(PressBand, { projectId: 'p-1', clientFirstName: 'June' }), { wrapper });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(mockReadEditions).not.toHaveBeenCalled();

    await act(async () => {
      if (transition === 'close') {
        await hooks.result.current.close.mutateAsync({ projectId: 'p-1', closure: [], snapshot: {} as never });
      } else {
        await hooks.result.current.status.mutateAsync({ status: 'archived', expectedStatus: 'active' });
      }
    });

    expect(mockRpc).toHaveBeenCalledWith(transition === 'close' ? 'close_project' : 'archive_project', expect.objectContaining({ p_project_id: 'p-1' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['client-editions', 'p-1'] });
    await waitFor(() => expect(screen.getByText('Closed')).toBeInTheDocument());
    expect(mockReadEditions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    client.clear();
  });

  it('a refused archive leaves the cached edition truth unchanged', async () => {
    const { client, wrapper } = setup();
    const error = new Error('status changed');
    mockRpc.mockResolvedValue({ error });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetProjectStatus('p-1'), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ status: 'archived', expectedStatus: 'active' })).rejects.toBe(error);
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(clientEditionsKey('p-1'))).toMatchObject({ projectClosed: false });
    client.clear();
  });
});
