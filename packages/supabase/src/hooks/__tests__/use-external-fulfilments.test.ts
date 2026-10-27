import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const { rpc, from, invalidateQueries } = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), invalidateQueries: vi.fn(),
}));
vi.mock('../../client', () => ({ createBrowserClient: () => ({ rpc, from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  externalFulfilmentCapability, externalFulfilmentKeys, useExternalFulfilments,
  useCreateExternalFulfilment, useRecordExternalFulfilmentEvent,
  useVerifyExternalFulfilmentEvent, useBindFulfilmentEvidence,
  useAssignFfeItemsToScopePackage, useSetFfeItemExternalFulfilment,
  useGrantFabricationAuthority, useRevokeFabricationAuthority,
  useRecordFabricationInstruction, useExternalFulfilmentReadings,
} from '../use-external-fulfilments';
import type { ExternalFulfilment, ExternalFulfilmentReading } from '../use-external-fulfilments';
import type { ExternalFulfilment as PublicExternalFulfilment, ExternalFulfilmentReading as PublicExternalFulfilmentReading } from '../index';

type ReadConfig = { retry: boolean; enabled: boolean; queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };
type ActConfig = {
  retry: boolean;
  mutationFn: (args: unknown) => Promise<unknown>;
  onSuccess: () => void;
};

beforeEach(() => {
  rpc.mockReset(); from.mockReset(); invalidateQueries.mockReset();
});

describe('external fulfilment read truth', () => {
  it('exports the native hooks and row type through the public barrel', () => {
    expectTypeOf<typeof import('../index')>().toMatchTypeOf<typeof import('../use-external-fulfilments')>();
    expectTypeOf<PublicExternalFulfilment>().toEqualTypeOf<ExternalFulfilment>();
    expectTypeOf<PublicExternalFulfilmentReading>().toEqualTypeOf<ExternalFulfilmentReading>();
  });

  it('keeps capability inactive without reading capability tables', () => {
    expect(externalFulfilmentCapability).toEqual({ status: 'inactive', reason: 'not_activated', available: false });
    const config = useExternalFulfilments(null) as unknown as ReadConfig;
    expect(config.enabled).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads only the native project RPC and preserves unpriced/reported fields', async () => {
    const row = { id: 'external-1', project_id: 'project-1', reported_price_cents: null, status: 'received' };
    rpc.mockResolvedValue({ data: [row], error: null });
    const config = useExternalFulfilments('project-1') as unknown as ReadConfig;
    expect(config.queryKey).toEqual(externalFulfilmentKeys.project('project-1'));
    await expect(config.queryFn()).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith('get_project_external_fulfilments', { p_project_id: 'project-1' });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not turn permission refusal into an empty successful schedule', async () => {
    const refusal = { code: '42501', message: 'external_forbidden' };
    rpc.mockResolvedValue({ data: null, error: refusal });
    await expect((useExternalFulfilments('project-1') as unknown as ReadConfig).queryFn()).rejects.toBe(refusal);
  });

  it.each([null, {}, [{ id: 'external-1', project_id: 'other-project' }]])(
    'refuses a missing, malformed or foreign-project read: %j', async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      await expect((useExternalFulfilments('project-1') as unknown as ReadConfig).queryFn()).rejects.toThrow('could not be read');
    },
  );

  it('accepts an actual empty successful native read', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect((useExternalFulfilments('project-1') as unknown as ReadConfig).queryFn()).resolves.toEqual([]);
  });
});

function packageReading(): ExternalFulfilmentReading {
  const event = {
    id: 'event-1', fulfilment_id: 'external-1', event_kind: 'contract_reported', event_seq: 1,
    evidence_level: 'verified', evidence: { contractAmountCents: 200000 },
    recorded_by: 'recorder', recorded_at: '2026-10-26T00:00:00Z', actor_id: null,
    verified_by: 'verifier', verified_at: '2026-10-26T00:00:01Z', verification_seq: 1,
    affected_units: null, releases_event_id: null, plan_issue_id: null, authority_id: null,
    manifest_id: null, manifest_hash: null, amount_cents: null, evidence_route: null, coverage: null,
  } satisfies ExternalFulfilmentReading['reading']['events'][number];
  return {
    id: 'external-1', project_id: 'project-1', scope_edition_id: 'edition-1', package_key: 'pkg.cabinets',
    units: ['k-1', 'k-2'], kind: 'gc_cabinetry', configuration_id: null, party_engagement_id: 'party-1',
    buyer_party_kind: 'gc', payer_party_kind: 'gc', contracting_party_kind: 'gc',
    created_by: 'recorder', created_at: event.recorded_at, reported_price_cents: 200000,
    price_visibility: 'studio_only', status: 'instructed', client_request_id: 'create-1', request_hash: 'header-hash',
    reading: {
      package_id: 'package-1', events: [event, {
        ...event, id: 'instruction-1', event_kind: 'fabrication_instruction', event_seq: 2,
        evidence_level: 'reported', evidence: { manifestId: 'manifest-1', authorizingPartyId: 'party-1' },
        actor_id: 'recorder', verified_by: null, verified_at: null, verification_seq: null,
        authority_id: 'authority-1', affected_units: ['k-1'], manifest_id: 'manifest-1',
        manifest_hash: 'a'.repeat(64), amount_cents: 200000, evidence_route: 'approved_submittal',
        coverage: [{ unit: 'k-1', revisionIds: ['revision-1'] }],
      }],
      verifications: [{ event_id: 'event-1', fulfilment_id: 'external-1', verified_by: 'verifier' }],
      bindings: [{ id: 'binding-1', fulfilment_id: 'external-1', decision_id: 'decision-1', units: ['k-1'],
        covers_plan_issue_id: null, covers_configuration_snapshot_hash: null,
        bound_by: 'recorder', bound_at: event.recorded_at }],
      manifests: [{ id: 'manifest-1', project_id: 'project-1', package_id: 'package-1',
        purpose: 'fabrication_instruction', manifest_hash: 'a'.repeat(64),
        created_by: 'recorder', created_at: event.recorded_at,
        members: [{ kind: 'coordination_item_revision', id: 'revision-1', rev: 1, sha256: 'b'.repeat(64) }],
        typed_members: [{ id: 'member-1', manifest_id: 'manifest-1', coordination_item_revision_id: 'revision-1',
          plan_issue_id: null, plan_issue_print_id: null, plan_print_id: null, product_configuration_id: null,
          custom_commission_revision_id: null, review_item_id: null, approval_artifact_id: null, po_spec_snapshot_id: null }],
      }],
    },
  };
}

const brokenReadingCases: [string, (row: ExternalFulfilmentReading) => void][] = [
  ['foreign event', (row) => { row.reading.events[0].fulfilment_id = 'other'; }],
  ['foreign binding', (row) => { row.reading.bindings[0].fulfilment_id = 'other'; }],
  ['foreign manifest project', (row) => { row.reading.manifests[0].project_id = 'other'; }],
  ['foreign manifest package', (row) => { row.reading.manifests[0].package_id = 'other'; }],
  ['missing required manifest', (row) => { row.reading.manifests = []; }],
  ['wrong recorded manifest hash', (row) => { row.reading.events[1].manifest_hash = 'c'.repeat(64); }],
  ['missing typed member', (row) => { row.reading.manifests[0].typed_members = []; }],
  ['wrong typed member identity', (row) => { row.reading.manifests[0].typed_members[0].coordination_item_revision_id = 'other'; }],
  ['wrong typed member manifest', (row) => { row.reading.manifests[0].typed_members[0].manifest_id = 'other'; }],
  ['missing verification receipt', (row) => { row.reading.verifications = []; }],
  ['wrong receipt verifier', (row) => { row.reading.verifications[0].verified_by = 'recorder'; }],
  ['wrong receipt event', (row) => { row.reading.verifications[0].event_id = 'other'; }],
  ['wrong receipt fulfilment', (row) => { row.reading.verifications[0].fulfilment_id = 'other'; }],
  ['wrong instruction actor', (row) => { row.reading.events[1].actor_id = 'verifier'; }],
  ['missing unit coverage', (row) => { row.reading.events[1].coverage = []; }],
  ['foreign covered revision', (row) => { row.reading.events[1].coverage = [{ unit: 'k-1', revisionIds: ['other'] }]; }],
  ['foreign covered unit', (row) => { row.reading.events[1].coverage = [{ unit: 'other', revisionIds: ['revision-1'] }]; }],
  ['missing coverage binding', (row) => { row.reading.bindings = []; }],
  ['duplicate event', (row) => { row.reading.events.push(row.reading.events[0]); }],
  ['duplicate receipt', (row) => { row.reading.verifications.push(row.reading.verifications[0]); }],
  ['out of order events', (row) => { row.reading.events.reverse(); }],
];

describe('authoritative external package evidence', () => {
  it('uses the same native RPC with a descendant key, without colliding with header data', async () => {
    const row = packageReading();
    rpc.mockResolvedValue({ data: [row], error: null });
    const config = useExternalFulfilmentReadings('project-1') as unknown as ReadConfig;
    expect(config.queryKey).toEqual([...externalFulfilmentKeys.project('project-1'), 'readings']);
    await expect(config.queryFn()).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith('get_project_external_fulfilments', { p_project_id: 'project-1' });
    await expect((useExternalFulfilments('project-1') as unknown as ReadConfig).queryFn()).resolves.toEqual([row]);
    expect(from).not.toHaveBeenCalled();
  });

  it('never retries either native reader after a refusal', () => {
    for (const hook of [useExternalFulfilments, useExternalFulfilmentReadings]) {
      expect((hook('project-1') as unknown as ReadConfig).retry).toBe(false);
    }
  });

  it('accepts a native uppercase UUID in release evidence', async () => {
    const row = packageReading();
    const base = row.reading.events[0];
    const id = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
    row.reading.events.push(
      { ...base, id, event_kind: 'hold', event_seq: 3, evidence_level: 'reported',
        verified_by: null, verified_at: null, verification_seq: null, affected_units: ['k-1'] },
      { ...base, id: 'release', event_kind: 'release_hold', event_seq: 4, evidence_level: 'reported',
        verified_by: null, verified_at: null, verification_seq: null, releases_event_id: id,
        evidence: { releasesEventId: id.toUpperCase() } },
    );
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect((useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn()).resolves.toEqual([row]);
  });

  it('preserves recorder, actor and verifier as distinct native fields, not fallback identities', async () => {
    const row = packageReading();
    rpc.mockResolvedValue({ data: [row], error: null });
    const result = await (useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn();
    expect(result).toEqual([row]);
    expect(row.reading.events[0]).toMatchObject({ recorded_by: 'recorder', actor_id: null, verified_by: 'verifier' });
    expect(row.reading.events[1]).toMatchObject({ actor_id: 'recorder', verified_by: null, evidence_level: 'reported' });
  });

  it('retains independent holds, a native null-unit release and the original instruction manifest', async () => {
    const row = packageReading();
    const instruction = row.reading.events[1];
    const hold = { ...instruction, event_kind: 'hold', actor_id: null, authority_id: null,
      manifest_id: null, manifest_hash: null, amount_cents: null, evidence_route: null, coverage: null,
      evidence: { decisionId: 'decision-1' } };
    row.reading.events.push(
      { ...hold, id: 'hold-1', event_seq: 3, affected_units: ['k-1'] },
      { ...hold, id: 'hold-2', event_seq: 4, affected_units: ['k-2'] },
      { ...hold, id: 'release-1', event_kind: 'release_hold', event_seq: 5, affected_units: null,
        releases_event_id: 'hold-1', evidence: { releasesEventId: 'hold-1', decisionId: 'decision-1' } },
      { ...hold, id: 'new-issue', event_kind: 'package_issued', event_seq: 6, affected_units: null,
        plan_issue_id: 'issue-new', evidence: { planIssueId: 'issue-new', configurationSnapshotHash: null } },
    );
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect((useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn()).resolves.toEqual([row]);
    expect(row.reading.events[1].manifest_id).toBe('manifest-1');
    expect(row.reading.events[3].affected_units).toEqual(['k-2']);
  });

  it.each(brokenReadingCases)('refuses whole malformed reading: %s', async (_name, breakReading) => {
    const row = packageReading(); breakReading(row);
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect((useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn()).rejects.toThrow('could not be read');
  });

  it.each([null, {}, [{ id: 'external-1', project_id: 'project-1' }],
    [{ ...packageReading(), reading: null }], [{ ...packageReading(), reading: { events: [null] } }]])(
    'refuses unavailable or missing nested evidence instead of false-empty success: %j', async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      await expect((useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn()).rejects.toThrow('could not be read');
    });

  it('distinguishes empty native success, native refusal and a disabled query', async () => {
    const disabled = useExternalFulfilmentReadings(null) as unknown as ReadConfig;
    expect(disabled.enabled).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await expect(disabled.queryFn()).rejects.toThrow('A project is required');
    rpc.mockResolvedValue({ data: [], error: null });
    await expect((useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn()).resolves.toEqual([]);
    const refusal = { code: '42501', message: 'external_fulfilment_access' };
    rpc.mockResolvedValue({ data: null, error: refusal });
    await expect((useExternalFulfilmentReadings('project-1') as unknown as ReadConfig).queryFn()).rejects.toBe(refusal);
  });

  it('inherits every external act parent-prefix invalidation without header-cache writes', () => {
    for (const [hook] of routes) {
      invalidateQueries.mockClear();
      (hook('project-1') as unknown as ActConfig).onSuccess();
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: externalFulfilmentKeys.project('project-1') });
    }
  });
});

type CreateArgs = Parameters<ReturnType<typeof useCreateExternalFulfilment>['mutateAsync']>[0];
type EventArgs = Parameters<ReturnType<typeof useRecordExternalFulfilmentEvent>['mutateAsync']>[0];
type ConversionArgs = Parameters<ReturnType<typeof useSetFfeItemExternalFulfilment>['mutateAsync']>[0];
type GrantArgs = Parameters<ReturnType<typeof useGrantFabricationAuthority>['mutateAsync']>[0];

const routes = [
  [useCreateExternalFulfilment, 'create_external_fulfilment', {
    p_project_id: 'project-1', p_scope_edition_id: 'edition-1', p_package_key: 'pkg.cabinet',
    p_kind: 'gc_cabinetry', p_units: ['U1'], p_party_engagement_id: null,
    p_configuration_id: null, p_client_request_id: 'stable-create',
  } satisfies CreateArgs],
  [useRecordExternalFulfilmentEvent, 'record_external_fulfilment_event', {
    p_fulfilment_id: 'external-1', p_event_kind: 'received', p_evidence: { source: 'reported' },
    p_affected_units: null, p_client_request_id: 'stable-event',
  } satisfies EventArgs],
  [useVerifyExternalFulfilmentEvent, 'verify_external_fulfilment_event', {
    p_event_id: 'event-1', p_client_request_id: 'stable-verify',
  }],
  [useBindFulfilmentEvidence, 'bind_fulfilment_evidence', {
    p_fulfilment_id: 'external-1', p_decision_id: 'decision-1', p_units: ['U1'],
    p_client_request_id: 'stable-bind',
  }],
  [useAssignFfeItemsToScopePackage, 'assign_ffe_items_to_scope_package', {
    p_project_id: 'project-1', p_item_ids: ['item-1'], p_package_key: 'pkg.cabinet', p_client_request_id: 'stable-assign',
  }],
  [useSetFfeItemExternalFulfilment, 'set_ffe_item_external_fulfilment', {
    p_item_id: 'item-1', p_fulfilment_id: null, p_row_version: 7, p_client_request_id: 'stable-conversion',
  } satisfies ConversionArgs],
  [useGrantFabricationAuthority, 'grant_fabrication_authority', {
    p_engagement_id: 'seat-1', p_effective_from: '2026-10-26', p_idempotency_key: 'stable-grant',
    p_effective_to: null, p_threshold_cents: null, p_copy_to: [], p_source_clause: null,
  } satisfies GrantArgs],
  [useRevokeFabricationAuthority, 'revoke_fabrication_authority', { p_authority_id: 'grant-1', p_reason: 'revoked' }],
  [useRecordFabricationInstruction, 'record_fabrication_instruction', {
    p_fulfilment_id: 'external-1', p_manifest_id: 'manifest-1', p_authorizing_party_id: 'seat-1',
    p_units: ['U1'], p_evidence: {}, p_client_request_id: '00000000-0000-0000-0000-000000000001',
  }],
] as const;

const namedRoutes = routes.map(([hook, name, args]) => [name, hook, args] as const);

describe('native external/fabrication acts', () => {
  it('retains required NULL inputs, optional grant defaults and unrelated generated requirements', () => {
    expectTypeOf<Pick<CreateArgs, 'p_party_engagement_id' | 'p_configuration_id'>>().toEqualTypeOf<{
      p_party_engagement_id: string | null; p_configuration_id: string | null;
    }>();
    expectTypeOf<Pick<EventArgs, 'p_affected_units'>>().toEqualTypeOf<{ p_affected_units: string[] | null }>();
    expectTypeOf<Pick<ConversionArgs, 'p_fulfilment_id'>>().toEqualTypeOf<{ p_fulfilment_id: string | null }>();
    expectTypeOf<Pick<GrantArgs, 'p_effective_to' | 'p_threshold_cents' | 'p_source_clause'>>().toEqualTypeOf<{
      p_effective_to?: string | null; p_threshold_cents?: number | null; p_source_clause?: string | null;
    }>();
    expectTypeOf<Pick<ConversionArgs, 'p_item_id' | 'p_row_version' | 'p_client_request_id'>>().toEqualTypeOf<{
      p_item_id: string; p_row_version: number; p_client_request_id: string;
    }>();
    expectTypeOf<Pick<GrantArgs, 'p_engagement_id' | 'p_effective_from' | 'p_idempotency_key'>>().toEqualTypeOf<{
      p_engagement_id: string; p_effective_from: string; p_idempotency_key: string;
    }>();
  });

  it.each(namedRoutes)('routes %s preserving typed NULLs, request keys and native receipts', async (name, hook, args) => {
    const receipt = { eventId: 'event-1', evidenceLevel: 'reported', status: 'received', replayed: true };
    rpc.mockResolvedValue({ data: receipt, error: null });
    const config = hook('project-1') as unknown as ActConfig;
    expect(config.retry).toBe(false);
    await expect(config.mutationFn(args)).resolves.toBe(receipt);
    await expect(config.mutationFn(args)).resolves.toBe(receipt);
    expect(rpc).toHaveBeenNthCalledWith(1, name, args);
    expect(rpc).toHaveBeenNthCalledWith(2, name, args);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(namedRoutes)('preserves inactive/authority refusal for %s', async (_name, hook) => {
    const refusal = { code: '42501', message: 'permission denied for function' };
    rpc.mockResolvedValue({ data: null, error: refusal });
    const config = hook('project-1') as unknown as ActConfig;
    await expect(config.mutationFn({})).rejects.toBe(refusal);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('invalidates canonical item, readiness, budget and external readers after conversion', () => {
    const config = useSetFfeItemExternalFulfilment('project-1') as unknown as ActConfig;
    config.onSuccess();
    for (const queryKey of [
      externalFulfilmentKeys.project('project-1'), ['project-ffe-items', 'project-1'],
      ['project-ffe-readiness'], ['working-budget', 'project-1'], ['procurement-items'],
    ]) expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
  });

  it('invalidates both seat/project authority readers after a dedicated revoke', () => {
    (useRevokeFabricationAuthority('project-1') as unknown as ActConfig).onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-party-authority'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-roster', 'project-1'] });
  });

  it('refuses a missing receipt rather than reporting a recorded act', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect((useRecordFabricationInstruction('project-1') as unknown as ActConfig).mutationFn({})).rejects.toThrow('no recorded result');
  });
});
