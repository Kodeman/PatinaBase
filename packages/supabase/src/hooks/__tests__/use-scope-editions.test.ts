import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), state: {} as Record<string, unknown> }));
vi.mock('../use-agreement-parts', async (original) => original());
vi.mock('../../client', () => ({ createBrowserClient: () => mocks }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => ({ ...config as object, ...mocks.state }),
  useMutation: (config: unknown) => config,
}));
import { readScopeEditions, scopeEditionCapability, useScopeEditions } from '../use-scope-editions';

const edition = () => ({
  id: 'edition-1', project_id: 'job-1', edition_number: 1, kind: 'baseline', status: 'active',
  commercial_document_id: 'document-1', source_proposal_id: 'proposal-1', predecessor_edition_id: null,
  agreement_fingerprint: 'signed-fingerprint', effective_at: '2026-10-26T00:00:00Z',
  content: { signerPolicy: null }, content_hash: 'hash', stale_reason: null,
  packages: [{ package_key: 'pkg.kitchen', label: 'Kitchen', room_ids: ['room-1'], inclusion: 'included',
    responsibilities: { design: 'studio', purchasing: 'gc', payer: 'client', fabrication_contract: 'gc', installation: 'studio' },
    provenance: { arrangementKey: 'full-service', arrangementVersion: 1 }, design_owed_since: 1, installation_owed_since: 1 }],
  phases: [{ source_proposal_phase_id: 'phase-1', project_phase_id: null, package_key: 'pkg.kitchen', service_slot: 'installation', bound_in_edition: 1 }],
  signers: [{ slot: 'client', required: true, profile_id: 'client-1', household_person_id: null, policy_revision: 1 }],
});
const bundle = (rows: unknown[] = [edition()]) => ({ projectId: 'job-1', editions: rows });
beforeEach(() => { vi.clearAllMocks(); mocks.state = {}; });

describe('scope edition read boundary', () => {
  it('maps native frozen packages, typed bindings and signer policy without creating authority', () => {
    const [mapped] = readScopeEditions(bundle(), 'job-1');
    expect(mapped.packages[0]).toMatchObject({ packageKey: 'pkg.kitchen', installationOwedSince: 1 });
    expect(mapped.phases[0]).toEqual({ sourceProposalPhaseId: 'phase-1', projectPhaseId: null, packageKey: 'pkg.kitchen', serviceSlot: 'installation', boundInEdition: 1 });
    expect(mapped.signers[0]).toMatchObject({ profileId: 'client-1', required: true });
    expect(mapped.content).toEqual({ signerPolicy: null });
  });
  it('keeps active, stale and superseded editions distinct', () => {
    expect(readScopeEditions(bundle(['active', 'stale', 'superseded'].map((status) => ({ ...edition(), status }))), 'job-1').map((e) => e.status))
      .toEqual(['active', 'stale', 'superseded']);
  });
  it.each([
    { ...edition(), kind: 'future-kind' }, { ...edition(), status: 'accepted' },
    { ...edition(), packages: null }, { ...edition(), phases: [{ ...edition().phases[0], service_slot: 'buyer' }] },
    { ...edition(), project_id: 'other-job' }, { ...edition(), signers: [{ ...edition().signers[0], required: 'yes' }] },
  ])('refuses malformed or unsupported edition content instead of inventing absence %#', (row) => {
    expect(() => readScopeEditions(bundle([row]), 'job-1')).toThrow();
  });
  it('does not treat an invalid envelope as no history', () => {
    for (const value of [null, {}, { editions: [] }, { projectId: 'job-1', editions: {} }]) {
      expect(() => readScopeEditions(value, 'job-1')).toThrow();
    }
  });
  it('uses only the authorized edition RPC and propagates refusal', async () => {
    const query = useScopeEditions('job-1') as any;
    mocks.rpc.mockResolvedValue({ data: bundle([]), error: null });
    await expect(query.queryFn()).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_project_scope_editions', { p_project_id: 'job-1' });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'scope_project_access_denied' } });
    await expect(query.queryFn()).rejects.toEqual({ message: 'scope_project_access_denied' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('distinguishes idle, loading, absent, error and recorded including warm refusals', () => {
    expect(useScopeEditions(null).editionState.status).toBe('idle');
    expect((useScopeEditions(null) as any).enabled).toBe(false);
    expect(useScopeEditions('job-1').editionState.status).toBe('loading');
    mocks.state = { data: [] };
    expect(useScopeEditions('job-1').editionState.status).toBe('absent');
    mocks.state = { data: readScopeEditions(bundle(), 'job-1') };
    expect(useScopeEditions('job-1').editionState.status).toBe('recorded');
    mocks.state = { isError: true, error: new Error('refused') };
    expect(useScopeEditions('job-1').editionState.status).toBe('error');
  });
  it('retains recorded editions alongside a failed background refetch', () => {
    const editions = readScopeEditions(bundle(), 'job-1');
    const error = new Error('refused');
    mocks.state = { data: editions, isError: true, error };
    const query = useScopeEditions('job-1');
    expect(query.editionState).toEqual({ status: 'recorded', editions });
    expect(query.refetchError).toBe(error);
    expect(query.error).toBe(error);
  });
  it('reports inactive by construction without querying capability tables', () => {
    expect(scopeEditionCapability).toEqual({ status: 'inactive', reason: 'not_activated' });
    expect(useScopeEditions('job-1').capability).toBe(scopeEditionCapability);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
