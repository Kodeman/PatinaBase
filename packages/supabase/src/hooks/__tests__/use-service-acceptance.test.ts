import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../use-agreement-parts', async (original) => original());
vi.mock('../../client', () => ({ createBrowserClient: () => mocks }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (config: unknown) => config }));
import {
  readProjectServiceAcceptance, serviceAcceptanceCapability, useServiceAcceptance,
} from '../use-service-acceptance';
import { serviceAcceptanceKeys } from '../../query-keys';

// Shape of get_project_service_acceptance (00886) as captured from the C4 oracle.
const response = (over: Record<string, unknown> = {}) => ({
  responseId: 'response-1', response: 'accept_with_conditions', method: 'portal_authenticated',
  conditions: [{ conditionId: 'condition-1', text: 'Keep the oak floor' }], returnReason: null,
  respondedAt: '2026-10-27T22:52:55Z', ...over,
});
const signer = (over: Record<string, unknown> = {}) => ({
  signerId: 'signer-1', slot: 'client', required: true, profileId: 'client-1', householdPersonId: null,
  status: 'active', replacedBySignerId: null, replacementReason: null, replacedAt: null, response: null, ...over,
});
const intake = (over: Record<string, unknown> = {}) => ({
  intakeId: 'intake-1', signerId: 'signer-3', storageObjectId: 'object-1', documentSha256: 'a'.repeat(64),
  paperSignedOn: '2026-10-27', signedName: 'Signed Name', disposition: 'accept', conditions: [], returnReason: null,
  presentedSignerPolicyRevision: 2, reviewState: 'confirmed', lapsedReason: null, recordedBy: 'owner-1',
  recordedAt: '2026-10-27T22:52:55Z', reviewedBy: 'admin-1', reviewedAt: '2026-10-27T22:53:00Z', reviewNote: null, ...over,
});
const request = (over: Record<string, unknown> = {}) => ({
  requestId: 'request-1', projectId: 'job-1', requestNumber: 1, predecessorRequestId: null,
  scopeEditionId: 'edition-1', scopeContentHash: 'scope-hash', evidenceManifestId: 'manifest-1',
  evidenceManifestHash: 'manifest-hash', signerPolicyRevision: 2, lifecycle: 'closed',
  aggregateOutcome: 'accepted_with_conditions', closedReason: 'accepted_with_conditions',
  closedAt: '2026-10-27T22:53:00Z', sentAt: '2026-10-27T22:52:00Z', supersededReason: null, supersededAt: null,
  withdrawnAt: null, withdrawReason: null, outboundDraftId: 'draft-1', createdAt: '2026-10-27T22:51:00Z',
  signers: [
    signer({ response: response() }),
    signer({ signerId: 'signer-2', slot: 'partner', profileId: 'partner-1', status: 'replaced',
      replacedBySignerId: 'signer-3', replacementReason: 'Partner travelling', replacedAt: '2026-10-27T22:52:30Z' }),
    signer({ signerId: 'signer-3', slot: 'partner', profileId: null, householdPersonId: 'card-1',
      response: response({ responseId: 'response-2', response: 'accept', conditions: [], method: 'paper_intake' }) }),
  ],
  paperIntakes: [intake(), intake({ intakeId: 'intake-0', signerId: 'signer-2', presentedSignerPolicyRevision: 1,
    reviewState: 'lapsed', lapsedReason: 'signer_policy_revised', reviewedBy: null, reviewedAt: null }),
  intake({ intakeId: 'intake-2', documentSha256: null, reviewState: 'pending_review', reviewedBy: null, reviewedAt: null })],
  ...over,
});
const bundle = (requests: unknown[] = [request()]) => ({ projectId: 'job-1', capability: 'inactive', requests });
beforeEach(() => { vi.clearAllMocks(); });

describe('service acceptance read boundary', () => {
  it('maps requests, replaced signers, paper intakes and responses', () => {
    const read = readProjectServiceAcceptance(bundle(), 'job-1');
    expect(read.capability).toBe('inactive');
    const [mapped] = read.requests;
    expect(mapped).toMatchObject({ lifecycle: 'closed', aggregateOutcome: 'accepted_with_conditions', signerPolicyRevision: 2 });
    expect(mapped.signers.map((s) => [s.slot, s.status, s.response?.method ?? null])).toEqual([
      ['client', 'active', 'portal_authenticated'], ['partner', 'replaced', null], ['partner', 'active', 'paper_intake'],
    ]);
    expect(mapped.signers[0].response?.conditions).toEqual([{ conditionId: 'condition-1', text: 'Keep the oak floor' }]);
    expect(mapped.paperIntakes[1]).toMatchObject({ reviewState: 'lapsed', lapsedReason: 'signer_policy_revised' });
    // Recorded paper stays unstamped until WP-10C hashes the stored bytes.
    expect(mapped.paperIntakes[2]).toMatchObject({ reviewState: 'pending_review', documentSha256: null });
    expect(mapped.paperIntakes[0].documentSha256).toBe('a'.repeat(64));
  });

  it('fails closed on unknown vocabulary, malformed signers and foreign rows', () => {
    const bad = [
      bundle([request({ lifecycle: 'approved' })]),
      bundle([request({ signers: [signer({ response: response({ method: 'electronic_signature' }) })] })]),
      bundle([request({ signers: [signer({ householdPersonId: 'card-1' })] })]),
      bundle([request({ paperIntakes: [intake({ reviewState: 'accepted' })] })]),
      bundle([request({ projectId: 'job-2' })]),
      { ...bundle(), capability: 'on' },
      { ...bundle(), projectId: 'job-2' },
    ];
    for (const value of bad) expect(() => readProjectServiceAcceptance(value, 'job-1')).toThrow();
  });

  it('reads only get_project_service_acceptance under its own key and stays inactive', async () => {
    const query = useServiceAcceptance('job-1') as any;
    expect(query.queryKey).toEqual(serviceAcceptanceKeys.project('job-1'));
    expect(query.capability).toBe(serviceAcceptanceCapability);
    expect(serviceAcceptanceCapability.status).toBe('inactive');
    mocks.rpc.mockResolvedValue({ data: bundle([]), error: null });
    await expect(query.queryFn()).resolves.toEqual({ projectId: 'job-1', capability: 'inactive', requests: [] });
    expect(mocks.rpc).toHaveBeenCalledWith('get_project_service_acceptance', { p_project_id: 'job-1' });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_privilege' } });
    await expect(query.queryFn()).rejects.toEqual({ message: 'insufficient_privilege' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect((useServiceAcceptance(null) as any).enabled).toBe(false);
  });
});
