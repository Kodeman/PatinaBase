import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-agreement-parts rig. useQuery/useMutation are identity
// functions, so a hook call returns its own config object and the test can read
// the query key, run the queryFn, and invoke the mutationFn directly.
// ─────────────────────────────────────────────────────────────────────────────

const rowsResult = {
  data: [
    {
      id: 'rate-2',
      studio_id: 'studio-1',
      user_id: 'member-1',
      hourly_rate_cents: 18000,
      effective_from: '2026-09-11',
      effective_to: null,
      created_by: 'owner-1',
      created_at: '2026-09-11T00:00:00Z',
    },
  ],
  error: null,
};

const orderSecond = vi.fn(() => Promise.resolve(rowsResult));
const orderFirst = vi.fn(() => ({ order: orderSecond }));
const eq = vi.fn(() => ({ order: orderFirst }));
const select = vi.fn(() => ({ eq }));

const single = vi.fn(() => Promise.resolve({ data: rowsResult.data[0], error: null }));
const selectAfterUpsert = vi.fn(() => ({ single }));
const upsert = vi.fn(() => ({ select: selectAfterUpsert }));

const from = vi.fn(() => ({ select, upsert }));

const supabaseClient = {
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'owner-1' } } })),
    getSession: vi.fn(),
  },
  functions: { invoke: vi.fn() },
  from,
  rpc: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import {
  studioMemberRateKeys,
  useStudioMemberRates,
  useSetStudioMemberRate,
} from '../use-studio-member-rates';

beforeEach(() => {
  vi.clearAllMocks();
  orderSecond.mockReturnValue(Promise.resolve(rowsResult));
  orderFirst.mockReturnValue({ order: orderSecond });
  eq.mockReturnValue({ order: orderFirst });
  select.mockReturnValue({ eq });
  single.mockReturnValue(Promise.resolve({ data: rowsResult.data[0], error: null }));
  selectAfterUpsert.mockReturnValue({ single });
  upsert.mockReturnValue({ select: selectAfterUpsert });
  from.mockReturnValue({ select, upsert });
  supabaseClient.auth.getUser.mockReturnValue(
    Promise.resolve({ data: { user: { id: 'owner-1' } } }),
  );
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — list plural + params, entity singular + id.
// ─────────────────────────────────────────────────────────────────────────────

describe('studioMemberRateKeys', () => {
  it('keys the list on the studio and the entity on the member', () => {
    expect(studioMemberRateKeys.list('studio-1')).toEqual(['studio-member-rates', 'studio-1']);
    expect(studioMemberRateKeys.entity('member-1')).toEqual(['studio-member-rate', 'member-1']);
  });
});

describe('useStudioMemberRates', () => {
  it('reads every dated row for the studio, newest first per member', async () => {
    const query = useStudioMemberRates('studio-1') as unknown as {
      queryKey: unknown;
      enabled: boolean;
      queryFn: () => Promise<unknown>;
    };

    expect(query.queryKey).toEqual(['studio-member-rates', 'studio-1']);
    expect(query.enabled).toBe(true);

    const rows = await query.queryFn();
    expect(from).toHaveBeenCalledWith('studio_member_rates');
    expect(eq).toHaveBeenCalledWith('studio_id', 'studio-1');
    expect(orderFirst).toHaveBeenCalledWith('user_id', { ascending: true });
    expect(orderSecond).toHaveBeenCalledWith('effective_from', { ascending: false });
    expect(rows).toEqual(rowsResult.data);
  });

  it('stays disabled with no studio', () => {
    const query = useStudioMemberRates(null) as unknown as { enabled: boolean };
    expect(query.enabled).toBe(false);
  });
});

describe('useSetStudioMemberRate', () => {
  it('upserts a dated row stamped with the acting user, defaulting to today', async () => {
    const mutation = useSetStudioMemberRate() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await mutation.mutationFn({
      studioId: 'studio-1',
      userId: 'member-1',
      hourlyRateCents: 18000,
    });

    const [payload, options] = upsert.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    // created_by must be the actor: studio_member_rates_admin_insert's WITH CHECK
    // requires created_by = auth.uid().
    expect(payload.created_by).toBe('owner-1');
    expect(payload.studio_id).toBe('studio-1');
    expect(payload.user_id).toBe('member-1');
    expect(payload.hourly_rate_cents).toBe(18000);
    expect(payload.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Blur-save writes twice on the same day; that is a correction to today's
    // row, not a UNIQUE (studio_id, user_id, effective_from) violation.
    expect(options).toEqual({ onConflict: 'studio_id,user_id,effective_from' });
    // effective_to is the trigger's to set, never the client's.
    expect(Object.keys(payload).sort()).toEqual([
      'created_by',
      'effective_from',
      'hourly_rate_cents',
      'studio_id',
      'user_id',
    ]);
  });

  it('honours an explicit effective_from', async () => {
    const mutation = useSetStudioMemberRate() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await mutation.mutationFn({
      studioId: 'studio-1',
      userId: 'member-1',
      hourlyRateCents: 16000,
      effectiveFrom: '2026-09-01',
    });
    const [payload] = upsert.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(payload.effective_from).toBe('2026-09-01');
  });

  it('refuses to write with no session', async () => {
    supabaseClient.auth.getUser.mockReturnValue(Promise.resolve({ data: { user: null } }) as never);
    const mutation = useSetStudioMemberRate() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(
      mutation.mutationFn({ studioId: 'studio-1', userId: 'member-1', hourlyRateCents: 1 }),
    ).rejects.toThrow('Not signed in');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('invalidates both rate keys and the Hours ledger reads the rate prices', () => {
    const mutation = useSetStudioMemberRate() as unknown as {
      onSuccess: (data: unknown, input: unknown) => void;
    };

    mutation.onSuccess(null, { studioId: 'studio-1', userId: 'member-1', hourlyRateCents: 18000 });

    expect(invalidatedKeys()).toEqual([
      ['studio-member-rates', 'studio-1'],
      ['studio-member-rate', 'member-1'],
      ['document-hours-week'],
      ['document-hours-unbilled'],
    ]);
  });
});
