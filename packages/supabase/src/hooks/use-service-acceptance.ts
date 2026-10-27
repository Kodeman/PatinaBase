'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { serviceAcceptanceKeys } from '../query-keys/service-acceptance';
import { scopeRecord } from './use-agreement-parts';

// C4 (00886) ships inactive: every mutation is revoked until a reviewed
// activation migration. This is the studio's read of
// get_project_service_acceptance only. The projection's `capability` echoes
// scope_editions (responses paused or not); it never activates acceptance.
// Acceptance rows stay out of use-project-approvals (X08).
export const serviceAcceptanceCapability = {
  status: 'inactive', reason: 'not_activated',
} as const;

const LIFECYCLES = ['draft', 'sent', 'withdrawn', 'superseded', 'closed'] as const;
const OUTCOMES = ['pending', 'accepted', 'accepted_with_conditions', 'returned'] as const;
const ANSWERS = ['accept', 'accept_with_conditions', 'return'] as const;
const METHODS = ['portal_authenticated', 'ios_authenticated', 'paper_intake'] as const;
const SUPERSEDED_REASONS = ['scope_edition_superseded', 'scope_edition_stale', 'successor_request'] as const;
const REVIEW_STATES = ['pending_review', 'confirmed', 'rejected', 'lapsed'] as const;
const LAPSED_REASONS = ['request_terminal', 'signer_policy_revised'] as const;

export type ServiceAcceptanceLifecycle = (typeof LIFECYCLES)[number];
export type ServiceAcceptanceOutcome = (typeof OUTCOMES)[number];
export type ServiceAcceptanceAnswer = (typeof ANSWERS)[number];
export type ServiceAcceptanceMethod = (typeof METHODS)[number];

export interface ServiceAcceptanceCondition { conditionId: string; text: string }

export interface ServiceAcceptanceResponse {
  responseId: string;
  response: ServiceAcceptanceAnswer;
  conditions: ServiceAcceptanceCondition[];
  returnReason: string | null;
  method: ServiceAcceptanceMethod;
  respondedAt: string;
}

export interface ServiceAcceptanceSigner {
  signerId: string;
  slot: string;
  required: boolean;
  profileId: string | null;
  householdPersonId: string | null;
  status: 'active' | 'replaced';
  replacedBySignerId: string | null;
  replacementReason: string | null;
  replacedAt: string | null;
  response: ServiceAcceptanceResponse | null;
}

export interface ServiceAcceptancePaperIntake {
  intakeId: string;
  signerId: string;
  storageObjectId: string;
  documentSha256: string;
  paperSignedOn: string;
  signedName: string;
  disposition: ServiceAcceptanceAnswer;
  conditions: ServiceAcceptanceCondition[];
  returnReason: string | null;
  presentedSignerPolicyRevision: number;
  reviewState: (typeof REVIEW_STATES)[number];
  lapsedReason: (typeof LAPSED_REASONS)[number] | null;
  recordedBy: string;
  recordedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface ServiceAcceptanceRequest {
  requestId: string;
  projectId: string;
  requestNumber: number;
  predecessorRequestId: string | null;
  scopeEditionId: string;
  scopeContentHash: string;
  evidenceManifestId: string;
  evidenceManifestHash: string;
  signerPolicyRevision: number;
  lifecycle: ServiceAcceptanceLifecycle;
  aggregateOutcome: ServiceAcceptanceOutcome;
  closedReason: Exclude<ServiceAcceptanceOutcome, 'pending'> | null;
  closedAt: string | null;
  sentAt: string | null;
  supersededReason: (typeof SUPERSEDED_REASONS)[number] | null;
  supersededAt: string | null;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  outboundDraftId: string | null;
  createdAt: string;
  signers: ServiceAcceptanceSigner[];
  paperIntakes: ServiceAcceptancePaperIntake[];
}

export interface ProjectServiceAcceptance {
  projectId: string;
  capability: 'active' | 'inactive';
  requests: ServiceAcceptanceRequest[];
}

// Strict reads: an unknown vocabulary or a malformed row fails closed.
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Malformed service acceptance text');
  return value;
}

function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('Malformed service acceptance number');
  return value as number;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error('Unsupported service acceptance value');
  return value as T;
}

function nullableOneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return value == null ? null : oneOf(value, allowed);
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Malformed service acceptance list');
  return value.map(scopeRecord);
}

function conditions(value: unknown): ServiceAcceptanceCondition[] {
  return records(value).map((row) => ({ conditionId: text(row.conditionId), text: text(row.text) }));
}

