import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock('../../client', () => ({ createBrowserClient: () => mocks }));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useRef: () => ({ current: null }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config, useMutation: (config: unknown) => config,
  useQueryClient: () => mocks,
}));
import { readMyServiceAcceptanceRequests, useMyServiceAcceptanceRequests, useRespondServiceAcceptance } from '../use-my-service-acceptance';
const request = (over: Record<string, unknown> = {}) => ({
  requestId: 'request-1', projectId: 'project-1', requestNumber: 1, scopeEditionId: 'scope-1',
  scopeContentHash: 'scope-hash', evidenceManifestHash: 'evidence-hash', signerPolicyRevision: 2,
  lifecycle: 'sent', aggregateOutcome: 'pending', sentAt: '2026-10-27', closedAt: null,
  viewerRole: 'signer_required', viewerSignerId: 'signer-1',
  signers: [{ signerId: 'signer-1', slot: 'Client', required: true, response: null }], ...over,
});
beforeEach(() => vi.clearAllMocks());
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
