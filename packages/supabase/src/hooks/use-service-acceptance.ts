'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { serviceAcceptanceKeys } from '../query-keys/service-acceptance';
import { scopeRecord } from './use-agreement-parts';

// C4 (00886) ships inactive: every mutation is revoked until a reviewed
// activation migration. The studio's read is get_project_service_acceptance;
// the studio acts below call the revoked RPCs and surface their denial. The projection's `capability` echoes
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
  documentSha256: string | null;
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
    documentSha256: nullableText(row.documentSha256), paperSignedOn: text(row.paperSignedOn), signedName: text(row.signedName),
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

// ---------------------------------------------------------------------------
// Studio acts (WP-10C). Every 00886 mutation is revoked from `authenticated`
// until a reviewed activation migration, and each re-checks scope_editions at
// entry, so a denial here is the normal inactive state, not data loss.
// ---------------------------------------------------------------------------

export const SERVICE_ACCEPTANCE_PAPER_BUCKET = 'service-acceptance-paper';
const PAPER_LIMIT_BYTES = 20 * 1024 * 1024;

function errorField(error: unknown, field: 'code' | 'message'): string {
  if (!error || typeof error !== 'object' || !(field in error)) return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

/** True when the act is not switched on: the grant is revoked (42501,
 *  "permission denied for function …") or the scope_editions switch is off.
 *  The RPCs' own `insufficient_privilege` refusal (also 42501) is a real
 *  authority answer for this caller and stays distinct. */
export function isServiceAcceptanceInactive(error: unknown): boolean {
  const message = errorField(error, 'message');
  if (/permission denied for function/i.test(message) || message === 'scope_editions_inactive') return true;
  return errorField(error, 'code') === '42501' && message !== 'insufficient_privilege';
}

/** The server's refusal token (RAISE EXCEPTION '<token>'), or null. */
export function serviceAcceptanceRefusal(error: unknown): string | null {
  const message = errorField(error, 'message');
  return /^[a-z][a-z0-9_]*$/.test(message) ? message : null;
}

function newRequestKey(): string {
  return globalThis.crypto.randomUUID();
}

// One client_request_id per act + exact arguments, held until the act
// succeeds: a retry after a timeout or remount replays the same key, so the
// server answers with its recorded receipt instead of acting twice.
const heldKeys = new Map<string, string>();

function heldKey(act: string, args: unknown): { slot: string; key: string } {
  const slot = `${act}:${JSON.stringify(args)}`;
  let key = heldKeys.get(slot);
  if (!key) {
    key = newRequestKey();
    heldKeys.set(slot, key);
  }
  return { slot, key };
}

function useServiceAcceptanceAct<Args, Result>(
  projectId: string,
  act: string,
  execute: (args: Args, key: string) => PromiseLike<{ data: unknown; error: unknown }>,
  signature: (args: Args) => unknown = (args) => args,
) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (args: Args): Promise<Result> => {
      const { slot, key } = heldKey(act, signature(args));
      const { data, error } = await execute(args, key);
      if (error) throw error;
      if (data == null) throw new Error('The act returned no recorded result.');
      heldKeys.delete(slot);
      return data as Result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serviceAcceptanceKeys.project(projectId) });
    },
  });
}

export interface CreateServiceAcceptanceArgs { scopeEditionId: string; evidenceManifestId: string }
export interface ServiceAcceptanceCreateReceipt {
  requestId: string; lifecycle: ServiceAcceptanceLifecycle; outboundDraftId: string | null;
  /** 00891: one notice draft per active required signer; outboundDraftId is the first. */
  outboundDraftIds: string[];
  signerPolicyRevision: number; replayed: boolean;
}

export function useCreateServiceAcceptanceRequest(projectId: string) {
  return useServiceAcceptanceAct<CreateServiceAcceptanceArgs, ServiceAcceptanceCreateReceipt>(
    projectId, 'create', (args, key) => createBrowserClient().rpc('create_service_acceptance_request', {
      p_project_id: projectId, p_scope_edition_id: args.scopeEditionId,
      p_evidence_manifest_id: args.evidenceManifestId, p_client_request_id: key,
    }));
}

export interface WithdrawServiceAcceptanceArgs { requestId: string; reason: string }

export function useWithdrawServiceAcceptanceRequest(projectId: string) {
  return useServiceAcceptanceAct<WithdrawServiceAcceptanceArgs, { requestId: string; lifecycle: string; replayed: boolean }>(
    projectId, 'withdraw', (args, key) => createBrowserClient().rpc('withdraw_service_acceptance_request', {
      p_request_id: args.requestId, p_reason: args.reason, p_client_request_id: key,
    }));
}

export interface ReplaceServiceAcceptanceSignerArgs {
  requestId: string; signerId: string; expectedSignerPolicyRevision: number; reason: string;
  newProfileId: string | null; newHouseholdPersonId: string | null;
}

