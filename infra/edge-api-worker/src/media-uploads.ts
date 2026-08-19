/**
 * The Phase-2 upload interface, piloted for scan originals (DELIVERY-PLAN W3,
 * `docs/engineering/patina-cloudflare-plan.md` "Upload and delivery
 * interfaces"):
 *
 *   POST /v1/media/uploads                   → an idempotent upload intent
 *   POST /v1/media/uploads/:uploadId/confirm → HEAD R2, compare, land `stored`
 *
 * ── AUTHORIZATION IS THE CALLER'S OWN RLS, TWICE ────────────────────────────
 * Like the read path (`scan.ts`), this adds no authorization of its own: it
 * verifies the Supabase JWT, then works inside ONE `SET LOCAL ROLE
 * authenticated` transaction on the UNCACHED `DB_FRESH` binding. The first
 * statement in that transaction is a plain read of `room_scans` — so the REAL
 * policies (00014/00020/00316) decide whether this caller may go on. Only then
 * is 00498's SECURITY DEFINER RPC called, and that RPC binds the caller a
 * second time through `caller_can_access_room_scan`. Two gates, one of them the
 * policy itself; 00498's header explains why the definer side cannot simply
 * re-run RLS.
 *
 * ── WHY THE KEY CARRIES NOTHING ─────────────────────────────────────────────
 * `scan_originals/{scanId}/{artifactKind}/{filename}` is registry-keyed. The
 * legacy Supabase Storage layout (`{userId}/{roomId}/…`) made the PATH the
 * authorization, and DELIVERY-PLAN W3 forbids carrying that into R2 by name.
 * Here the registry row and `media_objects`' RLS delegation carry it; the key
 * is an address.
 *
 * ── WHY EVERY NEGATIVE IS 404 ───────────────────────────────────────────────
 * Missing/invalid JWT is 401 (about the caller). A malformed body is 400
 * (about the request, and says nothing about any row). Everything else — an
 * unknown scan, a scan the caller cannot see, an unknown upload id, an upload
 * belonging to someone else — is an identical 404. A 403 would confirm the row
 * exists, which is the mood-board bug class this plan gates against.
 *
 * The one exception is a genuine conflict about bytes the caller already owns:
 * a confirm whose observed size/checksum disagrees with what the intent
 * declared is 409 `upload_mismatch`, and the registry row STAYS `pending`. The
 * caller has already proven visibility to reach that point, so 409 leaks
 * nothing, and it is the only answer that tells a client "re-PUT" rather than
 * "give up".
 */

import { verifySupabaseRequest } from './auth';
import {
  withAuthenticatedTransaction,
  type DatabaseClient,
  type DatabaseClientFactory,
} from './database';
import type { EdgeApiEnv } from './env';
import { presignR2Url } from './r2';

/**
 * How long an upload capability lives. Thirty minutes, per the Phase-2
 * interface: long enough to PUT a multi-hundred-megabyte capture artifact from
 * a phone on a bad connection, short enough that a URL lifted from a network
 * tab is worthless before it can be used. Fixed, not configurable — a
 * per-environment TTL is a knob whose only use is making it last longer.
 */
export const UPLOAD_URL_TTL_SECONDS = 1800;

/**
 * The confirm HEAD is signed and consumed inside one request, so it gets the
 * shortest TTL that survives a slow round trip.
 */
export const CONFIRM_HEAD_TTL_SECONDS = 60;

/**
 * The schema-v3 capture bundle's artifact kinds — the union of
 * `KIND_TO_URL_COLUMN` and `KIND_TO_FOLDER` in
 * `services/scan-pipeline/src/patina_scan_worker/keys.py`, which are pinned in
 * turn by the iOS `ScanUploadDescriptor` table and capture-bundle-spec B-18.
 * Duplicated here and in 00498 deliberately: the Worker rejects an unknown kind
 * before a database round trip, and the RPC rejects it again for a caller that
 * never went through the Worker.
 */
export const UPLOAD_ARTIFACT_KINDS = [
  'anchors',
  'bundleManifest',
  'capturedRoomJson',
  'coverageHeatmap',
  'depthArchive',
  'depthIndex',
  'heroFrame',
  'keyframeIndex',
  'keyframeSummary',
  'keyframesArchive',
  'mesh',
  'photosManifest',
  'scorecard',
  'thumbnail',
  'usdz',
  'worldMap',
] as const;
export type UploadArtifactKind = (typeof UPLOAD_ARTIFACT_KINDS)[number];

