import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetch = jest.fn();
const mockLoad = jest.fn();
const mockPatch = jest.fn();
const mockCreateBackend = jest.fn();
const mockRpc = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'user-1' } };
const mockBrowserClient = { rpc: (...args: unknown[]) => mockRpc(...args) };

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => mockBrowserClient,
  useSession: () => ({ session: mockSession }),
}));

// SWC rewrites `@patina/help-system` to the package's src barrel (patina-testing
// Trap 1), so mock the resolved path, not the specifier.
jest.mock('../../../../packages/help-system/src/index.ts', () => ({
  getSanityClient: () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }),
  createSupabaseTeachingNoteBackend: (client: unknown) => {
    mockCreateBackend(client);
    return { load: () => mockLoad(), patch: (...args: unknown[]) => mockPatch(...args) };
  },
}));

jest.mock(
  '../content/teaching-releases',
  () => ({
    TEACHING_RELEASES: [
      { id: '2026-09-25-galley-po', shippedOn: '2026-09-25', sizeClass: 'workflow_changing', featureKeys: ['galley'] },
      { id: '2026-10-02-hours', shippedOn: '2026-10-02', sizeClass: 'useful', featureKeys: ['hours'] },
    ],
  }),
  { virtual: true },
);

import {
  invalidateTeachingSignals,
  useTeachingNotes,
  useTeachingNoteState,
  useTeachingReleases,
  useTeachingSignals,
} from './use-teaching-data';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { id: 'user-1' } };
});

describe('useTeachingNotes', () => {
  it('fetches published notes under [teaching-notes] with the learn-more slug', async () => {
    mockFetch.mockResolvedValue([
      {
        noteKey: 'galley-po@1',
        body: 'Print {invoiceNumber}.',
        bindings: [{ token: 'invoiceNumber', source: 'invoiceNumber' }],
        learnMoreSlug: 'galley',
      },
    ]);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useTeachingNotes(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mockFetch.mock.calls[0][0] as string;
    expect(query).toContain('*[_type == "teachingNote"]');
    expect(query).toContain('"learnMoreSlug": learnMore->slug.current');
    expect(result.current.data?.[0]).toMatchObject({
      noteKey: 'galley-po@1',
      learnMoreSlug: 'galley',
      bindings: { invoiceNumber: 'invoiceNumber' },
    });
    expect(queryClient.getQueryData(['teaching-notes'])).toBe(result.current.data);
  });

  it('does not fetch without a signed-in user', () => {
    mockSession = null;
    const { wrapper } = setup();
    const { result } = renderHook(() => useTeachingNotes(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useTeachingReleases', () => {
  it('returns only published releases that are in the manifest, in manifest order', async () => {
    mockFetch.mockResolvedValue([
      { id: 'unshipped-release', headline: 'Not in this bundle' },
      { id: '2026-09-25-galley-po', headline: 'Parts on the Galley' },
    ]);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useTeachingReleases(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch.mock.calls[0][0]).toContain('*[_type == "teachingRelease"]');
    expect(result.current.data?.map((r) => r.id)).toEqual(['2026-09-25-galley-po']);
    expect(queryClient.getQueryData(['teaching-releases'])).toBe(result.current.data);
  });
});

describe('useTeachingNoteState', () => {
  it('loads under [teaching-note-state] and adopts the state patch returns', async () => {
    mockLoad.mockResolvedValue({ v: 1 });
    const returned = { v: 1, seen: { 'galley-po@1': { n: 1 } } };
    mockPatch.mockResolvedValue(returned);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useTeachingNoteState(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state).toEqual({ v: 1 });
    expect(mockCreateBackend).toHaveBeenCalledWith(mockBrowserClient);

    await act(async () => {
      await result.current.patch(['seen', 'galley-po@1', 'n'], 1);
    });

    expect(mockPatch).toHaveBeenCalledWith(['seen', 'galley-po@1', 'n'], 1);
    expect(queryClient.getQueryData(['teaching-note-state'])).toEqual(returned);
    await waitFor(() => expect(result.current.state).toEqual(returned));
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('does not load without a signed-in user', () => {
    mockSession = null;
    const { wrapper } = setup();
    renderHook(() => useTeachingNoteState(), { wrapper });
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe('useTeachingSignals', () => {
  it('returns signals from teaching_signals() under [teaching-signals] and refetches on invalidate', async () => {
    const signals = { role: 'owner', used: { galley: true }, lastAt: {}, createdAt: '2026-01-01T00:00:00Z' };
    mockRpc.mockResolvedValue({ data: signals, error: null });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useTeachingSignals(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('teaching_signals');
    expect(queryClient.getQueryData(['teaching-signals'])).toEqual(signals);

    await act(async () => {
      await invalidateTeachingSignals(queryClient);
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('treats a missing function as null signals and logs once', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useTeachingSignals(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();

    await act(async () => {
      await invalidateTeachingSignals(queryClient);
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(result.current.isError).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not call the RPC without a signed-in user', () => {
    mockSession = null;
    const { wrapper } = setup();
    renderHook(() => useTeachingSignals(), { wrapper });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
