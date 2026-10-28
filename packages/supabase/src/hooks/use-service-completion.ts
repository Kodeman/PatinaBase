'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { scopeRecord } from './use-agreement-parts';
import type { ServiceAcceptanceOutcome } from './use-service-acceptance';

// C6 (00888) ships inactive: complete_studio_service,
// resolve_service_acceptance_condition and revoke_studio_service_completion
// are revoked from `authenticated` until a reviewed activation migration, so a
// denial is the normal inactive state (isServiceAcceptanceInactive). The two
// reads are granted. Completion is not closure: nothing here touches
// close_project or projects.status.

export const serviceCompletionKeys = {
  all: ['service-completion'] as const,
  project: (projectId: string | null | undefined) => ['service-completion', 'project', projectId ?? null] as const,
  obligations: (projectId: string | null | undefined) =>
    ['service-completion', 'project', projectId ?? null, 'obligations'] as const,
  completion: (projectId: string | null | undefined) =>
    ['service-completion', 'project', projectId ?? null, 'completion'] as const,
  evidence: (projectId: string | null | undefined) =>
    ['service-completion', 'project', projectId ?? null, 'evidence'] as const,
  citation: (projectId: string, kind: ServiceConditionEvidenceKind, id: string) =>
    ['service-completion', 'project', projectId, 'citation', kind, id] as const,
  /** The job's storage inventory: one per job, shared by the picker and every stored citation. */
  storage: (projectId: string) => ['service-completion', 'project', projectId, 'storage'] as const,
};

// These reads print their own calm read error with Retry, so a failure never
// reaches the designer's global toast (R83 `errorSurface` convention).
const SILENT = { errorSurface: 'silent' as const };

const STATES = ['completed', 'completed_with_conditions'] as const;
const OUTCOMES = ['pending', 'accepted', 'accepted_with_conditions', 'returned'] as const;

export type StudioServiceCompletionState = (typeof STATES)[number];

/** One derived row: a blocker or an informational item (C6 §2.3). */
export interface StudioServiceObligationItem {
  code: string;
  count: number;
  packageKey: string | null;
  /** The server's own label; the portal prints its plain-language copy. */
  label: string;
}

export interface StudioServiceOpenCondition {
  conditionId: string;
  text: string;
  responseId: string;
  signerId: string;
}

export interface StudioServiceFinancialHold {
  openInvoiceCount: number;
  balanceCents: number;
  uncollectedContractCents: number;
}

export interface StudioServiceObligations {
  projectId: string;
  capability: 'active' | 'inactive';
  scopeEditionId: string | null;
  obligationHash: string;
  blockers: StudioServiceObligationItem[];
  informational: StudioServiceObligationItem[];
  /** K3 option A: open acceptance conditions never block; completion records them. */
  conditions: StudioServiceOpenCondition[];
  acceptance: { requestId: string | null; outcome: ServiceAcceptanceOutcome | null; pendingRequiredSigners: number };
  /** As of read, beside the hash and never in it: it holds closure, not service. */
  financialHold: StudioServiceFinancialHold;
  /** Reads are numbered as they start (see staleReadingMark). */
  readNumber: number;
}

export interface ServiceConditionEvidence {
  issueId?: string;
  siteRequestId?: string;
  storageObjectId?: string;
}

export interface StudioServiceCompletion {
  completionId: string;
  scopeEditionId: string;
  acceptanceRequestId: string;
  state: StudioServiceCompletionState;
  openConditionIds: string[];
  obligationHash: string;
  completedBy: string;
  completedAt: string;
  conditionsClosedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

export interface ServiceConditionResolution {
  resolutionId: string;
  requestId: string;
  conditionId: string;
  responseId: string;
  resolution: string;
  evidence: ServiceConditionEvidence;
  resolvedBy: string;
  resolvedAt: string;
}

export interface StudioServiceCompletionRead {
  projectId: string;
  capability: 'active' | 'inactive';
  completions: StudioServiceCompletion[];
  resolutions: ServiceConditionResolution[];
}

// Strict reads: an unknown vocabulary or a malformed row fails closed.
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Malformed service completion text');
  return value;
}

function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Malformed service completion number');
  return value as number;
}

function cents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Malformed service completion amount');
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error('Unsupported service completion value');
  return value as T;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Malformed service completion list');
  return value.map(scopeRecord);
}

function items(value: unknown): StudioServiceObligationItem[] {
  return records(value).map((row) => ({
    code: text(row.code), count: count(row.count), packageKey: nullableText(row.packageKey), label: text(row.label),
  }));
}