/** R2's single-PUT ceiling. Anything larger needs multipart, which this interface does not issue. */
const MAX_DECLARED_SIZE = 5_368_709_120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MIME_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

const INTENT_PATH = '/v1/media/uploads';
const CONFIRM_PATTERN = /^\/v1\/media\/uploads\/([^/]+)\/confirm$/;

export class UploadUnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UploadUnauthorizedError';
  }
}

/** The body was not a shape this route accepts. Answered 400, never 403/404. */
export class UploadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRequestError';
  }
}

/** The caller cannot see the scan or the upload — answered as an identical 404. */
export class UploadNotFoundError extends Error {
  constructor() {
    super('not_found');
    this.name = 'UploadNotFoundError';
  }
}

/**
 * Observed bytes disagree with what the intent declared. Answered 409; the row
 * stays pending. `registry` is the belt-and-braces case — the Worker's own
 * comparison passed but 00498's independent one did not, which should be
 * unreachable and is therefore worth naming distinctly in the logs.
 */
export class UploadMismatchError extends Error {
  readonly reason: 'size' | 'checksum' | 'missing' | 'state' | 'registry';
  constructor(reason: 'size' | 'checksum' | 'missing' | 'state' | 'registry') {
    super(`upload_mismatch:${reason}`);
    this.name = 'UploadMismatchError';
    this.reason = reason;
  }
}

export type MediaUploadRoute =
  | { kind: 'intent' }
  | { kind: 'confirm'; uploadId: string };

/**
 * Match either route. Returns null for anything else — including a malformed
 * upload id, which becomes the same 404 an invisible upload gets.
 */
export function parseMediaUploadPath(
  pathname: string,
): MediaUploadRoute | null {
  if (pathname === INTENT_PATH) return { kind: 'intent' };
  const match = CONFIRM_PATTERN.exec(pathname);
  if (!match) return null;
  let uploadId: string;
  try {
    uploadId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!UUID_PATTERN.test(uploadId)) return null;
  return { kind: 'confirm', uploadId };
}

export interface UploadIntentInput {
  scanId: string;
  artifactKind: UploadArtifactKind;
  filename: string;
  declaredSha256: string;
  declaredSize: number;
  declaredMime: string;
}

/**
 * Validate the request body. Total and defensive — every rejection is the same
 * class, and no message names a row or a caller.
 */
export function parseUploadIntentBody(body: unknown): UploadIntentInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new UploadRequestError('body must be a JSON object');
  }
  const {
    scanId,
    artifactKind,
    filename,
    declaredSha256,
    declaredSize,
    declaredMime,
  } = body as Record<string, unknown>;

  if (typeof scanId !== 'string' || !UUID_PATTERN.test(scanId)) {
    throw new UploadRequestError('scanId must be a UUID');
  }
  if (
    typeof artifactKind !== 'string' ||
    !(UPLOAD_ARTIFACT_KINDS as readonly string[]).includes(artifactKind)
  ) {
    throw new UploadRequestError('artifactKind is not a known artifact kind');
  }
  // No separator, no traversal, no leading dot: the key is built from this
  // value, so a second path segment here would move the object.
  if (
    typeof filename !== 'string' ||
    !FILENAME_PATTERN.test(filename) ||
    filename.includes('..')
  ) {
    throw new UploadRequestError('filename must be one safe path segment');
  }
  if (typeof declaredSha256 !== 'string' || !SHA256_PATTERN.test(declaredSha256)) {
    throw new UploadRequestError('declaredSha256 must be 64 lowercase hex characters');
  }
  if (
    typeof declaredSize !== 'number' ||
    !Number.isSafeInteger(declaredSize) ||
    declaredSize <= 0 ||
    declaredSize > MAX_DECLARED_SIZE
  ) {
    throw new UploadRequestError('declaredSize is out of range');
  }
  if (typeof declaredMime !== 'string' || !MIME_PATTERN.test(declaredMime)) {
    throw new UploadRequestError('declaredMime is malformed');
  }

  return {
    scanId,
    artifactKind: artifactKind as UploadArtifactKind,
    filename,
    declaredSha256,
    declaredSize,
    declaredMime,
  };
}

