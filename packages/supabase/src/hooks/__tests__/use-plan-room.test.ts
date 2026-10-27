import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };

function queryBuilder(result: QueryResult = { data: [], error: null }) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    then: (resolve: (value: QueryResult) => unknown) => Promise<unknown>;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  return builder;
}

type Builder = ReturnType<typeof queryBuilder>;

let builders: Record<string, Builder> = {};

const supabaseClient = {
  rpc: vi.fn(),
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = queryBuilder();
    return builders[table];
  }),
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

import {
  planRoomKeys,
  usePlanRoom,
  usePlanRoomComposition,
  usePlanRoomHoldings,
  usePlanIssuePreview,
  useFilePlanPrints,
  useSetPlanSheetState,
  useDeletePlanSheet,
  useCreatePlanIssue,
  useCreatePlanTransmittal,
  useReissuePlanTransmittalLink,
  useRevokePlanTransmittalLink,
  useClientPlanSet,
  type FilePlanPrintEntry,
} from '../use-plan-room';
import {
  useExternalFulfilments,
  useExternalFulfilmentReadings,
} from '../use-external-fulfilments';

type QueryConfig<T> = {
  queryKey: readonly unknown[];
  enabled: boolean;
  staleTime?: number;
  queryFn: () => Promise<T>;
};

type MutationConfig<TArgs, TData> = {
  retry?: boolean;
  gcTime?: number;
  mutationFn: (args: TArgs) => Promise<TData>;
  onSuccess: () => void;
};

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

beforeEach(() => {
  builders = {};
  supabaseClient.rpc.mockReset();
  supabaseClient.rpc.mockResolvedValue({ data: null, error: null });
  supabaseClient.from.mockClear();
  invalidateQueries.mockReset();
});

describe('planRoomKeys', () => {
  it('has the pinned shapes', () => {
    expect(planRoomKeys.all).toEqual(['plan-room']);
    expect(planRoomKeys.room('p1')).toEqual(['plan-room', 'room', 'p1']);
    expect(planRoomKeys.holdings('p1')).toEqual(['plan-room', 'holdings', 'p1']);
  });

  it('issuePreview keeps null as null and sorts a copy of sheet ids', () => {
    expect(planRoomKeys.issuePreview('p1', null)).toEqual([
      'plan-room',
      'issue-preview',
      'p1',
      null,
    ]);
    const input = ['b-sheet', 'a-sheet'];
    expect(planRoomKeys.issuePreview('p1', input)).toEqual([
      'plan-room',
      'issue-preview',
      'p1',
      ['a-sheet', 'b-sheet'],
    ]);
    expect(input).toEqual(['b-sheet', 'a-sheet']);
  });

  it('clientSet sorts a copy of project ids', () => {
    const input = ['p2', 'p1'];
    expect(planRoomKeys.clientSet(input)).toEqual([
      'plan-room',
      'client-set',
      ['p1', 'p2'],
    ]);
    expect(input).toEqual(['p2', 'p1']);
  });
});

