// project-approval-attachments core (NI-06, CONTRACT-C revision 4 §C.3.1, §C.3.2, §C.9).
//
// Everything here runs against an AttachmentsPort so the Deno suite can drive it with an
// in-memory fake; index.ts supplies the one real port (caller-JWT RPC client plus a
// service-role client for the resolver, recorder and project-approval-editions bucket).
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";
import { bearerRole } from "../board-asset-cleanup/core.ts";
import { isServiceRoleCaller } from "../client-invite/lib.ts";

export const EDITIONS_BUCKET = "project-approval-editions";
export const SIGNED_URL_TTL_SECONDS = 300;
/** No live attempt can own an object this old: an attempt lives inside one invocation. */
export const SWEEP_AGE_MS = 24 * 60 * 60 * 1000;
/** Start no new attachment attempt past this point; the rest answers 202. */
export const MATERIALIZE_BUDGET_MS = 40_000;
export const RETRY_AFTER_SECONDS = 2;
export const CONTRACT_TAG = "shared_direction_v1";

const ALLOWED_CONTENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const EDITION_STATUSES = new Set(["ok", "revoked", "not_found", "unauthorized"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface RpcResult {
  data: unknown;
  error: unknown;
}

export interface ResolvedEntry {
  attachmentId: string;
  sha256: string;
  sizeBytes: number | null;
  contentType: string | null;
  recorded: boolean;
  objectPath: string | null;
  source: { bucket: string; path: string | null } | null;
}

export interface StoredObject {
  /** Full object name inside project-approval-editions. */
  path: string;
  createdAtMs: number;
}

export interface OpenedObject {
  stream: ReadableStream<Uint8Array>;
  contentType: string | null;
}

export interface RecordArgs {
  p_decision_id: string;
  p_attachment_id: string;
  p_sha256: string;
  p_size_bytes: number;
  p_content_type: string;
  p_object_path: string;
}

export interface SignedItem {
  error: string | null;
  path: string | null;
  signedUrl: string | null;
}

export interface AttachmentsPort {
  /** get_project_decision_edition, called with the CALLER's JWT. */
  getEdition(decisionId: string): Promise<RpcResult>;
  /** project_approval_attachment_objects, service role. */
  resolveObjects(decisionId: string): Promise<RpcResult>;
  /** Server-side copy of a source object into project-approval-editions. */
  copyToStaging(source: { bucket: string; path: string }, stagingPath: string): Promise<boolean>;
  /** Streams an object of project-approval-editions; null when it cannot be read. */
  openObject(path: string): Promise<OpenedObject | null>;
  /** Server-side move inside project-approval-editions. */
  move(fromPath: string, toPath: string): Promise<boolean>;
  /** Removes objects of project-approval-editions. Never throws for a missing object. */
  remove(paths: string[]): Promise<void>;
  /** public.record_project_approval_edition_object, service role. */
  record(args: RecordArgs): Promise<RpcResult>;
  /** Flat listing of project-approval-editions under a prefix ('' = whole bucket). */
  list(prefix: string): Promise<StoredObject[] | null>;
  /** createSignedUrls on project-approval-editions. */
  sign(paths: string[], expiresIn: number): Promise<{ data: SignedItem[] | null; error: unknown }>;
  newAttemptId(): string;
  now(): number;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export type ParsedRequest =
  | { kind: "decision"; decisionId: string }
  | { kind: "sweep" };

export function parseRequest(body: unknown): ParsedRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.mode === "sweep") return { kind: "sweep" };
  const decisionId = record.decisionId;
  if (typeof decisionId !== "string" || !UUID_RE.test(decisionId)) return null;
  return { kind: "decision", decisionId: decisionId.toLowerCase() };
}

/**
 * Who may run `{mode: "sweep"}`. The pg_cron job reaches this function through
 * public.invoke_edge_function, whose Bearer is the Vault `service_role_key` app setting.
 * It is admitted the way the other invoke_edge_function targets admit it
 * (board-asset-cleanup, site-request-media-maintenance, apns-send): verify_jwt has
 * verified the token at the gateway and its role claim is service_role. The key-format
 * arms of isServiceRoleCaller (timing-safe equality with the injected keys) are also
 * accepted. The bearer is never string-compared on its own.
 */
export function isSweepCaller(
  authorization: string | null,
  keys: { serviceRoleKey: string; secretKeys: string; projectRef: string | null },
): boolean {
  return bearerRole(authorization) === "service_role" ||
    isServiceRoleCaller(authorization, keys.serviceRoleKey, keys.secretKeys, keys.projectRef);
}

export type EditionAnswer =
  | { kind: "ok" }
  | { kind: "negative"; status: string }
  | { kind: "indeterminate" };

/**
 * §C.3.2 step 2. Only a decoded shared_direction_v1 envelope with a known status is an
 * answer; an RPC error, a null body, an undecodable body or an unknown status is
 * indeterminate (never 404, unlike project-review-media).
 */
export function classifyEdition(result: RpcResult, decisionId: string): EditionAnswer {
  if (result.error) return { kind: "indeterminate" };
  const envelope = result.data;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { kind: "indeterminate" };
  }
  const record = envelope as Record<string, unknown>;
  if (record.contract !== CONTRACT_TAG) return { kind: "indeterminate" };
  if (
    typeof record.decisionId !== "string" ||
    record.decisionId.toLowerCase() !== decisionId
  ) {
    return { kind: "indeterminate" };
  }
  const status = record.status;
  if (typeof status !== "string" || !EDITION_STATUSES.has(status)) {
    return { kind: "indeterminate" };
  }
  return status === "ok" ? { kind: "ok" } : { kind: "negative", status };
}

