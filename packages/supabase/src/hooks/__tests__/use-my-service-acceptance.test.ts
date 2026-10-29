import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock('../../client', () => ({ createBrowserClient: () => mocks }));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useRef: () => ({ current: null }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config, useMutation: (config: unknown) => config,
  useQueryClient: () => mocks,
}));
import {
  readMyStudioServiceCompletion, useMyStudioServiceCompletion,
  readMyServiceAcceptanceEvidence, readMyServiceAcceptanceRequests, useMyServiceAcceptanceEvidence,
  useMyServiceAcceptanceRequests, useRespondServiceAcceptance,
} from '../use-my-service-acceptance';
const request = (over: Record<string, unknown> = {}) => ({
  requestId: 'request-1', projectId: 'project-1', requestNumber: 1, scopeEditionId: 'scope-1',
  scopeContentHash: 'scope-hash', evidenceManifestHash: 'evidence-hash', signerPolicyRevision: 2,
  lifecycle: 'sent', aggregateOutcome: 'pending', sentAt: '2026-10-27', closedAt: null,
  viewerRole: 'signer_required', viewerSignerId: 'signer-1',
  signers: [{ signerId: 'signer-1', slot: 'Client', required: true, response: null }], ...over,
});
beforeEach(() => { vi.clearAllMocks(); });
it('maps required and optional roles and defaults unknown role to observer', () => {
  expect(readMyServiceAcceptanceRequests([request()])[0].viewerRole).toBe('signer_required');
  expect(readMyServiceAcceptanceRequests([request({ viewerRole: 'signer_optional', signers: [{ signerId: 'signer-1', slot: 'Client', required: false, response: null }] })])[0].viewerRole).toBe('signer_optional');
  for (const viewerRole of ['observer', 'future_role', undefined]) {
    expect(readMyServiceAcceptanceRequests([request({ viewerRole })])[0].viewerRole).toBe('observer');
  }
});
it('rejects mismatched signers and malformed lifecycle or response vocabulary', () => {
  for (const over of [{ viewerSignerId: null }, { lifecycle: 'approved' }, { signerPolicyRevision: 0 }, { signers: [{ signerId: 'signer-1', required: true, slot: 'Client', response: { response: 'approved' } }] }]) {
    expect(() => readMyServiceAcceptanceRequests([request(over)])).toThrow();
  }
});
it('projects only client fields and records portal iOS and paper method labels', () => {
  for (const method of ['portal_authenticated', 'ios_authenticated', 'paper_intake']) {
    const [read] = readMyServiceAcceptanceRequests([request({ paperIntakes: [{ storageObjectId: 'private-object' }], signers: [{ signerId: 'signer-1', required: true, slot: 'Client', profileId: 'private-profile', response: { response: 'accept_with_conditions', conditions: [{ conditionId: 'c', text: 'Finish trim' }], returnReason: null, method, respondedAt: 'today', responseId: 'private-receipt' } }] })]);
    expect(read.signers[0].response?.method).toBe(method);
    expect(read.signers[0].response?.conditions[0].text).toBe('Finish trim');
    expect(JSON.stringify(read)).not.toMatch(/private|paperIntakes|profileId|responseId/);
  }
});
it('reads the dedicated RPC and key without approval queries', async () => {
  const query = useMyServiceAcceptanceRequests() as any;
  expect(query.queryKey).toEqual(['service-acceptance', 'mine']);
  mocks.rpc.mockResolvedValue({ data: [request()], error: null });
  expect(await query.queryFn()).toHaveLength(1);
  expect(mocks.rpc).toHaveBeenCalledWith('get_my_service_acceptance_requests');
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  await expect(query.queryFn()).rejects.toEqual({ code: '42501' });
});
it('sends exact presented hashes revision method and reuses key through uncertain retry', async () => {
  const mutation = useRespondServiceAcceptance() as any;
  const input = { request: request(), response: 'accept_with_conditions', conditions: [{ text: 'Finish trim' }], returnReason: '' };
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network lost' } });
  await expect(mutation.mutationFn(input)).rejects.toEqual({ message: 'network lost' });
  const first = mocks.rpc.mock.calls[0][1];
  const receipt = { responseId: 'r1', aggregateOutcome: 'pending', pendingRequiredSigners: [{ signerId: 'signer-2', slot: 'Partner' }], signerPolicyRevision: 2, replayed: true };
  mocks.rpc.mockResolvedValue({ data: receipt, error: null });
  await expect(mutation.mutationFn(input)).resolves.toEqual(receipt);
  expect(mocks.rpc.mock.calls[1][1]).toEqual(first);
  expect(first).toEqual({ p_request_id: 'request-1', p_response: 'accept_with_conditions', p_conditions: input.conditions, p_return_reason: '', p_scope_content_hash: 'scope-hash', p_evidence_manifest_hash: 'evidence-hash', p_signer_policy_revision: 2, p_method: 'portal_authenticated', p_client_request_id: expect.any(String) });
  await mutation.mutationFn({ ...input, returnReason: 'changed body' });
  expect(mocks.rpc.mock.calls[2][1].p_client_request_id).not.toBe(first.p_client_request_id);
  expect(first.p_conditions).toEqual([{ text: 'Finish trim' }]);
  expect(first.p_conditions[0]).not.toHaveProperty('conditionId');
  expect(mutation.retry).toBe(false);
  mutation.onSuccess();
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['service-acceptance'] });
});
it('rejects malformed receipts rather than claiming success', async () => {
  const mutation = useRespondServiceAcceptance() as any;
  mocks.rpc.mockResolvedValue({ data: { replayed: 'true' }, error: null });
  await expect(mutation.mutationFn({ request: request(), response: 'accept', conditions: [], returnReason: '' })).rejects.toThrow('Malformed acceptance receipt');
});