function readResponse(value: unknown): ServiceAcceptanceResponse | null {
  if (value == null) return null;
  const row = scopeRecord(value);
  return {
    responseId: text(row.responseId), response: oneOf(row.response, ANSWERS), conditions: conditions(row.conditions),
    returnReason: nullableText(row.returnReason), method: oneOf(row.method, METHODS), respondedAt: text(row.respondedAt),
  };
}

function readSigner(row: Record<string, unknown>): ServiceAcceptanceSigner {
  if (typeof row.required !== 'boolean' || (row.profileId == null) === (row.householdPersonId == null)) {
    throw new Error('Malformed service acceptance signer');
  }
  return {
    signerId: text(row.signerId), slot: text(row.slot), required: row.required,
    profileId: nullableText(row.profileId), householdPersonId: nullableText(row.householdPersonId),
    status: oneOf(row.status, ['active', 'replaced'] as const),
    replacedBySignerId: nullableText(row.replacedBySignerId), replacementReason: nullableText(row.replacementReason),
    replacedAt: nullableText(row.replacedAt), response: readResponse(row.response),
  };
}

function readIntake(row: Record<string, unknown>): ServiceAcceptancePaperIntake {
  return {
    intakeId: text(row.intakeId), signerId: text(row.signerId), storageObjectId: text(row.storageObjectId),
    documentSha256: text(row.documentSha256), paperSignedOn: text(row.paperSignedOn), signedName: text(row.signedName),
    disposition: oneOf(row.disposition, ANSWERS), conditions: conditions(row.conditions),
    returnReason: nullableText(row.returnReason),
    presentedSignerPolicyRevision: positiveInteger(row.presentedSignerPolicyRevision),
    reviewState: oneOf(row.reviewState, REVIEW_STATES), lapsedReason: nullableOneOf(row.lapsedReason, LAPSED_REASONS),
    recordedBy: text(row.recordedBy), recordedAt: text(row.recordedAt), reviewedBy: nullableText(row.reviewedBy),
    reviewedAt: nullableText(row.reviewedAt), reviewNote: nullableText(row.reviewNote),
  };
}

export function readProjectServiceAcceptance(value: unknown, projectId: string): ProjectServiceAcceptance {
  const bundle = scopeRecord(value);
  if (bundle.projectId !== projectId) throw new Error('Service acceptance project mismatch');
  return {
    projectId,
    capability: oneOf(bundle.capability, ['active', 'inactive'] as const),
    requests: records(bundle.requests).map((row) => {
      if (row.projectId !== projectId) throw new Error('Service acceptance request project mismatch');
      return {
        requestId: text(row.requestId), projectId, requestNumber: positiveInteger(row.requestNumber),
        predecessorRequestId: nullableText(row.predecessorRequestId), scopeEditionId: text(row.scopeEditionId),
        scopeContentHash: text(row.scopeContentHash), evidenceManifestId: text(row.evidenceManifestId),
        evidenceManifestHash: text(row.evidenceManifestHash),
        signerPolicyRevision: positiveInteger(row.signerPolicyRevision),
        lifecycle: oneOf(row.lifecycle, LIFECYCLES), aggregateOutcome: oneOf(row.aggregateOutcome, OUTCOMES),
        closedReason: nullableOneOf(row.closedReason, ['accepted', 'accepted_with_conditions', 'returned'] as const),
        closedAt: nullableText(row.closedAt), sentAt: nullableText(row.sentAt),
        supersededReason: nullableOneOf(row.supersededReason, SUPERSEDED_REASONS),
        supersededAt: nullableText(row.supersededAt), withdrawnAt: nullableText(row.withdrawnAt),
        withdrawReason: nullableText(row.withdrawReason), outboundDraftId: nullableText(row.outboundDraftId),
        createdAt: text(row.createdAt), signers: records(row.signers).map(readSigner),
        paperIntakes: records(row.paperIntakes).map(readIntake),
      };
    }),
  };
}

export function useServiceAcceptance(projectId: string | null | undefined) {
  const query = useQuery({
    queryKey: serviceAcceptanceKeys.project(projectId),
    queryFn: async () => {
      const { data, error } = await createBrowserClient().rpc('get_project_service_acceptance', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return readProjectServiceAcceptance(data, projectId as string);
    },
    enabled: !!projectId,
  });
  return { ...query, capability: serviceAcceptanceCapability };
}