function evidence(value: unknown): ServiceConditionEvidence {
  const row = scopeRecord(value);
  const out: ServiceConditionEvidence = {};
  for (const key of ['issueId', 'siteRequestId', 'storageObjectId'] as const) {
    if (row[key] != null) out[key] = text(row[key]);
  }
  return out;
}

export function readStudioServiceObligations(
  value: unknown, projectId: string,
): Omit<StudioServiceObligations, 'readNumber'> {
  const bundle = scopeRecord(value);
  if (bundle.projectId !== projectId) throw new Error('Service obligations project mismatch');
  const acceptance = scopeRecord(bundle.acceptance);
  const hold = scopeRecord(bundle.financialHold);
  if (!Array.isArray(acceptance.pendingRequiredSigners)) throw new Error('Malformed service obligations acceptance');
  return {
    projectId,
    capability: oneOf(bundle.capability, ['active', 'inactive'] as const),
    scopeEditionId: nullableText(bundle.scopeEditionId),
    obligationHash: text(bundle.obligationHash),
    blockers: items(bundle.blockers),
    informational: items(bundle.informational),
    conditions: records(bundle.conditions).map((row) => ({
      conditionId: text(row.conditionId), text: text(row.text), responseId: text(row.responseId),
      signerId: text(row.signerId),
    })),
    acceptance: {
      requestId: nullableText(acceptance.requestId),
      outcome: acceptance.outcome == null ? null : oneOf(acceptance.outcome, OUTCOMES),
      pendingRequiredSigners: acceptance.pendingRequiredSigners.length,
    },
    financialHold: {
      openInvoiceCount: count(hold.openInvoiceCount), balanceCents: cents(hold.balanceCents),
      uncollectedContractCents: cents(hold.uncollectedContractCents),
    },
  };
}

export function readStudioServiceCompletion(value: unknown, projectId: string): StudioServiceCompletionRead {
  const bundle = scopeRecord(value);
  if (bundle.projectId !== projectId) throw new Error('Service completion project mismatch');
  // The designer portal reads the studio projection only; the client one
  // carries no capability, hold or resolutions.
  if (bundle.audience !== 'studio') throw new Error('Service completion audience mismatch');
  return {
    projectId,
    capability: oneOf(bundle.capability, ['active', 'inactive'] as const),
    completions: records(bundle.completions).map((row) => {
      if (!Array.isArray(row.openConditionIds)) throw new Error('Malformed service completion conditions');
      return {
        completionId: text(row.completionId), scopeEditionId: text(row.scopeEditionId),
        acceptanceRequestId: text(row.acceptanceRequestId), state: oneOf(row.state, STATES),
        openConditionIds: row.openConditionIds.map(text), obligationHash: text(row.obligationHash),
        completedBy: text(row.completedBy), completedAt: text(row.completedAt),
        conditionsClosedAt: nullableText(row.conditionsClosedAt), revokedAt: nullableText(row.revokedAt),
        revokedBy: nullableText(row.revokedBy), revokeReason: nullableText(row.revokeReason),
      };
    }),
    resolutions: records(bundle.resolutions).map((row) => ({
      resolutionId: text(row.resolutionId), requestId: text(row.requestId), conditionId: text(row.conditionId),
      responseId: text(row.responseId), resolution: text(row.resolution), evidence: evidence(row.evidence),
      resolvedBy: text(row.resolvedBy), resolvedAt: text(row.resolvedAt),
    })),
  };
}

// Every obligations read takes the next number as it starts. A stale refusal
// records the last number begun before it (before its refresh starts), so only
// a reading numbered above that mark began after the refusal: a read already in
// flight when the server refused can never re-enable Complete.
let obligationReadsStarted = 0;
const staleMarks = new Map<string, number>();

/** The last obligations read begun before this job's latest stale refusal, or
 *  null when none was refused. A reading at or below it is retired. */
export function staleReadingMark(projectId: string): number | null {
  return staleMarks.get(projectId) ?? null;
}

/** derive_studio_service_obligations: the blockers, informational items, open
 *  conditions and financial hold the studio reads before completing. */
