import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-agreement-parts rig. useQuery is an identity function, so a
// hook call returns its own config and the test can read the key and run the
// queryFn directly.
// ─────────────────────────────────────────────────────────────────────────────

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  functions: { invoke: vi.fn() },
  from,
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
  agreementPartEventsKeys,
  mapAgreementPartEvent,
  useAgreementPartEvents,
  type AgreementPartEventRow,
} from '../use-agreement-part-events';

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ order });
  select.mockReturnValue({ eq });
  from.mockReturnValue({ select });
});

const row = (over: Partial<AgreementPartEventRow> = {}): AgreementPartEventRow => ({
  id: 'event-1',
  proposal_id: 'prop-1',
  part_id: 'part-1',
  part_key: 'patina.services',
  action: 'added',
  actor: 'user-1',
  actor_name: 'Marguerite',
  why: 'Added the study to the scope',
  before: null,
  after: { title: 'Services' },
  at: '2026-09-07T10:00:00Z',
  ...over,
});

describe('agreementPartEventsKeys', () => {
  it('keys one agreement’s history under the family prefix', () => {
    expect(agreementPartEventsKeys.list('prop-1')).toEqual([
      'agreement-part-events',
      'prop-1',
    ]);
    // The prefix is what a cross-domain invalidation reaches for.
    expect(agreementPartEventsKeys.all).toEqual(['agreement-part-events']);
    expect(agreementPartEventsKeys.list('prop-1').slice(0, 1)).toEqual([
      ...agreementPartEventsKeys.all,
    ]);
  });
});

describe('mapAgreementPartEvent', () => {
  it('carries every column across, camelCased', () => {
    expect(mapAgreementPartEvent(row())).toEqual({
      id: 'event-1',
      proposalId: 'prop-1',
      partId: 'part-1',
      partKey: 'patina.services',
      action: 'added',
      actor: 'user-1',
      actorName: 'Marguerite',
      why: 'Added the study to the scope',
      before: null,
      after: { title: 'Services' },
      at: '2026-09-07T10:00:00Z',
    });
  });

  it('reads a removed part’s event, where the part id is gone', () => {
    const mapped = mapAgreementPartEvent(
      row({ action: 'removed', part_id: null, before: { title: 'Ceiling' }, after: null }),
    );
    expect(mapped.partId).toBeNull();
    expect(mapped.action).toBe('removed');
    expect(mapped.before).toEqual({ title: 'Ceiling' });
    expect(mapped.after).toBeNull();
  });

  it('reads an event nobody attributed, and never invents a name', () => {
    const mapped = mapAgreementPartEvent(row({ actor: null, actor_name: null, why: null }));
    expect(mapped.actor).toBeNull();
    expect(mapped.actorName).toBeNull();
    expect(mapped.why).toBeNull();
  });
});

describe('useAgreementPartEvents', () => {
  it('reads one agreement’s history newest first', async () => {
    order.mockResolvedValue({ data: [row(), row({ id: 'event-2' })], error: null });

    const query = useAgreementPartEvents('prop-1') as any;
    expect(query.queryKey).toEqual(agreementPartEventsKeys.list('prop-1'));
    expect(query.enabled).toBe(true);

    const result = await query.queryFn();
    expect(from).toHaveBeenCalledWith('agreement_part_events');
    expect(eq).toHaveBeenCalledWith('proposal_id', 'prop-1');
    expect(order).toHaveBeenCalledWith('at', { ascending: false });
    expect(result.map((event: { id: string }) => event.id)).toEqual(['event-1', 'event-2']);
  });

  it('answers an empty history with an empty list, not a throw', async () => {
    order.mockResolvedValue({ data: null, error: null });
    const query = useAgreementPartEvents('prop-1') as any;
    await expect(query.queryFn()).resolves.toEqual([]);
  });

  it('raises the database’s own refusal rather than swallowing it', async () => {
    order.mockResolvedValue({ data: null, error: new Error('permission denied') });
    const query = useAgreementPartEvents('prop-1') as any;
    await expect(query.queryFn()).rejects.toThrow('permission denied');
  });

  it('asks nothing until it has an agreement to ask about', () => {
    expect((useAgreementPartEvents(null) as any).enabled).toBe(false);
    expect((useAgreementPartEvents(undefined) as any).enabled).toBe(false);
  });
});
