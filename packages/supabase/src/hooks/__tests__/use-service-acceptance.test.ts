import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), invalidateQueries: vi.fn(), upload: vi.fn(), bucket: vi.fn(), invoke: vi.fn(),
  list: vi.fn(), download: vi.fn(), signedUrl: vi.fn(),
}));
vi.mock('../use-agreement-parts', async (original) => original());
vi.mock('../../client', () => ({
  createBrowserClient: () => ({
    rpc: mocks.rpc, from: mocks.from,
    storage: { from: (bucket: string) => {
      mocks.bucket(bucket);
      return { upload: mocks.upload, list: mocks.list, download: mocks.download, createSignedUrl: mocks.signedUrl };
    } },
    functions: { invoke: mocks.invoke },
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
import {
  isServiceAcceptanceInactive, normalizePaperCode, readProjectServiceAcceptance, serviceAcceptanceCapability,
  useServiceAcceptancePaperDocument,
  serviceAcceptanceRefusal, useCreateServiceAcceptanceRequest, useRecordServiceAcceptancePaperIntake,
  useReplaceServiceAcceptanceSigner, useReviewServiceAcceptancePaperIntake, useServiceAcceptance,
  useServiceAcceptanceManifests, useStampServiceAcceptancePaper, useWithdrawServiceAcceptanceRequest,
} from '../use-service-acceptance';
import { serviceAcceptanceKeys } from '../../query-keys';
import { outboundDraftKeys } from '../use-outbound-drafts';

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

const KEY = /^[0-9a-f-]{36}$/;
const lastKey = () => mocks.rpc.mock.calls.at(-1)![1].p_client_request_id as string;

describe('service acceptance studio acts (WP-10C)', () => {
  it('creates against the edition and manifest with a generated client_request_id', async () => {
    mocks.rpc.mockResolvedValue({ data: { requestId: 'request-1', lifecycle: 'draft', outboundDraftId: 'draft-1',
      outboundDraftIds: ['draft-1', 'draft-2'] }, error: null });
    const act = useCreateServiceAcceptanceRequest('job-1') as any;
    await expect(act.mutationFn({ scopeEditionId: 'edition-1', evidenceManifestId: 'manifest-1' }))
      .resolves.toMatchObject({ outboundDraftId: 'draft-1', outboundDraftIds: ['draft-1', 'draft-2'] });
    expect(mocks.rpc).toHaveBeenCalledWith('create_service_acceptance_request', {
      p_project_id: 'job-1', p_scope_edition_id: 'edition-1', p_evidence_manifest_id: 'manifest-1',
      p_client_request_id: expect.stringMatching(KEY),
    });
    act.onSuccess();
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: serviceAcceptanceKeys.project('job-1') });
    // 00893 (SQ-2348 F3): the new signer notices are read under the same key
    // as useOutboundDrafts({ projectId }) and Ready to send, so it goes stale.
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: outboundDraftKeys.list('job-1') });
    expect(outboundDraftKeys.list('job-1')).toEqual(['outbound-drafts', 'job-1', 'all']);
  });

  it('replays a failed act with the same key, and mints a new key once it succeeds', async () => {
    const act = useWithdrawServiceAcceptanceRequest('job-1') as any;
    const args = { requestId: 'request-1', reason: 'Scope is changing' };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await expect(act.mutationFn(args)).rejects.toEqual({ message: 'Failed to fetch' });
    const first = lastKey();
    mocks.rpc.mockResolvedValueOnce({ data: { requestId: 'request-1', lifecycle: 'withdrawn', replayed: true }, error: null });
    await act.mutationFn(args);
    expect(lastKey()).toBe(first);
    expect(mocks.rpc).toHaveBeenLastCalledWith('withdraw_service_acceptance_request', {
      p_request_id: 'request-1', p_reason: 'Scope is changing', p_client_request_id: first,
    });
    mocks.rpc.mockResolvedValueOnce({ data: { requestId: 'request-1' }, error: null });
    await act.mutationFn(args);
    expect(lastKey()).not.toBe(first);
    // Different arguments never share a held key.
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await expect(act.mutationFn({ ...args, reason: 'Other' })).rejects.toBeTruthy();
    expect(lastKey()).not.toBe(first);
  });

  it('replaces a signer against the presented policy revision', async () => {
    mocks.rpc.mockResolvedValue({ data: { signerId: 'signer-9', signerPolicyRevision: 3 }, error: null });
    await (useReplaceServiceAcceptanceSigner('job-1') as any).mutationFn({
      requestId: 'request-1', signerId: 'signer-2', expectedSignerPolicyRevision: 2, reason: 'Partner travelling',
      newProfileId: null, newHouseholdPersonId: 'card-2',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('replace_service_acceptance_signer', {
      p_request_id: 'request-1', p_signer_id: 'signer-2', p_new_profile_id: null, p_new_household_person_id: 'card-2',
      p_expected_signer_policy_revision: 2, p_reason: 'Partner travelling', p_client_request_id: expect.stringMatching(KEY),
    });
  });

  it('uploads paper once to the private bucket path, then records the intake with the presented binding', async () => {
    const file = new File(['%PDF-1.7'], 'paper.pdf', { type: 'application/pdf' });
    // The binding is what the recorder transcribed; the hook sends it as given.
    const args = {
      requestId: 'request-1',
      presented: { requestNumber: 2, scopeContentHash: 'scope-hash', evidenceManifestHash: 'manifest-hash',
        signerPolicyRevision: 2 },
      signerId: 'signer-3', file, paperSignedOn: '2026-10-27', signedName: 'Signed Name',
      disposition: 'accept_with_conditions' as const, conditions: ['Keep the oak floor'], returnReason: null,
    };
    mocks.upload.mockResolvedValue({ data: { id: 'object-1', path: 'job-1/x.pdf' }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    const act = useRecordServiceAcceptancePaperIntake('job-1') as any;
    await expect(act.mutationFn(args)).rejects.toBeTruthy();
    const first = lastKey();
    mocks.rpc.mockResolvedValueOnce({ data: { intakeId: 'intake-1', reviewState: 'pending_review', documentSha256: null }, error: null });
    await act.mutationFn(args);
    expect(mocks.bucket).toHaveBeenCalledWith('service-acceptance-paper');
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][0]).toMatch(/^job-1\/[0-9a-f-]{36}\.pdf$/);
    expect(mocks.upload.mock.calls[0][2]).toEqual({ contentType: 'application/pdf', upsert: false });
    expect(mocks.rpc).toHaveBeenLastCalledWith('record_service_acceptance_paper_intake', {
      p_request_id: 'request-1', p_signer_id: 'signer-3', p_storage_object_id: 'object-1',
      p_paper_signed_on: '2026-10-27', p_signed_name: 'Signed Name', p_disposition: 'accept_with_conditions',
      p_conditions: [{ text: 'Keep the oak floor' }], p_return_reason: null, p_presented_request_number: 2,
      p_presented_scope_content_hash: 'scope-hash', p_presented_evidence_manifest_hash: 'manifest-hash',
      p_presented_signer_policy_revision: 2, p_client_request_id: first,
    });
    await expect(act.mutationFn({ ...args, file: new File(['x'], 'scan.png', { type: 'image/png' }) }))
      .rejects.toThrow('Choose a PDF');
  });

  it('reviews with the confirmed/rejected vocabulary and the expected stamped hash', async () => {
    mocks.rpc.mockResolvedValue({ data: { intakeId: 'intake-1', reviewState: 'confirmed' }, error: null });
    await (useReviewServiceAcceptancePaperIntake('job-1') as any).mutationFn({
      intakeId: 'intake-1', decision: 'confirmed', expectedDocumentSha256: 'a'.repeat(64), note: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('review_service_acceptance_paper_intake', {
      p_intake_id: 'intake-1', p_decision: 'confirmed', p_expected_document_sha256: 'a'.repeat(64), p_note: null,
      p_client_request_id: expect.stringMatching(KEY),
    });
  });

  it('stamps through the paper-hash edge function and checks its receipt', async () => {
    const stamp = useStampServiceAcceptancePaper('job-1') as any;
    mocks.invoke.mockResolvedValue({ data: { intakeId: 'intake-1', documentSha256: 'b'.repeat(64), replayed: false }, error: null });
    await expect(stamp.mutationFn({ intakeId: 'intake-1' })).resolves.toEqual({ intakeId: 'intake-1', documentSha256: 'b'.repeat(64) });
    expect(mocks.invoke).toHaveBeenCalledWith('service-acceptance-paper-hash', { body: { projectId: 'job-1', intakeId: 'intake-1' } });
    mocks.invoke.mockResolvedValue({ data: { intakeId: 'intake-1', documentSha256: 'nope' }, error: null });
    await expect(stamp.mutationFn({ intakeId: 'intake-1' })).rejects.toThrow('not stamped');
  });

  it('normalizes a transcribed code to the full form 00886 compares, and refuses a short form', () => {
    const full = 'AB12'.repeat(16);
    expect(normalizePaperCode(` ${full.slice(0, 32)} ${full.slice(32)}\n`)).toBe(full.toLowerCase());
    expect(normalizePaperCode('ab12ab12')).toBeNull();
    expect(normalizePaperCode('z'.repeat(64))).toBeNull();
  });

  it('opens the exact stored paper: finds its object by id, hashes the bytes and signs a short view', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 stamped');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const sha = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const page = Array.from({ length: 100 }, (_, n) => ({ id: `other-${n}`, name: `other-${n}.pdf` }));
    mocks.list.mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'object-1', name: 'paper-uuid.pdf' }], error: null });
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    mocks.signedUrl.mockResolvedValue({ data: { signedUrl: 'http://127.0.0.1:54321/storage/v1/object/sign/x' }, error: null });
    const intake = { intakeId: 'intake-1', storageObjectId: 'object-1', documentSha256: sha };
    const query = useServiceAcceptancePaperDocument('job-1', intake, true) as any;
    expect(query.queryKey).toEqual([...serviceAcceptanceKeys.project('job-1'), 'paper', 'intake-1', 'object-1', sha]);
    expect(query.enabled).toBe(true);
    await expect(query.queryFn()).resolves.toEqual({
      url: 'http://127.0.0.1:54321/storage/v1/object/sign/x', sha256: sha, matchesStamp: true,
    });
    expect(mocks.bucket).toHaveBeenCalledWith('service-acceptance-paper');
    expect(mocks.list).toHaveBeenNthCalledWith(2, 'job-1', expect.objectContaining({ limit: 100, offset: 100 }));
    expect(mocks.download).toHaveBeenCalledWith('job-1/paper-uuid.pdf');
    expect(mocks.signedUrl).toHaveBeenCalledWith('job-1/paper-uuid.pdf', 600);

    mocks.list.mockResolvedValueOnce({ data: [{ id: 'object-1', name: 'paper-uuid.pdf' }], error: null });
    const moved = useServiceAcceptancePaperDocument('job-1', { ...intake, documentSha256: 'f'.repeat(64) }, true) as any;
    await expect(moved.queryFn()).resolves.toMatchObject({ matchesStamp: false });

    mocks.list.mockResolvedValueOnce({ data: [], error: null });
    await expect(query.queryFn()).rejects.toThrow('could not be found');
    expect((useServiceAcceptancePaperDocument('job-1', intake, false) as any).enabled).toBe(false);
  });

  it('reads only the project service_acceptance manifests under the service-acceptance key', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'm-1', project_id: 'job-1', purpose: 'service_acceptance', manifest_hash: 'h', created_at: 't' }], error: null });
    const eq2 = vi.fn(() => ({ order }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ eq: eq1 })) });
    const query = useServiceAcceptanceManifests('job-1') as any;
    expect(query.queryKey).toEqual([...serviceAcceptanceKeys.project('job-1'), 'manifests']);
    await expect(query.queryFn()).resolves.toEqual([{ id: 'm-1', manifestHash: 'h', createdAt: 't' }]);
    expect(mocks.from).toHaveBeenCalledWith('evidence_manifests');
    expect(eq1).toHaveBeenCalledWith('project_id', 'job-1');
    expect(eq2).toHaveBeenCalledWith('purpose', 'service_acceptance');
  });

  it('tells an inactive act from an authority refusal', () => {
    expect(isServiceAcceptanceInactive({ code: '42501', message: 'permission denied for function create_service_acceptance_request' })).toBe(true);
    expect(isServiceAcceptanceInactive({ message: 'scope_editions_inactive', code: '55000' })).toBe(true);
    expect(isServiceAcceptanceInactive({ code: '42501', message: 'insufficient_privilege' })).toBe(false);
    expect(isServiceAcceptanceInactive({ code: '23514', message: 'signer_policy_missing' })).toBe(false);
    expect(isServiceAcceptanceInactive(null)).toBe(false);
    expect(serviceAcceptanceRefusal({ message: 'signer_policy_duplicate' })).toBe('signer_policy_duplicate');
    expect(serviceAcceptanceRefusal({ message: 'Failed to fetch' })).toBeNull();
  });
});
