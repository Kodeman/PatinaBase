/**
 * US-34 N7 — the Document reads its red-letter need for its own engagement
 * (useEngagementNeed: desk_read with p_engagement_id) instead of the whole
 * Desk (useDeskEngagements: desk_read for the studio). The need must stay
 * exact: selectOperationalNeed(s)ForDocument answers the same from the scoped
 * inputs as from the Desk's.
 *
 *   1. Composition: partitionDesk over one row and that job's slice of each
 *      feed answers what partitionDesk over the whole studio answers, over the
 *      selector suite's fixtures plus the two studio-wide inputs (an install
 *      collision and the week's Pulse count).
 *   2. Transport: both hooks run against one studio through a desk_read
 *      stand-in that scopes each feed the way 00791's SCOPE note says
 *      (project feeds by project_id, flags by proposal_id, ceremonies by lead
 *      or relationship, leads by lead_id, delivery_events never), so the
 *      scoped hook is proven to ask for this job alone and still compose the
 *      same need.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- @patina/supabase: one studio behind a desk_read stand-in -------------
type Row = Record<string, unknown>;
interface TableRead {
  table: string;
  columns: string;
  filters: Array<[string, unknown]>;
}
let mockStudio: Record<string, unknown> = {};
const mockRpc = jest.fn();
const mockTableReads: TableRead[] = [];

/** Each scoped feed and the key 00791 narrows it by. */
const mockProjectOf = (feeds: Record<string, unknown>) => {
  const phaseProject = new Map(
    ((feeds.phases ?? []) as Row[]).map((p) => [p.id, p.project_id]),
  );
  const poProject = new Map(
    ((feeds.claim_notices ?? []) as Array<{ purchase_order: Row }>).map((n) => [
      n.purchase_order.id,
      n.purchase_order.project_id,
    ]),
  );
  const own = (r: Row) => r.project_id;
  const viaPo = (r: Row) => (r.purchase_order as Row | undefined)?.project_id;
  return {
    receivables: own, phases: own, schedule_proposals: own, returns: own, drafts: own,
    outbound_drafts: own, quotes: own, exceptions: own, samples: own, live_proposals: own,
    paid_invoices: own, sent_purchase_orders: own,
    project_starts: (r: Row) => r.id,
    milestones: (r: Row) => phaseProject.get(r.phase_id),
    claim_notices: viaPo,
    payment_notices: viaPo,
    paid_po_payments: viaPo,
    claim_deadlines: (r: Row) => poProject.get(r.purchase_order_id),
    held: (r: Row) => r.projectId,
  } as Record<string, (r: Row) => unknown>;
};

function mockDeskRead(params?: { p_engagement_id?: string }) {
  const feeds = mockStudio;
  if (!params?.p_engagement_id) return { data: feeds, error: null };
  const id = params.p_engagement_id;
  const engagements = ((feeds.engagements ?? []) as Row[]).filter((r) => r.engagement_id === id);
  const row = engagements[0];
  const projectId = row?.project_id ?? null;
  const proposalId = row?.proposal_id ?? null;
  const leadId = row?.lead_id ?? null;
  const keep = (feed: unknown, match: (r: Row) => boolean) =>
    Array.isArray(feed) ? (feed as Row[]).filter(match) : feed;
  const scoped: Record<string, unknown> = { ...feeds, engagements };
  for (const [key, keyOf] of Object.entries(mockProjectOf(feeds))) {
    scoped[key] = keep(feeds[key], (r) => projectId !== null && keyOf(r) === projectId);
  }
  scoped.flagged_lines = keep(
    feeds.flagged_lines,
    (r) => proposalId !== null && (r.proposal_items as Row).proposal_id === proposalId,
  );
  scoped.flagged_board_pins = keep(
    feeds.flagged_board_pins,
    (r) =>
      proposalId !== null &&
      ((r.proposal_board_items as Row).proposal_boards as Row).proposal_id === proposalId,
  );
  scoped.ceremonies = keep(
    feeds.ceremonies,
    (r) => (leadId !== null && r.lead_id === leadId) || r.designer_client_id === id,
  );
  scoped.leads = keep(feeds.leads, (r) => leadId !== null && r.id === leadId);
  return { data: scoped, error: null };
}