export function useStudioServiceObligations(projectId: string | null | undefined) {
  return useQuery({
    queryKey: serviceCompletionKeys.obligations(projectId),
    enabled: !!projectId,
    meta: SILENT,
    queryFn: async (): Promise<StudioServiceObligations> => {
      obligationReadsStarted += 1;
      const readNumber = obligationReadsStarted;
      const { data, error } = await createBrowserClient().rpc('derive_studio_service_obligations', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return { ...readStudioServiceObligations(data, projectId as string), readNumber };
    },
  });
}

/** get_studio_service_completion (studio audience): every completion, revoked
 *  ones included, and every condition resolution. */
export function useStudioServiceCompletion(projectId: string | null | undefined) {
  return useQuery({
    queryKey: serviceCompletionKeys.completion(projectId),
    enabled: !!projectId,
    meta: SILENT,
    queryFn: async () => {
      const { data, error } = await createBrowserClient().rpc('get_studio_service_completion', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return readStudioServiceCompletion(data, projectId as string);
    },
  });
}

/** The 00888 refusal token. Unlike C4's, `service_obligations_open` carries
 *  its blocker list after a colon; only the token is returned. */
export function serviceCompletionRefusal(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  return /^([a-z][a-z0-9_]*)(?::|$)/.exec(message)?.[1] ?? null;
}

/** Refusals that mean the reading on screen is out of date: refetch it. */
export const STALE_SERVICE_COMPLETION_REFUSALS: ReadonlySet<string> = new Set([
  'stale_obligations', 'service_obligations_open', 'service_already_completed', 'acceptance_request_not_current',
  'acceptance_request_unknown', 'scope_edition_not_active', 'service_acceptance_condition_resolved',
  'service_acceptance_condition_unknown', 'service_completion_revoked',
]);

// One client_request_id per act + exact arguments, held until the act
// succeeds: a retry after a timeout or remount replays the same key, so the
// server answers with its recorded receipt instead of acting twice.
const heldKeys = new Map<string, string>();

function heldKey(act: string, args: unknown): { slot: string; key: string } {
  const slot = `${act}:${JSON.stringify(args)}`;
  let key = heldKeys.get(slot);
  if (!key) {
    key = globalThis.crypto.randomUUID();
    heldKeys.set(slot, key);
  }
  return { slot, key };
}

function useServiceCompletionAct<Args, Result>(
  projectId: string,
  act: string,
  execute: (args: Args, key: string) => PromiseLike<{ data: unknown; error: unknown }>,
) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: serviceCompletionKeys.project(projectId) });
  return useMutation({
    retry: false,
    mutationFn: async (args: Args): Promise<Result> => {
      const { slot, key } = heldKey(act, args);
      const { data, error } = await execute(args, key);
      if (error) throw error;
      if (data == null) throw new Error('The act returned no recorded result.');
      heldKeys.delete(slot);
      return data as Result;
    },
    onSuccess: () => {
      void refresh();
    },
    onError: (error: unknown) => {
      const token = serviceCompletionRefusal(error);
      if (!token || !STALE_SERVICE_COMPLETION_REFUSALS.has(token)) return;
      // Marked before the refresh starts its read, which numbers above it.
      staleMarks.set(projectId, obligationReadsStarted);
      void refresh();
    },
  });
}

export interface CompleteStudioServiceArgs {
  acceptanceRequestId: string;
  /** The hash of the obligations the studio was shown. */
  obligationHash: string;
}
export interface StudioServiceCompletionReceipt {
  completionId: string; state: StudioServiceCompletionState; conditionsOpen: number; replayed: boolean;
}

export function useCompleteStudioService(projectId: string) {
  return useServiceCompletionAct<CompleteStudioServiceArgs, StudioServiceCompletionReceipt>(
    projectId, `complete:${projectId}`, (args, key) => createBrowserClient().rpc('complete_studio_service', {
      p_project_id: projectId, p_acceptance_request_id: args.acceptanceRequestId,
      p_obligation_hash: args.obligationHash, p_client_request_id: key,
    }));
}

export interface ResolveServiceAcceptanceConditionArgs {
  requestId: string;
  conditionId: string;
  resolution: string;
  /** Exactly one reference (C6 §2.2): 00888 refuses an empty evidence object. */
  evidence: ServiceConditionEvidence;
}
export interface ServiceConditionResolutionReceipt {
  resolutionId: string; requestId: string; conditionId: string; completionId?: string | null;
  completionState?: StudioServiceCompletionState | null; replayed: boolean;
}

export function useResolveServiceAcceptanceCondition(projectId: string) {
  return useServiceCompletionAct<ResolveServiceAcceptanceConditionArgs, ServiceConditionResolutionReceipt>(
    projectId, 'resolve-condition', (args, key) => createBrowserClient().rpc('resolve_service_acceptance_condition', {
      p_request_id: args.requestId, p_condition_id: args.conditionId, p_resolution: args.resolution,
      p_evidence: { ...args.evidence }, p_client_request_id: key,
    }));
}

export interface RevokeStudioServiceCompletionArgs { completionId: string; reason: string }

/** Owner or admin of the recorded studio only (00888). The row and every
 *  resolution stay on the record; the server replays a same-reason retry. */
