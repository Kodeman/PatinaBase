// POST /plates/ingest — the client plate lane (US-49). The client-plate-copy
// edge function sends a source URL; this Worker fetches it once, hashes it,
// has the container crop and encode it (op `plate_ingest`), and writes every
// output to the private PLATES bucket under plates/{projectId}/{sha256}/.
// No runtime imports and erasable-only TypeScript, so test/ingest-route.test.mjs
// loads this file directly under Node.

export interface PlatesEnv {
  PLATES: R2Bucket;
  PLATE_INGEST_SECRET: string;
  SUPABASE_STORAGE_ORIGIN: string;
}

export interface PlateIngestDeps {
  fetchSource: (url: string, init: RequestInit) => Promise<Response>;
  processPlate: (request: Request) => Promise<Response>;
}

export const SOURCE_KINDS = ['upload', 'installed', 'scan', 'board', 'sheet', 'maker', 'concept'];
export const SOURCE_TIMEOUT_MS = 10_000;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
// The edge abandons the ingest call at 30 s. The container holds the same
// deadline as the job's budgetMs (container/plates.mjs PLATE_BUDGET_MS).
export const PROCESSOR_TIMEOUT_MS = 25_000;
// The container's clock starts when the job reaches it, after this one: it gets
// what is left of PROCESSOR_TIMEOUT_MS less this margin, so it gives up first.
export const PROCESSOR_MARGIN_MS = 1_000;

// Only maker pictures and board covers may be outside hotlinks. Their storage
// URLs still use the private-origin pin, independently of their rendition role.
const HOTLINK_KINDS = new Set(['maker', 'board']);
// A hotlink never targets these names or anything under them.
const REFUSED_DOMAINS = ['localhost', 'local', 'internal', 'workers.dev', 'patina.cloud'];
// URL parsing normalises every numeric IPv4 form (2130706433, 0x7f.1) to dotted quads.
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTPUT_NAME = /^(wide|cover_phone|tall|wide32|pair|piece|sheet|board)-\d{3,4}\.(avif|webp)$/;
const OUTPUT_TYPES = new Set(['image/avif', 'image/webp']);
const EDGE = 1e-9;

type Rect = [number, number, number, number];

interface IngestBody {
  projectId: string;
  requestId: string;
  sourceKind: string;
  sourceUrl: string;
  focal: [number, number] | null;
  subjectBox: Rect | null;
}

interface Source {
  bytes: Uint8Array;
  contentType: string;
}

interface PlateRecord {
  sha256: string;
  width: number;
  height: number;
  format: string;
  ground: string;
  dominantHex: string;
  lqip: string | null;
  originalKey: string;
  crops: Record<string, { rect: Rect; widths: number[] }>;
}

// crops.json = the response record, the inputs that shaped the crops, and the
// source kinds whose crops it already holds.
interface StoredPlate extends PlateRecord {
  focal: [number, number] | null;
  subjectBox: Rect | null;
  sourceKinds?: string[];
}

interface ProcessorJob {
  op: 'plate_ingest';
  sourceKind: string;
  focal: [number, number] | null;
  subjectBox: Rect | null;
  // Crop keys these bytes already have; the container does not plan them again.
  skip: string[];
}

// The container kills the job at this deadline even if this Worker's abort never reaches it.
type BudgetedJob = ProcessorJob & { budgetMs: number };

type OriginPolicy = (target: URL) => string | null;

interface ProcessorOutput {
  key: string;
  contentType: string;
  dataB64: string;
}

type ProcessorResult = Omit<PlateRecord, 'sha256' | 'originalKey'> & { outputs: ProcessorOutput[] };

class IngestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function fail(status: number, message: string): Response {
  return Response.json({ error: message.slice(0, 200) }, { status });
}

