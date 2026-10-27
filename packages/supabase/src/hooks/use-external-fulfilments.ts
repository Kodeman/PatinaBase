'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database, Json } from '../database.types';
import { createBrowserClient } from '../client';
import { partyAuthorityKeys } from './use-coordination';
import { invalidateFfeCaches } from './use-procurement';
import { commercialKeys } from './use-commercial-documents';
import { peopleSeatKeys } from './use-people';
import { clientHouseholdKeys } from './use-households';

type Functions = Database['public']['Functions'];
type RpcArgs<Name extends keyof Functions> = Functions[Name]['Args'];
// The generator omits SQL argument nullability. Restore only native NULL
// semantics (00875:232–241, 00876:294/328–358, 00878:143–197, 00879:218–220).
// Mapping over Pick preserves the generated required/optional modifiers.
type NullableRpcArgs<Name extends keyof Functions, Keys extends keyof RpcArgs<Name>> =
  Omit<RpcArgs<Name>, Keys> & {
    [Key in keyof Pick<RpcArgs<Name>, Keys>]: RpcArgs<Name>[Key] | null;
  };
type CreateExternalFulfilmentArgs = NullableRpcArgs<'create_external_fulfilment',
  'p_party_engagement_id' | 'p_configuration_id'>;
type RecordExternalFulfilmentEventArgs = NullableRpcArgs<'record_external_fulfilment_event', 'p_affected_units'>;
type SetFfeItemExternalFulfilmentArgs = NullableRpcArgs<'set_ffe_item_external_fulfilment', 'p_fulfilment_id'>;
type GrantFabricationAuthorityArgs = NullableRpcArgs<'grant_fabrication_authority',
  'p_effective_to' | 'p_threshold_cents' | 'p_source_clause'>;
export type ExternalFulfilment = Database['public']['Tables']['project_external_fulfilments']['Row'];
type ExternalEvent = Omit<Database['public']['Tables']['project_external_fulfilment_events']['Row'],
  'client_request_id' | 'request_hash'>;
type ExternalBinding = Omit<Database['public']['Tables']['project_external_fulfilment_evidence_bindings']['Row'],
  'client_request_id' | 'request_hash'>;
type ExternalVerification = Pick<Database['public']['Tables']['project_external_fulfilment_verifications']['Row'],
  'event_id' | 'fulfilment_id' | 'verified_by'>;
type ExternalManifest = Pick<Database['public']['Tables']['evidence_manifests']['Row'],
  'id' | 'project_id' | 'package_id' | 'purpose' | 'members' | 'manifest_hash' | 'created_by' | 'created_at'> & {
    typed_members: Database['public']['Tables']['evidence_manifest_members']['Row'][];
  };
export type ExternalFulfilmentReading = ExternalFulfilment & {
  reading: {
    package_id: Database['public']['Tables']['project_packages']['Row']['id'] | null;
    events: ExternalEvent[];
    bindings: ExternalBinding[];
    verifications: ExternalVerification[];
    manifests: ExternalManifest[];
  };
};

// W3 does not authorize activation or a browser read of server_capabilities.
export const externalFulfilmentCapability = {
  status: 'inactive', reason: 'not_activated', available: false,
} as const;

export const externalFulfilmentKeys = {
  all: ['project-external-fulfilments'] as const,
  project: (projectId: string | null | undefined) =>
    ['project-external-fulfilments', projectId ?? null] as const,
};

function parseFulfilments(value: Json, projectId: string): ExternalFulfilment[] {
  if (!Array.isArray(value) || value.some((row) =>
    !row || typeof row !== 'object' || Array.isArray(row) ||
    typeof row.id !== 'string' || row.project_id !== projectId
  )) {
    throw new Error('External fulfilments could not be read for this project.');
  }
  return value as ExternalFulfilment[];
}

/** An empty successful read is different from a denied/unavailable read. */
export function useExternalFulfilments(projectId: string | null | undefined) {
  const query = useQuery({
    queryKey: externalFulfilmentKeys.project(projectId),
    enabled: !!projectId,
    retry: false,
    queryFn: async () => {
      if (!projectId) throw new Error('A project is required.');
      const { data, error } = await createBrowserClient().rpc('get_project_external_fulfilments', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return parseFulfilments(data, projectId);
    },
  });
  return { ...query, capability: externalFulfilmentCapability };
}

const readingMemberColumns = {
  plan_issue: 'plan_issue_id', plan_issue_print: 'plan_issue_print_id', plan_print: 'plan_print_id',
  product_configuration: 'product_configuration_id', custom_commission_revision: 'custom_commission_revision_id',
  review_item: 'review_item_id', approval_artifact: 'approval_artifact_id', po_spec_snapshot: 'po_spec_snapshot_id',
  coordination_item_revision: 'coordination_item_revision_id',
} as const;

function readingObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function readingStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') &&
    new Set(value).size === value.length;
}
function requireReading(ok: unknown): asserts ok {
  if (!ok) throw new Error('External fulfilment evidence could not be read for this project.');
}

