/**
 * r19 MAJOR-1 — A GRANT THAT ENDED WITH ITS SEAT IS HISTORY TOO.
 *
 * 00634 ends a seat's open grants on the day the seat closes
 * (`effective_to = GREATEST(effective_from, off_job_at)`). The query's own
 * window — `effective_to.is.null,effective_to.gte.<today>` — keeps a grant
 * through its LAST day in force, which is right for a seat still on the job
 * and wrong for the one day on which a seat closed TODAY: that is exactly the
 * `merge_seat_collision` repair path, where the studio closes one of two
 * duplicate seats in order to fold the cards and folds the same minute. Before
 * this narrowing the Call Sheet printed "Signs money to $10,000." beside
 * "Signs money to $2,500." for one human on one job for the rest of that day.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { useProjectAuthority } from '../use-project-authority';

const seatRows: { id: string; off_job_at: string | null }[] = [];
let grantRows: Record<string, unknown>[] = [];

jest.mock('@patina/supabase', () => ({
  partyAuthorityKeys: { all: ['party-authority'] as const },
  createBrowserClient: () => ({
    from: (table: string) => {
      if (table === 'project_parties') {
        return {
          select: () => ({ eq: async () => ({ data: seatRows, error: null }) }),
        };
      }
      return {
        select: () => ({
          in: () => ({ or: async () => ({ data: grantRows, error: null }) }),
        }),
      };
    },
  }),
}));

const TODAY = new Date().toISOString().slice(0, 10);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  seatRows.length = 0;
  grantRows = [];
});

describe('useProjectAuthority — the window a closed seat closes', () => {
  it('drops a grant the seat ended today, and keeps the live seat’s (r19 MAJOR-1)', async () => {
    seatRows.push(
      { id: 'seat-open', off_job_at: null },
      { id: 'seat-closed', off_job_at: TODAY },
    );
    grantRows = [
      {
        id: 'g-open',
        engagement_id: 'seat-open',
        scope: 'money',
        threshold_cents: 1000000,
        effective_to: null,
      },
      {
        id: 'g-closed',
        engagement_id: 'seat-closed',
        scope: 'money',
        threshold_cents: 250000,
        effective_to: TODAY,
      },
    ];
    const { result } = renderHook(() => useProjectAuthority('okonkwo'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Object.keys(result.current.data ?? {})).toEqual(['seat-open']);
    expect(result.current.data?.['seat-open']).toHaveLength(1);
  });

  it('keeps a grant still OPEN on a closed seat — that state is shown, not hidden', async () => {
    seatRows.push({ id: 'seat-closed', off_job_at: '2026-01-01' });
    grantRows = [
      {
        id: 'g-still-open',
        engagement_id: 'seat-closed',
        scope: 'money',
        threshold_cents: 250000,
        effective_to: null,
      },
    ];
    const { result } = renderHook(() => useProjectAuthority('okonkwo'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.['seat-closed']).toHaveLength(1);
  });

  it('keeps a live seat’s grant that ends in the future', async () => {
    seatRows.push({ id: 'seat-open', off_job_at: null });
    grantRows = [
      {
        id: 'g-dated',
        engagement_id: 'seat-open',
        scope: 'money',
        threshold_cents: 500000,
        effective_to: '2099-01-01',
      },
    ];
    const { result } = renderHook(() => useProjectAuthority('okonkwo'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.['seat-open']).toHaveLength(1);
  });
});