/** Timing-safe bearer check; a length mismatch still spends one equal-length compare. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const encoder = new TextEncoder();
  const expected = encoder.encode(secret);
  const provided = encoder.encode(/^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? '');
  if (provided.byteLength !== expected.byteLength) {
    crypto.subtle.timingSafeEqual(expected, expected);
    return false;
  }
  return crypto.subtle.timingSafeEqual(provided, expected);
}

// ---- body validation -------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUuid = (value: unknown): boolean => typeof value === 'string' && UUID.test(value);

const isUnit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

const isUnitTuple = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every(isUnit);

const boxFits = ([x, y, w, h]: number[]): boolean => w > 0 && h > 0 && x + w <= 1 + EDGE && y + h <= 1 + EDGE;

function urlError(value: string): string | null {
  try {
    return new URL(value).protocol === 'https:' ? null : 'sourceUrl must be an https URL';
  } catch {
    return 'sourceUrl must be an absolute URL';
  }
}

const FIELD_CHECKS: [keyof IngestBody, (value: unknown) => string | null][] = [
  ['projectId', (v) => (isUuid(v) ? null : 'projectId must be a uuid')],
  ['requestId', (v) => (isUuid(v) ? null : 'requestId must be a uuid')],
  ['sourceKind', (v) => (SOURCE_KINDS.includes(v as string) ? null : `sourceKind must be one of ${SOURCE_KINDS.join(', ')}`)],
  ['sourceUrl', (v) => (typeof v === 'string' ? urlError(v) : 'sourceUrl must be an absolute URL')],
  ['focal', (v) => (v == null || isUnitTuple(v, 2) ? null : 'focal must be [x, y] normalised 0-1')],
  [
    'subjectBox',
    (v) => (v == null || (isUnitTuple(v, 4) && boxFits(v)) ? null : 'subjectBox must be [x, y, w, h] normalised 0-1 inside the frame'),
  ],
];

/** The validated body, or an error message. */
export function parseIngestBody(raw: unknown): IngestBody | string {
  if (!isRecord(raw)) return 'body must be a JSON object';
  const error = FIELD_CHECKS.map(([field, check]) => check(raw[field])).find((e) => e !== null);
  if (error) return error;
  const body = raw as unknown as IngestBody;
  return {
    projectId: body.projectId.toLowerCase(),
    requestId: body.requestId.toLowerCase(),
    sourceKind: body.sourceKind,
    sourceUrl: body.sourceUrl,
    focal: body.focal ?? null,
    subjectBox: body.subjectBox ?? null,
  };
}

async function readBody(request: Request): Promise<IngestBody | string> {
  try {
    return parseIngestBody(await request.json());
  } catch {
    return 'body must be JSON';
  }
}

// ---- source origin policy --------------------------------------------------

function storageOrigin(configured: string | undefined): string | null {
  try {
    const url = new URL(configured ?? '');
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function hotlinkRefusal(hostname: string): string | null {
  const host = hostname.replace(/\.+$/, '');
  if (host.startsWith('[') || IPV4.test(host)) return 'a hotlink may not be an IP address';
  const underRefused = REFUSED_DOMAINS.some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
  return !host.includes('.') || underRefused ? `a hotlink may not point at ${host}` : null;
}

function privateRefusal(target: URL, sourceKind: string, storage: string | null): string | null {
  if (!storage) return `${sourceKind} sources are refused until SUPABASE_STORAGE_ORIGIN is set`;
  return target.origin === storage ? null : `a ${sourceKind} source must come from the Supabase storage origin`;
}

/** The rule every fetch target (the sourceUrl and each redirect Location) must pass. */
function originPolicy(sourceKind: string, sourceUrl: string, configuredStorage: string | undefined): OriginPolicy {
  const storage = storageOrigin(configuredStorage);
  // Select provenance once: a storage source cannot escape its pin via redirect.
  const privateSource = new URL(sourceUrl).origin === storage || !HOTLINK_KINDS.has(sourceKind);
  return (target) => {
    if (target.protocol !== 'https:') return 'source must be an https URL';
    if (target.username || target.password) return 'source URL may not carry credentials';
    return privateSource ? privateRefusal(target, sourceKind, storage) : hotlinkRefusal(target.hostname);
  };
}

// ---- source fetch (10 s, image/*, <= 20 MB) --------------------------------

function lostSource(controller: AbortController): IngestError {
  return controller.signal.aborted
    ? new IngestError(504, 'source fetch timed out')
    : new IngestError(502, 'source fetch failed');
}

async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // An errored body is already done with.
  }
}

async function fetchOnce(url: string, deps: PlateIngestDeps, controller: AbortController): Promise<Response> {
  try {
    return await deps.fetchSource(url, { headers: { Accept: 'image/*' }, redirect: 'manual', signal: controller.signal });
  } catch {
    throw lostSource(controller);
  }
}