/**
 * The resolver's answer. `undefined` = the call failed or the body does not decode;
 * `null` = the resolver served no set (not Stage-2, or the plan-set assert failed).
 */
export function parseResolved(result: RpcResult): ResolvedEntry[] | null | undefined {
  if (result.error) return undefined;
  if (result.data === null) return null;
  if (!Array.isArray(result.data)) return undefined;
  const entries: ResolvedEntry[] = [];
  for (const raw of result.data) {
    if (!raw || typeof raw !== "object") return undefined;
    const item = raw as Record<string, unknown>;
    if (typeof item.attachmentId !== "string" || !UUID_RE.test(item.attachmentId)) {
      return undefined;
    }
    if (typeof item.sha256 !== "string" || !SHA256_RE.test(item.sha256)) return undefined;
    if (typeof item.recorded !== "boolean") return undefined;
    const objectPath = typeof item.objectPath === "string" ? item.objectPath : null;
    if (item.recorded && !objectPath) return undefined;
    const source = item.source && typeof item.source === "object"
      ? item.source as Record<string, unknown>
      : null;
    entries.push({
      attachmentId: item.attachmentId.toLowerCase(),
      sha256: item.sha256,
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
      contentType: typeof item.contentType === "string" ? item.contentType : null,
      recorded: item.recorded,
      objectPath,
      source: source && typeof source.bucket === "string"
        ? {
          bucket: source.bucket,
          path: typeof source.path === "string" && source.path ? source.path : null,
        }
        : null,
    });
  }
  return entries;
}