function mockTable(table: string) {
  const read: TableRead = { table, columns: '', filters: [] };
  mockTableReads.push(read);
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      read.columns = columns;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      read.filters.push([column, value]);
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: ((mockStudio.engagements ?? []) as Row[]).filter((row) =>
          read.filters.every(([column, value]) => row[column] === value),
        ),
        error: null,
      }).then(resolve, reject),
  };
  return builder;
}

jest.mock('@patina/supabase', () => ({
  // The derivations' pure helpers (calendarDaysPast and kin) stay real.
  ...jest.requireActual('@patina/supabase'),
  createBrowserClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => mockTable(table),
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }),
    },
  })),
  docKeys: {
    all: ['document-state'],
    desk: () => ['document-state', 'desk'],
    engagement: (id: string | null) => ['document-state', 'engagement', id],
  },
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { deskZeroRowRead: jest.fn() },
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

import {
  selectOperationalNeedForDocument,
  selectOperationalNeedsForDocument,
  useDeskEngagements,
} from '../use-desk-engagements';
import { useEngagementNeed } from '../use-engagement-need';
import { partitionDesk, type DocumentStateRow } from '@/lib/document/desk-derivation';


// ---- shared fixtures ---------------------------------------------------------

/** The selector suite's row (use-desk-engagements.test.tsx), whole. */
const base = {
  engagement_kind: 'lead', engagement_id: 'lead-1', project_id: null, proposal_id: null,
  lead_id: 'lead-1', is_archived: false, lead_status: 'new', lead_response_deadline: null,
  open_claim_count: 0, updated_at: '2026-08-01T12:00:00Z',
  client_name: 'Avery Stone', title: 'Stone Residence', designer_id: 'designer-1',
  client_profile_id: 'client-1', active_section: 'project', is_paused: false,
  project_status: 'active', current_phase: 'design_development', proposal_status: null,
  proposal_sent_at: null, proposal_viewed_at: null, overdue_decision_count: 0,
  awaiting_inspection_count: 0, blocked_item_count: 0, in_flight_count: 0,
  installed_count: 0, item_count: 0, open_claim_po: null, unsent_pulse_count: 0,
  pulse_week_of: null, draft_unsent_po_count: 0, oldest_draft_po_created_at: null,
  draft_po_label: null, unacked_po_count: 0, oldest_unacked_sent_at: null,
  unacked_po_label: null, due_task_count: 0, earliest_task_due: null, due_task_title: null,
} as unknown as DocumentStateRow;

const PULSE_WEEK = '2026-08-03';
const project = (id: string, extra: Partial<DocumentStateRow> = {}): DocumentStateRow => ({
  ...base,
  engagement_kind: 'project',
  engagement_id: `job-${id}`,
  project_id: `p-${id}`,
  lead_id: null,
  lead_status: null,
  title: `House ${id}`,
  ...extra,
});

/** One studio: two installs colliding, a week of Pulses, a debt, flags, a lead. */
const STUDIO: DocumentStateRow[] = [
  project('a', { unsent_pulse_count: 2, pulse_week_of: PULSE_WEEK }),
  project('b', { unsent_pulse_count: 1, pulse_week_of: PULSE_WEEK }),
  project('c'),
  project('quiet'),
  project('paused', { is_paused: true, unsent_pulse_count: 4, pulse_week_of: PULSE_WEEK }),
  project('archived', { is_archived: true }),
  {
    ...base,
    engagement_kind: 'proposal', engagement_id: 'chain-1', proposal_id: 'prop-v2',
    project_id: null, lead_id: null, lead_status: null, active_section: 'proposal',
    proposal_status: 'sent', title: 'Design agreement',
  } as DocumentStateRow,
  { ...base, engagement_kind: 'lead', active_section: 'brief' } as DocumentStateRow,
];

