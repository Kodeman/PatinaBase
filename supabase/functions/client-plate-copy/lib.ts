// Pure parts of client-plate-copy (US-49): where a queued source is fetched
// from, what the media worker's /plates/ingest answer must hold, how an error
// is cut down for the queue, and how a run is summed up.

export interface PlateRequest {
  id: string;
  project_id: string;
  source_kind: string;
  source_ref: { table?: string; id?: string } | null;
  source_url: string;
  lease_token: string;
}

export type PlateSource =
  | { kind: "direct"; url: string }
  | { kind: "signed"; bucket: string; path: string };

export interface IngestAsset {
  sha256: string;
  width: number;
  height: number;
  format: string | null;
  ground: "white" | "scene" | "drawing" | null;
  dominantHex: string | null;
  lqip: string | null;
  originalKey: string;
  crops: Record<string, unknown>;
}

export interface RunCounts {
  claimed: number;
  recorded: number;
  failed: number;
}

export const SIGNED_URL_TTL_SECONDS = 600;
export const INGEST_TIMEOUT_MS = 30_000;
export const MAX_ERROR_LENGTH = 200;

// The private bucket each source table's object path lives in (00843 queues
// a path, not a URL, for these). project-item-images is public.
const PRIVATE_BUCKET_BY_TABLE: Record<string, string> = {
  project_rooms: "room-renders",
  room_scan_images: "room-scans",
  project_boards: "proposal-mood-boards",
};

const PUBLIC_BUCKET_BY_TABLE: Record<string, string> = {
  project_ffe_item_images: "project-item-images",
};

function encodePath(path: string): string {
  return path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
}

/**
 * Where to fetch a request's picture: a hotlink or outside address as it is;
 * an object path in a private bucket is signed by the caller; an upload in the
 * public item-images bucket gets its public object URL. Null when the source
 * table is unknown or the address is blank.
 */
export function resolveSource(request: PlateRequest, supabaseUrl: string): PlateSource | null {
  const address = (request.source_url ?? "").trim();
  if (!address) return null;
  if (/^https?:\/\//i.test(address)) return { kind: "direct", url: address };

  const table = request.source_ref?.table ?? "";
  const privateBucket = PRIVATE_BUCKET_BY_TABLE[table];
  if (privateBucket) return { kind: "signed", bucket: privateBucket, path: address.replace(/^\/+/, "") };

  const publicBucket = PUBLIC_BUCKET_BY_TABLE[table];
  if (publicBucket) {
    const base = supabaseUrl.replace(/\/+$/, "");
    return { kind: "direct", url: `${base}/storage/v1/object/public/${publicBucket}/${encodePath(address)}` };
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function optionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}

/**
 * Checks the media worker's answer before it is recorded. The original must
 * sit under plates/<projectId>/<sha256>/, the key record_client_plate_asset
 * also insists on.
 */
export function validateIngestResponse(
  body: unknown,
  projectId: string,
): { ok: true; asset: IngestAsset } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "ingest answer is not an object" };
  const { sha256, width, height, format, ground, dominantHex, lqip, originalKey, crops } = body;
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
    return { ok: false, error: "ingest answer has no sha256" };
  }
  if (!positiveInt(width) || !positiveInt(height)) {
    return { ok: false, error: "ingest answer has no width and height" };
  }
  if (typeof originalKey !== "string" || !originalKey.startsWith(`plates/${projectId}/${sha256}/`)) {
    return { ok: false, error: "ingest answer's original is outside plates/<project>/<sha256>/" };
  }
  if (!(ground === null || ground === undefined || ground === "white" || ground === "scene" || ground === "drawing")) {
    return { ok: false, error: "ingest answer has an unknown ground" };
  }
  if (!optionalString(format) || !optionalString(dominantHex) || !optionalString(lqip)) {
    return { ok: false, error: "ingest answer has a non-text format, dominantHex or lqip" };
  }
  if (typeof lqip === "string" && lqip.length > 800) {
    return { ok: false, error: "ingest answer's lqip is over 800 characters" };
  }
  if (!(crops === undefined || isPlainObject(crops))) {
    return { ok: false, error: "ingest answer's crops is not an object" };
  }
  return {
    ok: true,
    asset: {
      sha256,
      width,
      height,
      format: format ?? null,
      ground: ground ?? null,
      dominantHex: dominantHex ?? null,
      lqip: lqip ?? null,
      originalKey,
      crops: crops ?? {},
    },
  };
}

/** The p_asset for record_client_plate_asset: the answer plus the request's source. */
export function recordPayload(asset: IngestAsset, request: PlateRequest): Record<string, unknown> {
  return { ...asset, source_kind: request.source_kind, source_ref: request.source_ref };
}

/**
 * One line of at most `max` characters for client_plate_requests.last_error.
 * Query strings are dropped, so a signed URL's token never reaches the queue.
 */
export function shortenError(error: unknown, max = MAX_ERROR_LENGTH): string {
  let text: string;
  if (error instanceof Error) text = error.message;
  else if (typeof error === "string") text = error;
  else {
    try {
      text = JSON.stringify(error) ?? String(error);
    } catch {
      text = String(error);
    }
  }
  text = text.replace(/(https?:\/\/[^\s?#"']*)[?#][^\s"']*/gi, "$1").replace(/\s+/g, " ").trim();
  if (!text) text = "copy failed";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The body's job_run_id when it is a positive integer, else null. */
export function parseJobRunId(body: unknown): number | null {
  if (!isPlainObject(body)) return null;
  const raw = body.job_run_id;
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  return positiveInt(value) ? value : null;
}

/** finish_client_plate_copy_run's status, detail and error for a run's counts. */
export function summarizeRun(counts: RunCounts): {
  status: "succeeded" | "failed" | "skipped";
  detail: RunCounts;
  error: string | null;
} {
  if (counts.claimed === 0) return { status: "skipped", detail: counts, error: null };
  if (counts.recorded === 0 && counts.failed > 0) {
    return { status: "failed", detail: counts, error: `all ${counts.failed} copies failed` };
  }
  return { status: "succeeded", detail: counts, error: null };
}

/** Runs `work` over `items` with at most `limit` in flight; results keep input order. */
export async function mapPool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}
