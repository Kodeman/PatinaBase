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
// `rpc`, `from` and `auth.getSession` are jest.fn()s configured per-test; the
// factory only wires them up (prefixed `mock*` so babel-plugin-jest-hoist
// allows referencing them from inside jest.mock's factory). N8: the Desk reads
// every feed through one `rpc('desk_read')`; `from` stays wired only so a
// test can prove no table is read directly any more.
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@patina/supabase', () => ({
  fetchReleasedPurchaseOrders: jest.fn(async () => []),
  createBrowserClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  })),
  docKeys: {
    all: ['document-state'],
    desk: (organizationId?: string) => ['document-state', 'desk', ...(organizationId ? [organizationId] : [])],
    engagement: (id: string) => ['document-state', 'engagement', id],
    sectionTasks: (projectId: string | null) => ['section-tasks', projectId],
    sectionGates: (projectId: string | null) => ['section-gates', projectId],
  },
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

import { replaceEqualDeep } from '@tanstack/react-query';
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildDeskStudioDrafts,
  buildDeskClaimWindows,
  buildDeskExceptions,
  buildDeskLandedPayments,
  buildDeskLeads,
  buildDeskProposalOutcomes,
  buildDeskPurchaseOrders,
  buildDeskQuotes,
  buildDeskSamples,
  DESK_LIVE_PROPOSAL_LIMIT,
  DESK_PHASE_LIMIT,
  DESK_PROPOSAL_LIMIT,
  DESK_SENT_PO_LIMIT,
  selectOperationalNeedForDocument,
  useDeskEngagements,
} from '../use-desk-engagements';
import { partitionDesk, type DocumentStateRow } from '@/lib/document/desk-derivation';
import { deriveDeskRoster } from '@/lib/document/desk-roster-derivation';

/** Every feed desk_read (00791) answers, each an empty answer by default. */
const DESK_READ_FEEDS = [
  'engagements', 'delivery_events', 'receivables', 'flagged_lines', 'flagged_board_pins',
  'ceremonies', 'phases', 'milestones', 'project_starts', 'schedule_proposals',
  'claim_notices', 'claim_deadlines', 'payment_notices', 'returns', 'drafts',
  'outbound_drafts', 'quotes', 'exceptions', 'held', 'samples', 'live_proposals',
  'paid_invoices', 'paid_po_payments', 'sent_purchase_orders', 'leads',
] as const;
type DeskFeedKey = (typeof DESK_READ_FEEDS)[number];

/** A feed that failed inside the RPC answers its error, not rows. */
const FAILED_FEED = { error: 'boom', code: 'XX000' };