it.each([1, null, {}, [{ signerId: 's2' }], [{ signerId: '', slot: 'Partner' }]])('rejects malformed pending-required array %j', async (pendingRequiredSigners) => {
  const mutation = useRespondServiceAcceptance() as any;
  mocks.rpc.mockResolvedValue({ data: { responseId: 'r1', aggregateOutcome: 'pending', pendingRequiredSigners, signerPolicyRevision: 2, replayed: false }, error: null });
  await expect(mutation.mutationFn({ request: request(), response: 'accept', conditions: [], returnReason: '' })).rejects.toThrow();
  expect(mocks.invalidateQueries).not.toHaveBeenCalled();
});
it('accepts an empty pending-required array for a completed receipt', async () => {
  const mutation = useRespondServiceAcceptance() as any;
  const receipt = { responseId: 'r1', aggregateOutcome: 'accepted', pendingRequiredSigners: [], signerPolicyRevision: 2, replayed: false };
  mocks.rpc.mockResolvedValue({ data: receipt, error: null });
  await expect(mutation.mutationFn({ request: request(), response: 'accept', conditions: [], returnReason: '' })).resolves.toEqual(receipt);
});
it('keeps condition identifiers out of the RPC even when supplied at runtime', async () => {
  const mutation = useRespondServiceAcceptance() as any;
  mocks.rpc.mockResolvedValue({ data: { responseId: 'r1', aggregateOutcome: 'accepted_with_conditions', pendingRequiredSigners: [], signerPolicyRevision: 2, replayed: false }, error: null });
  await mutation.mutationFn({ request: request(), response: 'accept_with_conditions', conditions: [{ conditionId: 'ui-only', text: ' Trim ' }], returnReason: '' });
  expect(mocks.rpc.mock.calls[0][1].p_conditions).toEqual([{ text: 'Trim' }]);
});

it.each([{ responseId: '' }, { aggregateOutcome: 'approved' }, { signerPolicyRevision: 0 }, { replayed: 1 }])('rejects malformed receipt fields %j', async (over) => {
  const mutation = useRespondServiceAcceptance() as any;
  mocks.rpc.mockResolvedValue({ data: { responseId: 'r1', aggregateOutcome: 'accepted', pendingRequiredSigners: [], signerPolicyRevision: 2, replayed: false, ...over }, error: null });
  await expect(mutation.mutationFn({ request: request(), response: 'accept', conditions: [], returnReason: '' })).rejects.toThrow();
});

