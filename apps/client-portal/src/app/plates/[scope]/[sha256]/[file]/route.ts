import { createServerClient } from '@patina/supabase/server';

import { framingRevision } from '@/lib/plates';

type PlateParams = { scope: string; sha256: string; file: string };
type PlateObject = {
  size: number;
  httpEtag: string;
};
type PlateBody = PlateObject & { body: ReadableStream<Uint8Array> };
// Spelled out: a ternary or several returns would reduce the union to PlateObject.
type PlateRead = PlateObject | PlateBody | null;
type PlateBucket = {
  get(key: string, options?: { onlyIf: Headers }): Promise<PlateRead>;
};
// 00843 is deployed independently of the generated database types.
type PlateReader = {
  rpc(name: 'client_can_read_plate', args: { p_scope_id: string; p_sha256: string }):
    PromiseLike<{ data: string | null; error: { code: string; message: string } | null }>;
};

function validParams({ scope, sha256, file }: PlateParams): boolean {
  // Absolute end assertions reject trailing newlines, which JS '$' alone permits.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/i.test(scope)
    && /^[0-9a-f]{64}(?![\s\S])/.test(sha256)
    && /^(wide|cover_phone|tall|wide32|pair|piece|sheet|board)-[1-9]\d{2,3}\.(avif|webp)(?![\s\S])/.test(file);
}

/** The framing revision `?r=` names, '' for none; null for bad params or anything but one well-formed `r`. */
function requestedRevision(request: Request, values: PlateParams): string | null {
  if (!validParams(values)) return null;
  const revisions = new URL(request.url).searchParams.getAll('r');
  if (revisions.length === 0) return '';
  return revisions.length === 1 && /^[0-9a-f]{16}(?![\s\S])/.test(revisions[0]) ? revisions[0] : null;
}

async function plateBucket(): Promise<PlateBucket | null> {
  try {
    // Sync access distinguishes a deployed Worker from Node without booting Miniflare.
    const { getCloudflareContext } = await import('@opennextjs/cloudflare/cloudflare-context');
    const { env } = getCloudflareContext();
    return (env as unknown as { PLATES?: PlateBucket }).PLATES ?? null;
  } catch {
    return null;
  }
}

function plateHeaders(object: PlateObject, file: string): Headers {
  return new Headers({
    'Content-Type': file.endsWith('.avif') ? 'image/avif' : 'image/webp',
    'Content-Length': String(object.size),
    ETag: object.httpEtag,
    'Cache-Control': 'private, max-age=3600',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
  });
}

function unavailable(status: 401 | 404 | 503): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function manifestRevision(body: ReadableStream<Uint8Array>): Promise<string | null> {
  try {
    const { focal, subjectBox } = await new Response(body).json();
    return framingRevision(focal ?? null, subjectBox ?? null);
  } catch {
    return null;
  }
}

/** The framing of the unversioned prefix's manifest, or null when there is none to read. */
async function unversionedRevision(bucket: PlateBucket, base: string): Promise<string | null> {
  const manifest = await bucket.get(`${base}/crops.json`);
  return manifest && 'body' in manifest ? manifestRevision(manifest.body) : null;
}

// A framing's renditions live under base/f/{rev}. Copies from before versioned
// keys left a framing at the unversioned prefix: served for `rev` only when no
// versioned object exists and that prefix's manifest is this same framing.
async function framedPlate(
  bucket: PlateBucket,
  request: Request,
  base: string,
  file: string,
  rev: string,
): Promise<PlateRead> {
  const framed = await bucket.get(`${base}/f/${rev}/${file}`, { onlyIf: request.headers });
  if (framed) return framed;
  if ((await unversionedRevision(bucket, base)) !== rev) return null;
  return bucket.get(`${base}/${file}`, { onlyIf: request.headers });
}

async function servePlate(request: Request, base: string, file: string, rev: string): Promise<Response> {
  const bucket = await plateBucket();
  if (!bucket) return unavailable(503);
  const object: PlateRead = rev
    ? await framedPlate(bucket, request, base, file, rev)
    : await bucket.get(`${base}/${file}`, { onlyIf: request.headers });
  if (!object) return unavailable(404);
  if (!('body' in object)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: object.httpEtag, 'Cache-Control': 'private, max-age=3600', Vary: 'Cookie' },
    });
  }
  return new Response(object.body, { headers: plateHeaders(object, file) });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<PlateParams> },
): Promise<Response> {
  const values = await params;
  const rev = requestedRevision(request, values);
  if (rev === null) return unavailable(404);
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unavailable(401);
  const { data: projectId, error } = await (supabase as unknown as PlateReader).rpc('client_can_read_plate', {
    p_scope_id: values.scope,
    p_sha256: values.sha256,
  });
  if (error) {
    console.error('client_can_read_plate', { code: error.code, message: error.message });
    return unavailable(404);
  }
  if (!projectId) return unavailable(404);
  return servePlate(request, `plates/${projectId}/${values.sha256}`, values.file, rev);
}
