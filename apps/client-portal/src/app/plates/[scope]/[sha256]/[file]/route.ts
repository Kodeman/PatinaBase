import { createServerClient } from '@patina/supabase/server';

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

/**
 * The plate's R2 key. One `?r=` of 32 lowercase hex is a media-worker framing
 * revision: its renditions are at f/{r}/ and nowhere else. Any other `r` (none,
 * several, or the base36 cache-buster SQ-1643 pages still carry) names none,
 * and the plate is read at its unversioned key, as before versioned keys.
 * There is no fallback between the two: the worker stamps every crop it writes
 * with the revision of the prefix it wrote, and never writes the unversioned
 * prefix, so an unstamped crop's object there is what Phase 1 and 2 left.
 */
function plateKey(request: Request, base: string, file: string): string {
  const revisions = new URL(request.url).searchParams.getAll('r');
  const rev = revisions.length === 1 && /^[0-9a-f]{32}(?![\s\S])/.test(revisions[0]) ? revisions[0] : null;
  return rev ? `${base}/f/${rev}/${file}` : `${base}/${file}`;
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

async function servePlate(request: Request, base: string, file: string): Promise<Response> {
  const bucket = await plateBucket();
  if (!bucket) return unavailable(503);
  const object: PlateRead = await bucket.get(plateKey(request, base, file), { onlyIf: request.headers });
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
  if (!validParams(values)) return unavailable(404);
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
  return servePlate(request, `plates/${projectId}/${values.sha256}`, values.file);
}