describe('usePlanRoom', () => {
  const config = () =>
    usePlanRoom('p1') as unknown as QueryConfig<{
      sheets: unknown[];
      prints: unknown[];
      batches: unknown[];
      issues: unknown[];
      issuePrints: unknown[];
      transmittals: unknown[];
      tokens: unknown[];
    }>;

  it('is keyed, gated and assembles the bundle from the seven native reads', async () => {
    builders['plan_sheets'] = queryBuilder({
      data: [{ id: 'sheet-1', project_id: 'p1', sheet_number: 'A-101' }],
      error: null,
    });
    builders['plan_issues'] = queryBuilder({
      data: [{ id: 'issue-1', project_id: 'p1' }],
      error: null,
    });
    builders['plan_prints'] = queryBuilder({
      data: [{ id: 'print-1', sheet_id: 'sheet-1' }],
      error: null,
    });
    builders['plan_print_batches'] = queryBuilder({
      data: [{ id: 'batch-1', project_id: 'p1' }],
      error: null,
    });
    builders['plan_issue_prints'] = queryBuilder({
      data: [{ id: 'ip-1', issue_id: 'issue-1' }],
      error: null,
    });
    builders['plan_transmittals'] = queryBuilder({
      data: [{ id: 'tx-1', project_id: 'p1' }],
      error: null,
    });
    builders['plan_transmittal_tokens'] = queryBuilder({
      data: [{ id: 'token-1', transmittal_id: 'tx-1' }],
      error: null,
    });

    const query = config();
    expect(query.queryKey).toEqual(['plan-room', 'room', 'p1']);
    expect(query.enabled).toBe(true);
    expect(query.staleTime).toBe(30_000);
    expect((usePlanRoom('') as unknown as QueryConfig<unknown>).enabled).toBe(
      false,
    );

    const bundle = await query.queryFn();
    expect(bundle).toEqual({
      sheets: [{ id: 'sheet-1', project_id: 'p1', sheet_number: 'A-101' }],
      prints: [{ id: 'print-1', sheet_id: 'sheet-1' }],
      batches: [{ id: 'batch-1', project_id: 'p1' }],
      issues: [{ id: 'issue-1', project_id: 'p1' }],
      issuePrints: [{ id: 'ip-1', issue_id: 'issue-1' }],
      transmittals: [{ id: 'tx-1', project_id: 'p1' }],
      tokens: [{ id: 'token-1', transmittal_id: 'tx-1' }],
    });
    expect(builders['plan_prints'].in).toHaveBeenCalledWith('sheet_id', [
      'sheet-1',
    ]);
    expect(builders['plan_issue_prints'].in).toHaveBeenCalledWith('issue_id', [
      'issue-1',
    ]);
    expect(builders['plan_transmittal_tokens'].select).toHaveBeenCalledWith(
      'id, transmittal_id, project_id, status, expires_at, first_opened_at, view_count, last_used_at, created_at',
    );
  });

  it('guards empty sheet/issue IN lists with the zero-uuid sentinel', async () => {
    builders['plan_sheets'] = queryBuilder({ data: [], error: null });
    builders['plan_issues'] = queryBuilder({ data: [], error: null });

    await config().queryFn();

    expect(builders['plan_prints'].in).toHaveBeenCalledWith('sheet_id', [
      ZERO_UUID,
    ]);
    expect(builders['plan_issue_prints'].in).toHaveBeenCalledWith('issue_id', [ZERO_UUID]);
  });

  it('propagates the first error from the parallel reads', async () => {
    builders['plan_transmittals'] = queryBuilder({
      data: null,
      error: new Error('rls denied'),
    });
    await expect(config().queryFn()).rejects.toThrow('rls denied');
  });

  it('keeps issue prints separate from current prints', async () => {
    builders.plan_sheets = queryBuilder({data:[{id:'sheet-1',current_print_id:'new-print'}],error:null});
    builders.plan_issues = queryBuilder({data:[{id:'issue-1'}],error:null});
    builders.plan_issue_prints = queryBuilder({data:[{issue_id:'issue-1',sheet_id:'sheet-1',print_id:'old-print',sheet_title:'Issued title'}],error:null});
    const bundle = await config().queryFn();
    expect(bundle.transmittals).toEqual([]);
    expect(bundle.issuePrints).toEqual([{issue_id:'issue-1',sheet_id:'sheet-1',print_id:'old-print',sheet_title:'Issued title'}]);
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
    expect(supabaseClient.from).toHaveBeenCalledTimes(7);
  });

  // SQ-2201 F3: the legacy /doc native read never touches round-8 composition.
  it('resolves without reading composition tables, even when each would fail', async () => {
    for (const table of ['plan_sheet_rooms', 'plan_sheet_packages', 'project_packages']) {
      builders[table] = queryBuilder({ data: null, error: new Error('composition down') });
    }
    builders.plan_sheets = queryBuilder({ data: [{ id: 'sheet-1' }], error: null });
    await expect(config().queryFn()).resolves.toMatchObject({ sheets: [{ id: 'sheet-1' }] });
    const bundle = await config().queryFn();
    expect(bundle).not.toHaveProperty('sheetRooms');
    expect(bundle).not.toHaveProperty('sheetPackages');
    expect(bundle).not.toHaveProperty('packages');
    const tables = supabaseClient.from.mock.calls.map(([table]) => table);
    expect(tables).not.toContain('plan_sheet_rooms');
    expect(tables).not.toContain('plan_sheet_packages');
    expect(tables).not.toContain('project_packages');
  });

  it('propagates a sheets read error', async () => {
    builders['plan_sheets'] = queryBuilder({
      data: null,
      error: new Error('sheets down'),
    });
    await expect(config().queryFn()).rejects.toThrow('sheets down');
  });
});