/** Hex → base64, for `x-amz-checksum-sha256` (S3 wants the digest base64-encoded). */
export function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface UploadIntent {
  uploadId: string;
  bucket: string;
  objectKey: string;
  lifecycleState: string;
  version: number;
  created: boolean;
}

interface RegistryRow extends Record<string, unknown> {
  id: string;
  bucket: string;
  object_key: string;
  lifecycle_state: string;
  scan_id: string | null;
  provenance: unknown;
}

/**
 * Map a Postgres error from 00498 onto this module's error vocabulary. The
 * errcodes are the contract (00498 header): P0410 → 404, P0411 → 400,
 * P0412/P0413 → 409. Anything else propagates as itself and the router answers
 * 503 — an unrecognised database failure is never reported as a statement
 * about the caller's data.
 */
function translateRpcError(error: unknown): Error {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'P0410') return new UploadNotFoundError();
  if (code === 'P0411') return new UploadRequestError('rejected by the registry');
  if (code === 'P0412') return new UploadMismatchError('registry');
  if (code === 'P0413') return new UploadMismatchError('state');
  return error instanceof Error ? error : new Error('registry failure');
}

/**
 * The scan visibility read that runs under the caller's OWN row security. It is
 * the first statement of the transaction on purpose: nothing downstream is
 * reached by a caller who cannot see the scan under the real policies.
 */
async function assertScanVisible(
  client: DatabaseClient,
  scanId: string,
): Promise<void> {
  const result = await client.query(
    'SELECT id FROM public.room_scans WHERE id = $1::uuid',
    [scanId],
  );
  if (result.rows.length === 0) throw new UploadNotFoundError();
}

export async function createUploadIntent(
  request: Request,
  env: EdgeApiEnv,
  input: UploadIntentInput,
  options: {
    key?: Parameters<typeof verifySupabaseRequest>[2];
    createClient?: DatabaseClientFactory;
  } = {},
): Promise<UploadIntent> {
  let claims;
  try {
    claims = await verifySupabaseRequest(request, env, options.key);
  } catch {
    throw new UploadUnauthorizedError();
  }

  const bucket = env.SCAN_R2_ORIGINALS_BUCKET as string;

  return withAuthenticatedTransaction(
    env,
    claims,
    async (client: DatabaseClient) => {
      await assertScanVisible(client, input.scanId);

      let rows;
      try {
        rows = await client.query<{ intent: Record<string, unknown> }>(
          `SELECT public.create_media_upload_intent(
             $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::bigint, $7::text
           ) AS intent`,
          [
            input.scanId,
            input.artifactKind,
            input.filename,
            bucket,
            input.declaredSha256,
            String(input.declaredSize),
            input.declaredMime,
          ],
        );
      } catch (error) {
        throw translateRpcError(error);
      }

      const intent = rows.rows[0]?.intent as
        | {
            object_id?: unknown;
            bucket?: unknown;
            object_key?: unknown;
            lifecycle_state?: unknown;
            version?: unknown;
            created?: unknown;
          }
        | undefined;
      if (
        !intent ||
        typeof intent.object_id !== 'string' ||
        typeof intent.bucket !== 'string' ||
        typeof intent.object_key !== 'string'
      ) {
        throw new Error('registry returned no intent');
      }

      return {
        uploadId: intent.object_id,
        bucket: intent.bucket,
        objectKey: intent.object_key,
        lifecycleState:
          typeof intent.lifecycle_state === 'string'
            ? intent.lifecycle_state
            : 'pending',
        version: typeof intent.version === 'number' ? intent.version : 1,
        created: intent.created === true,
      };
    },
    options.createClient,
  );
}

/**
 * Sign the PUT the client will make. Two headers beyond `host` are signed, and
 * both are CONDITIONS the client cannot alter without invalidating the URL:
 *
 *  - `content-length`: the declared byte count. A body of any other length is
 *    rejected by R2 before a single byte is stored.
 *  - `x-amz-checksum-sha256`: the declared digest, base64. R2 verifies the body
 *    against it and refuses a mismatch, which is what makes the intent's
 *    `declaredSha256` a promise rather than a label.
 *
 * `content-type` is deliberately NOT signed. It is metadata, not integrity, and
 * signing it turns every client that normalises a MIME string into a
 * SignatureDoesNotMatch with no diagnosis.
 */
