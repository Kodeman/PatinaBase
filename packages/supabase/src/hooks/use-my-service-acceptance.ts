'use client';

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { serviceAcceptanceKeys } from '../query-keys/service-acceptance';
import { scopeRecord } from './use-agreement-parts';
import type { ScopePackagePayload, ScopePartyKind, ScopeServiceSlot } from '@patina/types';
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

const evidenceKinds = ['plan_issue', 'plan_issue_print', 'plan_print', 'product_configuration',
  'custom_commission_revision', 'review_item', 'approval_artifact', 'po_spec_snapshot',
  'coordination_item_revision'] as const;
const parties = ['studio', 'client', 'gc', 'other', 'none'] as const;
export type ServiceAcceptanceEvidenceKind = typeof evidenceKinds[number];
export interface MyServiceAcceptanceScopePackage {
  key: string;
  label: string;
  inclusion: ScopePackagePayload['inclusion'];
  conditionText: string | null;
  responsibilities: Record<'design' | 'purchasing' | 'installation', ScopePartyKind>;
  phases: { name: string; service: ScopeServiceSlot }[];
}
export interface MyServiceAcceptanceEvidenceDocument { bucket: 'project-documents'; path: string; title: string }
export interface MyServiceAcceptanceEvidenceMember {
  kind: ServiceAcceptanceEvidenceKind;
  title: string;
  issuedAt: string | null;
  documents: MyServiceAcceptanceEvidenceDocument[];
}
/** What a signer accepts (A20): the content behind the request's frozen hashes. */
export interface MyServiceAcceptanceEvidence {
  requestId: string;
  requestNumber: number;
  scope: { editionId: string; contentHash: string; packages: MyServiceAcceptanceScopePackage[] };
  evidence: { manifestId: string; manifestHash: string; members: MyServiceAcceptanceEvidenceMember[] };
}
function readScopePackage(row: Record<string, unknown>): MyServiceAcceptanceScopePackage {
  const inclusion = choice(row.inclusion, ['included', 'excluded', 'conditional'] as const);
  const conditionText = row.conditionText == null ? null : text(row.conditionText);
  if (inclusion === 'conditional' && conditionText === null) throw new Error('Malformed acceptance condition');
  const responsibilities = scopeRecord(row.responsibilities);
  return {
    key: text(row.key), label: text(row.label), inclusion, conditionText,
    responsibilities: {
      design: choice(responsibilities.design, parties), purchasing: choice(responsibilities.purchasing, parties),
      installation: choice(responsibilities.installation, parties),
    },
    phases: list(row.phases).map((p) => ({ name: text(p.name), service: choice(p.service, ['design', 'installation'] as const) })),
  };
}
export function readMyServiceAcceptanceEvidence(value: unknown): MyServiceAcceptanceEvidence {
  const row = scopeRecord(value);
  const scope = scopeRecord(row.scope);
  const evidence = scopeRecord(row.evidence);
  return {
    requestId: text(row.requestId), requestNumber: integer(row.requestNumber),
    scope: { editionId: text(scope.editionId), contentHash: text(scope.contentHash), packages: list(scope.packages).map(readScopePackage) },
    evidence: {
      manifestId: text(evidence.manifestId), manifestHash: text(evidence.manifestHash),
      members: list(evidence.members).map((m) => ({
        kind: choice(m.kind, evidenceKinds), title: text(m.title), issuedAt: m.issuedAt == null ? null : text(m.issuedAt),
        documents: list(m.documents).map((d) => ({
          bucket: choice(d.bucket, ['project-documents'] as const), path: text(d.path), title: text(d.title),
        })),
      })),
    },
  };
}
export function useMyServiceAcceptanceEvidence(requestId: string | null | undefined) {
  return useQuery({
    queryKey: [...myRequestsKey, 'evidence', requestId ?? null] as const,
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await createBrowserClient().rpc('get_my_service_acceptance_evidence', {
        p_request_id: requestId as string,
      });
      if (error) throw error;
      const read = readMyServiceAcceptanceEvidence(data);
      if (read.requestId !== requestId) throw new Error('Acceptance evidence mismatch');
      return read;
    },
  });
}
export interface RespondServiceAcceptanceInput {
  request: Pick<MyServiceAcceptanceRequest, 'requestId' | 'scopeContentHash' | 'evidenceManifestHash' | 'signerPolicyRevision'>;
  response: ServiceAcceptanceAnswer;
  conditions: Pick<ServiceAcceptanceCondition, 'text'>[];
  returnReason: string;
}
export interface MyServiceAcceptanceReceipt {
  responseId: string;
  aggregateOutcome: ServiceAcceptanceOutcome;
  pendingRequiredSigners: { signerId: string; slot: string }[];
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
        p_conditions: input.conditions.map((c) => ({ text: c.text.trim() })),
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
        pendingRequiredSigners: list(row.pendingRequiredSigners).map((s) => ({ signerId: text(s.signerId), slot: text(s.slot) })),
        signerPolicyRevision: integer(row.signerPolicyRevision), replayed: row.replayed,
      };
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: serviceAcceptanceKeys.all }); },
  });
}