describe('usePlanRoomComposition', () => {
  const config = (enabled?: boolean) =>
    usePlanRoomComposition('p1', enabled === undefined ? undefined : { enabled }) as unknown as QueryConfig<{
      sheetRooms: unknown[];
      sheetPackages: unknown[];
      packages: unknown[];
    }>;

  it('is keyed under the room key and enabled only by its consumer', () => {
    expect(config().queryKey).toEqual(['plan-room', 'room', 'p1', 'composition']);
    expect(config().queryKey.slice(0, 3)).toEqual(planRoomKeys.room('p1'));
    expect(config().enabled).toBe(true);
    expect(config(false).enabled).toBe(false);
    expect((usePlanRoomComposition('') as unknown as QueryConfig<unknown>).enabled).toBe(false);
  });

  it('returns exact composition scoped through the project sheets', async () => {
    builders.plan_sheets = queryBuilder({data:[{id:'sheet-1'}],error:null});
    builders.plan_sheet_rooms = queryBuilder({data:[{sheet_id:'sheet-1',project_room_id:'room-1'}],error:null});
    builders.plan_sheet_packages = queryBuilder({data:[{sheet_id:'sheet-1',package_id:'package-uuid'}],error:null});
    builders.project_packages = queryBuilder({data:[{id:'package-uuid',package_key:'pkg.kitchen-cabinetry',archived_at:'2026-01-01'}],error:null});
    const composition = await config().queryFn();
    expect(composition).toEqual({
      sheetRooms: [{sheet_id:'sheet-1',project_room_id:'room-1'}],
      sheetPackages: [{sheet_id:'sheet-1',package_id:'package-uuid'}],
      packages: [{id:'package-uuid',package_key:'pkg.kitchen-cabinetry',archived_at:'2026-01-01'}],
    });
    expect(builders.plan_sheets.select).toHaveBeenCalledWith('id');
    expect(builders.plan_sheets.eq).toHaveBeenCalledWith('project_id','p1');
    expect(builders.plan_sheet_rooms.in).toHaveBeenCalledWith('sheet_id',['sheet-1']);
    expect(builders.plan_sheet_packages.in).toHaveBeenCalledWith('sheet_id',['sheet-1']);
    expect(builders.project_packages.eq).toHaveBeenCalledWith('project_id','p1');
    expect(supabaseClient.from).toHaveBeenCalledTimes(4);
  });

  it('guards an empty sheet IN list with the zero-uuid sentinel', async () => {
    builders.plan_sheets = queryBuilder({ data: [], error: null });
    await config().queryFn();
    expect(builders.plan_sheet_rooms.in).toHaveBeenCalledWith('sheet_id', [ZERO_UUID]);
    expect(builders.plan_sheet_packages.in).toHaveBeenCalledWith('sheet_id', [ZERO_UUID]);
  });

  it.each(['plan_sheets','plan_sheet_rooms','plan_sheet_packages','project_packages'])('propagates %s failures instead of false empty', async (table) => {
    builders[table]=queryBuilder({data:null,error:new Error('composition down')});
    await expect(config().queryFn()).rejects.toThrow('composition down');
  });

  const compositionReads = [
    { table: 'plan_sheet_rooms', field: 'sheetRooms', keys: ['sheet_id', 'project_room_id'] },
    { table: 'plan_sheet_packages', field: 'sheetPackages', keys: ['sheet_id', 'package_id'] },
    { table: 'project_packages', field: 'packages', keys: ['id'] },
  ] as const;

  it.each(compositionReads)('returns every $table row across two ordered pages', async ({ table, field, keys }) => {
    const rows = Array.from({ length: 1001 }, (_, index) =>
      Object.fromEntries(keys.map((key) => [key, `${key}-${String(index).padStart(4, '0')}`])),
    );
    // Unpaged PostgREST reads are capped at 1000, even though 1001 rows exist.
    const builder = queryBuilder({ data: rows.slice(0, 1000), error: null });
    builder.range.mockImplementation((from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    );
    builders[table] = builder;

    const composition = await config().queryFn();
    expect(composition[field]).toEqual(rows);
    expect(builder.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(builder.order.mock.calls).toEqual(keys.map((key) => [key, { ascending: true }]));
  });

  it.each(compositionReads)('propagates a later $table page failure without returning partial composition', async ({ table }) => {
    const builder = queryBuilder({ data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null });
    builder.range.mockReturnValueOnce(builder).mockResolvedValueOnce({ data: null, error: new Error('second page down') });
    builders[table] = builder;
    await expect(config().queryFn()).rejects.toThrow('second page down');
    expect(builder.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe('usePlanRoomHoldings', () => {
  it('calls get_plan_room_holdings with p_project_id and unwraps data', async () => {
    const holdings = { parties: [{ partyDisplayName: 'Ada Mason' }] };
    supabaseClient.rpc.mockResolvedValue({ data: holdings, error: null });
    const query = usePlanRoomHoldings('p1') as unknown as QueryConfig<unknown>;
    expect(query.queryKey).toEqual(['plan-room', 'holdings', 'p1']);
    expect(query.enabled).toBe(true);
    expect(await query.queryFn()).toEqual(holdings);
    expect(supabaseClient.rpc).toHaveBeenCalledWith('get_plan_room_holdings', {
      p_project_id: 'p1',
    });
  });
});

describe('usePlanIssuePreview', () => {
  it('omits p_sheet_ids when sheetIds is null and unwraps data', async () => {
    const preview = { checksumPreview: 'abc123', sheets: [], priorIssue: null };
    supabaseClient.rpc.mockResolvedValue({ data: preview, error: null });
    const query = usePlanIssuePreview(
      'p1',
      null,
    ) as unknown as QueryConfig<unknown>;
    expect(await query.queryFn()).toEqual(preview);
    expect(supabaseClient.rpc).toHaveBeenCalledWith('preview_plan_issue', {
      p_project_id: 'p1',
    });
  });

  it('passes p_sheet_ids through unsorted when provided', async () => {
    const query = usePlanIssuePreview('p1', [
      'b-sheet',
      'a-sheet',
    ]) as unknown as QueryConfig<unknown>;
    await query.queryFn();
    expect(supabaseClient.rpc).toHaveBeenCalledWith('preview_plan_issue', {
      p_project_id: 'p1',
      p_sheet_ids: ['b-sheet', 'a-sheet'],
    });
  });
});

describe('useFilePlanPrints', () => {
  const entries: FilePlanPrintEntry[] = [
    { kind: 'confirm_current', sheet_id: 'sheet-1' },
  ];
  const config = () =>
    useFilePlanPrints('p1') as unknown as MutationConfig<
      {
        idempotencyKey: string;
        sourceFilename?: string | null;
        entries: FilePlanPrintEntry[];
      },
      unknown
    >;

  it('is non-retrying and calls file_plan_prints with the p_ args', async () => {
    const mutation = config();
    expect(mutation.retry).toBe(false);

    await mutation.mutationFn({ idempotencyKey: 'key-1', entries });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('file_plan_prints', {
      p_project_id: 'p1',
      p_idempotency_key: 'key-1',
      p_entries: entries,
    });

    await mutation.mutationFn({
      idempotencyKey: 'key-2',
      sourceFilename: 'set.pdf',
      entries,
    });
    expect(supabaseClient.rpc).toHaveBeenLastCalledWith('file_plan_prints', {
      p_project_id: 'p1',
      p_idempotency_key: 'key-2',
      p_entries: entries,
      p_source_filename: 'set.pdf',
    });
  });

  it('invalidates exactly room, holdings, issue-preview prefix and folio-files on success', () => {
    config().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'holdings', 'p1'] }],
      [{ queryKey: ['plan-room', 'issue-preview', 'p1'] }],
      [{ queryKey: ['folio-files', 'p1'] }],
    ]);
  });
});

describe('useSetPlanSheetState', () => {
  const config = () =>
    useSetPlanSheetState('p1') as unknown as MutationConfig<
      { sheetId: string; state: string },
      unknown
    >;

  it('calls set_plan_sheet_state with p_sheet_id and p_state', async () => {
    await config().mutationFn({ sheetId: 'sheet-1', state: 'shared' });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_plan_sheet_state', {
      p_sheet_id: 'sheet-1',
      p_state: 'shared',
    });
  });

  it('invalidates exactly room, issue-preview prefix and folio-files on success', () => {
    config().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'issue-preview', 'p1'] }],
      [{ queryKey: ['folio-files', 'p1'] }],
    ]);
  });
});

