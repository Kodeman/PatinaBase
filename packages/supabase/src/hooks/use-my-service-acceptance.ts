'use client';

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { serviceAcceptanceKeys } from '../query-keys/service-acceptance';
import { scopeRecord } from './use-agreement-parts';
import type {
  ServiceAcceptanceAnswer, ServiceAcceptanceCondition, ServiceAcceptanceLifecycle,
  ServiceAcceptanceMethod, ServiceAcceptanceOutcome,
} from './use-service-acceptance';

export type ServiceAcceptanceViewerRole = 'signer_required' | 'signer_optional' | 'observer';
export interface MyServiceAcceptanceResponse {
  response: ServiceAcceptanceAnswer;
  conditions: ServiceAcceptanceCondition[];
  returnReason: string | null;
  method: ServiceAcceptanceMethod;
  respondedAt: string;
}
export interface MyServiceAcceptanceSigner {
  signerId: string;
  slot: string;
  required: boolean;
  response: MyServiceAcceptanceResponse | null;
}
export interface MyServiceAcceptanceRequest {
  requestId: string;
  projectId: string;
  requestNumber: number;
  scopeEditionId: string;
  scopeContentHash: string;
  evidenceManifestHash: string;
  signerPolicyRevision: number;
  lifecycle: ServiceAcceptanceLifecycle;
  aggregateOutcome: ServiceAcceptanceOutcome;
  sentAt: string;
  closedAt: string | null;
  viewerRole: ServiceAcceptanceViewerRole;
  viewerSignerId: string | null;
  signers: MyServiceAcceptanceSigner[];
}

const myRequestsKey = [...serviceAcceptanceKeys.all, 'mine'] as const;
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Malformed acceptance text');
  return value;
}
function integer(value: unknown, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error('Malformed acceptance number');
  return value as number;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new Error('Unsupported acceptance value');
  return value as T;
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Malformed acceptance list');
  return value.map(scopeRecord);
}
function readResponse(value: unknown): MyServiceAcceptanceResponse | null {
  if (value == null) return null;
  const row = scopeRecord(value);
  return {
    response: choice(row.response, ['accept', 'accept_with_conditions', 'return'] as const),
    conditions: list(row.conditions).map((c) => ({ conditionId: text(c.conditionId), text: text(c.text) })),
    returnReason: row.returnReason == null ? null : text(row.returnReason),
    method: choice(row.method, ['portal_authenticated', 'ios_authenticated', 'paper_intake'] as const),
    respondedAt: text(row.respondedAt),
  };
}
export function readMyServiceAcceptanceRequests(value: unknown): MyServiceAcceptanceRequest[] {
  return list(value).map((row) => {
    const signers = list(row.signers).map((s) => {
      if (typeof s.required !== 'boolean') throw new Error('Malformed acceptance signer');
      return { signerId: text(s.signerId), slot: text(s.slot), required: s.required, response: readResponse(s.response) };
    });
    const viewerRole = row.viewerRole === 'signer_required' || row.viewerRole === 'signer_optional'
      ? row.viewerRole : 'observer';
    const viewerSignerId = row.viewerSignerId == null ? null : text(row.viewerSignerId);
    if (viewerRole !== 'observer' && !signers.some((s) => s.signerId === viewerSignerId && s.required === (viewerRole === 'signer_required'))) {
      throw new Error('Acceptance viewer mismatch');
    }
    return {
      requestId: text(row.requestId), projectId: text(row.projectId), requestNumber: integer(row.requestNumber),
      scopeEditionId: text(row.scopeEditionId), scopeContentHash: text(row.scopeContentHash),
      evidenceManifestHash: text(row.evidenceManifestHash), signerPolicyRevision: integer(row.signerPolicyRevision),
      lifecycle: choice(row.lifecycle, ['draft', 'sent', 'withdrawn', 'superseded', 'closed'] as const),
      aggregateOutcome: choice(row.aggregateOutcome, ['pending', 'accepted', 'accepted_with_conditions', 'returned'] as const),
      sentAt: text(row.sentAt), closedAt: row.closedAt == null ? null : text(row.closedAt),
      viewerRole, viewerSignerId, signers,
    };
  });
}
export function useMyServiceAcceptanceRequests() {
  return useQuery({
    queryKey: myRequestsKey,
    queryFn: async () => {
      const { data, error } = await createBrowserClient().rpc('get_my_service_acceptance_requests');
      if (error) throw error;
      return readMyServiceAcceptanceRequests(data);
    },
  });
}
export interface RespondServiceAcceptanceInput {
  request: Pick<MyServiceAcceptanceRequest, 'requestId' | 'scopeContentHash' | 'evidenceManifestHash' | 'signerPolicyRevision'>;
  response: ServiceAcceptanceAnswer;
  conditions: ServiceAcceptanceCondition[];
  returnReason: string;
}
export interface MyServiceAcceptanceReceipt {
  responseId: string;
  aggregateOutcome: ServiceAcceptanceOutcome;
  pendingRequiredSigners: number;
  signerPolicyRevision: number;
  replayed: boolean;
}
export function useRespondServiceAcceptance() {
  const client = useQueryClient();
  // Keep the key AND the exact presented body together through an uncertain
  // network result. Editing the answer creates a different attempt.
  const attempt = useRef<{ body: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async (input: RespondServiceAcceptanceInput): Promise<MyServiceAcceptanceReceipt> => {
      const args = {
        p_request_id: input.request.requestId, p_response: input.response,
        p_conditions: input.conditions.map((c) => ({ conditionId: c.conditionId, text: c.text })),
        p_return_reason: input.returnReason, p_scope_content_hash: input.request.scopeContentHash,
        p_evidence_manifest_hash: input.request.evidenceManifestHash,
        p_signer_policy_revision: input.request.signerPolicyRevision, p_method: 'portal_authenticated',
      };
      const body = JSON.stringify(args);
      if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
      const { data, error } = await createBrowserClient().rpc('respond_service_acceptance', {
        ...args, p_client_request_id: attempt.current.key,
      });
      if (error) throw error;
      const row = scopeRecord(data);
      if (typeof row.replayed !== 'boolean') throw new Error('Malformed acceptance receipt');
      return {
        responseId: text(row.responseId),
        aggregateOutcome: choice(row.aggregateOutcome, ['pending', 'accepted', 'accepted_with_conditions', 'returned'] as const),
        pendingRequiredSigners: integer(row.pendingRequiredSigners, 0),
        signerPolicyRevision: integer(row.signerPolicyRevision), replayed: row.replayed,
      };
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: serviceAcceptanceKeys.all }); },
  });
}