/** sha256 and byte count of a stream, hashed incrementally (memory bounded). */
export async function hashStream(
  stream: ReadableStream<Uint8Array>,
): Promise<{ sha256: string; sizeBytes: number }> {
  let sizeBytes = 0;
  async function* counted(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    for await (const chunk of stream) {
      sizeBytes += chunk.byteLength;
      yield chunk as Uint8Array<ArrayBuffer>;
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", counted());
  return { sha256: encodeHex(digest), sizeBytes };
}

export function stagingPath(decisionId: string, attemptId: string): string {
  return `${decisionId}/_staging/${attemptId}`;
}

export function finalPath(entry: ResolvedEntry, decisionId: string, attemptId: string): string {
  return `${decisionId}/${entry.attachmentId}/${entry.sha256}/${attemptId}`;
}

type AttemptOutcome = "recorded" | "lost" | "integrity" | "unavailable";

/**
 * One staged attempt (§C.3.1): copy the source to <d>/_staging/<attempt>, hash the
 * staging object, publish by move to the attempt's own final path, record first-writer-
 * wins. A losing attempt removes only its own final object. A record call that errors
 * or refuses leaves the final object in place and answers 503 (indeterminate, never a
 * purge): whether it was recorded is unknown, and the sweep removes it only once the
 * resolver shows it unrecorded.
 */
export async function materializeEntry(
  port: AttachmentsPort,
  decisionId: string,
  entry: ResolvedEntry,
): Promise<AttemptOutcome> {
  if (!entry.source?.path) return "unavailable";
  const attemptId = port.newAttemptId();
  const staging = stagingPath(decisionId, attemptId);
  const published = finalPath(entry, decisionId, attemptId);
  try {
    if (!await port.copyToStaging({ bucket: entry.source.bucket, path: entry.source.path }, staging)) {
      return "unavailable";
    }
    const opened = await port.openObject(staging);
    if (!opened) return "unavailable";
    let hashed: { sha256: string; sizeBytes: number };
    try {
      hashed = await hashStream(opened.stream);
    } catch {
      return "unavailable";
    }
    if (hashed.sha256 !== entry.sha256) return "integrity";
    // The recorder checks size and MIME against the stored object's metadata, so both
    // come from the staged object itself: the streamed byte count and its served type.
    const contentType = opened.contentType ?? entry.contentType;
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) return "unavailable";
    if (!await port.move(staging, published)) {
      // The final path is this attempt's alone, so removing it can touch nothing else.
      await port.remove([published]);
      return "unavailable";
    }
    const recorded = await port.record({
      p_decision_id: decisionId,
      p_attachment_id: entry.attachmentId,
      p_sha256: hashed.sha256,
      p_size_bytes: hashed.sizeBytes,
      p_content_type: contentType,
      p_object_path: published,
    });
    if (recorded.error || typeof recorded.data !== "boolean") return "unavailable";
    if (recorded.data) return "recorded";
    await port.remove([published]);
    return "lost";
  } finally {
    await port.remove([staging]);
  }
}

/**
 * Removes a decision's `_staging/` objects and unrecorded final objects older than
 * SWEEP_AGE_MS. A final object is removed only when the resolver served a set, the
 * set names its attachment, and that attachment's recorded path is a different one
 * (or none). A recorded object is never removed. Returns the number removed.
 */
export async function sweepDecision(
  port: AttachmentsPort,
  decisionId: string,
  objects: StoredObject[],
  entries: ResolvedEntry[] | null | undefined,
  nowMs: number,
): Promise<number> {
  const stale = objects.filter((object) =>
    object.path.startsWith(`${decisionId}/`) && nowMs - object.createdAtMs > SWEEP_AGE_MS
  );
  const doomed: string[] = [];
  for (const object of stale) {
    const segments = object.path.split("/");
    if (segments.length === 3 && segments[1] === "_staging") {
      doomed.push(object.path);
      continue;
    }
    if (segments.length !== 4 || !entries) continue;
    const entry = entries.find((candidate) => candidate.attachmentId === segments[1]);
    if (!entry) continue;
    if (entry.recorded && entry.objectPath === object.path) continue;
    doomed.push(object.path);
  }
  if (doomed.length > 0) await port.remove(doomed);
  return doomed.length;
}

/** The hourly pg_cron sweep (service-role `sweep` mode) over the whole bucket. */
export async function sweepAll(
  port: AttachmentsPort,
): Promise<{ scanned: number; removed: number; skipped: number }> {
  const objects = await port.list("");
  if (!objects) throw new Error("listing project-approval-editions failed");
  const nowMs = port.now();
  const byDecision = new Map<string, StoredObject[]>();
  for (const object of objects) {
    const decisionId = object.path.split("/")[0];
    if (!UUID_RE.test(decisionId)) continue;
    const group = byDecision.get(decisionId) ?? [];
    group.push(object);
    byDecision.set(decisionId, group);
  }
  let removed = 0;
  let skipped = 0;
  for (const [decisionId, group] of byDecision) {
    const hasStaleFinal = group.some((object) =>
      object.path.split("/").length === 4 && nowMs - object.createdAtMs > SWEEP_AGE_MS
    );
    const entries = hasStaleFinal
      ? parseResolved(await port.resolveObjects(decisionId))
      : undefined;
    if (hasStaleFinal && !entries) skipped += 1;
    removed += await sweepDecision(port, decisionId, group, entries, nowMs);
  }
  return { scanned: objects.length, removed, skipped };
}

const unavailable = (): HandlerResult => ({
  status: 503,
  body: { error: "media_unavailable" },
});

/**
 * §C.3.2. Every non-ok answer returns before the resolver, storage or the signer is
 * touched. The sign path never downloads bytes and never returns a storage path.
 */
export async function handleDecisionRequest(
  port: AttachmentsPort,
  decisionId: string,
): Promise<HandlerResult> {
  const answer = classifyEdition(await port.getEdition(decisionId), decisionId);
  if (answer.kind === "indeterminate") {
    return { status: 503, body: { error: "edition_unavailable" } };
  }
  if (answer.kind === "negative") {
    return { status: 404, body: { error: answer.status } };
  }

  let entries = parseResolved(await port.resolveObjects(decisionId));
  if (!entries) return unavailable();

  try {
    const objects = await port.list(`${decisionId}/`);
    if (objects) await sweepDecision(port, decisionId, objects, entries, port.now());
  } catch (error) {
    console.error("project-approval-attachments: sweep failed", error);
  }

  if (entries.some((entry) => !entry.recorded)) {
    const startedAt = port.now();
    for (const entry of entries) {
      if (entry.recorded) continue;
      if (port.now() - startedAt >= MATERIALIZE_BUDGET_MS) break;
      const outcome = await materializeEntry(port, decisionId, entry);
      if (outcome === "integrity") {
        return { status: 409, body: { error: "media_integrity_failed" } };
      }
      if (outcome === "unavailable") return unavailable();
    }
    entries = parseResolved(await port.resolveObjects(decisionId));
    if (!entries) return unavailable();
    const ready = entries.filter((entry) => entry.recorded).length;
    if (ready < entries.length) {
      return {
        status: 202,
        body: {
          status: "materializing",
          ready,
          total: entries.length,
          retryAfterSeconds: RETRY_AFTER_SECONDS,
        },
      };
    }
  }

  if (entries.length === 0) {
    return { status: 200, body: { urls: [], expiresInSeconds: SIGNED_URL_TTL_SECONDS } };
  }
  if (entries.some((entry) => entry.sizeBytes === null)) return unavailable();

  const paths = entries.map((entry) => entry.objectPath as string);
  const signed = await port.sign(paths, SIGNED_URL_TTL_SECONDS);
  const items = signed.data;
  // §C.3.2 step 4: exact correspondence, item by item; anything else signs nothing.
  if (signed.error || !Array.isArray(items) || items.length !== paths.length) {
    return unavailable();
  }
  for (let index = 0; index < paths.length; index += 1) {
    const item = items[index];
    if (
      !item || item.path !== paths[index] || item.error !== null ||
      typeof item.signedUrl !== "string" || item.signedUrl.length === 0
    ) {
      return unavailable();
    }
  }
  return {
    status: 200,
    body: {
      urls: entries.map((entry, index) => ({
        attachmentId: entry.attachmentId,
        signedUrl: items[index].signedUrl,
        sizeBytes: entry.sizeBytes,
      })),
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    },
  };
}
