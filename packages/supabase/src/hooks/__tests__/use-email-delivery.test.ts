import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors the use-invoices rig: the Supabase client and React Query are both
// mocked, so `useQuery` hands back the config object for inspection.
const chain = {
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  order: vi.fn(),
};
const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  functions: { invoke: vi.fn() },
  from: vi.fn(() => chain),
  rpc: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Import AFTER mocks.
import {
  useEmailDelivery,
  deriveEmailDeliveryState,
  shouldPollEmailDelivery,
  emailDeliveryKeys,
  EMAIL_DELIVERY_SELECT,
  EMAIL_DELIVERY_CHUNK,
  type EmailDelivery,
  type EmailDeliveryRow,
} from '../use-email-delivery';

interface DeliveryConfig {
  queryKey: unknown[];
  enabled: boolean;
  staleTime: number;
  refetchIntervalInBackground: boolean;
  /** Typed against TanStack's `Query` in the hook; only `.state.data` is read. */
  refetchInterval: (q: {
    state: { data: Record<string, EmailDelivery> | undefined };
  }) => number | false;
  queryFn: () => Promise<Record<string, EmailDelivery>>;
}

const config = (refType: Parameters<typeof useEmailDelivery>[0], ids: string[]) =>
  useEmailDelivery(refType, ids) as unknown as DeliveryConfig;

