import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), list: vi.fn(), bucket: vi.fn(), invalidateQueries: vi.fn(),
}));
vi.mock('../use-agreement-parts', async (original) => original());
vi.mock('../../client', () => ({
  createBrowserClient: () => ({
    rpc: mocks.rpc, from: mocks.from,
    storage: { from: (bucket: string) => { mocks.bucket(bucket); return { list: mocks.list }; } },
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
import {
  citedReferences, readStudioServiceCompletion, readStudioServiceObligations, serviceCompletionKeys,
  serviceCompletionRefusal, useCompleteStudioService, useResolveServiceAcceptanceCondition,
  useRevokeStudioServiceCompletion, useServiceConditionCitation, useServiceConditionEvidenceOptions,
  useStudioServiceCompletion, useStudioServiceObligations,
} from '../use-service-completion';

type Act<A> = { mutationFn: (args: A) => Promise<unknown>; onSuccess: () => void; onError: (error: unknown) => void };
type Read<T> = { queryKey: unknown; enabled: boolean; meta?: unknown; queryFn: () => Promise<T> };

type Entry = { id: string | null; name: string };
/** A storage tree keyed `bucket:prefix`; `list` pages it by offset and limit
 *  and lists an unknown prefix as empty, as the storage API does. */
function storageTree(tree: Record<string, Entry[]>, failAt?: string) {
  mocks.list.mockImplementation(async (prefix: string, options: { limit: number; offset?: number }) => {
    const bucket = mocks.bucket.mock.calls.at(-1)?.[0];
    if (`${bucket}:${prefix}` === failAt) return { data: null, error: { message: 'storage unavailable' } };
    const offset = options.offset ?? 0;
    return { data: (tree[`${bucket}:${prefix}`] ?? []).slice(offset, offset + options.limit), error: null };
  });
}

/** A PostgREST builder over fixed rows per table: every filter chains, and the
 *  chain answers as a list (await) or a single row (maybeSingle). */
function tables(rows: Record<string, unknown[]>, single: Record<string, { data: unknown; error: unknown }> = {}) {
  const calls: { table: string; step: string; args: unknown[] }[] = [];
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const step of ['select', 'eq', 'order', 'range']) {
      query[step] = (...args: unknown[]) => { calls.push({ table, step, args }); return query; };
    }
    query.maybeSingle = async () => single[table] ?? { data: null, error: null };
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
    return query;
  });
  return calls;
}

const files = (count: number, prefix = 'file') =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix}-${String(index).padStart(3, '0')}.pdf` }));

// Shape of derive_studio_service_obligations (00888 §2.3, `- 'snapshot'`).
const obligations = (over: Record<string, unknown> = {}) => ({
  projectId: 'job-1', capability: 'inactive', scopeEditionId: 'edition-1', obligationHash: 'hash-1',
  blockers: [{ code: 'studio_installation_open', count: 2, packageKey: 'living', label: 'Studio installation not complete' }],
  informational: [{ code: 'punch_item_open', count: 1, label: 'Open install punch item' }],
  conditions: [{ conditionId: 'condition-1', text: 'Touch up the hall', responseId: 'response-1', signerId: 'signer-1' }],
  acceptance: { requestId: 'request-1', outcome: 'accepted_with_conditions', pendingRequiredSigners: [] },
  financialHold: { openInvoiceCount: 1, balanceCents: 120000, uncollectedContractCents: 0 },
  ...over,
});
const completionRead = (over: Record<string, unknown> = {}) => ({
  projectId: 'job-1', audience: 'studio', capability: 'inactive',
  completions: [{
    completionId: 'completion-1', scopeEditionId: 'edition-1', acceptanceRequestId: 'request-1',
    state: 'completed_with_conditions', openConditionIds: ['condition-1'], obligationSnapshot: {},
    obligationHash: 'hash-1', financialHold: {}, completedBy: 'designer-1', completedAt: '2026-10-27T10:00:00Z',
    conditionsClosedAt: null, revokedAt: null, revokedBy: null, revokeReason: null,
  }],
  resolutions: [{
    resolutionId: 'resolution-1', requestId: 'request-1', conditionId: 'condition-0', responseId: 'response-1',
    resolution: 'Repainted', evidence: { issueId: 'issue-1' }, resolvedBy: 'designer-1',
    resolvedAt: '2026-10-27T11:00:00Z',
  }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('service completion reads', () => {
  it('maps the obligation reading, with packageKey absent read as null and the hold beside it', () => {
    const read = readStudioServiceObligations(obligations(), 'job-1');
    expect(read.blockers).toEqual([
      { code: 'studio_installation_open', count: 2, packageKey: 'living', label: 'Studio installation not complete' },
    ]);
    expect(read.informational[0]).toMatchObject({ code: 'punch_item_open', packageKey: null });
    expect(read.acceptance).toEqual({ requestId: 'request-1', outcome: 'accepted_with_conditions', pendingRequiredSigners: 0 });
    expect(read.financialHold.balanceCents).toBe(120000);
    expect(read.conditions[0].conditionId).toBe('condition-1');
  });

  it('fails closed on another project, an unknown outcome or a malformed count', () => {
    expect(() => readStudioServiceObligations(obligations(), 'job-2')).toThrow('project mismatch');
    expect(() => readStudioServiceObligations(obligations({
      acceptance: { requestId: null, outcome: 'maybe', pendingRequiredSigners: [] } }), 'job-1')).toThrow();
    expect(() => readStudioServiceObligations(obligations({
      blockers: [{ code: 'x', count: -1, label: 'x' }] }), 'job-1')).toThrow();
  });

  it('reads the studio completion projection and refuses the client one', () => {
    const read = readStudioServiceCompletion(completionRead(), 'job-1');
    expect(read.completions[0]).toMatchObject({ state: 'completed_with_conditions', openConditionIds: ['condition-1'] });
    expect(read.resolutions[0].evidence).toEqual({ issueId: 'issue-1' });
    expect(() => readStudioServiceCompletion(completionRead({ audience: 'client' }), 'job-1')).toThrow('audience');
  });

  it('calls the two granted read RPCs with the project id under the service-completion keys', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: obligations(), error: null });
    const derive = useStudioServiceObligations('job-1') as unknown as Read<unknown>;
    expect(derive.queryKey).toEqual(serviceCompletionKeys.obligations('job-1'));
    await derive.queryFn();
    expect(mocks.rpc).toHaveBeenCalledWith('derive_studio_service_obligations', { p_project_id: 'job-1' });
    mocks.rpc.mockResolvedValueOnce({ data: completionRead(), error: null });
    const completion = useStudioServiceCompletion('job-1') as unknown as Read<unknown>;
    await completion.queryFn();
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_studio_service_completion', { p_project_id: 'job-1' });
    expect((useStudioServiceObligations(null) as unknown as Read<unknown>).enabled).toBe(false);
  });
});

describe('service completion acts', () => {
  it('completes with the displayed hash and one stable client_request_id across a retry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement' } });
    mocks.rpc.mockResolvedValueOnce({ data: { completionId: 'c', state: 'completed', conditionsOpen: 0, replayed: true }, error: null });
    const act = useCompleteStudioService('job-1') as unknown as Act<{ acceptanceRequestId: string; obligationHash: string }>;
    const args = { acceptanceRequestId: 'request-1', obligationHash: 'hash-1' };
    await expect(act.mutationFn(args)).rejects.toMatchObject({ code: '57014' });
    await act.mutationFn(args);
    const [first, second] = mocks.rpc.mock.calls;
    expect(first[0]).toBe('complete_studio_service');
    expect(first[1]).toMatchObject({ p_project_id: 'job-1', p_acceptance_request_id: 'request-1', p_obligation_hash: 'hash-1' });
    expect(first[1].p_client_request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second[1].p_client_request_id).toBe(first[1].p_client_request_id);
    // A different reading (a new hash) is a different act, with its own key.
    mocks.rpc.mockResolvedValueOnce({ data: { completionId: 'c' }, error: null });
    await act.mutationFn({ ...args, obligationHash: 'hash-2' });
    expect(mocks.rpc.mock.calls[2][1].p_client_request_id).not.toBe(first[1].p_client_request_id);
  });

  it('refetches the reading on a stale refusal and after success, never on an inactive denial', () => {
    const act = useCompleteStudioService('job-1') as unknown as Act<unknown>;
    act.onError({ code: '40001', message: 'stale_obligations' });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: serviceCompletionKeys.project('job-1') });
    mocks.invalidateQueries.mockClear();
    act.onError({ code: '23514', message: 'service_obligations_open: acceptance_not_accepted' });
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    mocks.invalidateQueries.mockClear();
    act.onError({ code: '42501', message: 'permission denied for function complete_studio_service' });
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    act.onSuccess();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: serviceCompletionKeys.project('job-1') });
  });

  it('resolves a condition with its text and one evidence reference', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { resolutionId: 'r', replayed: false }, error: null });
    const act = useResolveServiceAcceptanceCondition('job-1') as unknown as Act<unknown>;
    await act.mutationFn({ requestId: 'request-1', conditionId: 'condition-1', resolution: 'Repainted',
      evidence: { siteRequestId: 'site-1' } });
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_service_acceptance_condition', expect.objectContaining({
      p_request_id: 'request-1', p_condition_id: 'condition-1', p_resolution: 'Repainted',
      p_evidence: { siteRequestId: 'site-1' }, p_client_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }));
  });

  it('revokes with the completion id and the reason', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { completionId: 'completion-1', revokedAt: 'x', replayed: false }, error: null });
    const act = useRevokeStudioServiceCompletion('job-1') as unknown as Act<unknown>;
    await act.mutationFn({ completionId: 'completion-1', reason: 'Recorded on the wrong edition' });
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_studio_service_completion', {
      p_completion_id: 'completion-1', p_reason: 'Recorded on the wrong edition',
    });
  });

  it('reads the refusal token, without the blocker list after the colon', () => {
    expect(serviceCompletionRefusal({ message: 'service_obligations_open: studio_line_open:living' }))
      .toBe('service_obligations_open');
    expect(serviceCompletionRefusal({ message: 'stale_obligations' })).toBe('stale_obligations');
    expect(serviceCompletionRefusal({ message: 'permission denied for function x' })).toBeNull();
    expect(serviceCompletionRefusal(null)).toBeNull();
  });
});

describe('condition evidence options', () => {
  it('lists the job issues, site requests and stored documents the user can read', async () => {
    tables({
      plan_issues: [{ id: 'issue-1', issue_number: 3, name: 'Kitchen set' }],
      site_requests: [{ id: 'site-1', note: 'Hall touch-up photos', assignee_name_snapshot: 'Ana', created_at: 'x' }],
    });
    storageTree({ 'project-documents:job-1': [{ id: 'object-1', name: 'walkthrough.pdf' }, { id: null, name: 'folder' }] });
    const read = useServiceConditionEvidenceOptions('job-1', true) as unknown as Read<unknown>;
    expect(await read.queryFn()).toEqual([
      { kind: 'issue', id: 'issue-1', label: 'Issue 3 · Kitchen set' },
      { kind: 'siteRequest', id: 'site-1', label: 'Hall touch-up photos' },
      { kind: 'storageObject', id: 'object-1', label: 'walkthrough.pdf' },
    ]);
    expect(mocks.bucket).toHaveBeenCalledWith('project-documents');
    expect(mocks.list).toHaveBeenCalledWith('job-1', expect.objectContaining({ limit: 100 }));
    expect((useServiceConditionEvidenceOptions('job-1', false) as unknown as Read<unknown>).enabled).toBe(false);
  });

  it('reaches nested documents and more than 100 files, page by page', async () => {
    tables({});
    storageTree({
      'project-documents:job-1': [{ id: null, name: 'site' }, ...files(100), { id: 'object-last', name: 'zz-last.pdf' }],
      'project-documents:job-1/site': [{ id: null, name: '2026' }],
      'project-documents:job-1/site/2026': [{ id: 'object-deep', name: 'walkthrough.pdf' }, { id: 'marker', name: '.emptyFolderPlaceholder' }],
    });
    const read = useServiceConditionEvidenceOptions('job-1', true) as unknown as Read<{ id: string; label: string }[]>;
    const options = await read.queryFn();
    expect(options).toHaveLength(102);
    expect(options).toContainEqual({ kind: 'storageObject', id: 'object-last', label: 'zz-last.pdf' });
    expect(options).toContainEqual({ kind: 'storageObject', id: 'object-deep', label: 'site/2026/walkthrough.pdf' });
    expect(options.find((option) => option.id === 'marker')).toBeUndefined();
    expect(mocks.list).toHaveBeenCalledWith('job-1', expect.objectContaining({ offset: 100 }));
  });
});

describe('recorded citations, each checked on its own (C6 §2.2)', () => {
  const ISSUE = '00000000-0000-4000-8000-000000000001';
  const OBJECT = '00000000-0000-4000-8000-000000000002';

  it('reads every cited key of a resolution as its own reference', () => {
    expect(citedReferences({ issueId: 'a', storageObjectId: 'b' })).toEqual([
      { kind: 'issue', id: 'a' }, { kind: 'storageObject', id: 'b' },
    ]);
    expect(citedReferences({})).toEqual([]);
  });

  it('checks an issue or site request directly by id on this job, under the user\'s read', async () => {
    const calls = tables({}, { plan_issues: { data: { id: ISSUE, issue_number: 3, name: 'Kitchen set' }, error: null } });
    const read = useServiceConditionCitation('job-1', 'issue', ISSUE) as unknown as Read<unknown>;
    expect(read.queryKey).toEqual(serviceCompletionKeys.citation('job-1', 'issue', ISSUE));
    expect(await read.queryFn()).toEqual({ available: true, label: 'Issue 3 · Kitchen set' });
    expect(calls.filter((call) => call.step === 'eq').map((call) => call.args)).toEqual([['id', ISSUE], ['project_id', 'job-1']]);
    tables({}, { site_requests: { data: null, error: null } });
    expect(await (useServiceConditionCitation('job-1', 'siteRequest', ISSUE) as unknown as Read<unknown>).queryFn())
      .toEqual({ available: false });
    tables({}, { plan_issues: { data: null, error: { code: '57014', message: 'canceling statement' } } });
    await expect(read.queryFn()).rejects.toMatchObject({ code: '57014' });
  });

  it('finds a stored object nested and past the first page in any bucket 00888 accepts', async () => {
    tables({});
    storageTree({
      'field-media:project/job-1': [{ id: null, name: 'visits' }],
      'field-media:project/job-1/visits': [...files(100), { id: OBJECT, name: 'hall.jpg' }],
    });
    const read = useServiceConditionCitation('job-1', 'storageObject', OBJECT) as unknown as Read<unknown>;
    expect(await read.queryFn()).toEqual({ available: true, label: 'visits/hall.jpg' });
    expect(mocks.bucket.mock.calls.map(([bucket]) => bucket)).toEqual(expect.arrayContaining([
      'project-documents', 'project-ffe-working', 'service-acceptance-paper', 'field-media',
    ]));
  });

  it('reads a stored object as gone only after every bucket and site request folder is walked', async () => {
    tables({ site_requests: [{ id: 'site-1' }] });
    storageTree({
      'project-documents:job-1': files(3),
      'site-requests:site-1': [{ id: 'other', name: 'photo.jpg' }],
    });
    const read = useServiceConditionCitation('job-1', 'storageObject', OBJECT) as unknown as Read<unknown>;
    expect(await read.queryFn()).toEqual({ available: false });
    expect(mocks.list).toHaveBeenCalledWith('site-1', expect.anything());
    expect(new Set(mocks.bucket.mock.calls.map(([bucket]) => bucket))).toEqual(new Set([
      'project-documents', 'project-ffe-working', 'service-acceptance-paper', 'field-media', 'site-requests',
    ]));
    // A walk that could not finish is not an answer: the check fails, never "gone".
    storageTree({}, 'project-ffe-working:job-1');
    await expect(read.queryFn()).rejects.toMatchObject({ message: 'storage unavailable' });
  });

  it('every read opts out of the global toast through meta.errorSurface', () => {
    for (const read of [
      useStudioServiceObligations('job-1'), useStudioServiceCompletion('job-1'),
      useServiceConditionEvidenceOptions('job-1'), useServiceConditionCitation('job-1', 'issue', ISSUE),
    ] as unknown as Read<unknown>[]) {
      expect(read.meta).toEqual({ errorSurface: 'silent' });
    }
  });
});
