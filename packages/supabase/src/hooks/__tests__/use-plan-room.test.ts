import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };

function queryBuilder(result: QueryResult = { data: [], error: null }) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    then: (resolve: (value: QueryResult) => unknown) => Promise<unknown>;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
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

type QueryConfig<T> = {
  queryKey: readonly unknown[];
  enabled: boolean;
  staleTime?: number;
  queryFn: () => Promise<T>;
};

type MutationConfig<TArgs, TData> = {
  retry?: boolean;
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

  it('is keyed, gated and assembles the bundle from the seven reads', async () => {
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
    expect(builders['plan_issue_prints'].in).toHaveBeenCalledWith('issue_id', [
      ZERO_UUID,
    ]);
  });

  it('propagates the first error from the parallel reads', async () => {
    builders['plan_transmittals'] = queryBuilder({
      data: null,
      error: new Error('rls denied'),
    });
    await expect(config().queryFn()).rejects.toThrow('rls denied');
  });

  it('propagates a sheets read error', async () => {
    builders['plan_sheets'] = queryBuilder({
      data: null,
      error: new Error('sheets down'),
    });
    await expect(config().queryFn()).rejects.toThrow('sheets down');
  });
});

describe('usePlanRoomHoldings', () => {
  it('calls get_plan_room_holdings with p_project_id', async () => {
    const query = usePlanRoomHoldings('p1') as unknown as QueryConfig<unknown>;
    expect(query.queryKey).toEqual(['plan-room', 'holdings', 'p1']);
    expect(query.enabled).toBe(true);
    await query.queryFn();
    expect(supabaseClient.rpc).toHaveBeenCalledWith('get_plan_room_holdings', {
      p_project_id: 'p1',
    });
  });
});

describe('usePlanIssuePreview', () => {
  it('omits p_sheet_ids when sheetIds is null', async () => {
    const query = usePlanIssuePreview(
      'p1',
      null,
    ) as unknown as QueryConfig<unknown>;
    await query.queryFn();
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

  it('invalidates exactly room, holdings and folio-files on success', () => {
    config().onSuccess();
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['plan-room', 'room', 'p1'] }],
      [{ queryKey: ['plan-room', 'holdings', 'p1'] }],
      [{ queryKey: ['folio-files', 'p1'] }],
    ]);
  });
});

describe('useSetPlanSheetState', () => {
  it('calls set_plan_sheet_state with p_sheet_id and p_state', async () => {
    const mutation = useSetPlanSheetState('p1') as unknown as MutationConfig<
      { sheetId: string; state: string },
      unknown
    >;
    await mutation.mutationFn({ sheetId: 'sheet-1', state: 'shared' });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_plan_sheet_state', {
      p_sheet_id: 'sheet-1',
      p_state: 'shared',
    });
  });
});

describe('useDeletePlanSheet', () => {
  it('calls delete_plan_sheet with p_sheet_id', async () => {
    const mutation = useDeletePlanSheet('p1') as unknown as MutationConfig<
      string,
      unknown
    >;
    await mutation.mutationFn('sheet-1');
    expect(supabaseClient.rpc).toHaveBeenCalledWith('delete_plan_sheet', {
      p_sheet_id: 'sheet-1',
    });
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

  it('is non-retrying and calls create_plan_transmittal with the p_ args', async () => {
    const mutation = config();
    expect(mutation.retry).toBe(false);

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
});

describe('transmittal link mutations', () => {
  it('reissue calls reissue_plan_transmittal_link with p_transmittal_id', async () => {
    const mutation = useReissuePlanTransmittalLink(
      'p1',
    ) as unknown as MutationConfig<string, unknown>;
    await mutation.mutationFn('tx-1');
    expect(supabaseClient.rpc).toHaveBeenCalledWith(
      'reissue_plan_transmittal_link',
      { p_transmittal_id: 'tx-1' },
    );
  });

  it('revoke calls revoke_plan_transmittal_link with p_transmittal_id', async () => {
    const mutation = useRevokePlanTransmittalLink(
      'p1',
    ) as unknown as MutationConfig<string, unknown>;
    await mutation.mutationFn('tx-1');
    expect(supabaseClient.rpc).toHaveBeenCalledWith(
      'revoke_plan_transmittal_link',
      { p_transmittal_id: 'tx-1' },
    );
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