export function useRevokeStudioServiceCompletion(projectId: string) {
  return useServiceCompletionAct<RevokeStudioServiceCompletionArgs, { completionId: string; revokedAt: string; replayed: boolean }>(
    projectId, 'revoke', (args) => createBrowserClient().rpc('revoke_studio_service_completion', {
      p_completion_id: args.completionId, p_reason: args.reason,
    }));
}

export type ServiceConditionEvidenceKind = 'issue' | 'siteRequest' | 'storageObject';

export interface ServiceConditionEvidenceOption {
  kind: ServiceConditionEvidenceKind;
  id: string;
  label: string;
}

type Client = ReturnType<typeof createBrowserClient>;

const STORAGE_PAGE = 100;
const ROW_PAGE = 1000;
/** Folders listed at once by one inventory walk. */
const STORAGE_WALK_PARALLELISM = 4;

function issueLabel(row: { issue_number: number; name: string }): string {
  return `Issue ${row.issue_number} · ${row.name}`;
}

function siteRequestLabel(row: { note: string | null; assignee_name_snapshot: string | null }): string {
  return row.note?.trim() || (row.assignee_name_snapshot ? `Site request to ${row.assignee_name_snapshot}` : 'Site request');
}

/** The job's site request ids the user can read, every page of them. */
async function siteRequestIds(client: Client, projectId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await client.from('site_requests').select('id').eq('project_id', projectId)
      .order('id').range(from, from + ROW_PAGE - 1);
    if (error) throw error;
    ids.push(...(data ?? []).map((row) => row.id));
    if ((data ?? []).length < ROW_PAGE) return ids;
  }
}

/** A stored object the signed-in user can read, by its path below its root. */
export interface StoredObject {
  bucket: string;
  path: string;
}

/** Every stored object of the job the signed-in user can read, by id. */
export interface StoredObjectInventory {
  objects: Record<string, StoredObject>;
}

interface Folder {
  bucket: string;
  root: string;
  folder: string;
}

/** Every page of one folder: objects into `objects`, subfolders returned. */
async function listFolder(client: Client, { bucket, root, folder }: Folder, objects: Record<string, StoredObject>) {
  const subfolders: Folder[] = [];
  const prefix = folder ? `${root}/${folder}` : root;
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: STORAGE_PAGE, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    const page = data ?? [];
    for (const entry of page) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      // A folder lists with no id.
      if (entry.id) objects[entry.id] = { bucket, path };
      else subfolders.push({ bucket, root, folder: path });
    }
    if (page.length < STORAGE_PAGE) return subfolders;
  }
}

/**
 * Where 00888 accepts a cited storage object for this job (C6 §2.2), walked
 * once, every folder and page, at most STORAGE_WALK_PARALLELISM folders at a
 * time: the first folder is the job in `project-documents`,
 * `project-ffe-working` and `service-acceptance-paper`; `field-media` paths
 * start `project/<job>/`; `site-requests` objects sit under one of the job's
 * site requests. Any failed list fails the whole walk: a partial inventory is
 * never an answer.
 */
async function storageInventory(client: Client, projectId: string): Promise<StoredObjectInventory> {
  const roots: [string, string][] = [
    ['project-documents', projectId], ['project-ffe-working', projectId], ['service-acceptance-paper', projectId],
    ['field-media', `project/${projectId}`],
    ...(await siteRequestIds(client, projectId)).map((id): [string, string] => ['site-requests', id]),
  ];
  const objects: Record<string, StoredObject> = {};
  const queue: Folder[] = roots.map(([bucket, root]) => ({ bucket, root, folder: '' }));
  await new Promise<void>((resolve, reject) => {
    let active = 0;
    let failed = false;
    const pump = () => {
      if (failed) return;
      if (queue.length === 0 && active === 0) { resolve(); return; }
      while (active < STORAGE_WALK_PARALLELISM && queue.length > 0) {
        active += 1;
        listFolder(client, queue.shift() as Folder, objects).then((subfolders) => {
          active -= 1;
          queue.push(...subfolders);
          pump();
        }, (error: unknown) => {
          failed = true;
          reject(error);
        });
      }
    };
    pump();
  });
  return { objects };
}

/**
 * The job's storage inventory, one query per job under the signed-in user's
 * read (the designer's QueryClient is per signed-in subject): the evidence
 * picker and every stored-object citation read it, so the job is walked once.
 */
function storageInventoryQuery(projectId: string) {
  return {
    queryKey: serviceCompletionKeys.storage(projectId),
    queryFn: () => storageInventory(createBrowserClient(), projectId),
  };
}