export function signUploadPut(
  env: EdgeApiEnv,
  target: { bucket: string; objectKey: string },
  input: { declaredSha256: string; declaredSize: number },
  now: Date,
): Promise<{ url: string; expiresAt: string }> {
  return presignR2Url({
    endpoint: env.SCAN_R2_ENDPOINT,
    bucket: target.bucket,
    objectKey: target.objectKey,
    accessKeyId: env.SCAN_R2_WRITE_ACCESS_KEY_ID as string,
    secretAccessKey: env.SCAN_R2_WRITE_SECRET_ACCESS_KEY as string,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    now,
    method: 'PUT',
    signedHeaders: {
      'content-length': String(input.declaredSize),
      'x-amz-checksum-sha256': hexToBase64(input.declaredSha256),
    },
  });
}

export interface ObservedObject {
  sizeBytes: number;
  etag: string | null;
  /** Hex sha256, when R2 returned one. Null means the PUT-time condition is the only assurance. */
  sha256: string | null;
}

/**
 * HEAD the object with the write credentials. `x-amz-checksum-mode: ENABLED` is
 * signed so R2 returns the stored checksum where it has one; a response without
 * it is normal, not an error — the confirm RPC records which assurance applied.
 */
export async function headUploadedObject(
  env: EdgeApiEnv,
  target: { bucket: string; objectKey: string },
  now: Date,
  fetcher: typeof fetch,
): Promise<ObservedObject> {
  const signed = await presignR2Url({
    endpoint: env.SCAN_R2_ENDPOINT,
    bucket: target.bucket,
    objectKey: target.objectKey,
    accessKeyId: env.SCAN_R2_WRITE_ACCESS_KEY_ID as string,
    secretAccessKey: env.SCAN_R2_WRITE_SECRET_ACCESS_KEY as string,
    expiresInSeconds: CONFIRM_HEAD_TTL_SECONDS,
    now,
    method: 'HEAD',
    signedHeaders: { 'x-amz-checksum-mode': 'ENABLED' },
  });

  const response = await fetcher(signed.url, {
    method: 'HEAD',
    headers: { 'x-amz-checksum-mode': 'ENABLED' },
  });
  if (response.status === 404) throw new UploadMismatchError('missing');
  if (!response.ok) throw new Error(`r2 head failed: ${response.status}`);

  const length = Number(response.headers.get('content-length'));
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new UploadMismatchError('missing');
  }
  const base64 = response.headers.get('x-amz-checksum-sha256');
  return {
    sizeBytes: length,
    etag: response.headers.get('etag'),
    sha256: base64 ? base64ToHex(base64) : null,
  };
}

/** base64 → lowercase hex, for the checksum R2 reports back. */
export function base64ToHex(value: string): string {
  const binary = atob(value);
  let hex = '';
  for (let index = 0; index < binary.length; index += 1) {
    hex += binary.charCodeAt(index).toString(16).padStart(2, '0');
  }
  return hex;
}

export interface ConfirmedUpload {
  uploadId: string;
  lifecycleState: string;
  sha256: string | null;
  etag: string | null;
  sizeBytes: number | null;
  changed: boolean;
}

export interface PendingUpload {
  bucket: string;
  objectKey: string;
  lifecycleState: string;
  declaredSha256: string | null;
  declaredSize: number | null;
}

/**
 * Resolve the registry row under the caller's own RLS. Returns the R2
 * coordinates the HEAD needs and what the intent DECLARED — and nothing else
 * reaches the caller, so an upload id that is not theirs is indistinguishable
 * from one that never existed.
 *
 * The declared values come back so the Worker can name WHICH comparison failed
 * (`size` or `checksum`) instead of reporting an undifferentiated conflict. The
 * database is still the authority: `confirm_media_upload` re-compares them for
 * any caller that never came through here.
 */
