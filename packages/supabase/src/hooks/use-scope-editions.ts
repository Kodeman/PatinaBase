import { useQuery } from '@tanstack/react-query';
import type { ScopeEdition, ScopeEditionState, ScopeEditionPhase, ScopeEditionSigner } from '@patina/types';
import { createBrowserClient } from '../client';
import { readScopePackagePayload, scopeRecord } from './use-agreement-parts';

// W3 has no activation authority. Replace only at the reviewed activation step
// with an authorized server projection; a browser flag is never this authority.
export const scopeEditionCapability = {
  status: 'inactive', reason: 'not_activated',
} as const;

export const scopeEditionKeys = {
  all: ['scope-editions'] as const,
  project: (projectId: string | null | undefined) => ['scope-editions', projectId] as const,
};

function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Malformed scope text');
  return value;
}

function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('Malformed scope number');
  return value as number;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Malformed scope list');
  return value.map(scopeRecord);
}

function mapPhase(row: Record<string, unknown>): ScopeEditionPhase {
  const slot = row.service_slot;
  if (slot != null && slot !== 'design' && slot !== 'installation') {
    throw new Error('Unsupported scope service slot');
  }
  const phase: ScopeEditionPhase = {
    sourceProposalPhaseId: text(row.source_proposal_phase_id),
    projectPhaseId: nullableText(row.project_phase_id),
    packageKey: nullableText(row.package_key),
    serviceSlot: slot == null ? null : slot,
    boundInEdition: row.bound_in_edition == null ? null : positiveInteger(row.bound_in_edition),
  };
  if ([phase.packageKey, phase.serviceSlot, phase.boundInEdition].filter((v) => v != null).length % 3 !== 0) {
    throw new Error('Malformed scope phase binding');
  }
  return phase;
}

function mapSigner(row: Record<string, unknown>): ScopeEditionSigner {
  if (typeof row.required !== 'boolean' || (row.profile_id == null) === (row.household_person_id == null)) {
    throw new Error('Malformed scope signer');
  }
  return {
    slot: text(row.slot), required: row.required,
    profileId: nullableText(row.profile_id), householdPersonId: nullableText(row.household_person_id),
    policyRevision: positiveInteger(row.policy_revision),
  };
}

export function readScopeEditions(value: unknown, projectId: string): ScopeEdition[] {
  const bundle = scopeRecord(value);
  if (bundle.projectId !== projectId) throw new Error('Scope project mismatch');
  return records(bundle.editions).map((row) => {
    if (row.project_id !== projectId) throw new Error('Scope edition project mismatch');
    if (row.kind !== 'baseline' && row.kind !== 'amendment') throw new Error('Unsupported scope edition kind');
    if (row.status !== 'active' && row.status !== 'stale' && row.status !== 'superseded') {
      throw new Error('Unsupported scope edition status');
    }
    const packages = records(row.packages).map((entry) => {
      const payload = readScopePackagePayload({
        packageKey: entry.package_key, label: entry.label, roomIds: entry.room_ids,
        inclusion: entry.inclusion, conditionText: entry.condition_text,
        responsibilities: entry.responsibilities, overrideOf: entry.override_of,
        provenance: entry.provenance,
      });
      return {
        ...payload, packageKey: text(entry.package_key),
        designOwedSince: entry.design_owed_since == null ? null : positiveInteger(entry.design_owed_since),
        installationOwedSince: entry.installation_owed_since == null ? null : positiveInteger(entry.installation_owed_since),
      };
    });
    const phases = records(row.phases).map(mapPhase);
    if (phases.some((phase) => phase.packageKey != null && !packages.some((p) => p.packageKey === phase.packageKey))) {
      throw new Error('Scope phase package missing');
    }
    return {
      id: text(row.id), projectId, editionNumber: positiveInteger(row.edition_number),
      kind: row.kind, status: row.status,
      commercialDocumentId: text(row.commercial_document_id), sourceProposalId: text(row.source_proposal_id),
      predecessorEditionId: nullableText(row.predecessor_edition_id),
      agreementFingerprint: text(row.agreement_fingerprint), effectiveAt: text(row.effective_at),
      content: scopeRecord(row.content), contentHash: text(row.content_hash), staleReason: nullableText(row.stale_reason),
      packages, phases, signers: records(row.signers).map(mapSigner),
    };
  });
}

export function useScopeEditions(projectId: string | null | undefined) {
  const query = useQuery({
    queryKey: scopeEditionKeys.project(projectId),
    queryFn: async () => {
      const { data, error } = await (createBrowserClient() as any).rpc('get_project_scope_editions', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return readScopeEditions(data, projectId as string);
    },
    enabled: !!projectId,
  });
  let editionState: ScopeEditionState;
  if (!projectId) editionState = { status: 'idle' };
  else if (query.data?.length) editionState = { status: 'recorded', editions: query.data };
  else if (query.isError) editionState = { status: 'error', error: query.error };
  else if (query.data === undefined) editionState = { status: 'loading' };
  else editionState = { status: 'absent' };
  const refetchError = projectId && query.data !== undefined && query.isError ? query.error : null;
  return { ...query, editionState, refetchError, capability: scopeEditionCapability };
}