const evidence = () => ({
  requestId: 'request-1', requestNumber: 2,
  scope: { editionId: 'edition-1', contentHash: 'scope-hash', packages: [
    { key: 'pkg.kitchen', label: 'Kitchen', inclusion: 'included', conditionText: null,
      responsibilities: { design: 'studio', purchasing: 'client', installation: 'studio' },
      phases: [{ name: 'Design development', service: 'design' }, { name: 'Installation week', service: 'installation' }] },
    { key: 'pkg.dining', label: 'Dining room', inclusion: 'conditional', conditionText: 'If the budget is approved',
      responsibilities: { design: 'client', purchasing: 'client', installation: 'other' }, phases: [] },
  ] },
  evidence: { manifestId: 'manifest-1', manifestHash: 'evidence-hash', members: [
    { kind: 'plan_issue', title: 'Issue 1', issuedAt: '2026-10-27T00:00:00Z', content: null,
      documents: [{ bucket: 'project-documents', path: 'project-1/set.pdf', title: 'Kitchen set' }] },
    { kind: 'review_item', title: 'Sofa', issuedAt: null, documents: [],
      content: { docCode: 'F-12', quantity: 2, room: 'Living room', details: { finish: 'Oiled walnut' } } },
    { kind: 'product_configuration', title: 'Dining chair', issuedAt: null, documents: [],
      content: { productName: 'Spindle chair', leadTimeWeeks: 10, selections: [{ groupName: 'Finish', valueLabel: 'Ebonized oak' }],
        components: [{ name: 'Seat cushion', quantity: 1 }], dimensions: { width: 20, unit: 'in' }, fabric: { fabricName: 'Linen' } } },
    { kind: 'custom_commission_revision', title: 'Dining chair revision 2', issuedAt: null, documents: [],
      // requirements and materials in the native CustomCommissionBrief string[] shape (SQ-2280 F1).
      content: { summary: 'Ebonized dining chair', revision: 2,
        requirements: ['Seat height 18 in', 'Arms flush with the table'], materials: ['Ebonized oak', 'Linen'],
        measurements: [{ label: 'Seat height', value: 18, unit: 'in' }],
        drawings: [{ name: 'Chair elevation', revision: 'B' }] } },
    { kind: 'approval_artifact', title: 'Care pack', issuedAt: null,
      content: { source: 'spec_book_artifact', question: 'Approve the care pack?' },
      documents: [{ bucket: 'project-documents', path: 'project-1/care.pdf', title: 'Care pack folio' }] },
  ] },
});
type Evidence = ReturnType<typeof evidence>;
it('reads the evidence RPC under its own key only once a request is chosen', async () => {
  expect((useMyServiceAcceptanceEvidence(null) as any).enabled).toBe(false);
  const query = useMyServiceAcceptanceEvidence('request-1') as any;
  expect(query.enabled).toBe(true);
  expect(query.queryKey).toEqual(['service-acceptance', 'mine', 'evidence', 'request-1']);
  mocks.rpc.mockResolvedValue({ data: evidence(), error: null });
  await expect(query.queryFn()).resolves.toEqual(evidence());
  expect(mocks.rpc).toHaveBeenCalledWith('get_my_service_acceptance_evidence', { p_request_id: 'request-1' });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  await expect(query.queryFn()).rejects.toEqual({ code: '42501' });
  mocks.rpc.mockResolvedValue({ data: { ...evidence(), requestId: 'request-2' }, error: null });
  await expect(query.queryFn()).rejects.toThrow('Acceptance evidence mismatch');
});
it('keeps only client-safe evidence fields even when the server sends more', () => {
  const leaky: any = evidence();
  Object.assign(leaky, { profileId: 'private-profile' });
  Object.assign(leaky.scope.packages[0], { roomIds: ['private-room'], provenance: 'private', payer: 'client' });
  Object.assign(leaky.scope.packages[0].responsibilities, { payer: 'client', fabrication_contract: 'gc' });
  Object.assign(leaky.evidence.members[0], { id: 'private-id', sha256: 'private-sha', costCents: 1 });
  Object.assign(leaky.evidence.members[0].documents[0], { storageObjectId: 'private-object' });
  Object.assign(leaky.evidence.members[1].content, { clientUnitPriceCents: 1, productId: 'private-product', media: [{ id: 'private-media' }] });
  Object.assign(leaky.evidence.members[1].content.details, { note: 'private note' });
  Object.assign(leaky.evidence.members[2].content, { tradePriceCents: 1, variant: { sku: 'private-sku' } });
  Object.assign(leaky.evidence.members[2].content.selections[0], { priceDeltaCents: 1 });
  Object.assign(leaky.evidence.members[2].content.fabric, { mill: 'private-mill', sidemark: 'private-sidemark' });
  Object.assign(leaky.evidence.members[3].content, { budgetCents: 1, fabricatorName: 'private-maker', notes: 'private note' });
  Object.assign(leaky.evidence.members[3].content.drawings[0], { url: 'https://private.invalid/drawing.pdf' });
  Object.assign(leaky.evidence.members[4].content, { context: 'private context', costCentsDelta: 1 });
  const read = readMyServiceAcceptanceEvidence(leaky);
  expect(read).toEqual(evidence());
  expect(JSON.stringify(read)).not.toMatch(/private|payer|fabrication|roomIds|provenance|sha256|costCents|Price|sku|mill|budgetCents|url/);
});
it('trims Postgres microsecond issue times to milliseconds', () => {
  const precise: any = evidence();
  precise.evidence.members[0].issuedAt = '2026-10-27T15:00:00.123456+00:00';
  expect(readMyServiceAcceptanceEvidence(precise).evidence.members[0].issuedAt).toBe('2026-10-27T15:00:00.123+00:00');
});
it('reads native string[] commission requirements and materials exactly, in order', () => {
  const content = readMyServiceAcceptanceEvidence(evidence()).evidence.members[3].content;
  expect(content?.requirements).toEqual(['Seat height 18 in', 'Arms flush with the table']);
  expect(content?.materials).toEqual(['Ebonized oak', 'Linen']);
  const empty: any = evidence();
  empty.evidence.members[3].content.materials = [];
  delete empty.evidence.members[3].content.requirements;
  const read = readMyServiceAcceptanceEvidence(empty).evidence.members[3].content;
  expect(read?.materials).toEqual([]);
  expect(read).not.toHaveProperty('requirements');
});
it.each<[string, (e: any) => void]>([
  ['request number', (e) => { e.requestNumber = 0; }],
  ['scope', (e) => { e.scope = null; }],
  ['scope hash', (e) => { e.scope.contentHash = ''; }],
  ['packages', (e) => { e.scope.packages = {}; }],
  ['inclusion', (e) => { e.scope.packages[0].inclusion = 'maybe'; }],
  ['condition', (e) => { e.scope.packages[1].conditionText = null; }],
  ['party', (e) => { e.scope.packages[0].responsibilities.design = 'maker'; }],
  ['phase service', (e) => { e.scope.packages[0].phases[0].service = 'fabrication'; }],
  ['manifest hash', (e) => { e.evidence.manifestHash = null; }],
  ['member', (e) => { e.evidence.members[1] = null; }],
  ['member kind', (e) => { e.evidence.members[0].kind = 'invoice'; }],
  ['member title', (e) => { e.evidence.members[0].title = ' '; }],
  ['invalid issued date', (e) => { e.evidence.members[0].issuedAt = 'not-a-date'; }],
  ['impossible issued day', (e) => { e.evidence.members[0].issuedAt = '2026-02-30T12:00:00Z'; }],
  ['documents', (e) => { e.evidence.members[1].documents = null; }],
  ['bucket', (e) => { e.evidence.members[0].documents[0].bucket = 'service-acceptance-paper'; }],
  ['path', (e) => { e.evidence.members[0].documents[0].path = ''; }],
  ['refused po spec kind', (e) => { e.evidence.members[1].kind = 'po_spec_snapshot'; }],
  ['refused coordination kind', (e) => { e.evidence.members[1].kind = 'coordination_item_revision'; }],
  ['plan content', (e) => { e.evidence.members[0].content = { title: 'Kitchen set' }; }],
  ['missing content', (e) => { e.evidence.members[1].content = null; }],
  ['content shape', (e) => { e.evidence.members[4].content = ['Approve the care pack?']; }],
  ['nested fact', (e) => { e.evidence.members[1].content.room = { id: 'room-1', name: 'Living room' }; }],
  ['blank fact', (e) => { e.evidence.members[4].content.question = ' '; }],
  ['fact number', (e) => { e.evidence.members[2].content.leadTimeWeeks = Number.NaN; }],
  ['fact list', (e) => { e.evidence.members[2].content.selections = { groupName: 'Finish' }; }],
  ['list fact', (e) => { e.evidence.members[3].content.measurements[0].value = [18]; }],
  ['fact object', (e) => { e.evidence.members[1].content.details = 'Oiled walnut'; }],
  ['scalar requirements', (e) => { e.evidence.members[3].content.requirements = 'Seat height 18 in'; }],
  ['null requirements', (e) => { e.evidence.members[3].content.requirements = null; }],
  ['object materials', (e) => { e.evidence.members[3].content.materials = { 0: 'Ebonized oak' }; }],
  ['number in requirements', (e) => { e.evidence.members[3].content.requirements = ['Seat height', 18]; }],
  ['blank material', (e) => { e.evidence.members[3].content.materials = ['Ebonized oak', ' ']; }],
  ['nested requirement', (e) => { e.evidence.members[3].content.requirements = [['Seat height 18 in']]; }],
  ['fact object in materials', (e) => { e.evidence.members[3].content.materials = [{ name: 'Linen' }]; }],
])('rejects malformed evidence: %s', (_name, mutate) => {
  const bad: Evidence = evidence();
  mutate(bad);
  expect(() => readMyServiceAcceptanceEvidence(bad)).toThrow();
});

