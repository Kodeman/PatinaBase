/**
 * The typed scan read path — `GET /v1/scan/room-files/:roomFileId/artifacts/:kind`
 * (Rendered Room v2, DELIVERY-PLAN R5 / W2).
 *
 * ── AUTHORIZATION IS THE CALLER'S OWN RLS ────────────────────────────────────
 * This route adds no authorization of its own. It verifies the Supabase JWT
 * (alg-pinned, `auth.ts`), then reads inside ONE `SET LOCAL ROLE authenticated`
 * transaction on the UNCACHED `DB_FRESH` binding, so `room_files`' delegation to
 * `room_scans` (00341) and `media_objects_select`'s delegation to the same
 * (00489) are what decide visibility. There is no `scan_reader` role on this
 * path and no `scan_media_read` view: that view is a *service* capability with
 * no tenant predicate, and 00490 says in as many words that a login role must
 * not inherit it before one exists. A caller-bound policy the caller runs under
 * is strictly stronger than a predicate this worker would have to get right.
 *
 * User-scoped rows never ride `DB_PUBLIC_CACHE` — a cached binding would let one
 * tenant's read answer another's.
 *
 * ── WHY EVERY NEGATIVE IS 404 ───────────────────────────────────────────────
 * Missing/invalid JWT is 401 (a statement about the caller, not about data).
 * Everything else — malformed id, unknown kind, a Room File the caller cannot
 * see, a Room File with no artifact of that kind, an object whose bytes are not
 * confirmed — is an identical 404. A 403 would confirm the row exists, which is
 * exactly the mood-board bug class this plan gates against.
 *
 * ── THE ARTIFACT MAP ────────────────────────────────────────────────────────
 * `room_files.artifacts` (00489) is `kind -> {object_id, version}` over
 * `public.media_objects`. `splat` and `glb` are single refs. `renders` is one
 * level deeper, and its actual on-disk shape (`renders_job.py`) is the
 * HOISTED-COVER manifest: `{ object_id, version, cover, count, shots: {shot
 * name -> {object_id, ...}} }`. `object_id`/`version` at the top are the cover
 * shot's ref, duplicated up a level so 00490's `scan_media_read` — which
 * resolves a ref by top-level `object_id` and has no notion of `shots` — has
 * something to join against; `shots` is the full set (four corners, a
 * top-down, a turntable strip) this route returns together in one round trip.
 * A flat `{shot name -> {object_id, version}}` map (no `shots` key) is read as
 * a legacy/tolerated fallback shape.
 */

import { verifySupabaseRequest } from './auth';
import {
  withAuthenticatedTransaction,
  type DatabaseClient,
  type DatabaseClientFactory,
} from './database';
import type { EdgeApiEnv } from './env';

export const SCAN_ARTIFACT_KINDS = ['splat', 'glb', 'renders'] as const;
export type ScanArtifactKind = (typeof SCAN_ARTIFACT_KINDS)[number];

/** The kind whose value is a map of shot name -> ref rather than a single ref. */
const SHOT_MAP_KIND: ScanArtifactKind = 'renders';

/**
 * Only these lifecycle states have bytes anyone should be handed. `pending`
 * means the registry row exists but the confirm step has not proven the object
 * landed; `deleted` is terminal. Signing either would hand the portal a URL
 * that 404s at R2 with no way to tell that apart from an auth failure.
 */
const SERVABLE_LIFECYCLE_STATES = ['stored', 'verified'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROUTE_PATTERN =
  /^\/v1\/scan\/room-files\/([^/]+)\/artifacts\/([^/]+)$/;

export class ScanUnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'ScanUnauthorizedError';
  }
}

export interface ScanArtifactRequest {
  roomFileId: string;
  kind: ScanArtifactKind;
}

/**
 * Match the route and validate both parameters. Returns null for anything that
 * is not this route, and throws nothing — an unknown kind or a non-UUID id is
 * simply "not this route's business", which the router turns into the same 404
 * an invisible Room File gets.
 */
export function parseScanArtifactPath(
  pathname: string,
): ScanArtifactRequest | null {
  const match = ROUTE_PATTERN.exec(pathname);
  if (!match) return null;

  let roomFileId: string;
  let kind: string;
  try {
    roomFileId = decodeURIComponent(match[1]);
    kind = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!UUID_PATTERN.test(roomFileId)) return null;
  if (!(SCAN_ARTIFACT_KINDS as readonly string[]).includes(kind)) return null;

  return { roomFileId, kind: kind as ScanArtifactKind };
}

/** One `room_files.artifacts` entry. `version` is informational — `object_id` is identity. */
export interface ScanArtifactRef {
  objectId: string;
  version: number | null;
}

function readRef(value: unknown): ScanArtifactRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { object_id: objectId, version } = value as Record<string, unknown>;
  if (typeof objectId !== 'string' || !UUID_PATTERN.test(objectId)) return null;
  return {
    objectId,
    version: typeof version === 'number' ? version : null,
  };
}