describe('useDeletePlanSheet', () => {
  const config = () =>
    useDeletePlanSheet('p1') as unknown as MutationConfig<string, unknown>;

  it('calls delete_plan_sheet with p_sheet_id', async () => {
    await config().mutationFn('sheet-1');
    expect(supabaseClient.rpc).toHaveBeenCalledWith('delete_plan_sheet', {
      p_sheet_id: 'sheet-1',
    });
  });

  it('invalidates exactly room and issue-preview prefix on success', () => {
    config().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'issue-preview', 'p1'] }],
    ]);
  });
});

describe('useCreatePlanIssue', () => {
  const config = () =>
    useCreatePlanIssue('p1') as unknown as MutationConfig<
      { name: string; idempotencyKey: string; sheetIds?: string[] | null },
      unknown
    >;

  it('is non-retrying and calls create_plan_issue with the p_ args', async () => {
    const mutation = config();
    expect(mutation.retry).toBe(false);

    await mutation.mutationFn({ name: 'Permit Set', idempotencyKey: 'key-1' });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('create_plan_issue', {
      p_project_id: 'p1',
      p_name: 'Permit Set',
      p_idempotency_key: 'key-1',
    });

    await mutation.mutationFn({
      name: 'Bid Set',
      idempotencyKey: 'key-2',
      sheetIds: ['sheet-1'],
    });
    expect(supabaseClient.rpc).toHaveBeenLastCalledWith('create_plan_issue', {
      p_project_id: 'p1',
      p_name: 'Bid Set',
      p_idempotency_key: 'key-2',
      p_sheet_ids: ['sheet-1'],
    });
  });

  it('invalidates exactly room, holdings, issue-preview and project external fulfilment prefixes on success', () => {
    config().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'holdings', 'p1'] }],
      [{ queryKey: ['plan-room', 'issue-preview', 'p1'] }],
      [{ queryKey: ['project-external-fulfilments', 'p1'] }],
    ]);
  });

  it('marks cached external headers and readings stale only for the issued project', async () => {
    const { QueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query',
    );
    const queryClient = new QueryClient();
    const queries = ['p1', 'p2'].flatMap((projectId) => [
      useExternalFulfilments(projectId) as unknown as QueryConfig<unknown>,
      useExternalFulfilmentReadings(projectId) as unknown as QueryConfig<unknown>,
    ]);
    try {
      for (const query of queries) {
        queryClient.setQueryData(query.queryKey, []);
        expect(queryClient.getQueryState(query.queryKey)?.isInvalidated).toBe(false);
      }
      invalidateQueries.mockImplementation((filters) => queryClient.invalidateQueries(filters));

      config().onSuccess();

      for (const [index, query] of queries.entries()) {
        expect(queryClient.getQueryState(query.queryKey)?.isInvalidated).toBe(index < 2);
      }
    } finally {
      queryClient.clear();
    }
  });
});

