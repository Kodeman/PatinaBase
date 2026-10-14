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

const mockFetchHeld = jest.fn(async () => [] as unknown[]);
jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  })),
  fetchHeldPurchaseOrders: (...args: unknown[]) => mockFetchHeld(...(args as [])),
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
import { buildDeskStudioDrafts,
  buildDeskExceptions,
  buildDeskLandedPayments,
  buildDeskLeads,
  buildDeskProposalOutcomes,
  buildDeskPurchaseOrders,
  buildDeskQuotes,
  buildDeskSamples,
  DESK_PHASE_LIMIT,
  selectOperationalNeedForDocument,
  useDeskEngagements,
} from '../use-desk-engagements';
import { partitionDesk, type DocumentStateRow } from '@/lib/document/desk-derivation';
import { deriveDeskRoster } from '@/lib/document/desk-roster-derivation';

/** A chainable PostgrestFilterBuilder stand-in — every filter method returns
 *  itself, and `.then` resolves it as the Promise.all in the hook expects. */
function chainResult(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'gte', 'lte', 'in', 'eq', 'neq', 'is', 'not', 'limit']) {
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
    expect(result.current.data).toEqual({ folders: [], chips: [], live: [], composed: {}, unreadFeeds: [], studioDrafts: [] });
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

  it('keeps the shared Desk cache key while allowing document-stage gating', () => {
    renderHook(() => useDeskEngagements({ enabled: false }), { wrapper: createWrapper() });
    const passedOptions = (useQuery as jest.Mock).mock.calls.at(-1)[0];
    expect(passedOptions.queryKey).toEqual(['document-state', 'desk']);
    expect(passedOptions.enabled).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
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

  /** Routes each table to its own canned result. */
  function routeTables(byTable: Record<string, { data: unknown; error: unknown }>) {
    mockFrom.mockImplementation((table: string) =>
      chainResult(byTable[table] ?? { data: [], error: null }),
    );
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
    routeTables({
      document_state: { data: [PROJECT_ROW], error: null },
      project_phases: { data: truncated, error: null },
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.folders).toHaveLength(0);
    expect(
      result.current.data!.folders.some((f) => f.need.kind === 'schedule_unconfigured'),
    ).toBe(false);
  });

  it('a SHORT phase read is a real answer — an absent project genuinely has no phases', async () => {
    routeTables({
      document_state: { data: [PROJECT_ROW], error: null },
      project_phases: { data: [], error: null },
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.folders.map((f) => f.need.kind)).toEqual([
      'schedule_unconfigured',
    ]);
  });

  it('a phases-query error also degrades to no answer', async () => {
    routeTables({
      document_state: { data: [PROJECT_ROW], error: null },
      project_phases: { data: null, error: { message: 'boom' } },
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.folders).toHaveLength(0);
  });

  it('bounds both schedule reads explicitly', async () => {
    const limits: number[] = [];
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      const builder = chainResult({
        data: table === 'document_state' ? [PROJECT_ROW] : [],
        error: null,
      }) as Record<string, jest.Mock>;
      const originalLimit = builder.limit;
      builder.limit = jest.fn((n: number) => {
        if (table === 'project_phases' || table === 'schedule_milestones') limits.push(n);
        return originalLimit(n);
      });
      return builder;
    });

    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(limits).toHaveLength(2);
    for (const n of limits) expect(n).toBeGreaterThan(0);
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
    mockFrom.mockImplementation((table: string) =>
      chainResult({
        data: table === 'document_state' ? [NEW_LEAD_ROW]
          : table === 'outbound_drafts' ? [studioDraft, otherStudioDraft]
            : [],
        error: null,
      }),
    );
    const wrapper = createWrapper();
    const desk = renderHook(() => useDeskEngagements({ organizationId: 'studio-1' }), { wrapper });
    const commandBar = renderHook(() => useDeskEngagements({ organizationId: 'studio-2' }), { wrapper });

    await waitFor(() => {
      expect(desk.result.current.isSuccess).toBe(true);
      expect(commandBar.result.current.isSuccess).toBe(true);
    });
    expect(mockFrom.mock.calls.filter(([table]) => table === 'document_state')).toHaveLength(1);
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
    mockFrom.mockImplementation((table: string) =>
      chainResult({
        data:
          table === 'document_state'
            ? [NEW_LEAD_ROW]
            : table === 'outbound_drafts'
              ? [studioDraft, otherStudioDraft]
              : [],
        error: null,
      }),
    );
    const { result } = renderHook(() => useDeskEngagements({ organizationId: 'studio-1' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('outbound_drafts');
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
          { ffe_item: { purchase_order_id: 'po-1', removed_at: null } },
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

describe('useDeskEngagements — fix-now 6: at rest only when every feed answered', () => {
  beforeEach(() => {
    mockFrom.mockReset();
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
    mockFrom.mockImplementation((table: string) =>
      chainResult(
        table === 'document_state'
          ? { data: [QUIET_PROJECT_ROW], error: null }
          : table === 'invoices'
            ? { data: null, error: { message: 'boom' } }
            : { data: [], error: null },
      ),
    );
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
    let feedbackReads = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'document_state') return chainResult({ data: [QUIET_PROJECT_ROW], error: null });
      // The first item_feedback read is the line flags; the second, board pins.
      if (table === 'item_feedback') {
        feedbackReads += 1;
        return chainResult(feedbackReads === 1 ? { data: null, error: { message: 'boom' } } : { data: [], error: null });
      }
      return chainResult({ data: [], error: null });
    });
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual(['flagged lines']);
    expect(rosterOf(result.current.data as never).notChecked).toBe('Not checked: flagged lines.');
  });

  it.each(['schedule_milestones', 'projects'])(
    'a failed %s read leaves schedules unread (SQ-751 F4)',
    async (failing) => {
      mockFrom.mockImplementation((table: string) =>
        chainResult(
          table === 'document_state'
            ? { data: [QUIET_PROJECT_ROW], error: null }
            : table === failing
              ? { data: null, error: { message: 'boom' } }
              : { data: [], error: null },
        ),
      );
      const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data!.unreadFeeds).toEqual(['schedules']);
    },
  );

  it('an empty invoices answer (an empty map) is the one state that prints at rest', async () => {
    mockFrom.mockImplementation((table: string) =>
      chainResult(table === 'document_state' ? { data: [QUIET_PROJECT_ROW], error: null } : { data: [], error: null }),
    );
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.unreadFeeds).toEqual([]);
    const roster = rosterOf(result.current.data as never);
    expect(roster.notChecked).toBeNull();
    const line = roster.groups.flatMap((g) => g.lines)[0];
    expect(line.notChecked).toBeNull();
    expect(line.custody).toBe('No current alert');
  });

  it('reads the live-job feeds desk-wide, once each, however many jobs there are (no N+1)', async () => {
    mockFrom.mockImplementation((table: string) =>
      chainResult(
        table === 'document_state'
          ? {
              data: [
                QUIET_PROJECT_ROW,
                { ...QUIET_PROJECT_ROW, engagement_id: 'job-2', project_id: 'p-2' },
                { ...QUIET_PROJECT_ROW, engagement_id: 'job-3', project_id: 'p-3' },
              ],
              error: null,
            }
          : { data: [], error: null },
      ),
    );
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calls = mockFrom.mock.calls.map((c) => c[0]);
    for (const table of ['proposals', 'po_payments', 'purchase_orders', 'leads']) {
      expect(calls.filter((t) => t === table)).toHaveLength(1);
    }
    // The receivables read and the paid-invoices read.
    expect(calls.filter((t) => t === 'invoices')).toHaveLength(2);
  });

  it('a signed proposal on a live job rises through the hook as its own need', async () => {
    mockFrom.mockImplementation((table: string) =>
      chainResult(
        table === 'document_state'
          ? { data: [QUIET_PROJECT_ROW], error: null }
          : table === 'proposals'
            ? {
                data: [
                  {
                    id: 'prop-1',
                    project_id: 'p-quiet',
                    status: 'accepted',
                    title: 'Living room',
                    signed_at: new Date().toISOString(),
                    items: [{ ffe: [{ purchase_order_id: null, removed_at: null }] }],
                  },
                ],
                error: null,
              }
            : { data: [], error: null },
      ),
    );
    const { result } = renderHook(() => useDeskEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.folders.map((f) => f.need.key)).toEqual(['proposal_signed:prop-1']);
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
          { ffe: [{ purchase_order_id: 'po-1', removed_at: null }] },
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