/**
 * Pull the refs for one kind out of the `artifacts` jsonb, keyed by shot name.
 * Single-ref kinds come back under the kind's own name. Total and defensive:
 * `artifacts` is jsonb with no shape constraint, and a malformed entry must read
 * as "no artifact" rather than throw inside a request.
 */
export function readArtifactRefs(
  artifacts: unknown,
  kind: ScanArtifactKind,
): Map<string, ScanArtifactRef> {
  const refs = new Map<string, ScanArtifactRef>();
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    return refs;
  }
  const entry = (artifacts as Record<string, unknown>)[kind];

  if (kind !== SHOT_MAP_KIND) {
    const ref = readRef(entry);
    if (ref) refs.set(kind, ref);
    return refs;
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return refs;
  const entryObj = entry as Record<string, unknown>;
  const shotsValue = entryObj.shots;

  // The real, hoisted-cover shape: `shots` carries the actual set. Read it,
  // then fold in the hoisted cover ref under key `cover` — but only if no shot
  // in the set already resolves to the same object, so the cover's own shot
  // (e.g. `top_down`) doesn't appear twice under two keys.
  if (shotsValue && typeof shotsValue === 'object' && !Array.isArray(shotsValue)) {
    // Sorted so the shot map — and therefore the response body — is
    // deterministic whatever order the renders stage wrote the keys in.
    for (const shot of Object.keys(shotsValue as Record<string, unknown>).sort()) {
      const ref = readRef((shotsValue as Record<string, unknown>)[shot]);
      if (ref) refs.set(shot, ref);
    }
    const coverRef = readRef(entryObj);
    if (coverRef) {
      const alreadyPresent = [...refs.values()].some(
        (ref) => ref.objectId === coverRef.objectId,
      );
      if (!alreadyPresent) refs.set('cover', coverRef);
    }
    return refs;
  }

  // Legacy/tolerated fallback: a flat `{shot name -> ref}` map with no `shots`
  // key of its own.
  for (const shot of Object.keys(entryObj).sort()) {
    const ref = readRef(entryObj[shot]);
    if (ref) refs.set(shot, ref);
  }
  return refs;
}

/** A registry row the caller is allowed to see, resolved to its R2 coordinates. */
export interface ScanArtifactObject {
  /** The shot name for `renders`; the kind's own name for a single-ref kind. */
  shot: string;
  bucket: string;
  objectKey: string;
}

interface RoomFileRow extends Record<string, unknown> {
  artifacts: unknown;
}

interface MediaObjectRow extends Record<string, unknown> {
  id: string;
  bucket: string;
  object_key: string;
}

/**
 * Resolve one kind's artifacts for one Room File under the caller's own row
 * security. Returns an empty array for every "the caller gets nothing" case, so
 * the router never has to distinguish them.
 *
 * Two statements rather than a join through the jsonb: `artifacts -> $1 ->>
 * 'object_id'` is untyped text, and casting it to uuid inside a WHERE clause
 * lets a malformed value abort the transaction with a cast error the planner can
 * raise before any filter runs. Reading the map and validating the ids here is
 * both safer and the same round trip count in practice.
 */
export async function resolveScanArtifacts(
  request: Request,
  env: EdgeApiEnv,
  target: ScanArtifactRequest,
  options: {
    key?: Parameters<typeof verifySupabaseRequest>[2];
    createClient?: DatabaseClientFactory;
  } = {},
): Promise<ScanArtifactObject[]> {
  let claims;
  try {
    claims = await verifySupabaseRequest(request, env, options.key);
  } catch {
    throw new ScanUnauthorizedError();
  }

  return withAuthenticatedTransaction(
    env,
    claims,
    async (client: DatabaseClient) => {
      const roomFile = await client.query<RoomFileRow>(
        'SELECT artifacts FROM public.room_files WHERE id = $1::uuid',
        [target.roomFileId],
      );
      const row = roomFile.rows[0];
      if (!row) return [];

      const refs = readArtifactRefs(row.artifacts, target.kind);
      if (refs.size === 0) return [];

      const objectIds = [...new Set([...refs.values()].map((ref) => ref.objectId))];
      const objects = await client.query<MediaObjectRow>(
        `SELECT id, bucket, object_key
           FROM public.media_objects
          WHERE id = ANY($1::uuid[])
            AND lifecycle_state = ANY($2::text[])`,
        [objectIds, SERVABLE_LIFECYCLE_STATES],
      );

      const byId = new Map(objects.rows.map((object) => [object.id, object]));
      const resolved: ScanArtifactObject[] = [];
      for (const [shot, ref] of refs) {
        const object = byId.get(ref.objectId);
        if (!object) continue;
        resolved.push({
          shot,
          bucket: object.bucket,
          objectKey: object.object_key,
        });
      }
      return resolved;
    },
    options.createClient,
  );
}