export function useReplaceServiceAcceptanceSigner(projectId: string) {
  return useServiceAcceptanceAct<ReplaceServiceAcceptanceSignerArgs, { signerId: string; signerPolicyRevision: number }>(
    projectId, 'replace-signer', (args, key) => createBrowserClient().rpc('replace_service_acceptance_signer', {
      p_request_id: args.requestId, p_signer_id: args.signerId,
      p_new_profile_id: args.newProfileId as string, p_new_household_person_id: args.newHouseholdPersonId as string,
      p_expected_signer_policy_revision: args.expectedSignerPolicyRevision, p_reason: args.reason,
      p_client_request_id: key,
    }));
}

/** The binding printed on the paper, as the recorder transcribed it (C4 F11).
 *  Never copied from the request on screen: 00886 compares each value with
 *  the request and refuses a paper that describes another one. */
export interface ServiceAcceptancePresentedBinding {
  requestNumber: number;
  scopeContentHash: string;
  evidenceManifestHash: string;
  signerPolicyRevision: number;
}

/** A printed code as 00886 compares it: full lowercase sha256 hex. Spaces and
 *  case from transcription are dropped; anything else (a short form) is null,
 *  because the server compares the full value exactly. */
export function normalizePaperCode(value: string): string | null {
  const code = value.replace(/\s+/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(code) ? code : null;
}

export interface RecordServiceAcceptancePaperArgs {
  requestId: string;
  presented: ServiceAcceptancePresentedBinding;
  signerId: string;
  file: File;
  paperSignedOn: string;
  signedName: string;
  disposition: ServiceAcceptanceAnswer;
  conditions: string[];
  returnReason: string | null;
}
export interface ServiceAcceptancePaperReceipt {
  intakeId: string; reviewState: string; documentSha256: string | null; replayed: boolean;
}

// The private PDF is uploaded once per file: a retry records against the
// object already stored instead of uploading a second copy.
const uploadedPaper = new WeakMap<File, { projectId: string; objectId: string }>();
const fileTokens = new WeakMap<File, string>();

function fileToken(file: File): string {
  let token = fileTokens.get(file);
  if (!token) {
    token = newRequestKey();
    fileTokens.set(file, token);
  }
  return token;
}

export function useRecordServiceAcceptancePaperIntake(projectId: string) {
  return useServiceAcceptanceAct<RecordServiceAcceptancePaperArgs, ServiceAcceptancePaperReceipt>(
    projectId, 'record-paper', async (args, key) => {
      const { file } = args;
      if (file.type !== 'application/pdf' || file.size < 1 || file.size > PAPER_LIMIT_BYTES) {
        throw new Error('Choose a PDF no larger than 20 MiB.');
      }
      const supabase = createBrowserClient();
      let stored = uploadedPaper.get(file);
      if (stored?.projectId !== projectId) {
        // 00886 storage policy: `<projectId>/<uuid>.pdf`, owned by the uploader.
        const path = `${projectId}/${newRequestKey()}.pdf`;
        const { data, error } = await supabase.storage.from(SERVICE_ACCEPTANCE_PAPER_BUCKET)
          .upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (error) throw error;
        if (!data?.id) throw new Error('The paper was stored but not confirmed. Try again.');
        stored = { projectId, objectId: data.id };
        uploadedPaper.set(file, stored);
      }
      const { presented } = args;
      return supabase.rpc('record_service_acceptance_paper_intake', {
        p_request_id: args.requestId, p_signer_id: args.signerId, p_storage_object_id: stored.objectId,
        p_paper_signed_on: args.paperSignedOn, p_signed_name: args.signedName, p_disposition: args.disposition,
        p_conditions: args.conditions.map((text) => ({ text })),
        p_return_reason: args.returnReason as string,
        p_presented_request_number: presented.requestNumber,
        p_presented_scope_content_hash: presented.scopeContentHash,
        p_presented_evidence_manifest_hash: presented.evidenceManifestHash,
        p_presented_signer_policy_revision: presented.signerPolicyRevision,
        p_client_request_id: key,
      });
    }, (args) => ({ ...args, file: fileToken(args.file) }));
}

export interface ReviewServiceAcceptancePaperArgs {
  intakeId: string; decision: 'confirmed' | 'rejected'; expectedDocumentSha256: string | null; note: string | null;
}

export function useReviewServiceAcceptancePaperIntake(projectId: string) {
  return useServiceAcceptanceAct<ReviewServiceAcceptancePaperArgs, { intakeId: string; reviewState: string }>(
    projectId, 'review-paper', (args, key) => createBrowserClient().rpc('review_service_acceptance_paper_intake', {
      p_intake_id: args.intakeId, p_decision: args.decision,
      p_expected_document_sha256: args.expectedDocumentSha256 as string, p_note: args.note as string,
      p_client_request_id: key,
    }));
}

/** Asks the service-role edge function to hash the stored PDF bytes and stamp
 *  the intake (00886 stamp_service_acceptance_paper_hash). Idempotent server
 *  side: a second call replays the recorded stamp. */
export function useStampServiceAcceptancePaper(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ intakeId }: { intakeId: string }) => {
      const { data, error } = await createBrowserClient().functions.invoke('service-acceptance-paper-hash', {
        body: { projectId, intakeId },
      });
      if (error) throw error;
      const receipt = data as { intakeId?: unknown; documentSha256?: unknown } | null;
      if (receipt?.intakeId !== intakeId || typeof receipt.documentSha256 !== 'string'
        || !/^[0-9a-f]{64}$/.test(receipt.documentSha256)) {
        throw new Error('The paper was not stamped. Try again.');
      }
      return { intakeId, documentSha256: receipt.documentSha256 };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serviceAcceptanceKeys.project(projectId) });
    },
  });
}

