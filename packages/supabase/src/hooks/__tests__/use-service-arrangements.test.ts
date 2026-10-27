import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScopeEdition, ScopeEditionState } from '@patina/types';
const mocks = vi.hoisted(() => ({ useScopeEditions: vi.fn() }));
vi.mock('../use-scope-editions', () => ({ useScopeEditions: mocks.useScopeEditions }));
import { selectServiceArrangements, useServiceArrangements } from '../use-service-arrangements';
const edition = {
  id: 'edition-1', editionNumber: 2, status: 'stale',
  packages: [{ packageKey: 'pkg.kitchen', provenance: { arrangementKey: 'full-service', arrangementVersion: 3 } }],
  phases: [{ packageKey: 'pkg.kitchen', serviceSlot: 'installation', sourceProposalPhaseId: 'signed-phase', projectPhaseId: null, boundInEdition: 1 }],
} as ScopeEdition;
const recorded = (value = edition): ScopeEditionState => ({ status: 'recorded', editions: [value] });
beforeEach(() => { vi.clearAllMocks(); });
describe('recorded service arrangement selector', () => {
  it('preserves loading, idle, error and empty as distinct states', () => {
    expect(selectServiceArrangements({ status: 'idle' })).toEqual({ status: 'idle' });
    expect(selectServiceArrangements({ status: 'loading' })).toEqual({ status: 'loading' });
    const failed = { status: 'error', error: new Error('denied') } as const;
    expect(selectServiceArrangements(failed)).toBe(failed);
    expect(selectServiceArrangements({ status: 'absent' })).toEqual({ status: 'empty' });
  });
  it('reports missing signed bindings as unavailable, never false empty', () => {
    expect(selectServiceArrangements(recorded({ ...edition, phases: [] }))).toEqual({ status: 'unavailable', reason: 'service_bindings_not_recorded' });
    expect(selectServiceArrangements(recorded({ ...edition, phases: [{ ...edition.phases[0], packageKey: null, serviceSlot: null, boundInEdition: null }] }))).toMatchObject({ status: 'unavailable' });
  });
  it('reads immutable provenance and per-slot binding without appointing a party or hiding stale scope', () => {
    expect(selectServiceArrangements(recorded())).toEqual({ status: 'recorded', arrangements: [{
      editionId: 'edition-1', editionNumber: 2, editionStatus: 'stale', packageKey: 'pkg.kitchen',
      arrangementKey: 'full-service', arrangementVersion: 3, bindings: edition.phases,
    }] });
  });
  it('does not infer a preset from missing or malformed provenance', () => {
    for (const provenance of [undefined, {}, { arrangementKey: 'future' }, { arrangementKey: 'x', arrangementVersion: '3' }]) {
      const state = selectServiceArrangements(recorded({ ...edition, packages: [{ ...edition.packages[0], provenance: provenance as any }] }));
      expect(state).toMatchObject({ status: 'recorded', arrangements: [{ arrangementKey: null, arrangementVersion: null }] });
    }
  });
  it('retains each edition binding separately and never merges signed history', () => {
    const state = selectServiceArrangements({ status: 'recorded', editions: [edition, { ...edition, id: 'edition-2', editionNumber: 3, status: 'active' }] });
    expect(state.status === 'recorded' && state.arrangements.map((entry) => entry.editionId)).toEqual(['edition-1', 'edition-2']);
  });
  it('is a thin selector over the existing query, preserving retained data and inactive capability', () => {
    const native = { editionState: recorded(), capability: { status: 'inactive', reason: 'not_activated' }, data: [edition], refetch: vi.fn() };
    mocks.useScopeEditions.mockReturnValue(native);
    const result = useServiceArrangements('job-1');
    expect(mocks.useScopeEditions).toHaveBeenCalledWith('job-1');
    expect(result.refetch).toBe(native.refetch);
    expect(result.capability).toBe(native.capability);
    expect(result.data).toBe(native.data);
    expect(result.arrangementState.status).toBe('recorded');
  });
});
