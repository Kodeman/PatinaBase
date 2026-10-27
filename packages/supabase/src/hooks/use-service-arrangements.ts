import type { RecordedServiceArrangement, ScopeEditionState, ServiceArrangementState } from '@patina/types';
import { useScopeEditions } from './use-scope-editions';

/** Read-only signed bindings, not a preset catalogue or an appointment. The
 * revoked service_arrangements table is deliberately not a browser data path. */
export function selectServiceArrangements(state: ScopeEditionState): ServiceArrangementState {
  if (state.status === 'error') return state;
  if (state.status !== 'recorded') return { status: state.status === 'absent' ? 'empty' : state.status };
  const arrangements: RecordedServiceArrangement[] = [];
  for (const edition of state.editions) {
    for (const pkg of edition.packages) {
      const bindings = edition.phases.filter((phase) => phase.packageKey === pkg.packageKey && phase.serviceSlot != null);
      if (!bindings.length) continue;
      const raw = pkg.provenance;
      const provenance = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown> : null;
      const versioned = provenance && typeof provenance.arrangementKey === 'string'
        && provenance.arrangementKey.trim() && typeof provenance.arrangementVersion === 'number'
        && Number.isSafeInteger(provenance.arrangementVersion) && provenance.arrangementVersion > 0;
      arrangements.push({
        editionId: edition.id, editionNumber: edition.editionNumber, editionStatus: edition.status,
        packageKey: pkg.packageKey,
        arrangementKey: versioned && typeof provenance.arrangementKey === 'string' ? provenance.arrangementKey : null,
        arrangementVersion: versioned && typeof provenance.arrangementVersion === 'number' ? provenance.arrangementVersion : null,
        bindings,
      });
    }
  }
  return arrangements.length ? { status: 'recorded', arrangements }
    : { status: 'unavailable', reason: 'service_bindings_not_recorded' };
}

export function useServiceArrangements(projectId: string | null | undefined) {
  const query = useScopeEditions(projectId);
  return { ...query, arrangementState: selectServiceArrangements(query.editionState) };
}