function validateReadingManifest(manifest: ExternalManifest, row: ExternalFulfilmentReading) {
  requireReading(typeof manifest.id === 'string' && manifest.project_id === row.project_id &&
    manifest.package_id === row.reading.package_id && manifest.package_id !== null &&
    manifest.purpose === 'fabrication_instruction' && /^[0-9a-f]{64}$/.test(manifest.manifest_hash) &&
    typeof manifest.created_by === 'string' && typeof manifest.created_at === 'string' &&
    Array.isArray(manifest.members) && manifest.members.length > 0 &&
    Array.isArray(manifest.typed_members) && manifest.typed_members.every(readingObject));
  requireReading(manifest.members.length === manifest.typed_members.length &&
    new Set(manifest.typed_members.map((member) => member.id)).size === manifest.typed_members.length);
  const identities = new Set<string>();
  for (const member of manifest.members) {
    requireReading(readingObject(member) && typeof member.kind === 'string' &&
      Object.prototype.hasOwnProperty.call(readingMemberColumns, member.kind) && typeof member.id === 'string' &&
      typeof member.sha256 === 'string' && /^[0-9a-f]{64}$/.test(member.sha256));
    const column = readingMemberColumns[member.kind as keyof typeof readingMemberColumns];
    const identity = `${member.kind}:${member.id}`;
    requireReading(!identities.has(identity));
    identities.add(identity);
    const versioned = ['plan_issue', 'product_configuration', 'review_item', 'approval_artifact'].includes(member.kind);
    requireReading(versioned ? Number.isSafeInteger(member.version) :
      (['plan_print', 'plan_issue_print'].includes(member.kind) ? typeof member.rev === 'string' :
        Number.isSafeInteger(member.rev)));
    requireReading(manifest.typed_members.some((typed) => typeof typed.id === 'string' &&
      typed.manifest_id === manifest.id && typed[column] === member.id &&
      Object.values(readingMemberColumns).every((key) => key === column || typed[key] === null)));
  }
}

function validateReadingEvent(event: ExternalEvent, row: ExternalFulfilmentReading) {
  requireReading(typeof event.id === 'string' && event.fulfilment_id === row.id &&
    Number.isSafeInteger(event.event_seq) && event.event_seq > 0 && readingObject(event.evidence) &&
    typeof event.recorded_by === 'string' && typeof event.recorded_at === 'string' &&
    ['quote_reported', 'contract_reported', 'package_issued', 'fabrication_instruction', 'hold',
      'release_hold', 'received', 'installed', 'cancelled'].includes(event.event_kind) &&
    ['reported', 'verified'].includes(event.evidence_level));
  for (const key of ['actor_id', 'authority_id', 'manifest_id', 'manifest_hash', 'plan_issue_id',
    'releases_event_id', 'verified_by', 'verified_at', 'evidence_route'] as const) {
    requireReading(event[key] === null || typeof event[key] === 'string');
  }
  requireReading(event.affected_units === null || (readingStrings(event.affected_units) &&
    event.affected_units.length > 0 && event.affected_units.every((unit) => row.units.includes(unit))));
  const receipt = row.reading.verifications.find((item) => item.event_id === event.id);
  if (event.evidence_level === 'verified') {
    requireReading(receipt && receipt.fulfilment_id === row.id && receipt.verified_by === event.verified_by &&
      typeof event.verified_by === 'string' && event.verified_by !== event.recorded_by &&
      typeof event.verified_at === 'string' && Number.isSafeInteger(event.verification_seq) &&
      event.verification_seq! > 0);
  } else {
    requireReading(!receipt && event.verified_by === null && event.verified_at === null && event.verification_seq === null);
  }
  if (event.event_kind === 'release_hold') {
    const hold = row.reading.events.find((item) => item.id === event.releases_event_id);
    requireReading(hold?.event_kind === 'hold' && hold.event_seq < event.event_seq &&
      typeof event.evidence.releasesEventId === 'string' &&
      event.evidence.releasesEventId.toLowerCase() === hold.id.toLowerCase() && event.affected_units === null);
  } else requireReading(event.releases_event_id === null);
  if (event.event_kind === 'hold') requireReading(event.affected_units !== null);
  if (event.event_kind === 'package_issued') {
    requireReading(typeof event.plan_issue_id === 'string' && event.evidence.planIssueId === event.plan_issue_id &&
      (event.evidence.configurationSnapshotHash === null ||
        typeof event.evidence.configurationSnapshotHash === 'string'));
  }
  if (event.event_kind === 'fabrication_instruction') validateInstructionReading(event, row);
  else requireReading(event.manifest_id === null && event.manifest_hash === null && event.coverage === null &&
    event.actor_id === null && event.authority_id === null && event.amount_cents === null && event.evidence_route === null);
}