function redirectTarget(location: string | null, from: URL): URL {
  if (!location) throw new IngestError(502, 'source redirect has no Location');
  try {
    return new URL(location, from);
  } catch {
    throw new IngestError(502, 'source redirect Location is not a URL');
  }
}

// Redirects are followed here, not by fetch, so the policy sees every hop first.
async function openSource(
  sourceUrl: string,
  policy: OriginPolicy,
  deps: PlateIngestDeps,
  controller: AbortController,
): Promise<Response> {
  let target = new URL(sourceUrl);
  for (let hop = 0; ; hop++) {
    const refusal = policy(target);
    if (refusal) throw new IngestError(403, refusal);
    const res = await fetchOnce(target.href, deps, controller);
    if (!REDIRECT_STATUSES.has(res.status)) return res;
    await discardBody(res);
    if (hop === MAX_REDIRECTS) throw new IngestError(502, `source redirected more than ${MAX_REDIRECTS} times`);
    target = redirectTarget(res.headers.get('location'), target);
  }
}

function mediaType(res: Response): string {
  return (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

function sourceRefusal(res: Response, contentType: string): IngestError | null {
  if (!res.ok) return new IngestError(502, `source returned HTTP ${res.status}`);
  if (!contentType.startsWith('image/')) return new IngestError(415, 'source is not an image/* content type');
  if (Number(res.headers.get('content-length')) > MAX_SOURCE_BYTES) return new IngestError(413, 'source exceeds 20 MB');
  return res.body ? null : new IngestError(502, 'source returned no body');
}

async function nextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  try {
    return await reader.read();
  } catch {
    throw lostSource(controller);
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Counts the stream as it arrives and cancels it past the cap, so an
// undeclared or lying content-length never buffers more than 20 MB.
async function readCapped(body: ReadableStream<Uint8Array>, controller: AbortController): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let step = await nextChunk(reader, controller); !step.done; step = await nextChunk(reader, controller)) {
    total += step.value.byteLength;
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new IngestError(413, 'source exceeds 20 MB');
    }
    chunks.push(step.value);
  }
  if (total === 0) throw new IngestError(422, 'source is empty');
  return concat(chunks, total);
}

async function readSource(sourceUrl: string, policy: OriginPolicy, deps: PlateIngestDeps): Promise<Source> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await openSource(sourceUrl, policy, deps, controller);
    const contentType = mediaType(res);
    const refusal = sourceRefusal(res, contentType);
    if (refusal) {
      await discardBody(res);
      throw refusal;
    }
    return { bytes: await readCapped(res.body as ReadableStream<Uint8Array>, controller), contentType };
  } finally {
    clearTimeout(timer);
  }
}

// ---- processing + storage --------------------------------------------------

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toRecord(plate: PlateRecord): PlateRecord {
  const { sha256, width, height, format, ground, dominantHex, lqip, originalKey, crops } = plate;
  return { sha256, width, height, format, ground, dominantHex, lqip, originalKey, crops };
}

function sameInputs(stored: StoredPlate, body: IngestBody): boolean {
  return (
    JSON.stringify(stored.focal ?? null) === JSON.stringify(body.focal) &&
    JSON.stringify(stored.subjectBox ?? null) === JSON.stringify(body.subjectBox)
  );
}

async function storedPlate(env: PlatesEnv, prefix: string, body: IngestBody): Promise<StoredPlate | null> {
  const existing = await env.PLATES.get(`${prefix}/crops.json`);
  const stored = existing && (await existing.json<StoredPlate>().catch(() => null));
  return stored && sameInputs(stored, body) ? stored : null;
}

const isPlateOutput = (o: ProcessorOutput): boolean =>
  OUTPUT_NAME.test(o?.key) && OUTPUT_TYPES.has(o?.contentType) && typeof o?.dataB64 === 'string';

function checkedOutputs(outputs: unknown): ProcessorOutput[] {
  if (Array.isArray(outputs) && outputs.every(isPlateOutput)) return outputs;
  throw new IngestError(502, 'processor returned an unexpected output');
}

