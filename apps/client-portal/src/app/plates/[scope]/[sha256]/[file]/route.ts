import { createServerClient } from '@patina/supabase/server';

type PlateParams = { scope: string; sha256: string; file: string };
type PlateObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
};
type PlateBucket = { get(key: string): Promise<PlateObject | null> };
// 00843 is deployed independently of the generated database types.
type PlateReader = {
  rpc(name: 'client_can_read_plate', args: { p_scope_id: string; p_sha256: string }):
    PromiseLike<{ data: string | null; error: unknown }>;
};

function validParams({ scope, sha256, file }: PlateParams): boolean {
  // Absolute end assertions reject trailing newlines, which JS '$' alone permits.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/i.test(scope)
    && /^[0-9a-f]{64}(?![\s\S])/.test(sha256)
    && /^(wide|cover_phone|tall|wide32|pair|piece|sheet|board)-\d{3,4}\.(avif|webp)(?![\s\S])/.test(file);
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
    'Content-Type': object.httpMetadata?.contentType ?? (file.endsWith('.avif') ? 'image/avif' : 'image/webp'),
    'Content-Length': String(object.size),
    ETag: object.httpEtag,
    'Cache-Control': 'private, max-age=3600',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
  });
}

function matchesEtag(value: string | null, etag: string): boolean {
  if (value === null) return false;
  return value.split(',').some((candidate) => {
    const tag = candidate.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag.replace(/^W\//, '');
  });
}

async function servePlate(request: Request, key: string, file: string): Promise<Response> {
  const bucket = await plateBucket();
  if (!bucket) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const object = await bucket.get(key);
  if (!object) return new Response(null, { status: 404 });
  const headers = plateHeaders(object, file);
  if (matchesEtag(request.headers.get('If-None-Match'), object.httpEtag)) {
    await object.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<PlateParams> },
): Promise<Response> {
  const values = await params;
  if (!validParams(values)) return new Response(null, { status: 404 });
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data: projectId, error } = await (supabase as unknown as PlateReader).rpc('client_can_read_plate', {
    p_scope_id: values.scope,
    p_sha256: values.sha256,
  });
  if (error || !projectId) return new Response(null, { status: 404 });
  return servePlate(request, `plates/${projectId}/${values.sha256}/${values.file}`, values.file);
}