describe('useCreatePlanTransmittal', () => {
  const config = () =>
    useCreatePlanTransmittal('p1') as unknown as MutationConfig<
      {
        issueId: string;
        purpose: string;
        partyId?: string | null;
        recipientName?: string | null;
        recipientCompany?: string | null;
        message?: string | null;
      },
      unknown
    >;

  it('is non-retrying, evicts the token-bearing result immediately, and calls create_plan_transmittal with the p_ args', async () => {
    const mutation = config();
    expect(mutation.retry).toBe(false);
    expect(mutation.gcTime).toBe(0);

    await mutation.mutationFn({ issueId: 'issue-1', purpose: 'construction' });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('create_plan_transmittal', {
      p_issue_id: 'issue-1',
      p_purpose: 'construction',
    });

    await mutation.mutationFn({
      issueId: 'issue-1',
      purpose: 'pricing',
      partyId: 'party-1',
      recipientName: 'Ada Mason',
      recipientCompany: 'Mason Builders',
      message: 'Bid by Friday',
    });
    expect(supabaseClient.rpc).toHaveBeenLastCalledWith(
      'create_plan_transmittal',
      {
        p_issue_id: 'issue-1',
        p_purpose: 'pricing',
        p_party_id: 'party-1',
        p_recipient_name: 'Ada Mason',
        p_recipient_company: 'Mason Builders',
        p_message: 'Bid by Friday',
      },
    );
  });

  it('invalidates exactly room and holdings on success', () => {
    config().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'holdings', 'p1'] }],
    ]);
  });
});

