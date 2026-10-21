// POST /plates/ingest — the client plate lane (US-49). The client-plate-copy
// edge function sends a source URL; this Worker fetches it once, hashes it,
// has the container crop and encode it (op `plate_ingest`), and writes every
// output to the private PLATES bucket under plates/{projectId}/{sha256}/.
// No runtime imports and erasable-only TypeScript, so test/ingest-route.test.mjs
// loads this file directly under Node.

export interface PlatesEnv {
  PLATES: R2Bucket;
  PLATE_INGEST_SECRET: string;
}

export interface PlateIngestDeps {
  fetchSource: (url: string, init: RequestInit) => Promise<Response>;
  processPlate: (request: Request) => Promise<Response>;
}

export const SOURCE_KINDS = ['upload', 'installed', 'scan', 'board', 'sheet', 'maker', 'concept'];
export const SOURCE_TIMEOUT_MS = 10_000;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

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

// crops.json = the response record plus the inputs that shaped the crops.
interface StoredPlate extends PlateRecord {
  focal: [number, number] | null;
  subjectBox: Rect | null;
}

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

function urlError(value: unknown): string | null {
  let protocol = '';
  try {
    protocol = new URL(value as string).protocol;
  } catch {
    return 'sourceUrl must be an absolute URL';
  }
  return protocol === 'https:' || protocol === 'http:' ? null : 'sourceUrl must be an http(s) URL';
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

// ---- source fetch (10 s, image/*, <= 20 MB) --------------------------------

function lostSource(controller: AbortController): IngestError {
  return controller.signal.aborted
    ? new IngestError(504, 'source fetch timed out')
    : new IngestError(502, 'source fetch failed');
}

async function openSource(url: string, deps: PlateIngestDeps, controller: AbortController): Promise<Response> {
  try {
    return await deps.fetchSource(url, { headers: { Accept: 'image/*' }, signal: controller.signal });
  } catch {
    throw lostSource(controller);
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

async function readSource(sourceUrl: string, deps: PlateIngestDeps): Promise<Source> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await openSource(sourceUrl, deps, controller);
    const contentType = mediaType(res);
    const refusal = sourceRefusal(res, contentType);
    if (refusal) {
      await res.body?.cancel().catch(() => {});
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

async function storedPlate(env: PlatesEnv, prefix: string, body: IngestBody): Promise<PlateRecord | null> {
  const existing = await env.PLATES.get(`${prefix}/crops.json`);
  const stored = existing && (await existing.json<StoredPlate>().catch(() => null));
  return stored && sameInputs(stored, body) ? toRecord(stored) : null;
}

const isPlateOutput = (o: ProcessorOutput): boolean =>
  OUTPUT_NAME.test(o?.key) && OUTPUT_TYPES.has(o?.contentType) && typeof o?.dataB64 === 'string';

function checkedOutputs(outputs: unknown): ProcessorOutput[] {
  if (Array.isArray(outputs) && outputs.every(isPlateOutput)) return outputs;
  throw new IngestError(502, 'processor returned an unexpected output');
}

async function runProcessor(deps: PlateIngestDeps, body: IngestBody, bytes: Uint8Array): Promise<ProcessorResult> {
  const job = { op: 'plate_ingest', sourceKind: body.sourceKind, focal: body.focal, subjectBox: body.subjectBox };
  const res = await deps.processPlate(
    new Request('http://media-processor/process', {
      method: 'POST',
      headers: { 'x-media-job': btoa(JSON.stringify(job)) },
      body: bytes,
    }),
  );
  const result = await res.json<ProcessorResult & { success?: boolean; error?: string }>().catch(() => null);
  if (!res.ok || !result?.success) {
    throw new IngestError(502, `processor failed: ${result?.error ?? `HTTP ${res.status}`}`);
  }
  return { ...result, outputs: checkedOutputs(result.outputs) };
}

const extension = (format: unknown): string =>
  typeof format === 'string' && /^[a-z0-9]{2,5}$/.test(format) ? format : 'bin';

async function storePlate(
  env: PlatesEnv,
  prefix: string,
  body: IngestBody,
  source: Source,
  sha256: string,
  result: ProcessorResult,
): Promise<PlateRecord> {
  for (const o of result.outputs) {
    await env.PLATES.put(`${prefix}/${o.key}`, b64ToBytes(o.dataB64), { httpMetadata: { contentType: o.contentType } });
  }
  const originalKey = `${prefix}/original.${extension(result.format)}`;
  await env.PLATES.put(originalKey, source.bytes, { httpMetadata: { contentType: source.contentType } });
  const record = toRecord({ ...result, sha256, originalKey });
  const stored: StoredPlate = { ...record, focal: body.focal, subjectBox: body.subjectBox };
  // Written last: its presence means every output above landed.
  await env.PLATES.put(`${prefix}/crops.json`, JSON.stringify(stored), {
    httpMetadata: { contentType: 'application/json' },
  });
  return record;
}

async function ingest(env: PlatesEnv, deps: PlateIngestDeps, body: IngestBody): Promise<PlateRecord> {
  const source = await readSource(body.sourceUrl, deps);
  const sha256 = await sha256Hex(source.bytes);
  const prefix = `plates/${body.projectId}/${sha256}`;
  // Re-ingest of the same bytes with the same focal/subject box returns the stored crops.
  const stored = await storedPlate(env, prefix, body);
  return stored ?? storePlate(env, prefix, body, source, sha256, await runProcessor(deps, body, source.bytes));
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

/** The Worker's remaining routes: POST /plates/ingest, else 404. */
export async function routePlates(request: Request, env: PlatesEnv, deps: PlateIngestDeps): Promise<Response> {
  if (request.method === 'POST' && new URL(request.url).pathname === '/plates/ingest') {
    return handlePlateIngest(request, env, deps);
  }
  return new Response('not found', { status: 404 });
}