function validateInstructionReading(event: ExternalEvent, row: ExternalFulfilmentReading) {
  const manifest = row.reading.manifests.find((item) => item.id === event.manifest_id);
  requireReading(manifest && manifest.manifest_hash === event.manifest_hash && readingObject(event.evidence) &&
    event.evidence.manifestId === event.manifest_id && typeof event.evidence.authorizingPartyId === 'string' &&
    event.actor_id === event.recorded_by && typeof event.authority_id === 'string' &&
    Number.isSafeInteger(event.amount_cents) && event.amount_cents! >= 0 &&
    ['shop_drawing', 'configured', 'approved_submittal'].includes(event.evidence_route ?? '') &&
    readingStrings(event.affected_units) && event.affected_units.length > 0 && Array.isArray(event.coverage));
  const covered = new Set<string>();
  for (const coverage of event.coverage) {
    requireReading(readingObject(coverage) && typeof coverage.unit === 'string' &&
      !covered.has(coverage.unit) && event.affected_units.includes(coverage.unit) &&
      readingStrings(coverage.revisionIds) && coverage.revisionIds.length > 0);
    covered.add(coverage.unit);
    requireReading(coverage.revisionIds.every((id) => manifest.typed_members.some((member) =>
      member.coordination_item_revision_id === id)) &&
      row.reading.bindings.some((binding) => binding.units.includes(coverage.unit as string)));
  }
  requireReading(covered.size === event.affected_units.length);
}

function validatePackageReading(row: ExternalFulfilmentReading) {
  requireReading(readingStrings(row.units) && row.units.length > 0 && typeof row.package_key === 'string' &&
    typeof row.scope_edition_id === 'string' && typeof row.kind === 'string' && typeof row.status === 'string' &&
    (row.configuration_id === null || typeof row.configuration_id === 'string') && readingObject(row.reading));
  const reading = row.reading;
  requireReading(reading.package_id === null || typeof reading.package_id === 'string');
  for (const values of [reading.events, reading.bindings, reading.verifications, reading.manifests]) {
    requireReading(Array.isArray(values) && values.every(readingObject));
  }
  requireReading(new Set(reading.events.map((event) => event.id)).size === reading.events.length &&
    new Set(reading.manifests.map((manifest) => manifest.id)).size === reading.manifests.length &&
    new Set(reading.bindings.map((binding) => binding.decision_id)).size === reading.bindings.length &&
    new Set(reading.verifications.map((receipt) => receipt.event_id)).size === reading.verifications.length);
  for (const binding of reading.bindings) {
    requireReading(typeof binding.id === 'string' && binding.fulfilment_id === row.id &&
      typeof binding.decision_id === 'string' && typeof binding.bound_by === 'string' &&
      typeof binding.bound_at === 'string' && readingStrings(binding.units) && binding.units.length > 0 &&
      binding.units.every((unit) => row.units.includes(unit)) &&
      (binding.covers_plan_issue_id === null || typeof binding.covers_plan_issue_id === 'string') &&
      (binding.covers_configuration_snapshot_hash === null || typeof binding.covers_configuration_snapshot_hash === 'string'));
  }
  for (const receipt of reading.verifications) {
    requireReading(typeof receipt.event_id === 'string' && receipt.fulfilment_id === row.id &&
      typeof receipt.verified_by === 'string' && reading.events.some((event) => event.id === receipt.event_id));
  }
  for (const manifest of reading.manifests) {
    validateReadingManifest(manifest, row);
    requireReading(reading.events.some((event) => event.manifest_id === manifest.id));
  }
  let priorSequence = 0;
  const verificationSequences = new Set<number>();
  const releasedHolds = new Set<string>();
  for (const event of reading.events) {
    validateReadingEvent(event, row);
    requireReading(event.event_seq > priorSequence);
    priorSequence = event.event_seq;
    if (event.verification_seq !== null) {
      requireReading(!verificationSequences.has(event.verification_seq));
      verificationSequences.add(event.verification_seq);
    }
    if (event.releases_event_id !== null) {
      requireReading(!releasedHolds.has(event.releases_event_id));
      releasedHolds.add(event.releases_event_id);
    }
  }
}

