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
  useRecordFabricationInstruction,
} from '../use-external-fulfilments';
import type { ExternalFulfilment } from '../use-external-fulfilments';
import type { ExternalFulfilment as PublicExternalFulfilment } from '../index';

type ReadConfig = { enabled: boolean; queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };
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