// Settles with `work`, or rejects as soon as `signal` aborts, whether or not
// `work` itself honours the signal.
function beforeDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  const deadline = new Promise<never>(
    (_, reject) => signal.addEventListener('abort', reject, { once: true }),
  );
  return Promise.race([work, deadline]);
}

/** The container's budget for a job sent at `now`: what is left before `deadlineAt`, less the margin; at least 1 ms. */
export function processorBudgetMs(deadlineAt: number, now: number): number {
  return Math.max(1, deadlineAt - now - PROCESSOR_MARGIN_MS);
}

const processorLate = (): IngestError =>
  new IngestError(504, `processor did not finish within ${PROCESSOR_TIMEOUT_MS / 1000} s`);

// The container answers 503 busy while it runs another plate job, and 504 when
// it killed this one at its deadline or on our hang-up.
function processorRefusal(res: Response, result: { success?: boolean; error?: string } | null): IngestError | null {
  if (res.status === 503 && result?.error === 'busy') return new IngestError(503, 'busy');
  if (res.status === 504) return processorLate();
  if (!res.ok || !result?.success) return new IngestError(502, `processor failed: ${result?.error ?? `HTTP ${res.status}`}`);
  return null;
}

async function callProcessor(
  deps: PlateIngestDeps,
  job: ProcessorJob,
  bytes: Uint8Array,
  signal: AbortSignal,
  deadlineAt: number,
): Promise<ProcessorResult> {
  const budgeted: BudgetedJob = { ...job, budgetMs: processorBudgetMs(deadlineAt, Date.now()) };
  const request = new Request('http://media-processor/process', {
    method: 'POST',
    headers: { 'x-media-job': btoa(JSON.stringify(budgeted)) },
    body: bytes,
    signal,
  });
  const res = await beforeDeadline(deps.processPlate(request), signal);
  const result = await beforeDeadline(
    res.json<ProcessorResult & { success?: boolean; error?: string }>().catch(() => null),
    signal,
  );
  const refusal = processorRefusal(res, result);
  if (refusal) throw refusal;
  return { ...(result as ProcessorResult), outputs: checkedOutputs(result?.outputs) };
}

async function runProcessor(
  deps: PlateIngestDeps,
  body: IngestBody,
  bytes: Uint8Array,
  skip: string[],
): Promise<ProcessorResult> {
  const job: ProcessorJob = {
    op: 'plate_ingest',
    sourceKind: body.sourceKind,
    focal: body.focal,
    subjectBox: body.subjectBox,
    skip,
  };
  const deadlineAt = Date.now() + PROCESSOR_TIMEOUT_MS;
  const controller = new AbortController();
  // Aborting the container fetch is the hang-up that makes the container kill the job.
  const timer = setTimeout(() => controller.abort(), PROCESSOR_TIMEOUT_MS);
  try {
    return await callProcessor(deps, job, bytes, controller.signal, deadlineAt);
  } catch (err) {
    throw controller.signal.aborted ? processorLate() : err;
  } finally {
    clearTimeout(timer);
  }
}

const extension = (format: unknown): string =>
  typeof format === 'string' && /^[a-z0-9]{2,5}$/.test(format) ? format : 'bin';

async function putOutputs(env: PlatesEnv, prefix: string, outputs: ProcessorOutput[]): Promise<void> {
  for (const o of outputs) {
    await env.PLATES.put(`${prefix}/${o.key}`, b64ToBytes(o.dataB64), { httpMetadata: { contentType: o.contentType } });
  }
}

// Written after every object it names: its presence means they all landed.
async function putManifest(env: PlatesEnv, prefix: string, stored: StoredPlate): Promise<PlateRecord> {
  await env.PLATES.put(`${prefix}/crops.json`, JSON.stringify(stored), {
    httpMetadata: { contentType: 'application/json' },
  });
  return toRecord(stored);
}

async function storePlate(
  env: PlatesEnv,
  prefix: string,
  body: IngestBody,
  source: Source,
  sha256: string,
  result: ProcessorResult,
): Promise<PlateRecord> {
  await putOutputs(env, prefix, result.outputs);
  const originalKey = `${prefix}/original.${extension(result.format)}`;
  await env.PLATES.put(originalKey, source.bytes, { httpMetadata: { contentType: source.contentType } });
  const record = toRecord({ ...result, sha256, originalKey });
  return putManifest(env, prefix, { ...record, focal: body.focal, subjectBox: body.subjectBox, sourceKinds: [body.sourceKind] });
}