const keep = <V,>(map: Map<string, V>, key: string | null) =>
  key ? new Map([...map].filter(([k]) => k === key)) : undefined;

const expectSameNeeds = (
  desk: Parameters<typeof selectOperationalNeedForDocument>[0],
  scoped: Parameters<typeof selectOperationalNeedForDocument>[0],
  engagementId: string,
) => {
  expect(selectOperationalNeedForDocument(scoped, engagementId)).toEqual(
    selectOperationalNeedForDocument(desk, engagementId),
  );
  expect(selectOperationalNeedsForDocument(scoped, engagementId)).toEqual(
    selectOperationalNeedsForDocument(desk, engagementId),
  );
};

describe('operational need parity — composition', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const conflicts = new Map([
    ['p-a', { collision: { text: 'Two installs collide — week of Aug 17', label: 'COLLISION', date: '2026-08-17' }, drift: null }],
    ['p-b', { collision: { text: 'Two installs collide — week of Aug 17', label: 'COLLISION', date: '2026-08-17' }, drift: null }],
  ]);
  const receivables = new Map([
    ['p-c', { count: 1, oldestDue: '2026-07-01', totalBalanceCents: 1000, invoiceId: 'invoice-1', invoiceLabel: 'Invoice 1' }],
  ]);
  const flagged = new Map([
    ['prop-v2', { count: 2, docTitle: 'Design agreement', proposalId: 'prop-v2' }],
    ['prop-other', { count: 1, docTitle: 'Another studio file', proposalId: 'prop-other' }],
  ]);
  const ceremonies = new Map([
    ['lead-1', { id: 'ceremony-1', state: 'draft', introText: 'Hello Avery', offeredSlots: null, offeredAt: null, pickedSlotStartsAt: null, timezone: null, threadId: null }],
    ['lead-2', { id: 'ceremony-2', state: 'draft', introText: 'Hello Blair', offeredSlots: null, offeredAt: null, pickedSlotStartsAt: null, timezone: null, threadId: null }],
  ]);
  const desk = partitionDesk(STUDIO, now, conflicts, receivables, flagged as never, ceremonies as never);

  it.each(STUDIO.map((row) => [row.engagement_id, row] as const))(
    'answers %s the same from its own slice as from the whole Desk',
    (engagementId, row) => {
      // What the scoped read hands partitionDesk: this job's key of each feed
      // (a feed the row has no key for is never asked), and the week's Pulse
      // columns only while this job has unsent Pulses.
      const pulseRows =
        row.unsent_pulse_count > 0
          ? STUDIO.filter((r) => r.pulse_week_of === row.pulse_week_of)
          : [row];
      const scoped = partitionDesk(
        [row],
        now,
        keep(conflicts, row.project_id),
        keep(receivables, row.project_id),
        keep(flagged, row.proposal_id) as never,
        row.engagement_kind === 'lead' ? (keep(ceremonies, row.lead_id) as never) : undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        pulseRows,
      );
      expectSameNeeds(desk, scoped, engagementId);
    },
  );

  it('is not vacuous: each studio-wide input reaches its job', () => {
    const kinds = (id: string) =>
      (selectOperationalNeedsForDocument(desk, id) ?? []).map((need) => need.kind);
    expect(kinds('job-a')).toEqual(expect.arrayContaining(['schedule_conflict', 'pulse_due']));
    expect(
      selectOperationalNeedsForDocument(desk, 'job-b')?.find((need) => need.kind === 'pulse_due')?.text,
    ).toBe('Review and send 3 Pulses');
    expect(kinds('job-c')).toContain('overdue_invoice');
    expect(kinds('chain-1')).toContain('lines_flagged');
    expect(kinds('lead-1')).toContain('ceremony_pending');
    expect(selectOperationalNeedForDocument(desk, 'job-archived')).toBeUndefined();
  });
});


// ---- transport: both hooks over one studio's desk_read ---------------------

const NOW = new Date('2026-08-12T15:00:00Z');
const INSTALL_DAY = '2026-08-20';