export async function resolveUploadForConfirm(
  request: Request,
  env: EdgeApiEnv,
  uploadId: string,
  options: {
    key?: Parameters<typeof verifySupabaseRequest>[2];
    createClient?: DatabaseClientFactory;
  } = {},
): Promise<PendingUpload> {
  let claims;
  try {
    claims = await verifySupabaseRequest(request, env, options.key);
  } catch {
    throw new UploadUnauthorizedError();
  }

  return withAuthenticatedTransaction(
    env,
    claims,
    async (client: DatabaseClient) => {
      const result = await client.query<RegistryRow>(
        `SELECT id, bucket, object_key, lifecycle_state, scan_id, provenance
           FROM public.media_objects
          WHERE id = $1::uuid`,
        [uploadId],
      );
      const row = result.rows[0];
      if (!row) throw new UploadNotFoundError();
      const provenance =
        row.provenance && typeof row.provenance === 'object'
          ? (row.provenance as Record<string, unknown>)
          : {};
      const declaredSize = Number(provenance.declared_size);
      return {
        bucket: row.bucket,
        objectKey: row.object_key,
        lifecycleState: row.lifecycle_state,
        declaredSha256:
          typeof provenance.declared_sha256 === 'string'
            ? provenance.declared_sha256
            : null,
        declaredSize: Number.isSafeInteger(declaredSize) ? declaredSize : null,
      };
    },
    options.createClient,
  );
}

/**
 * Compare what R2 holds against what the intent declared, and throw the precise
 * disagreement. Run BEFORE the confirm RPC so a mismatch never reaches the
 * write path at all — the registry row stays `pending`, which is what lets the
 * client simply re-PUT.
 *
 * A missing declared checksum is a `state` conflict rather than a pass: an
 * intent that recorded nothing to compare against cannot be confirmed.
 */
export function assertObservedMatchesDeclared(
  pending: PendingUpload,
  observed: ObservedObject,
): void {
  if (pending.declaredSha256 === null || pending.declaredSize === null) {
    throw new UploadMismatchError('state');
  }
  if (observed.sizeBytes !== pending.declaredSize) {
    throw new UploadMismatchError('size');
  }
  if (observed.sha256 !== null && observed.sha256 !== pending.declaredSha256) {
    throw new UploadMismatchError('checksum');
  }
}

/**
 * Land the confirm. A SECOND authenticated transaction rather than one held
 * across the R2 HEAD: a network round trip inside an open transaction pins a
 * Hyperdrive connection for its whole duration, and there is nothing to keep
 * consistent between the two — the RPC re-reads the row `FOR UPDATE` and
 * re-binds the caller itself.
 */
export async function confirmUpload(
  request: Request,
  env: EdgeApiEnv,
  uploadId: string,
  observed: ObservedObject,
  options: {
    key?: Parameters<typeof verifySupabaseRequest>[2];
    createClient?: DatabaseClientFactory;
  } = {},
): Promise<ConfirmedUpload> {
  let claims;
  try {
    claims = await verifySupabaseRequest(request, env, options.key);
  } catch {
    throw new UploadUnauthorizedError();
  }

  return withAuthenticatedTransaction(
    env,
    claims,
    async (client: DatabaseClient) => {
      let rows;
      try {
        rows = await client.query<{ confirmed: Record<string, unknown> }>(
          `SELECT public.confirm_media_upload(
             $1::uuid, $2::text, $3::text, $4::bigint
           ) AS confirmed`,
          [uploadId, observed.sha256, observed.etag, String(observed.sizeBytes)],
        );
      } catch (error) {
        throw translateRpcError(error);
      }

      const confirmed = rows.rows[0]?.confirmed as
        | {
            object_id?: unknown;
            lifecycle_state?: unknown;
            sha256?: unknown;
            etag?: unknown;
            size_bytes?: unknown;
            changed?: unknown;
          }
        | undefined;
      if (!confirmed || typeof confirmed.object_id !== 'string') {
        throw new Error('registry returned no confirmation');
      }
      return {
        uploadId: confirmed.object_id,
        lifecycleState:
          typeof confirmed.lifecycle_state === 'string'
            ? confirmed.lifecycle_state
            : 'pending',
        sha256: typeof confirmed.sha256 === 'string' ? confirmed.sha256 : null,
        etag: typeof confirmed.etag === 'string' ? confirmed.etag : null,
        sizeBytes:
          typeof confirmed.size_bytes === 'number'
            ? confirmed.size_bytes
            : Number(confirmed.size_bytes ?? Number.NaN) || null,
        changed: confirmed.changed === true,
      };
    },
    options.createClient,
  );
}