const completion = (over: Record<string, unknown> = {}) => ({
  completionId: 'completion-1', scopeEditionId: 'scope-1', acceptanceRequestId: 'request-1',
  state: 'completed_with_conditions', completedAt: '2026-10-27T12:00:00Z', conditionsClosedAt: null,
  scopeContentHash: 'scope-hash', requestNumber: 1, ...over,
});
const completionPayload = (completions: unknown[] = [completion()], over = {}) => ({
  projectId: 'project-1', audience: 'client', completions, ...over,
});
it('allowlists client completion states dates and accepted scope without financial or obligation fields', () => {
  const read = readMyStudioServiceCompletion(completionPayload([completion({ financialHold: { secret: 'private' }, obligationSnapshot: 'private', openConditionIds: ['private'] })]), 'project-1', 'request-1');
  expect(read).toEqual({ projectId: 'project-1', completion: completion() });
  expect(JSON.stringify(read)).not.toMatch(/financial|obligation|openCondition|private/);
  expect(readMyStudioServiceCompletion(completionPayload([completion({ state: 'completed', conditionsClosedAt: '2026-10-28T12:00:00Z' })]), 'project-1', 'request-1')?.completion?.state).toBe('completed');
});
it('fails closed for absent unknown revoked or non-client completion without falling back from an unknown latest state', () => {
  for (const payload of [completionPayload([]), completionPayload([completion({ state: 'future' }), completion()]), completionPayload([completion({ revokedAt: '2026-10-28' })]), completionPayload([completion({ revokedAt: '2026-10-28' })], { audience: 'studio' }), completionPayload([completion()], { audience: 'future' })]) {
    expect(readMyStudioServiceCompletion(payload, 'project-1', 'request-1')).toEqual({ projectId: 'project-1', completion: null });
  }
  expect(readMyStudioServiceCompletion(completionPayload([], { capability: 'inactive' }), 'project-1', 'request-1')).toBeNull();
});
it('rejects malformed completion references dates lists and project identity', () => {
  for (const over of [{ completedAt: 'invalid' }, { conditionsClosedAt: undefined }, { scopeContentHash: '' }, { requestNumber: 0 }, { acceptanceRequestId: null }, { state: null }]) {
    expect(() => readMyStudioServiceCompletion(completionPayload([completion(over)]), 'project-1', 'request-1')).toThrow();
  }
  expect(() => readMyStudioServiceCompletion({ ...completionPayload(), completions: {} }, 'project-1', 'request-1')).toThrow();
  expect(() => readMyStudioServiceCompletion(completionPayload(), 'foreign', 'request-1')).toThrow();
});
it('reads the completion RPC under a client-specific canonical key and hides permission denial but surfaces read failure', async () => {
  const query = useMyStudioServiceCompletion('project-1', 'request-1') as any;
  expect(query.queryKey).toEqual(['service-completion', 'project', 'project-1', 'completion', 'client', 'request-1']);
  expect((useMyStudioServiceCompletion(null, 'request-1') as any).enabled).toBe(false);
  mocks.rpc.mockResolvedValue({ data: completionPayload(), error: null });
  expect((await query.queryFn()).completion).toEqual(completion());
  expect(mocks.rpc).toHaveBeenCalledWith('get_studio_service_completion', { p_project_id: 'project-1' });
  for (const error of [{ code: '42501', message: 'insufficient_privilege' }, { message: 'scope_editions_inactive' }, { message: 'permission denied for function get_studio_service_completion' }]) {
    mocks.rpc.mockResolvedValue({ data: null, error });
    expect(await query.queryFn()).toBeNull();
  }
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(query.queryFn()).rejects.toEqual({ message: 'offline' });
});

it('selects only the viewed request completion even when another request completed more recently', () => {
  const other = completion({ acceptanceRequestId: 'request-2', completionId: 'completion-2' });
  expect(readMyStudioServiceCompletion(completionPayload([other, completion()]), 'project-1', 'request-1')?.completion).toEqual(completion());
  expect(readMyStudioServiceCompletion(completionPayload([other]), 'project-1', 'request-1')?.completion).toBeNull();
  expect(readMyStudioServiceCompletion(completionPayload([other, completion({ revokedAt: '2026-10-28' })]), 'project-1', 'request-1')?.completion).toBeNull();
  expect((useMyStudioServiceCompletion('project-1', 'request-2') as any).queryKey).not.toEqual((useMyStudioServiceCompletion('project-1', 'request-1') as any).queryKey);
});