/** One studio's desk_read answer: every feed 00791 returns, in its shape. */
function studioFeeds(): Record<string, unknown> {
  const install = (projectId: string, id: string) => ({
    id, project_id: projectId, event_type: 'install_milestone', event_date: INSTALL_DAY,
    title: 'Install', status: 'scheduled',
  });
  const rejected = (proposalId: string) => ({
    proposal_items: { proposal_id: proposalId, proposals: { title: `Proposal ${proposalId}` } },
  });
  const ceremony = (id: string, leadId: string, intro: string) => ({
    id, lead_id: leadId, designer_client_id: null, state: 'draft', intro_text: intro,
    offered_slots: null, offered_at: null, picked_slot_starts_at: null, timezone: null,
    thread_id: null, created_at: '2026-08-11T09:00:00Z',
  });
  return {
    engagements: STUDIO,
    delivery_events: [
      install('p-a', 'ev-a'),
      install('p-b', 'ev-b'),
      {
        id: 'ev-c', project_id: 'p-c', event_type: 'delivery', event_date: '2026-09-01',
        title: 'Sofa lands', status: 'scheduled',
      },
    ],
    receivables: [
      {
        id: 'inv-c', project_id: 'p-c', status: 'sent', due_date: '2026-07-01',
        total_cents: 250_000, amount_paid_cents: 0, invoice_number: 'INV-7', ar_last_chased_at: null,
      },
    ],
    flagged_lines: [rejected('prop-v2'), rejected('prop-v2'), rejected('prop-other')],
    flagged_board_pins: [
      {
        proposal_board_items: {
          proposal_boards: { proposal_id: 'prop-v2', proposals: { title: 'Proposal prop-v2' } },
        },
      },
    ],
    ceremonies: [ceremony('cer-1', 'lead-1', 'Hello Avery'), ceremony('cer-2', 'lead-2', 'Hello Blair')],
    phases: [
      {
        id: 'ph-c', project_id: 'p-c', name: 'Design', phase_key: 'design', status: 'in_progress',
        sort_order: 1, lane: null, duration_days: 30, duration_weeks: null, follows_phase_id: null,
        anchor_date: '2026-08-01', start_date: '2026-08-01', target_end_date: '2026-08-31',
      },
    ],
    milestones: [
      {
        id: 'ms-c', phase_id: 'ph-c', name: 'Present the scheme', kind: 'presentation',
        offset_days: 10, anchor_date: null, status: 'pending', sort_order: 1,
      },
    ],
    project_starts: ['a', 'b', 'c', 'quiet', 'paused', 'archived'].map((id) => ({
      id: `p-${id}`, start_date: '2026-07-01',
    })),
    schedule_proposals: [],
    claim_notices: [
      {
        purchase_order: {
          id: 'po-c', project_id: 'p-c', po_number: 'PO-1001', vendor_po_number: null,
          sidemark: null, vendor: { name: 'Hollis Upholstery' },
          inspections: [{ outcome: 'damaged', inspected_at: '2026-08-10', claims: [{ state: 'drafted' }] }],
        },
      },
    ],
    claim_deadlines: [{ purchase_order_id: 'po-c', vendor_deadline: '2026-08-13' }],
    payment_notices: [],
    returns: [],
    drafts: [],
    outbound_drafts: [],
    quotes: [],
    exceptions: [],
    held: [],
    samples: [],
    live_proposals: [],
    paid_invoices: [
      {
        id: 'inv-quiet-paid', project_id: 'p-quiet', invoice_number: 'INV-8', title: 'Deposit',
        total_cents: 50_000, amount_paid_cents: 50_000, paid_at: '2026-08-11T10:00:00.000Z',
      },
    ],
    paid_po_payments: [],
    sent_purchase_orders: [],
    leads: [
      { id: 'lead-1', created_at: '2026-08-11T09:00:00Z', contact_name: 'Avery Stone' },
      { id: 'lead-2', created_at: '2026-08-11T09:00:00Z', contact_name: 'Blair Ash' },
    ],
  };
}