/** Answers one desk_read: every feed empty unless overridden. */
function mockDeskRead(feeds: Partial<Record<DeskFeedKey, unknown>> = {}) {
  const read = Object.fromEntries(DESK_READ_FEEDS.map((key) => [key, [] as unknown]));
  mockRpc.mockImplementation(async () => ({ data: { ...read, ...feeds }, error: null }));
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
    mockRpc.mockReset();
    mockGetSession.mockReset();
    mockDeskZeroRowRead.mockReset();
  });

  it('throws when document_state returns 0 rows and there is no valid session', async () => {
    mockDeskRead();
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
    mockDeskRead();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ folders: [], chips: [], live: [], composed: {}, unreadFeeds: [], studioDrafts: [] });
    expect(result.current.isError).toBe(false);
    // A genuinely quiet desk on first load has nothing to compare against —
    // no breadcrumb.
    expect(mockDeskZeroRowRead).not.toHaveBeenCalled();
  });

  it('wires placeholderData to keepPreviousData', async () => {
    mockDeskRead();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });

    renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });

    await waitFor(() => expect((useQuery as jest.Mock).mock.calls.length).toBeGreaterThan(0));
    const passedOptions = (useQuery as jest.Mock).mock.calls[0][0];
    expect(passedOptions.placeholderData).toBe(keepPreviousData);
  });

  it('keeps the shared Desk cache key while allowing document-stage gating', () => {
    renderHook(() => useDeskEngagements({ enabled: false }), { wrapper: createWrapper() });
    const passedOptions = (useQuery as jest.Mock).mock.calls.at(-1)[0];
    expect(passedOptions.queryKey).toEqual(['document-state', 'desk']);
    expect(passedOptions.enabled).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fires the zero-row breadcrumb when a 0-row read follows a non-zero cached result', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockDeskRead({ engagements: [NEW_LEAD_ROW] });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.folders.length).toBe(1));

    // Flip document_state empty and force a refetch on the same hook instance
    // — the previous-result ref lives inside this render, not the cache.
    mockDeskRead();
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        folders: [], chips: [], live: [], composed: {}, unreadFeeds: [], studioDrafts: [],
      }),
    );
    expect(mockDeskZeroRowRead).toHaveBeenCalledWith({
      previous_folder_count: 1,
      previous_chip_count: 0,
      session_valid: true,
    });
  });

  // ── N8: one desk_read answers every feed ───────────────────────────────

  it('reads every Desk feed through one desk_read call and no table read', async () => {
    mockDeskRead({ engagements: [NEW_LEAD_ROW] });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('desk_read');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.data!.folders).toHaveLength(1);
  });

  it('a refused desk_read takes the Desk to its error state, never a false-empty desk', async () => {
    mockRpc.mockImplementation(async () => ({
      data: null,
      error: { message: 'permission denied for function desk_read', code: '42501' },
    }));
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('a failed engagements feed is the one feed that takes the Desk down', async () => {
    mockDeskRead({ engagements: FAILED_FEED });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('boom');
  });

  it('a feed key desk_read did not carry is unanswered, not empty', async () => {
    mockRpc.mockImplementation(async () => ({
      data: Object.fromEntries(
        DESK_READ_FEEDS.filter((key) => key !== 'quotes').map((key) => [key, [] as unknown]),
      ),
      error: null,
    }));
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual(['quotes']);
  });

  it('caps in desk_read match the TS full-page sentinels', () => {
    // A full page is no answer only if the RPC caps each feed at exactly the
    // limit the hook compares against. Read the caps out of 00791 itself.
    const sql = readFileSync(
      resolve(__dirname, '../../../../../supabase/migrations/00791_desk_read_rpc.sql'),
      'utf8',
    );
    const capOf = (feed: string) => {
      const block = sql.split(`-- ── ${feed}`)[1]?.split('-- ── ')[0] ?? '';
      const caps = [...block.matchAll(/LIMIT (\d+)/g)].map((m) => Number(m[1]));
      return caps.at(-1);
    };
    expect(capOf('phases')).toBe(DESK_PHASE_LIMIT);
    expect(capOf('schedule_proposals')).toBe(DESK_PROPOSAL_LIMIT);
    expect(capOf('live_proposals')).toBe(DESK_LIVE_PROPOSAL_LIMIT);
    expect(capOf('sent_purchase_orders')).toBe(DESK_SENT_PO_LIMIT);
  });

  // ── R108: the desk-wide schedule feed is bounded, and a full page is no
  //    answer at all ──────────────────────────────────────────────────────
  //
  // A truncated phase read silently drops whole projects, and a project
  // missing from a PRESENT map reads as "no phases" — the desk would invent a
  // setup need for a fully-composed schedule. Truncation must therefore
  // degrade the map to undefined, exactly like a query error.

  /** A project-shape row that derives no need of its own, so any need it
   *  ends up with came from the schedule feed. */
  const PROJECT_ROW = {
    ...NEW_LEAD_ROW,
    engagement_kind: 'project',
    engagement_id: 'project-1',
    project_id: 'project-1',
    lead_id: null,
    lead_status: null,
    active_section: 'project',
    is_paused: false,
    overdue_decision_count: 0,
    due_task_count: 0,
    draft_unsent_po_count: 0,
    unacked_po_count: 0,
    unsent_pulse_count: 0,
    awaiting_inspection_count: 0,
    in_flight_count: 0,
    item_count: 0,
    client_name: 'Sarah Whitfield',
    title: 'Whitfield Residence',
  };

  /** Answers each feed from its own canned rows, with a valid session. */
  function routeFeeds(feeds: Partial<Record<DeskFeedKey, unknown>>) {
    mockDeskRead(feeds);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
  }

  it('caps the schedule reads and treats a FULL phase read as no answer, not as "no phases"', async () => {
    // A full page: every row belongs to some other project, so `project-1` is
    // absent from the map — the exact shape that would fabricate a need.
    const truncated = Array.from({ length: DESK_PHASE_LIMIT }, (_, i) => ({
      id: `ph-${i}`,
      project_id: `other-${i}`,
      name: 'Phase',
      phase_key: null,
      status: 'pending',
      sort_order: 0,
      lane: 'main',
      duration_days: 7,
      duration_weeks: null,
      follows_phase_id: null,
      anchor_date: '2026-01-01',
      start_date: null,
      target_end_date: null,
    }));
    routeFeeds({
      engagements: [PROJECT_ROW],
      phases: truncated,
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.folders).toHaveLength(0);
    expect(
      result.current.data!.folders.some((f) => f.need.kind === 'schedule_unconfigured'),
    ).toBe(false);
  });

  it('a SHORT phase read is a real answer — an absent project genuinely has no phases', async () => {
    routeFeeds({
      engagements: [PROJECT_ROW],
      phases: [],
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.folders.map((f) => f.need.kind)).toEqual([
      'schedule_unconfigured',
    ]);
  });

  it('a phases-query error also degrades to no answer', async () => {
    routeFeeds({
      engagements: [PROJECT_ROW],
      phases: FAILED_FEED,
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.folders).toHaveLength(0);
  });

  it('shares one Desk fetch across observers while selecting studio drafts per observer', async () => {
    const studioDraft = {
      id: 'studio-1-draft', organization_id: 'studio-1', project_id: null,
      kind: 'invoice_reminder', channel: 'email', recipient_kind: 'client',
      status: 'awaiting_review', to_address: 'one@example.test', subject: 'One',
      body: 'Draft', created_at: '2026-10-13T08:00:00Z', claimed_at: null,
    };
    const otherStudioDraft = {
      ...studioDraft, id: 'studio-2-draft', organization_id: 'studio-2',
    };
    mockDeskRead({ engagements: [NEW_LEAD_ROW], outbound_drafts: [studioDraft, otherStudioDraft] });
    const wrapper = createWrapper();
    const desk = renderHook(() => useDeskEngagements({ organizationId: 'studio-1' }), { wrapper });
    const commandBar = renderHook(() => useDeskEngagements({ organizationId: 'studio-2' }), { wrapper });

    await waitFor(() => {
      expect(desk.result.current.isSuccess).toBe(true);
      expect(commandBar.result.current.isSuccess).toBe(true);
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(desk.result.current.data?.studioDrafts?.map((draft) => draft.id)).toEqual(['studio-1-draft']);
    expect(commandBar.result.current.data?.studioDrafts?.map((draft) => draft.id)).toEqual(['studio-2-draft']);
  });

  it('keeps existing outbound drafts visible when the UI feature flag is off', async () => {
    const studioDraft = {
      id: 'studio-draft',
      organization_id: 'studio-1',
      project_id: null,
      kind: 'invoice_reminder',
      channel: 'email',
      recipient_kind: 'client',
      status: 'awaiting_review',
      to_address: 'owner@example.test',
      subject: 'Invoice reminder',
      body: 'Please review.',
      created_at: '2026-10-13T08:00:00Z',
      claimed_at: null,
    };
    const otherStudioDraft = { ...studioDraft, id: 'other-studio-draft', organization_id: 'studio-2' };
    mockDeskRead({ engagements: [NEW_LEAD_ROW], outbound_drafts: [studioDraft, otherStudioDraft] });
    const { result } = renderHook(() => useDeskEngagements({ organizationId: 'studio-1' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('desk_read');
    expect(result.current.data?.studioDrafts?.map((draft) => draft.id)).toEqual(['studio-draft']);
    expect(buildDeskStudioDrafts([studioDraft], 'studio-1')).toHaveLength(1);
  });
});

describe('selectOperationalNeedForDocument', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const base = {
    ...NEW_LEAD_ROW,
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

  it.each([
    ['schedule_conflict', () => partitionDesk(
      [{ ...base, engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1' }],
      now,
      new Map([['project-1', { collision: { text: 'Install collision', label: 'COLLISION', date: null }, drift: null }]]),
    )],
    ['overdue_invoice', () => partitionDesk(
      [{ ...base, engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1' }],
      now,
      undefined,
      new Map([['project-1', { count: 1, oldestDue: '2026-08-01', totalBalanceCents: 1000, invoiceId: 'invoice-1', invoiceLabel: 'Invoice 1' }]]),
    )],
    ['lines_flagged', () => partitionDesk(
      [{ ...base, engagement_kind: 'proposal', engagement_id: 'proposal-1', proposal_id: 'proposal-1', project_id: null, active_section: 'proposal', proposal_status: 'sent' }],
      now,
      undefined,
      undefined,
      new Map([['proposal-1', { count: 2, docTitle: 'Design agreement', proposalId: 'proposal-1' }]]),
    )],
    ['ceremony_pending', () => partitionDesk(
      [{ ...base, engagement_kind: 'lead', engagement_id: 'lead-1', lead_id: 'lead-1', project_id: null, active_section: 'brief', lead_status: 'new' }],
      now,
      undefined,
      undefined,
      undefined,
      new Map([['lead-1', { id: 'ceremony-1', state: 'draft', introText: 'Hello Avery', offeredSlots: null, offeredAt: null, pickedSlotStartsAt: null, timezone: null, threadId: null }]]),
    )],
  ] as const)('selects the canonical %s need from shared Desk composition', (kind, compose) => {
    const data = compose();
    expect(selectOperationalNeedForDocument(data, data.folders[0].row.engagement_id)?.kind).toBe(kind);
  });

  it('answers null when the Desk composed this document and found no need', () => {
    const data = partitionDesk(
      [{ ...base, engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1' }],
      now,
    );

    expect(data.folders).toHaveLength(0);
    expect(selectOperationalNeedForDocument(data, 'project-1')).toBeNull();
  });

  it('answers undefined when the Desk has not answered for this document', () => {
    const data = partitionDesk(
      [{ ...base, engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1' }],
      now,
    );

    expect(selectOperationalNeedForDocument(undefined, 'project-1')).toBeUndefined();
    expect(selectOperationalNeedForDocument(data, null)).toBeUndefined();
    expect(selectOperationalNeedForDocument(data, undefined)).toBeUndefined();
  });

  it('stays structurally shareable across an identical recomposition', () => {
    // The Desk re-reads every 60s. React Query's replaceEqualDeep hands back the
    // PREVIOUS result when the new one deep-equals it, which is what keeps every
    // consumer of this query from re-rendering on each tick — but it does not
    // recurse into Sets or Maps, so `composed` has to stay plain data.
    const rows = [
      { ...base, engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1' },
    ] as DocumentStateRow[];

    const first = partitionDesk(rows, now);
    const second = partitionDesk(rows, now);

    expect(replaceEqualDeep(first, second)).toBe(first);
  });

  it('never reads absence from a composition that did not cover the document', () => {
    // The Desk cache is shared with the CommandBar, so it is hot on documents
    // this composition never saw. Those are unanswered, not need-free.
    const data = partitionDesk(
      [{ ...base, engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1' }],
      now,
    );

    expect(data.composed['project-1']).toBe(true);
    expect(selectOperationalNeedForDocument(data, 'some-other-engagement')).toBeUndefined();
  });

  it('treats an archived engagement as uncomposed rather than need-free', () => {
    const data = partitionDesk(
      [{
        ...base,
        engagement_kind: 'project',
        engagement_id: 'project-1',
        project_id: 'project-1',
        is_archived: true,
      }],
      now,
    );

    expect(data.composed['project-1']).toBeUndefined();
    expect(selectOperationalNeedForDocument(data, 'project-1')).toBeUndefined();
  });

  it('composes a paused engagement, so its no-need answer is sayable', () => {
    const data = partitionDesk(
      [{
        ...base,
        engagement_kind: 'project',
        engagement_id: 'project-1',
        project_id: 'project-1',
        is_paused: true,
      }],
      now,
    );

    expect(data.composed['project-1']).toBe(true);
    expect(selectOperationalNeedForDocument(data, 'project-1')).toBeNull();
  });
});

describe('buildDeskQuotes (C-29)', () => {
  it('folds quote rows by job, counting only lines still to order', () => {
    const map = buildDeskQuotes([
      {
        id: 'q-1',
        project_id: 'project-1',
        quote_ref: 'Q-2291',
        valid_until: '2026-10-30',
        vendor: { name: 'Hewn' },
        lines: [
          { ffe_item: { purchase_order_id: null, removed_at: null } },
          { ffe_item: { purchase_order_id: 'po-1', po_sent: true, removed_at: null } },
          { ffe_item: { purchase_order_id: null, removed_at: '2026-10-01T00:00:00Z' } },
        ],
      },
      { id: 'q-2', project_id: 'project-1', quote_ref: null, valid_until: '2026-10-31', vendor: null, lines: [] },
      { id: 'q-3', project_id: 'project-2', quote_ref: null, valid_until: null, lines: [] },
    ]);
    expect(map?.get('project-1')).toEqual([
      { quoteId: 'q-1', vendorName: 'Hewn', quoteRef: 'Q-2291', validUntil: '2026-10-30', openLines: 1 },
      { quoteId: 'q-2', vendorName: null, quoteRef: null, validUntil: '2026-10-31', openLines: 0 },
    ]);
    expect(map?.has('project-2')).toBe(false);
  });

  it('is undefined (unknown, not empty) when the read failed', () => {
    expect(buildDeskQuotes(null)).toBeUndefined();
  });
});

describe('buildDeskExceptions (C-30)', () => {
  it('folds open exceptions by job with the line, PO label, clock and lane', () => {
    const map = buildDeskExceptions([
      {
        id: 'x-1',
        project_id: 'project-1',
        type: 'damage',
        status: 'open',
        clock_due_on: '2026-10-09',
        purchase_order: { po_number: 'PO-101', is_patina_catalog: false },
        ffe_item: { name: 'Walnut console' },
      },
      {
        id: 'x-2',
        project_id: 'project-1',
        type: 'backorder',
        status: 'open',
        clock_due_on: null,
        purchase_order: [{ po_number: null, vendor_po_number: null, sidemark: null, is_patina_catalog: true }],
        ffe_item: null,
      },
      { id: 'x-3', project_id: null, type: 'delay', status: 'open' },
    ]);
    expect(map?.get('project-1')).toEqual([
      {
        id: 'x-1',
        type: 'damage',
        status: 'open',
        itemName: 'Walnut console',
        poLabel: 'PO-101',
        clockDueOn: '2026-10-09',
        isPatinaCatalog: false,
      },
      {
        id: 'x-2',
        type: 'backorder',
        status: 'open',
        itemName: null,
        poLabel: 'A purchase order',
        clockDueOn: null,
        isPatinaCatalog: true,
      },
    ]);
    expect(map?.size).toBe(1);
  });

  it('is undefined (unknown, not empty) when the read failed', () => {
    expect(buildDeskExceptions(null)).toBeUndefined();
  });
});

describe('buildDeskSamples (C-35)', () => {
  it('folds live samples by job with kind, maker and return-by', () => {
    const map = buildDeskSamples([
      { id: 's1', project_id: 'p1', kind: 'memo', return_by: '2026-06-11', vendor: { name: 'Hewn' } },
      { id: 's2', project_id: 'p1', kind: 'loaner', return_by: '2026-06-12', vendor: [{ name: 'Oak & Ash' }] },
      { id: 's3', project_id: 'p2', kind: 'finish_chip', return_by: '2026-06-20', vendor: null },
      { id: 's4', project_id: null, kind: 'memo', return_by: '2026-06-11', vendor: null },
    ]);
    expect(map!.get('p1')).toEqual([
      { id: 's1', kind: 'memo', vendorName: 'Hewn', returnBy: '2026-06-11' },
      { id: 's2', kind: 'loaner', vendorName: 'Oak & Ash', returnBy: '2026-06-12' },
    ]);
    expect(map!.get('p2')).toEqual([
      { id: 's3', kind: 'finish_chip', vendorName: null, returnBy: '2026-06-20' },
    ]);
    expect(map!.size).toBe(2);
  });

  it('is undefined (unknown, not empty) when the read failed', () => {
    expect(buildDeskSamples(null)).toBeUndefined();
  });
});

// ─── US-25 W2 (SQ-744) ────────────────────────────────────────────────────────

/** A live job with nothing open on its own row. */
const QUIET_PROJECT_ROW = {
  engagement_kind: 'project',
  engagement_id: 'job-quiet',
  project_id: 'p-quiet',
  proposal_id: null,
  lead_id: null,
  title: 'Quiet House',
  client_name: 'Greta Whitfield',
  active_section: 'project',
  current_phase: null,
  is_archived: false,
  is_paused: false,
  unsent_pulse_count: 0,
  draft_unsent_po_count: 0,
  unacked_po_count: 0,
  overdue_decision_count: 0,
  open_claim_count: 0,
  updated_at: new Date().toISOString(),
};

/** A delivered PO with a drafted damage claim the vendor has not seen yet. */
const LIVE_CLAIM_PO = {
  id: 'po-claim',
  project_id: 'p-quiet',
  po_number: 'PO-7',
  vendor_po_number: null,
  sidemark: null,
  vendor: { name: 'Hollis Upholstery' },
  inspections: [
    { inspected_at: '2026-10-10T09:00:00Z', outcome: 'damaged', claims: [{ state: 'drafted' }] },
  ],
};

describe('useDeskEngagements — fix-now 6: at rest only when every feed answered', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
  });

  const rosterOf = (data: { folders: never[]; chips: never[]; live: never[]; unreadFeeds: string[] }) =>
    deriveDeskRoster(
      // one-voice: the empty schedule's setup need prints at rest (FR4 521).
      { folders: data.folders, chips: data.chips, live: data.live, unreadFeeds: data.unreadFeeds, oneVoice: true },
      new Date(),
    );

  it('an unanswered invoices read never prints at rest — it names what went unchecked', async () => {
    mockDeskRead({ engagements: [QUIET_PROJECT_ROW], receivables: FAILED_FEED });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual(['invoices']);
    const roster = rosterOf(result.current.data as never);
    expect(roster.notChecked).toBe('Not checked: invoices.');
    const line = roster.groups.flatMap((g) => g.lines)[0];
    expect(line.notChecked).toBe('Not checked: invoices.');
    expect(line.custody).toBe('Not checked');
  });

  it('one failed flag read leaves flagged lines unread, though the board read answered empty (SQ-751 F4)', async () => {
    mockDeskRead({ engagements: [QUIET_PROJECT_ROW], flagged_lines: FAILED_FEED, flagged_board_pins: [] });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual(['flagged lines']);
    expect(rosterOf(result.current.data as never).notChecked).toBe('Not checked: flagged lines.');
  });

  it.each(['milestones', 'project_starts'] as const)(
    'a failed %s feed leaves schedules unread (SQ-751 F4)',
    async (failing) => {
      mockDeskRead({ engagements: [QUIET_PROJECT_ROW], [failing]: FAILED_FEED });
      const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data!.unreadFeeds).toEqual(['schedules']);
    },
  );

  it('an empty invoices answer (an empty map) is the one state that prints at rest', async () => {
    mockDeskRead({ engagements: [QUIET_PROJECT_ROW] });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual([]);
    const roster = rosterOf(result.current.data as never);
    expect(roster.notChecked).toBeNull();
    const line = roster.groups.flatMap((g) => g.lines)[0];
    expect(line.notChecked).toBeNull();
    expect(line.custody).toBe('No current alert');
  });

  it('reads the live-job feeds desk-wide in one read, however many jobs there are (no N+1)', async () => {
    mockDeskRead({
      engagements: [
        QUIET_PROJECT_ROW,
        { ...QUIET_PROJECT_ROW, engagement_id: 'job-2', project_id: 'p-2' },
        { ...QUIET_PROJECT_ROW, engagement_id: 'job-3', project_id: 'p-3' },
      ],
    });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc.mock.calls).toEqual([['desk_read']]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('a live claim window whose deadlines went unread leaves claim windows unread (E2-4)', async () => {
    mockDeskRead({
      engagements: [QUIET_PROJECT_ROW],
      claim_notices: [{ purchase_order: LIVE_CLAIM_PO }],
      claim_deadlines: FAILED_FEED,
    });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual(['claim windows']);
  });

  it('a signed proposal on a live job rises through the hook as its own need', async () => {
    mockDeskRead({
      engagements: [QUIET_PROJECT_ROW],
      live_proposals: [
        {
          id: 'prop-1',
          project_id: 'p-quiet',
          status: 'accepted',
          title: 'Living room',
          signed_at: new Date().toISOString(),
          items: [{ ffe: [{ purchase_order_id: null, removed_at: null }] }],
        },
      ],
    });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.folders.map((f) => f.need.key)).toEqual(['proposal_signed:prop-1']);
  });
});

describe('buildDeskClaimWindows (E2-4: deadlines answered as one set)', () => {
  it('folds each live PO to one signal carrying its deadline, keyed by project', () => {
    const map = buildDeskClaimWindows(
      [{ purchase_order: LIVE_CLAIM_PO }, { purchase_order: LIVE_CLAIM_PO }],
      [{ purchase_order_id: 'po-claim', vendor_deadline: '2026-10-15' }],
    );
    expect(map?.get('p-quiet')).toEqual([
      {
        purchaseOrderId: 'po-claim',
        poLabel: 'PO-7',
        vendorName: 'Hollis Upholstery',
        claimStates: ['drafted'],
        latestOutcome: 'damaged',
        deadline: '2026-10-15',
      },
    ]);
  });

  it('drops a live PO with no computable deadline', () => {
    expect(buildDeskClaimWindows([{ purchase_order: LIVE_CLAIM_PO }], [])?.size).toBe(0);
  });

  it('unread deadlines are no answer only when a live PO needed one', () => {
    expect(buildDeskClaimWindows([{ purchase_order: LIVE_CLAIM_PO }], null)).toBeUndefined();
    const settled = {
      ...LIVE_CLAIM_PO,
      inspections: [{ ...LIVE_CLAIM_PO.inspections[0], claims: [{ state: 'vendor_notified' }] }],
    };
    expect(buildDeskClaimWindows([{ purchase_order: settled }], null)?.size).toBe(0);
  });

  it('unread notices are no answer', () => {
    expect(buildDeskClaimWindows(null, [])).toBeUndefined();
  });
});

describe('the US-25 W2 live-job builders', () => {
  it('buildDeskProposalOutcomes keeps the standing outcome of each chain and counts ordered lines', () => {
    const map = buildDeskProposalOutcomes([
      { id: 'v1', project_id: 'p1', status: 'declined', title: 'Kitchen', declined_at: '2026-06-01T00:00:00Z' },
      { id: 'v2', project_id: 'p1', status: 'sent', title: 'Kitchen', parent_proposal_id: 'v1' },
      {
        id: 'b',
        project_id: 'p1',
        status: 'declined',
        title: 'Bath',
        declined_at: '2026-06-02T00:00:00Z',
        decline_reason: null,
        client_feedback: 'Too cold',
      },
      {
        id: 's',
        project_id: 'p2',
        status: 'accepted',
        title: 'Sofa',
        accepted_at: '2026-06-03T00:00:00Z',
        items: [
          { ffe: [{ purchase_order_id: 'po-1', po_sent: true, removed_at: null }] },
          { ffe: [{ purchase_order_id: null, removed_at: null }, { purchase_order_id: null, removed_at: '2026-06-04' }] },
        ],
      },
      { id: 'r', project_id: 'p2', status: 'declined', title: 'Rug', replacement_proposal_id: 'r2' },
    ])!;
    // v1 was revised by v2; the rug was replaced.
    expect(map.get('p1')).toEqual([
      { proposalId: 'b', title: 'Bath', status: 'declined', at: '2026-06-02T00:00:00Z', reason: 'Too cold', lineCount: 0, orderedCount: 0 },
    ]);
    expect(map.get('p2')).toEqual([
      { proposalId: 's', title: 'Sofa', status: 'accepted', at: '2026-06-03T00:00:00Z', reason: null, lineCount: 2, orderedCount: 1 },
    ]);
    expect(buildDeskProposalOutcomes(null)).toBeUndefined();
  });

  it('buildDeskLandedPayments folds paid invoices and maker payments by job', () => {
    const map = buildDeskLandedPayments(
      [{ id: 'inv-1', project_id: 'p1', invoice_number: 'INV-1', amount_paid_cents: 5000, paid_at: '2026-06-10T00:00:00Z' }],
      [{ id: 'pay-1', kind: 'deposit', amount_cents: 900, paid_date: '2026-06-09', purchase_order: { project_id: 'p1', po_number: 'PO-1', vendor: { name: 'Fenmoor Joinery' } } }],
    )!;
    expect(map.get('p1')).toEqual([
      { id: 'inv-1', label: 'INV-1', amountCents: 5000, landedAt: '2026-06-10T00:00:00Z' },
      { id: 'pay-1', label: 'Deposit to Fenmoor Joinery', amountCents: 900, landedAt: '2026-06-09' },
    ]);
    expect(buildDeskLandedPayments(null, null)).toBeUndefined();
  });

  it('buildDeskPurchaseOrders keys sent POs by job and treats a full page as no answer', () => {
    const map = buildDeskPurchaseOrders([
      { id: 'po-1', project_id: 'p1', po_number: null, vendor_po_number: 'V-9', sent_at: '2026-06-01T00:00:00Z', acknowledged_at: null },
    ])!;
    expect(map.get('p1')).toEqual([
      { purchaseOrderId: 'po-1', poLabel: 'V-9', sentAt: '2026-06-01T00:00:00Z', acknowledgedAt: null },
    ]);
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `po-${i}`, project_id: 'p1', sent_at: '2026-06-01T00:00:00Z' }));
    expect(buildDeskPurchaseOrders(full)).toBeUndefined();
  });

  it('buildDeskLeads keys each lead’s arrival by lead id', () => {
    expect(buildDeskLeads([{ id: 'l1', created_at: '2026-06-01T00:00:00Z', contact_name: 'Nora Hale' }])!.get('l1')).toEqual({
      createdAt: '2026-06-01T00:00:00Z',
      contactName: 'Nora Hale',
    });
  });
});

describe('F-02 Desk sent-only proposal count', () => {
  it('excludes draft and released-unsent PO links from orderedCount', () => {
    const reading = buildDeskProposalOutcomes([{ id: 'p', project_id: 'job', status: 'accepted', items: [{ ffe: [
      { purchase_order_id: 'draft', po_sent: false },
      { purchase_order_id: 'released', po_sent: false },
      { purchase_order_id: 'sent', po_sent: true },
    ] }] }]);
    expect(reading!.get('job')![0]).toMatchObject({ lineCount: 3, orderedCount: 1 });
  });
});