describe('transmittal link mutations', () => {
  const reissue = () =>
    useReissuePlanTransmittalLink('p1') as unknown as MutationConfig<
      string,
      unknown
    >;
  const revoke = () =>
    useRevokePlanTransmittalLink('p1') as unknown as MutationConfig<
      string,
      unknown
    >;

  it('reissue evicts the token-bearing result immediately and calls reissue_plan_transmittal_link with p_transmittal_id', async () => {
    const mutation = reissue();
    expect(mutation.gcTime).toBe(0);
    await mutation.mutationFn('tx-1');
    expect(supabaseClient.rpc).toHaveBeenCalledWith(
      'reissue_plan_transmittal_link',
      { p_transmittal_id: 'tx-1' },
    );
  });

  it('reissue invalidates exactly room and holdings on success', () => {
    reissue().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'holdings', 'p1'] }],
    ]);
  });

  it('revoke calls revoke_plan_transmittal_link with p_transmittal_id', async () => {
    await revoke().mutationFn('tx-1');
    expect(supabaseClient.rpc).toHaveBeenCalledWith(
      'revoke_plan_transmittal_link',
      { p_transmittal_id: 'tx-1' },
    );
  });

  it('revoke invalidates exactly room and holdings on success', () => {
    revoke().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'holdings', 'p1'] }],
    ]);
  });
});

describe('rpc error propagation', () => {
  it('throws when the rpc answers with an error', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: new Error('rpc denied'),
    });
    const mutation = useDeletePlanSheet('p1') as unknown as MutationConfig<
      string,
      unknown
    >;
    await expect(mutation.mutationFn('sheet-1')).rejects.toThrow('rpc denied');
    const query = usePlanRoomHoldings('p1') as unknown as QueryConfig<unknown>;
    await expect(query.queryFn()).rejects.toThrow('rpc denied');
  });
});