function renderWithClient<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(hook, { wrapper }), queryClient };
}

async function readBoth(engagementId: string) {
  const { result } = renderWithClient(() => ({
    desk: useDeskEngagements(),
    need: useEngagementNeed(engagementId),
  }));
  await waitFor(() => {
    expect(result.current.desk.error ?? null).toBeNull();
    expect(result.current.need.error ?? null).toBeNull();
    expect(result.current.desk.isSuccess).toBe(true);
    expect(result.current.need.isSuccess).toBe(true);
  });
  return { desk: result.current.desk.data, need: result.current.need.data };
}

describe('operational need parity — the scoped read against the Desk read', () => {
  beforeEach(() => {
    // Only the clock is frozen, so both compositions share one `now`;
    // timers stay real for the query client and waitFor.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
        'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    mockStudio = studioFeeds();
    mockTableReads.length = 0;
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (fn: string, params?: { p_engagement_id?: string }) => {
      if (fn !== 'desk_read') throw new Error(`unexpected rpc ${fn}`);
      return mockDeskRead(params);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(STUDIO.map((row) => [row.engagement_id] as const))(
    'composes the same need for %s',
    async (engagementId) => {
      const { desk, need } = await readBoth(engagementId);
      expectSameNeeds(desk, need, engagementId);
    },
  );

  it('carries the studio-wide inputs into one job: a collision and the week’s Pulses', async () => {
    const { need } = await readBoth('job-a');
    const needs = selectOperationalNeedsForDocument(need, 'job-a') ?? [];
    expect(needs.map((n) => n.kind)).toEqual(
      expect.arrayContaining(['schedule_conflict', 'pulse_due']),
    );
    // Job A's 2 and job B's 1; the paused job's 4 never count.
    expect(needs.find((n) => n.kind === 'pulse_due')?.text).toBe('Review and send 3 Pulses');
    expect(needs.find((n) => n.kind === 'schedule_conflict')?.text).toMatch(/Two installs collide/);
  });

  it('is not vacuous: each scoped feed surfaces its job’s need', async () => {
    const kinds = async (engagementId: string) => {
      const { need } = await readBoth(engagementId);
      return (selectOperationalNeedsForDocument(need, engagementId) ?? []).map((n) => n.kind);
    };
    expect(await kinds('job-c')).toEqual(expect.arrayContaining(['overdue_invoice', 'claim_window']));
    expect(await kinds('chain-1')).toContain('lines_flagged');
    expect(await kinds('lead-1')).toContain('ceremony_pending');
  });

  it('asks desk_read for this engagement alone, keyed under docKeys.engagement(id)', async () => {
    const { result, queryClient } = renderWithClient(() => useEngagementNeed('job-c'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc.mock.calls).toEqual([['desk_read', { p_engagement_id: 'job-c' }]]);
    // No Pulses on job C, so no table is read beside the one RPC.
    expect(mockTableReads).toEqual([]);
    // The Document's own invalidations of docKeys.engagement(id) reach it.
    expect(
      queryClient.getQueryCache().findAll({ queryKey: ['document-state', 'engagement', 'job-c'] }),
    ).toHaveLength(1);
  });

  it('reads the week’s Pulse columns, and only those, for a job with unsent Pulses', async () => {
    const { result } = renderWithClient(() => useEngagementNeed('job-a'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockTableReads).toEqual([
      {
        table: 'document_state',
        columns: 'is_archived, is_paused, pulse_week_of, unsent_pulse_count',
        filters: [['pulse_week_of', PULSE_WEEK]],
      },
    ]);
  });

  it('degrades the same way when a feed fails', async () => {
    mockStudio.receivables = { error: 'boom', code: 'XX000' };
    mockStudio.flagged_lines = { error: 'boom', code: 'XX000' };
    for (const engagementId of ['job-c', 'chain-1']) {
      const { desk, need } = await readBoth(engagementId);
      expectSameNeeds(desk, need, engagementId);
    }
  });
});