/** Separate validation/cache identity; both queries receive the same additive RPC rows. */
export function useExternalFulfilmentReadings(projectId: string | null | undefined) {
  const query = useQuery({
    queryKey: [...externalFulfilmentKeys.project(projectId), 'readings'] as const,
    enabled: !!projectId,
    retry: false,
    queryFn: async () => {
      if (!projectId) throw new Error('A project is required.');
      const { data, error } = await createBrowserClient().rpc('get_project_external_fulfilments', {
        p_project_id: projectId,
      });
      if (error) throw error;
      const rows = parseFulfilments(data, projectId) as ExternalFulfilmentReading[];
      requireReading(new Set(rows.map((row) => row.id)).size === rows.length);
      rows.forEach(validatePackageReading);
      return rows;
    },
  });
  return { ...query, capability: externalFulfilmentCapability };
}

/** Preserve native refusals, request keys and receipts; never synthesize an act. */
function useExternalAct<Args, Result>(
  projectId: string,
  execute: (args: Args) => PromiseLike<{ data: Result | null; error: unknown }>,
  authority = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (args: Args): Promise<Result> => {
      const { data, error } = await execute(args);
      if (error) throw error;
      if (data == null) throw new Error('The act returned no recorded result.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: externalFulfilmentKeys.project(projectId) });
      // 00876/00883 own the cross-domain financial and logistics derivations.
      // Invalidation asks those readers again; it never manufactures a PO,
      // studio price, verified installation or an accepted service on the client.
      invalidateFfeCaches(queryClient, projectId);
      void queryClient.invalidateQueries({ queryKey: commercialKeys.budget(projectId) });
      for (const key of [
        ['project-review-attention', projectId],
        ['project-commercial-summary', projectId],
        ['client-project-editorial', projectId],
        ['client-selections', projectId], ['client-plan', projectId],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      if (authority) {
        void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['project-parties', projectId] });
        void queryClient.invalidateQueries({ queryKey: ['project-roster', projectId] });
        void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
        void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
      }
    },
  });
}

export function useCreateExternalFulfilment(projectId: string) {
  return useExternalAct(projectId, (args: CreateExternalFulfilmentArgs) =>
    createBrowserClient().rpc('create_external_fulfilment', args as RpcArgs<'create_external_fulfilment'>));
}

export function useRecordExternalFulfilmentEvent(projectId: string) {
  return useExternalAct(projectId, (args: RecordExternalFulfilmentEventArgs) =>
    createBrowserClient().rpc('record_external_fulfilment_event', args as RpcArgs<'record_external_fulfilment_event'>));
}

export function useVerifyExternalFulfilmentEvent(projectId: string) {
  return useExternalAct(projectId, (args: RpcArgs<'verify_external_fulfilment_event'>) =>
    createBrowserClient().rpc('verify_external_fulfilment_event', args));
}

export function useBindFulfilmentEvidence(projectId: string) {
  return useExternalAct(projectId, (args: RpcArgs<'bind_fulfilment_evidence'>) =>
    createBrowserClient().rpc('bind_fulfilment_evidence', args));
}

export function useAssignFfeItemsToScopePackage(projectId: string) {
  return useExternalAct(projectId, (args: RpcArgs<'assign_ffe_items_to_scope_package'>) =>
    createBrowserClient().rpc('assign_ffe_items_to_scope_package', args));
}

export function useSetFfeItemExternalFulfilment(projectId: string) {
  return useExternalAct(projectId, (args: SetFfeItemExternalFulfilmentArgs) =>
    createBrowserClient().rpc('set_ffe_item_external_fulfilment', args as RpcArgs<'set_ffe_item_external_fulfilment'>));
}

export function useGrantFabricationAuthority(projectId: string) {
  return useExternalAct(projectId, (args: GrantFabricationAuthorityArgs) =>
    createBrowserClient().rpc('grant_fabrication_authority', args as RpcArgs<'grant_fabrication_authority'>), true);
}

export function useRevokeFabricationAuthority(projectId: string) {
  return useExternalAct(projectId, (args: RpcArgs<'revoke_fabrication_authority'>) =>
    createBrowserClient().rpc('revoke_fabrication_authority', args), true);
}

/** The native shared gate derives amount/actor/authority for both event routes. */
export function useRecordFabricationInstruction(projectId: string) {
  return useExternalAct(projectId, (args: RpcArgs<'record_fabrication_instruction'>) =>
    createBrowserClient().rpc('record_fabrication_instruction', args));
}