/**
 * What a resolution can cite, as the signed-in user can read it: the job's
 * drawing-set issues, site requests and stored documents (`project-documents`,
 * every file under `<projectId>/`, from the job's storage inventory). The
 * picker only; a recorded citation is checked on its own
 * (useServiceConditionCitation).
 */
export function useServiceConditionEvidenceOptions(projectId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: serviceCompletionKeys.evidence(projectId),
    enabled: enabled && !!projectId,
    meta: SILENT,
    queryFn: async (): Promise<ServiceConditionEvidenceOption[]> => {
      const supabase = createBrowserClient();
      const [issues, requests, inventory] = await Promise.all([
        supabase.from('plan_issues').select('id, issue_number, name').eq('project_id', projectId as string)
          .order('issue_number', { ascending: false }),
        supabase.from('site_requests').select('id, note, assignee_name_snapshot, created_at')
          .eq('project_id', projectId as string).order('created_at', { ascending: false }),
        queryClient.fetchQuery({ ...storageInventoryQuery(projectId as string), meta: SILENT }),
      ]);
      if (issues.error) throw issues.error;
      if (requests.error) throw requests.error;
      const files = Object.entries(inventory.objects)
        // The storage API's empty-folder marker is not a document.
        .filter(([, object]) => object.bucket === 'project-documents' && !object.path.endsWith('.emptyFolderPlaceholder'))
        .map(([id, object]) => ({ kind: 'storageObject' as const, id, label: object.path }))
        .sort((a, b) => a.label.localeCompare(b.label));
      return [
        ...(issues.data ?? []).map((row) => ({ kind: 'issue' as const, id: row.id, label: issueLabel(row) })),
        ...(requests.data ?? []).map((row) => ({ kind: 'siteRequest' as const, id: row.id, label: siteRequestLabel(row) })),
        ...files,
      ];
    },
  });
}

/** A recorded citation, checked now: still readable, or positively gone. */
export type ServiceConditionCitation = { available: true; label: string } | { available: false };

const GONE: ServiceConditionCitation = { available: false };

/** The references a resolution recorded, one per evidence key. */
export function citedReferences(evidence: ServiceConditionEvidence): { kind: ServiceConditionEvidenceKind; id: string }[] {
  const keys: [ServiceConditionEvidenceKind, keyof ServiceConditionEvidence][] = [
    ['issue', 'issueId'], ['siteRequest', 'siteRequestId'], ['storageObject', 'storageObjectId'],
  ];
  return keys.flatMap(([kind, key]) => (evidence[key] ? [{ kind, id: evidence[key] as string }] : []));
}

/** An issue or site request, checked directly by id on this job. */
async function checkRow(
  client: Client, projectId: string, kind: 'issue' | 'siteRequest', id: string,
): Promise<ServiceConditionCitation> {
  if (kind === 'issue') {
    const { data, error } = await client.from('plan_issues').select('id, issue_number, name').eq('id', id)
      .eq('project_id', projectId).maybeSingle();
    if (error) throw error;
    return data ? { available: true, label: issueLabel(data) } : GONE;
  }
  const { data, error } = await client.from('site_requests').select('id, note, assignee_name_snapshot').eq('id', id)
    .eq('project_id', projectId).maybeSingle();
  if (error) throw error;
  return data ? { available: true, label: siteRequestLabel(data) } : GONE;
}

/** A cited stored object, read from a completed inventory: absent there is gone. */
export function citeStoredObject(inventory: StoredObjectInventory, id: string): ServiceConditionCitation {
  const object = inventory.objects[id];
  return object ? { available: true, label: object.path } : GONE;
}

/**
 * One recorded citation, checked under the signed-in user's read authority
 * (C6 §2.2 point-in-time). An issue or site request is read directly by id; a
 * stored object is looked up in the job's shared storage inventory. Gone only
 * when the check completes without finding it; a failed check (or a failed
 * inventory) is an error, and the reader says it could not check, never that
 * the reference is gone or the resolution reopened.
 */
export function useServiceConditionCitation(projectId: string, kind: ServiceConditionEvidenceKind, id: string) {
  return useQuery<StoredObjectInventory | ServiceConditionCitation, Error, ServiceConditionCitation, readonly unknown[]>(
    kind === 'storageObject'
      ? { ...storageInventoryQuery(projectId), meta: SILENT,
        select: (inventory) => citeStoredObject(inventory as StoredObjectInventory, id) }
      : { queryKey: serviceCompletionKeys.citation(projectId, kind, id), meta: SILENT,
        queryFn: () => checkRow(createBrowserClient(), projectId, kind, id) },
  );
}
