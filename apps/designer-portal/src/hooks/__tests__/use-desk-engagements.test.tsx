/**
 * Arrival Arc Phase 0 (DECISIONS.md I64) — the Desk's silent half-render is
 * an auth-degraded 200/0-row read from `document_state`. These tests cover
 * the hook-side fix stack in use-desk-engagements.ts:
 *   (a) a 0-row read with no valid session throws (surfaces as an error
 *       desk/page.tsx's whole-desk error state can catch), instead of
 *       resolving a false-empty Desk;
 *   (b) a 0-row read with a valid session resolves a genuinely empty Desk —
 *       a real quiet desk stays honest;
 *   (c) `placeholderData` is wired to TanStack's `keepPreviousData`;
 *   (d) the zero-row telemetry breadcrumb fires exactly when a 0-row read
 *       follows a cached result that had folders/chips in it.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery, keepPreviousData } from '@tanstack/react-query';

// ---- @patina/supabase -------------------------------------------------
// `from` and `auth.getSession` are jest.fn()s configured per-test; the
// factory only wires them up (prefixed `mock*` so babel-plugin-jest-hoist
// allows referencing them from inside jest.mock's factory).
const mockFrom = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  })),
}));

// ---- analytics rail ------------------------------------------------------
const mockDeskZeroRowRead = jest.fn();
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    deskZeroRowRead: (...args: unknown[]) => mockDeskZeroRowRead(...args),
  },
}));

// ---- @tanstack/react-query -------------------------------------------
// Wrap the real useQuery in a jest.fn so test (c) can inspect the options
// object the hook actually passed — a direct proof of wiring rather than an
// inference from behavior (the query key here is static, so a plain refetch
// already preserves `data`, which would make a purely-behavioral test pass
// even without placeholderData set).
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn((options: unknown) => actual.useQuery(options)),
  };
});

import { useDeskEngagements } from '../use-desk-engagements';

/** A chainable PostgrestFilterBuilder stand-in — every filter method returns
 *  itself, and `.then` resolves it as the Promise.all in the hook expects. */
function chainResult(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'gte', 'lte', 'in', 'eq', 'is']) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (
    resolve: (v: typeof result) => void,
    reject?: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

/** A minimal `document_state` row that resolves to exactly one "new lead"
 *  folder (desk-derivation.ts's lead branch returns on lead_status alone —
 *  no other field is consulted before it returns). */
const NEW_LEAD_ROW = {
  engagement_kind: 'lead',
  engagement_id: 'lead-1',
  project_id: null,
  proposal_id: null,
  lead_id: 'lead-1',
  is_archived: false,
  lead_status: 'new',
  lead_response_deadline: null,
  open_claim_count: 0,
  updated_at: new Date().toISOString(),
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useDeskEngagements', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockGetSession.mockReset();
    mockDeskZeroRowRead.mockReset();
  });

  it('throws when document_state returns 0 rows and there is no valid session', async () => {
    mockFrom.mockImplementation(() => chainResult({ data: [], error: null }));
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toMatch(/desk_session_degraded/);
    expect(mockGetSession).toHaveBeenCalled();
    // The false-empty Desk never resolves — the guard surfaced the truth instead.
    expect(result.current.data).toBeUndefined();
  });

  it('resolves an empty desk when document_state returns 0 rows and the session is valid', async () => {
    mockFrom.mockImplementation(() => chainResult({ data: [], error: null }));
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ folders: [], chips: [] });
    expect(result.current.isError).toBe(false);
    // A genuinely quiet desk on first load has nothing to compare against —
    // no breadcrumb.
    expect(mockDeskZeroRowRead).not.toHaveBeenCalled();
  });

  it('wires placeholderData to keepPreviousData', async () => {
    mockFrom.mockImplementation(() => chainResult({ data: [], error: null }));
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });

    renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });

    await waitFor(() => expect((useQuery as jest.Mock).mock.calls.length).toBeGreaterThan(0));
    const passedOptions = (useQuery as jest.Mock).mock.calls[0][0];
    expect(passedOptions.placeholderData).toBe(keepPreviousData);
  });

  it('fires the zero-row breadcrumb when a 0-row read follows a non-zero cached result', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      chainResult(
        table === 'document_state' ? { data: [NEW_LEAD_ROW], error: null } : { data: [], error: null },
      ),
    );

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.folders.length).toBe(1));

    // Flip document_state empty and force a refetch on the same hook instance
    // — the previous-result ref lives inside this render, not the cache.
    mockFrom.mockImplementation(() => chainResult({ data: [], error: null }));
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.data).toEqual({ folders: [], chips: [] }));
    expect(mockDeskZeroRowRead).toHaveBeenCalledWith({
      previous_folder_count: 1,
      previous_chip_count: 0,
      session_valid: true,
    });
  });
});