// Same bytes and inputs, a source kind the manifest has not planned for: the
// processor encoded only the crops that kind adds, and the manifest keeps the union.
async function addCrops(
  env: PlatesEnv,
  prefix: string,
  body: IngestBody,
  stored: StoredPlate,
  result: ProcessorResult,
): Promise<PlateRecord> {
  await putOutputs(env, prefix, result.outputs);
  return putManifest(env, prefix, {
    ...stored,
    crops: { ...stored.crops, ...result.crops },
    sourceKinds: [...(stored.sourceKinds ?? []), body.sourceKind],
  });
}

async function ingest(env: PlatesEnv, deps: PlateIngestDeps, body: IngestBody): Promise<PlateRecord> {
  const source = await readSource(body.sourceUrl, originPolicy(body.sourceKind, body.sourceUrl, env.SUPABASE_STORAGE_ORIGIN), deps);
  const sha256 = await sha256Hex(source.bytes);
  const prefix = `plates/${body.projectId}/${sha256}`;
  const stored = await storedPlate(env, prefix, body);
  if (!stored) return storePlate(env, prefix, body, source, sha256, await runProcessor(deps, body, source.bytes, []));
  if (stored.sourceKinds?.includes(body.sourceKind)) return toRecord(stored);
  return addCrops(env, prefix, body, stored, await runProcessor(deps, body, source.bytes, Object.keys(stored.crops)));
}

function errorResponse(err: unknown): Response {
  if (err instanceof IngestError) return fail(err.status, err.message);
  return fail(500, `plate ingest failed: ${err instanceof Error ? err.message : String(err)}`);
}

export async function handlePlateIngest(request: Request, env: PlatesEnv, deps: PlateIngestDeps): Promise<Response> {
  if (!bearerMatches(request.headers.get('authorization'), env.PLATE_INGEST_SECRET)) {
    return fail(401, 'unauthorized');
  }
  const body = await readBody(request);
  if (typeof body === 'string') return fail(400, body);
  try {
    return Response.json(await ingest(env, deps, body));
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /plates/{projectId}/{sha256}/{file} — the client-edition-compose edge
// function reads a plate's full-frame rendition (the `piece` crop: uncropped,
// immutable per sha256) to show a model. Same bearer as ingest. Only the two
// piece widths it reads are served, so no free path segment reaches R2; the
// answer is 401, 404 or the bytes, and nothing else.
export const READABLE_FILES = ['piece-512.webp', 'piece-768.webp'];
const READ_SHAPE = /^\/plates\/[^/]+\/[^/]+\/[^/]+$/;
const READ_PATH = /^\/plates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\/([^/]+)$/;

/** The R2 key a read may touch, or null: a uuid, a sha256 and an allowlisted file. */
function readKey(pathname: string): string | null {
  const match = READ_PATH.exec(pathname);
  return match && READABLE_FILES.includes(match[3]) ? `plates/${match[1]}/${match[2]}/${match[3]}` : null;
}

/** The stored plate, or null when it is missing or the bucket fails: a failed read answers as a miss. */
async function readPlate(env: PlatesEnv, key: string) {
  try {
    return await env.PLATES.get(key);
  } catch {
    console.error('Plate read failed');
    return null;
  }
}

export async function handlePlateRead(request: Request, env: PlatesEnv): Promise<Response> {
  if (!bearerMatches(request.headers.get('authorization'), env.PLATE_INGEST_SECRET)) {
    return new Response(null, { status: 401 });
  }
  const key = readKey(new URL(request.url).pathname);
  const object = key ? await readPlate(env, key) : null;
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' } });
}

/** The Worker's remaining routes: POST /plates/ingest, GET /plates/…, else 404. */
export async function routePlates(request: Request, env: PlatesEnv, deps: PlateIngestDeps): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method === 'POST' && pathname === '/plates/ingest') {
    return handlePlateIngest(request, env, deps);
  }
  if (request.method === 'GET' && READ_SHAPE.test(pathname)) return handlePlateRead(request, env);
  return new Response('not found', { status: 404 });
}
