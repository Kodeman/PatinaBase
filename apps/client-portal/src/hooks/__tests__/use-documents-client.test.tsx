import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { useClientDocuments, documentSignedUrl } from '../use-documents-client';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
}));

const mockCreateBrowserClient = createBrowserClient as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const documentRow = {
  id: 'doc-1',
  project_id: 'proj-1',
  proposal_id: null,
  title: 'Service Agreement.pdf',
  doc_type: 'pdf',
  category: 'contract',
  section_key: null,
  storage_path: 'proj-1/agreement.pdf',
  size_bytes: 128000,
  client_visible: true,
  created_at: '2026-01-05T00:00:00Z',
};

// A thenable builder: every filter call returns the query, and awaiting it
// resolves with the canned rows — matching supabase-js's fluent shape.
function documentsQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  const calls: Record<string, unknown[]> = {};
  for (const method of ['select', 'eq', 'in', 'or', 'order']) {
    calls[method] = [];
    query[method] = jest.fn((...args: unknown[]) => {
      calls[method].push(args);
      return query;
    });
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return { query, calls };
}

function fakeSupabase({
  proposals = { data: [], error: null },
  documents = { data: [documentRow], error: null },
}: {
  proposals?: { data: unknown; error: unknown };
  documents?: { data: unknown; error: unknown };
} = {}) {
  const proposalsQuery = {
    select: jest.fn().mockResolvedValue(proposals),
  };
  const docs = documentsQuery(documents);
  const from = jest.fn((table: string) =>
    table === 'proposals' ? proposalsQuery : docs.query,
  );
  return { from, docs, proposalsQuery };
}

describe('useClientDocuments', () => {
  it('reads client-visible rows across projects AND the client’s proposals', async () => {
    const supabase = fakeSupabase({
      proposals: {
        data: [
          { id: 'prop-1', project_id: 'proj-1' },
          { id: 'prop-2', project_id: null },
        ],
        error: null,
      },
    });
    mockCreateBrowserClient.mockReturnValue(supabase);

    const { result } = renderHook(() => useClientDocuments(['proj-1', 'proj-2']), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Proposal ids come from an RLS-scoped id read, never a wildcard select.
    expect(supabase.proposalsQuery.select).toHaveBeenCalledWith('id, project_id');
    // The widened anchor: project_id OR proposal_id, with client_visible kept.
    expect(supabase.docs.calls.or).toEqual([
      ['project_id.in.(proj-1,proj-2),proposal_id.in.(prop-1,prop-2)'],
    ]);
    expect(supabase.docs.calls.eq).toEqual([['client_visible', true]]);
    // section_key rides along — it is the loose-list discriminator.
    expect(String(supabase.docs.calls.select[0]?.[0])).toContain('section_key');
    expect(String(supabase.docs.calls.select[0]?.[0])).toContain('proposal_id');

    expect(result.current.data).toEqual({
      documents: [documentRow],
      proposalProjectIds: { 'prop-1': 'proj-1', 'prop-2': null },
    });
  });

  it('falls back to a plain project filter when the client has no proposals', async () => {
    const supabase = fakeSupabase();
    mockCreateBrowserClient.mockReturnValue(supabase);

    const { result } = renderHook(() => useClientDocuments(['proj-1']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.docs.calls.or).toEqual([]);
    expect(supabase.docs.calls.in).toEqual([['project_id', ['proj-1']]]);
    expect(result.current.data?.proposalProjectIds).toEqual({});
  });

  it('stays disabled with no projects', () => {
    const supabase = fakeSupabase();
    mockCreateBrowserClient.mockReturnValue(supabase);

    const { result } = renderHook(() => useClientDocuments([]), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('surfaces a proposals read failure as a query error', async () => {
    const supabase = fakeSupabase({
      proposals: { data: null, error: new Error('denied') },
    });
    mockCreateBrowserClient.mockReturnValue(supabase);

    const { result } = renderHook(() => useClientDocuments(['proj-1']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('surfaces a documents read failure as a query error', async () => {
    const supabase = fakeSupabase({
      documents: { data: null, error: new Error('denied') },
    });
    mockCreateBrowserClient.mockReturnValue(supabase);

    const { result } = renderHook(() => useClientDocuments(['proj-1']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('documentSignedUrl', () => {
  it('mints a signed URL from the private bucket', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/signed.pdf' },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({
      storage: { from: jest.fn(() => ({ createSignedUrl })) },
    });

    await expect(documentSignedUrl('proj-1/file.pdf')).resolves.toBe(
      'https://storage.example.test/signed.pdf',
    );
    expect(createSignedUrl).toHaveBeenCalledWith('proj-1/file.pdf', 3600);
  });

  it('returns null when signing fails', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'nope' },
    });
    mockCreateBrowserClient.mockReturnValue({
      storage: { from: jest.fn(() => ({ createSignedUrl })) },
    });

    await expect(documentSignedUrl('proj-1/file.pdf')).resolves.toBeNull();
  });
});