describe('useClientPlanSet', () => {
  it('is disabled for an empty project list', () => {
    const query = useClientPlanSet([]) as unknown as QueryConfig<unknown>;
    expect(query.enabled).toBe(false);
    expect(query.queryKey).toEqual(['plan-room', 'client-set', []]);
  });

  it('reads only sheets, prints and documents, and joins the shared set sorted by number', async () => {
    builders['plan_sheets'] = queryBuilder({
      data: [
        {
          id: 's-a201',
          project_id: 'p1',
          sheet_number: 'A-201',
          title: 'Second Floor',
          discipline: 'A',
          state: 'shared',
          current_print_id: 'pr-2',
        },
        {
          id: 's-a101',
          project_id: 'p1',
          sheet_number: 'A-101',
          title: 'First Floor',
          discipline: null,
          state: 'shared',
          current_print_id: 'pr-1',
        },
      ],
      error: null,
    });
    builders['plan_prints'] = queryBuilder({
      data: [
        {
          id: 'pr-1',
          sheet_id: 's-a101',
          rev_letter: 'A',
          project_document_id: 'doc-1',
          created_at: '2026-08-01T00:00:00Z',
        },
        {
          id: 'pr-2',
          sheet_id: 's-a201',
          rev_letter: 'B',
          project_document_id: 'doc-2',
          created_at: '2026-08-02T00:00:00Z',
        },
      ],
      error: null,
    });
    builders['project_documents'] = queryBuilder({
      data: [
        { id: 'doc-1', storage_path: 'plans/doc-1.pdf', size_bytes: 1000 },
        { id: 'doc-2', storage_path: 'plans/doc-2.pdf', size_bytes: 2000 },
      ],
      error: null,
    });

    const query = useClientPlanSet(['p1']) as unknown as QueryConfig<
      Array<Record<string, unknown>>
    >;
    const sheets = await query.queryFn();

    const tables = supabaseClient.from.mock.calls.map(([table]) => table);
    expect([...new Set(tables)].sort()).toEqual([
      'plan_prints',
      'plan_sheets',
      'project_documents',
    ]);
    expect(tables).not.toContain('plan_transmittals');
    expect(tables).not.toContain('plan_transmittal_tokens');
    expect(tables).not.toContain('plan_issues');
    expect(tables).not.toContain('plan_issue_prints');
    expect(tables).not.toContain('plan_print_batches');
    expect(builders['plan_sheets'].eq).toHaveBeenCalledWith('state', 'shared');
    expect(builders['plan_sheets'].select).toHaveBeenCalledWith(
      'id, project_id, sheet_number, title, discipline, state, current_print_id',
    );
    expect(builders['plan_prints'].select).toHaveBeenCalledWith(
      'id, sheet_id, rev_letter, project_document_id, created_at',
    );
    expect(builders['project_documents'].select).toHaveBeenCalledWith(
      'id, storage_path, size_bytes',
    );

    expect(sheets).toEqual([
      {
        sheetId: 's-a101',
        projectId: 'p1',
        number: 'A-101',
        title: 'First Floor',
        discipline: null,
        revLetter: 'A',
        revDate: '2026-08-01T00:00:00Z',
        projectDocumentId: 'doc-1',
        storagePath: 'plans/doc-1.pdf',
        sizeBytes: 1000,
      },
      {
        sheetId: 's-a201',
        projectId: 'p1',
        number: 'A-201',
        title: 'Second Floor',
        discipline: 'A',
        revLetter: 'B',
        revDate: '2026-08-02T00:00:00Z',
        projectDocumentId: 'doc-2',
        storagePath: 'plans/doc-2.pdf',
        sizeBytes: 2000,
      },
    ]);
  });
});