function row(over: Partial<EmailDeliveryRow> = {}): EmailDeliveryRow {
  return {
    id: 'log-1',
    ref_id: 'ref-1',
    recipient: 'dave@okonkwo.net',
    status: 'sent',
    sent_at: '2026-09-08T14:00:00.000Z',
    delivered_at: null,
    bounced_at: null,
    bounce_type: null,
    bounce_reason: null,
    delayed_at: null,
    last_event: null,
    last_event_at: null,
    created_at: '2026-09-08T14:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.order.mockResolvedValue({ data: [], error: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveEmailDeliveryState — every branch
// ─────────────────────────────────────────────────────────────────────────────

describe('deriveEmailDeliveryState', () => {
  it('reads the terminal provider verdicts as themselves', () => {
    expect(deriveEmailDeliveryState(row({ status: 'bounced' }))).toBe('bounced');
    expect(deriveEmailDeliveryState(row({ status: 'complained' }))).toBe('complained');
    expect(deriveEmailDeliveryState(row({ status: 'failed' }))).toBe('failed');
    expect(deriveEmailDeliveryState(row({ status: 'suppressed' }))).toBe('suppressed');
  });

  it('collapses clicked onto opened', () => {
    expect(deriveEmailDeliveryState(row({ status: 'opened' }))).toBe('opened');
    expect(deriveEmailDeliveryState(row({ status: 'clicked' }))).toBe('opened');
  });

  it('reads delivered as delivered', () => {
    expect(deriveEmailDeliveryState(row({ status: 'delivered' }))).toBe('delivered');
  });

  it('separates a retrying send from a plain one', () => {
    expect(deriveEmailDeliveryState(row({ status: 'sent' }))).toBe('sent');
    expect(
      deriveEmailDeliveryState(
        row({ status: 'sent', delayed_at: '2026-09-08T15:00:00.000Z' }),
      ),
    ).toBe('delayed');
    // A delay that later landed is no longer a delay.
    expect(
      deriveEmailDeliveryState(
        row({
          status: 'sent',
          delayed_at: '2026-09-08T15:00:00.000Z',
          delivered_at: '2026-09-08T15:05:00.000Z',
        }),
      ),
    ).toBe('sent');
  });

  it('reads everything still in the pipe as sending', () => {
    expect(deriveEmailDeliveryState(row({ status: 'queued' }))).toBe('sending');
    expect(deriveEmailDeliveryState(row({ status: 'sending' }))).toBe('sending');
    expect(deriveEmailDeliveryState(row({ status: 'unconfirmed' }))).toBe('sending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query key
// ─────────────────────────────────────────────────────────────────────────────

describe('emailDeliveryKeys', () => {
  it('sorts the ids so the same batch in any order is one cache entry', () => {
    expect(emailDeliveryKeys.list('invoice', ['b', 'a'])).toEqual([
      'email-delivery',
      'invoice',
      'a,b',
    ]);
    expect(emailDeliveryKeys.list('invoice', ['a', 'b'])).toEqual(
      emailDeliveryKeys.list('invoice', ['b', 'a']),
    );
  });

  it('does not mutate the caller’s array', () => {
    const ids = ['b', 'a'];
    emailDeliveryKeys.list('proposal', ids);
    expect(ids).toEqual(['b', 'a']);
  });

  it('is the key the hook reads under', () => {
    expect(config('client_review', ['r2', 'r1']).queryKey).toEqual([
      'email-delivery',
      'client_review',
      'r1,r2',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useEmailDelivery
// ─────────────────────────────────────────────────────────────────────────────

describe('useEmailDelivery', () => {
  it('stays disabled with nothing to ask about', () => {
    expect(config('invoice', []).enabled).toBe(false);
    expect(config('invoice', ['inv-1']).enabled).toBe(true);
  });

  it('holds the read for 15s and never polls in the background', () => {
    const c = config('invoice', ['inv-1']);
    expect(c.staleTime).toBe(15_000);
    expect(c.refetchIntervalInBackground).toBe(false);
  });

  it('filters to this ref type’s emails, newest first', async () => {
    await config('client_invitation', ['i-1', 'i-2']).queryFn();
    expect(supabaseClient.from).toHaveBeenCalledWith('notification_log');
    expect(chain.select).toHaveBeenCalledWith(EMAIL_DELIVERY_SELECT);
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'channel', 'email');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'ref_type', 'client_invitation');
    expect(chain.in).toHaveBeenCalledWith('ref_id', ['i-1', 'i-2']);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('keeps only the latest row per ref', async () => {
    chain.order.mockResolvedValue({
      data: [
        row({ id: 'log-new', ref_id: 'inv-1', status: 'bounced', created_at: '2026-09-09T10:00:00.000Z' }),
        row({ id: 'log-old', ref_id: 'inv-1', status: 'delivered', created_at: '2026-09-08T10:00:00.000Z' }),
        row({ id: 'log-other', ref_id: 'inv-2', status: 'opened' }),
      ],
      error: null,
    });
    const byRef = await config('invoice', ['inv-1', 'inv-2']).queryFn();
    expect(Object.keys(byRef).sort()).toEqual(['inv-1', 'inv-2']);
    expect(byRef['inv-1'].logId).toBe('log-new');
    expect(byRef['inv-1'].state).toBe('bounced');
    expect(byRef['inv-2'].state).toBe('opened');
  });

  it('maps the row onto the camelCase reading', async () => {
    chain.order.mockResolvedValue({
      data: [
        row({
          status: 'bounced',
          bounced_at: '2026-09-09T10:00:00.000Z',
          bounce_type: 'permanent',
          bounce_reason: 'mailbox does not exist',
          last_event: 'email.bounced',
          last_event_at: '2026-09-09T10:00:00.000Z',
        }),
      ],
      error: null,
    });
    const byRef = await config('invoice', ['ref-1']).queryFn();
    expect(byRef['ref-1']).toEqual({
      logId: 'log-1',
      refId: 'ref-1',
      recipient: 'dave@okonkwo.net',
      state: 'bounced',
      status: 'bounced',
      sentAt: '2026-09-08T14:00:00.000Z',
      deliveredAt: null,
      bouncedAt: '2026-09-09T10:00:00.000Z',
      bounceType: 'permanent',
      bounceReason: 'mailbox does not exist',
      delayedAt: null,
      lastEvent: 'email.bounced',
      lastEventAt: '2026-09-09T10:00:00.000Z',
      createdAt: '2026-09-08T14:00:00.000Z',
    });
  });

  it('throws the read error rather than answering nothing', async () => {
    chain.order.mockResolvedValue({ data: null, error: new Error('rls') });
    await expect(config('invoice', ['inv-1']).queryFn()).rejects.toThrow('rls');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refetchInterval
// ─────────────────────────────────────────────────────────────────────────────

describe('refetchInterval', () => {
  const now = Date.parse('2026-09-09T12:00:00.000Z');
  const delivery = (over: Partial<EmailDelivery>): EmailDelivery => ({
    logId: 'log-1',
    refId: 'ref-1',
    recipient: null,
    state: 'sent',
    status: 'sent',
    sentAt: null,
    deliveredAt: null,
    bouncedAt: null,
    bounceType: null,
    bounceReason: null,
    delayedAt: null,
    lastEvent: null,
    lastEventAt: null,
    createdAt: '2026-09-09T11:00:00.000Z',
    ...over,
  });

  it('polls while a recent send is still in motion', () => {
    for (const state of ['sending', 'sent', 'delayed'] as const) {
      expect(shouldPollEmailDelivery({ a: delivery({ state }) }, now)).toBe(true);
    }
  });

  it('stops once the send has settled', () => {
    for (const state of ['delivered', 'opened', 'bounced', 'complained', 'failed', 'suppressed'] as const) {
      expect(shouldPollEmailDelivery({ a: delivery({ state }) }, now)).toBe(false);
    }
  });

  it('stops asking about a send older than 48 hours', () => {
    expect(
      shouldPollEmailDelivery(
        { a: delivery({ state: 'sent', createdAt: '2026-09-06T11:00:00.000Z' }) },
        now,
      ),
    ).toBe(false);
  });

  it('polls when any one of a batch is still in motion', () => {
    expect(
      shouldPollEmailDelivery(
        { a: delivery({ state: 'delivered' }), b: delivery({ state: 'sending' }) },
        now,
      ),
    ).toBe(true);
  });

  it('does not poll before anything has been read', () => {
    expect(shouldPollEmailDelivery(undefined, now)).toBe(false);
    expect(shouldPollEmailDelivery({}, now)).toBe(false);
  });

  it('is wired into the query config, reading the query’s own state', () => {
    const c = config('invoice', ['inv-1']);
    expect(c.refetchInterval({ state: { data: {} } })).toBe(false);
    expect(c.refetchInterval({ state: { data: undefined } })).toBe(false);
    expect(
      c.refetchInterval({
        state: { data: { a: delivery({ state: 'sending', createdAt: new Date().toISOString() }) } },
      }),
    ).toBe(30_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dedupe, chunking, and the stable empty answer
// ─────────────────────────────────────────────────────────────────────────────

describe('the ids the hook actually asks about', () => {
  it('dedupes and sorts them for the key AND the request', async () => {
    const c = config('invoice', ['b', 'a', 'b', 'a', 'c']);
    expect(c.queryKey).toEqual(['email-delivery', 'invoice', 'a,b,c']);
    await c.queryFn();
    expect(chain.in).toHaveBeenCalledTimes(1);
    expect(chain.in).toHaveBeenCalledWith('ref_id', ['a', 'b', 'c']);
  });

  it('splits a ledger-sized batch into chunks of 100', async () => {
    // The Accounts ledger passes every non-draft invoice, which is not a
    // number PostgREST will take in one `.in()` URL filter.
    const ids = Array.from({ length: 250 }, (_, i) => `inv-${String(i).padStart(3, '0')}`);
    await config('invoice', ids).queryFn();
    expect(EMAIL_DELIVERY_CHUNK).toBe(100);
    expect(supabaseClient.from).toHaveBeenCalledTimes(3);
    expect(chain.in).toHaveBeenCalledTimes(3);
    const batches = chain.in.mock.calls.map((call) => call[1] as string[]);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    // Every id is asked about exactly once, in sorted order.
    expect(batches.flat()).toEqual([...ids].sort());
  });

  it('merges the chunks into one byRef answer', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `inv-${String(i).padStart(3, '0')}`);
    chain.order
      .mockResolvedValueOnce({ data: [row({ ref_id: 'inv-000', status: 'bounced' })], error: null })
      .mockResolvedValueOnce({ data: [row({ ref_id: 'inv-149', status: 'delivered' })], error: null });
    const byRef = await config('invoice', ids).queryFn();
    expect(Object.keys(byRef).sort()).toEqual(['inv-000', 'inv-149']);
    expect(byRef['inv-000'].state).toBe('bounced');
    expect(byRef['inv-149'].state).toBe('delivered');
  });

  it('throws when any one chunk is refused', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `inv-${String(i).padStart(3, '0')}`);
    chain.order
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('rls') });
    await expect(config('invoice', ids).queryFn()).rejects.toThrow('rls');
  });
});

describe('byRef before anything has been read', () => {
  it('is the same frozen object every render, so a memo on it never re-fires', () => {
    const first = useEmailDelivery('invoice', ['inv-1']) as unknown as {
      byRef: Record<string, EmailDelivery>;
    };
    const second = useEmailDelivery('invoice', ['inv-2']) as unknown as {
      byRef: Record<string, EmailDelivery>;
    };
    expect(first.byRef).toEqual({});
    expect(first.byRef).toBe(second.byRef);
    expect(Object.isFrozen(first.byRef)).toBe(true);
  });
});
