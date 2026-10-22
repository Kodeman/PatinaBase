// Pure parts of client-plate-copy (US-49): where a queued source is fetched
// from, what the media worker's /plates/ingest answer must hold, how an error
// is cut down for the queue, and one run's copies against its deadline.

export interface PlateRequest {
  id: string;
  project_id: string;
  source_kind: string;
  source_ref: { table?: string; id?: string } | null;
  source_url: string;
  asset_id?: string | null;
  lease_token: string;
}

export type PlateSource =
  | { kind: "direct"; url: string }
  | { kind: "signed"; bucket: string; path: string }
  | { kind: "not_owned" };

/** The fetch address is not the request's project's to copy (fail reason source_not_owned). */
export class SourceNotOwned extends Error {
  constructor() {
    super("source_not_owned");
  }
}

/**
 * The database half of the ownership check (client_plate_source_owned: the
 * scan's owner folder, the board's proposal) and the service-role signer.
 */
export interface SourceAuthority {
  owned(request: PlateRequest, signal?: AbortSignal): Promise<boolean>;
  sign(bucket: string, path: string, signal?: AbortSignal): Promise<string>;
}

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
// A run's clock starts when the function is entered. No copy starts after
// RUN_START_BUDGET_MS, and every awaited step has ended by RUN_HARD_END_MS.
export const RUN_START_BUDGET_MS = 20_000;
export const RUN_HARD_END_MS = 50_000;
// Work on a row ends this long before the hard end, so failing it and
// finishing the run still have time; finishing keeps the last FINISH_RESERVE_MS.
export const SETTLE_RESERVE_MS = 5_000;
export const FINISH_RESERVE_MS = 2_000;
export const RUN_BUDGET_EXCEEDED = "run budget exceeded";
export const MAX_ERROR_LENGTH = 200;

const WORK_END_MS = RUN_HARD_END_MS - SETTLE_RESERVE_MS;
const FAIL_END_MS = RUN_HARD_END_MS - FINISH_RESERVE_MS;

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

// An empty, "." or ".." segment, also %2e-encoded (client_plate_source_owned's rule).
const DOT_OR_EMPTY_SEGMENT = /(^|\/)(\.|%2e){0,2}(\/|$)/i;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// room-renders/<project>/<room>/<file> (00580's policy shape).
const ROOM_RENDER_PATH = new RegExp(`^(${UUID})/${UUID}/.+$`, "i");

/** What the path alone settles: no dot segment, and a room render under the request's project. */
function pathMayBelong(bucket: string, path: string, projectId: string): boolean {
  if (DOT_OR_EMPTY_SEGMENT.test(path)) return false;
  if (bucket !== "room-renders") return true;
  const match = ROOM_RENDER_PATH.exec(path);
  return match !== null && match[1].toLowerCase() === projectId.toLowerCase();
}

/**
 * Where to fetch a request's picture: a hotlink or outside address as it is;
 * an object path in a private bucket is signed by the caller, unless its path
 * already shows it is not the request's project's; an upload in the public
 * item-images bucket gets its public object URL. Null when the source table is
 * unknown or the address is blank.
 */
