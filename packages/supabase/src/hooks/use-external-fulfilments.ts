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