export interface ServiceAcceptancePaperDocument {
  /** Short-lived signed URL of the stored object, for the portal's framed
   *  PDF viewer. 00886 forbids updating or deleting these objects, so it
   *  serves the same bytes that were hashed below. */
  url: string;
  sha256: string;
  /** False when the bytes do not hash to the stamp; null while unstamped. */
  matchesStamp: boolean | null;
}

type PaperBucket = ReturnType<ReturnType<typeof createBrowserClient>['storage']['from']>;
const PAPER_LIST_PAGE = 100;
const PAPER_VIEW_SECONDS = 600;

// The projection carries only storage_object_id; the object's name is
// `<projectId>/<uuid>.pdf`, so page the project's folder (RLS-read) for it.
async function findPaperObjectName(bucket: PaperBucket, projectId: string, objectId: string): Promise<string> {
  for (let offset = 0; ; offset += PAPER_LIST_PAGE) {
    const { data, error } = await bucket.list(projectId, {
      limit: PAPER_LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    const found = data?.find((object) => object.id === objectId);
    if (found) return `${projectId}/${found.name}`;
    if ((data?.length ?? 0) < PAPER_LIST_PAGE) throw new Error('The stored paper could not be found.');
  }
}

/** The exact stored PDF of one paper intake, for the reviewer to read before
 *  confirming (C4 F11). Its bytes are hashed here so a file that no longer
 *  matches the stamp is never presented as the stamped paper. */
export function useServiceAcceptancePaperDocument(
  projectId: string,
  intake: Pick<ServiceAcceptancePaperIntake, 'intakeId' | 'storageObjectId' | 'documentSha256'>,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...serviceAcceptanceKeys.project(projectId), 'paper', intake.intakeId, intake.storageObjectId,
      intake.documentSha256] as const,
    enabled: enabled && !!projectId,
    staleTime: (PAPER_VIEW_SECONDS - 60) * 1000,
    queryFn: async (): Promise<ServiceAcceptancePaperDocument> => {
      const bucket = createBrowserClient().storage.from(SERVICE_ACCEPTANCE_PAPER_BUCKET);
      const name = await findPaperObjectName(bucket, projectId, intake.storageObjectId);
      const { data: blob, error } = await bucket.download(name);
      if (error) throw error;
      if (!blob) throw new Error('The stored paper could not be read.');
      const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const signed = await bucket.createSignedUrl(name, PAPER_VIEW_SECONDS);
      if (signed.error) throw signed.error;
      if (!signed.data?.signedUrl) throw new Error('The stored paper could not be opened.');
      return {
        url: signed.data.signedUrl, sha256,
        matchesStamp: intake.documentSha256 == null ? null : sha256 === intake.documentSha256,
      };
    },
  });
}

export interface ServiceAcceptanceManifest { id: string; manifestHash: string; createdAt: string }

/** The project's `purpose = 'service_acceptance'` evidence manifests (00877,
 *  RLS-read), under the service-acceptance project key. */
export function useServiceAcceptanceManifests(projectId: string | null | undefined) {
  return useQuery({
    queryKey: [...serviceAcceptanceKeys.project(projectId), 'manifests'] as const,
    enabled: !!projectId,
    queryFn: async (): Promise<ServiceAcceptanceManifest[]> => {
      const { data, error } = await createBrowserClient().from('evidence_manifests')
        .select('id, project_id, purpose, manifest_hash, created_at')
        .eq('project_id', projectId as string).eq('purpose', 'service_acceptance')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return records(data).map((row) => {
        if (row.project_id !== projectId || row.purpose !== 'service_acceptance') {
          throw new Error('Service acceptance manifest mismatch');
        }
        return { id: text(row.id), manifestHash: text(row.manifest_hash), createdAt: text(row.created_at) };
      });
    },
  });
}
