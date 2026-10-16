/**
 * useAttachDocumentClient must refresh the project's K5 "Link a client" standing
 * (SQ-1066 F2): set_document_client can stamp a NULL studio through 00563, and
 * an owner/admin's standing is read from that studio.
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAttachDocumentClient } from '../use-attach-client';

const mockRpc = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ rpc: mockRpc }),
  documentClientAuthorityKeys: {
    all: ['document-client-authority'],
    canLink: (projectId: string) => ['document-client-authority', 'can-link', projectId],
  },
}));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useAttachDocumentClient(), { wrapper });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { result, invalidatedKeys };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('useAttachDocumentClient — K5 standing', () => {
  it("invalidates the project's link standing after linking a client", async () => {
    const { result, invalidatedKeys } = setup();

    await act(async () => {
      await result.current.mutateAsync({
        engagementKind: 'project',
        targetId: 'project-1',
        clientId: 'client-1',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('set_document_client', {
      p_engagement_kind: 'project',
      p_target_id: 'project-1',
      p_client_id: 'client-1',
    });
    expect(invalidatedKeys()).toContainEqual(['document-client-authority', 'can-link', 'project-1']);
  });
});