export function resolveSource(request: PlateRequest, supabaseUrl: string): PlateSource | null {
  const address = request.source_url.trim();
  if (!address) return null;
  if (/^https?:\/\//i.test(address)) return { kind: "direct", url: address };
  return storageSource(request, address, supabaseUrl);
}

function storageSource(request: PlateRequest, address: string, supabaseUrl: string): PlateSource | null {
  const key = request.source_ref?.table ?? "";
  const privateBucket = PRIVATE_BUCKET_BY_TABLE[key];
  if (privateBucket) {
    const path = address.replace(/^\/+/, "");
    return pathMayBelong(privateBucket, path, request.project_id)
      ? { kind: "signed", bucket: privateBucket, path }
      : { kind: "not_owned" };
  }
  const publicBucket = PUBLIC_BUCKET_BY_TABLE[key];
  if (!publicBucket) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  return { kind: "direct", url: `${base}/storage/v1/object/public/${publicBucket}/${encodePath(address)}` };
}

/**
 * The URL the media worker fetches. A private object is signed only once its
 * path and the database both place it in the request's project; otherwise
 * SourceNotOwned is thrown and nothing is signed.
 */
export async function fetchAddress(
  request: PlateRequest,
  supabaseUrl: string,
  authority: SourceAuthority,
  signal?: AbortSignal,
): Promise<string> {
  const source = resolveSource(request, supabaseUrl);
  if (!source) throw new Error(`no fetch address for a ${request.source_kind} source`);
  if (source.kind === "direct") return source.url;
  if (source.kind === "not_owned" || !(await authority.owned(request, signal))) throw new SourceNotOwned();
  return await authority.sign(source.bucket, source.path, signal);
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

const GROUNDS = new Set<unknown>([null, undefined, "white", "scene", "drawing"]);

type IngestCheck = (body: Record<string, unknown>, projectId: string) => string | null;

// In order; the first failing check names the answer's fault.
const INGEST_CHECKS: IngestCheck[] = [
  (body) => (typeof body.sha256 === "string" && /^[0-9a-f]{64}$/.test(body.sha256) ? null : "ingest answer has no sha256"),
  (body) => (positiveInt(body.width) && positiveInt(body.height) ? null : "ingest answer has no width and height"),
  (body, projectId) =>
    typeof body.originalKey === "string" && body.originalKey.startsWith(`plates/${projectId}/${body.sha256}/`)
      ? null
      : "ingest answer's original is outside plates/<project>/<sha256>/",
  (body) => (GROUNDS.has(body.ground) ? null : "ingest answer has an unknown ground"),
  (body) =>
    [body.format, body.dominantHex, body.lqip].every(optionalString)
      ? null
      : "ingest answer has a non-text format, dominantHex or lqip",
  (body) => (String(body.lqip ?? "").length > 800 ? "ingest answer's lqip is over 800 characters" : null),
  (body) => (body.crops === undefined || isPlainObject(body.crops) ? null : "ingest answer's crops is not an object"),
];

function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function toAsset(body: Record<string, unknown>): IngestAsset {
  return {
    sha256: body.sha256 as string,
    width: body.width as number,
    height: body.height as number,
    format: orNull(body.format as string | null | undefined),
    ground: orNull(body.ground as IngestAsset["ground"] | undefined),
    dominantHex: orNull(body.dominantHex as string | null | undefined),
    lqip: orNull(body.lqip as string | null | undefined),
    originalKey: body.originalKey as string,
    crops: (body.crops as Record<string, unknown> | undefined) ?? {},
  };
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
  for (const check of INGEST_CHECKS) {
    const error = check(body, projectId);
    if (error) return { ok: false, error };
  }
  return { ok: true, asset: toAsset(body) };
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
  const text = errorText(error)
    .replace(/(https?:\/\/[^\s?#"']*)[?#][^\s"']*/gi, "$1")
    .replace(/\s+/g, " ")
    .trim() || "copy failed";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return jsonText(error);
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The body's job_run_id when it is a positive integer, else null. */
export function parseJobRunId(body: unknown): number | null {
  if (!isPlainObject(body)) return null;
  const raw = body.job_run_id;
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  return positiveInt(value) ? value : null;
}

export interface RunSummary {
  status: "succeeded" | "failed" | "skipped";
  detail: RunCounts;
  error: string | null;
}

/** finish_client_plate_copy_run's status, detail and error for a run's counts. */
export function summarizeRun(counts: RunCounts): RunSummary {
  if (counts.claimed === 0) return { status: "skipped", detail: counts, error: null };
  if (counts.recorded === 0 && counts.failed > 0) {
    return { status: "failed", detail: counts, error: `all ${counts.failed} copies failed` };
  }
  return { status: "succeeded", detail: counts, error: null };
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as number),
};

/** One run's clock, from function entry: whether a copy may start, and per-step deadlines. */
export class RunDeadline {
  readonly startedAt: number;
  #timers = new Set<unknown>();

  constructor(private readonly clock: Clock) {
    this.startedAt = clock.now();
  }

  elapsed(): number {
    return this.clock.now() - this.startedAt;
  }

  mayStart(): boolean {
    return this.elapsed() < RUN_START_BUDGET_MS;
  }

  /** A signal that aborts with `reason` once `atMs` of the run has passed. */
  by(atMs: number, reason = RUN_BUDGET_EXCEEDED): AbortSignal {
    const controller = new AbortController();
    const wait = atMs - this.elapsed();
    if (wait <= 0) {
      controller.abort(new Error(reason));
      return controller.signal;
    }
    const id = this.clock.setTimeout(() => {
      this.#timers.delete(id);
      controller.abort(new Error(reason));
    }, wait);
    this.#timers.add(id);
    return controller.signal;
  }

  close(): void {
    for (const id of this.#timers) this.clock.clearTimeout(id);
    this.#timers.clear();
  }
}

/** The ingest call's timeout `elapsedMs` into a run: 30 s, or what is left less the settle reserve. */
export function ingestTimeoutMs(elapsedMs: number): number {
  return Math.max(0, Math.min(INGEST_TIMEOUT_MS, RUN_HARD_END_MS - elapsedMs - SETTLE_RESERVE_MS));
}

/**
 * `work` given `signal`, ended by it: rejects with the signal's reason the
 * moment it aborts, even if `work` ignores the signal and settles later.
 */
export function bounded<T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work(signal).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function settle(signal: AbortSignal, what: string, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
  try {
    await bounded(signal, work);
  } catch (err) {
    console.error(`client-plate-copy: ${what}: ${shortenError(err)}`);
  }
}

/** The media worker's processor is running another run's copy (503 {"error":"busy"}). */
class LaneBusy extends Error {
  constructor() {
    super("ingest 503 busy");
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface CopySteps {
  /** Lease the next queued request (attempts + 1), or null when none is queued. */
  claim(signal: AbortSignal): Promise<PlateRequest | null>;
  authority: SourceAuthority;
  /** POST the request to the media worker's /plates/ingest. */
  ingest(request: PlateRequest, sourceUrl: string, signal: AbortSignal): Promise<Response>;
  record(request: PlateRequest, asset: IngestAsset, signal: AbortSignal): Promise<void>;
  /** fail_client_plate_request: re-queued, or failed at the attempt cap. */
  fail(request: PlateRequest, error: string, signal: AbortSignal): Promise<void>;
  finish(summary: RunSummary, signal: AbortSignal): Promise<void>;
}

async function ingestAsset(steps: CopySteps, run: RunDeadline, request: PlateRequest, sourceUrl: string) {
  const timeoutMs = ingestTimeoutMs(run.elapsed());
  const signal = run.by(run.elapsed() + timeoutMs, `ingest timed out after ${timeoutMs} ms`);
  return await bounded(signal, async (s) => {
    const response = await steps.ingest(request, sourceUrl, s);
    const text = await response.text().catch(() => "");
    if (response.status === 503 && (parseJson(text) as { error?: unknown } | null)?.error === "busy") {
      throw new LaneBusy();
    }
    if (!response.ok) throw new Error(`ingest ${response.status}: ${text.slice(0, 300)}`);
    const checked = validateIngestResponse(parseJson(text), request.project_id);
    if (!checked.ok) throw new Error(checked.error);
    return checked.asset;
  });
}

type CopyOutcome = "recorded" | "failed" | "busy";

// A row whose claim or source address came back after the start budget is
// failed unstarted: an ingest begun then could outlive the run.
async function copyOne(steps: CopySteps, run: RunDeadline, request: PlateRequest, supabaseUrl: string): Promise<CopyOutcome> {
  try {
    if (!run.mayStart()) throw new Error(RUN_BUDGET_EXCEEDED);
    const sourceUrl = await bounded(run.by(WORK_END_MS), (s) => fetchAddress(request, supabaseUrl, steps.authority, s));
    if (!run.mayStart()) throw new Error(RUN_BUDGET_EXCEEDED);
    const asset = await ingestAsset(steps, run, request, sourceUrl);
    await bounded(run.by(WORK_END_MS), (s) => steps.record(request, asset, s));
    return "recorded";
  } catch (cause) {
    // A lease that ran out is re-queued by the dispatcher instead.
    await settle(run.by(FAIL_END_MS), `fail ${request.id}`, (s) => steps.fail(request, shortenError(cause), s));
    return cause instanceof LaneBusy ? "busy" : "failed";
  }
}

/**
 * One copy at a time, each claimed just before it is copied, until `limit`
 * copies, an empty queue, the start budget, or a busy media worker. The
 * processor is one 1-vCPU container that takes one job at a time (SQ-1629,
 * SQ-1634); claiming one at a time leaves no leased request waiting. A claim
 * error ends the run with the counts so far.
 */
async function drainQueue(
  steps: CopySteps,
  run: RunDeadline,
  supabaseUrl: string,
  limit: number,
): Promise<{ counts: RunCounts; claimError: unknown }> {
  const counts: RunCounts = { claimed: 0, recorded: 0, failed: 0 };
  while (counts.claimed < limit && run.mayStart()) {
    let request: PlateRequest | null;
    try {
      request = await bounded(run.by(WORK_END_MS), (s) => steps.claim(s));
    } catch (claimError) {
      return { counts, claimError };
    }
    if (request === null) break;
    counts.claimed += 1;
    const outcome = await copyOne(steps, run, request, supabaseUrl);
    if (outcome === "recorded") counts.recorded += 1;
    else counts.failed += 1;
    // Another run holds the processor; more claims would only spend attempts.
    if (outcome === "busy") break;
  }
  return { counts, claimError: null };
}

/** drainQueue, then finish_client_plate_copy_run; every step has ended by RUN_HARD_END_MS. */
export async function copyRun(
  steps: CopySteps,
  run: RunDeadline,
  supabaseUrl: string,
  limit: number,
): Promise<{ summary: RunSummary; claimError: unknown }> {
  const { counts, claimError } = await drainQueue(steps, run, supabaseUrl, limit);
  const summary: RunSummary = claimError === null
    ? summarizeRun(counts)
    : { status: "failed", detail: counts, error: shortenError(claimError) };
  await finishRun(steps, run, summary);
  return { summary, claimError };
}

export function finishRun(steps: Pick<CopySteps, "finish">, run: RunDeadline, summary: RunSummary): Promise<void> {
  return settle(run.by(RUN_HARD_END_MS), "finish", (s) => steps.finish(summary, s));
}
