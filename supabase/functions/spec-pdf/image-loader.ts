import {
  assertHostResolvesSafe,
  assertSafeUrl,
  denoPinnedHttpTransport,
  PinnedTransportError,
  type SafeFetchDependencies,
  UrlError,
} from '../capture-from-url/ssrf.ts';

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 5_000;
const BOARD_BUCKET = 'proposal-mood-boards';

export async function serviceMayResolveBoardProjection(
  admin: {
    rpc(name: string, args: Record<string, unknown>): Promise<{
      data: unknown;
      error: unknown;
    }>;
  },
  boardId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('board_media_projection_is_allowed', {
    p_board_id: boardId,
  });
  if (error) throw error;
  return data === true;
}

const BOARD_MARKERS = [
  `/storage/v1/object/public/${BOARD_BUCKET}/`,
  `/storage/v1/object/authenticated/${BOARD_BUCKET}/`,
  `/storage/v1/object/sign/${BOARD_BUCKET}/`,
  `/storage/v1/render/image/public/${BOARD_BUCKET}/`,
  `/storage/v1/render/image/authenticated/${BOARD_BUCKET}/`,
  `/storage/v1/render/image/sign/${BOARD_BUCKET}/`,
];

/** Canonical 00435 board reference parser for server-side PDF hydration. */
export function boardStoragePath(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const withoutQuery = raw.split('?', 1)[0];
  for (const marker of BOARD_MARKERS) {
    const index = withoutQuery.indexOf(marker);
    if (index >= 0) {
      const path = withoutQuery.slice(index + marker.length);
      return path && !/(^|\/)\.\.(\/|$)/.test(path) ? path : null;
    }
  }
  if (/^https?:\/\//i.test(withoutQuery)) return null;
  const unprefixed = withoutQuery.replace(/^\/+/, '');
  const path = unprefixed.startsWith(`${BOARD_BUCKET}/`)
    ? unprefixed.slice(BOARD_BUCKET.length + 1)
    : unprefixed;
  return path && !/(^|\/)\.\.(\/|$)/.test(path) ? path : null;
}

export function resolvePrivateBoardImageSources<T extends CompositionImageSource>(
  sources: readonly T[],
  signedByPath: ReadonlyMap<string, string>,
): T[] {
  return sources.map((source) => {
    const path = boardStoragePath(source.imageUrl);
    if (!path) return { ...source };
    return { ...source, imageUrl: signedByPath.get(path) ?? null };
  });
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 ||
    status === 308;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function readCappedImage(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    length += value.byteLength;
    if (length > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new UrlError('image_too_large', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** SSRF-guarded PNG/JPEG hydration. Every redirect host is revalidated. */
export async function loadCompositionImage(
  startUrl: string,
  dependencies: SafeFetchDependencies = {},
): Promise<string> {
  let currentUrl = startUrl;
  const transport = dependencies.transport ?? denoPinnedHttpTransport;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = assertSafeUrl(currentUrl);
    const addresses = await assertHostResolvesSafe(
      parsed.hostname,
      dependencies.resolver,
      TIMEOUT_MS,
    );
    currentUrl = parsed.toString();

    let response: Response;
    try {
      response = await transport.request(parsed, addresses[0], {
        headers: { accept: 'image/png,image/jpeg' },
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_IMAGE_BYTES,
        allowedContentTypes: ['image/png', 'image/jpeg'],
      });
    } catch (error) {
      if (
        error instanceof PinnedTransportError && error.reason === 'timeout'
      ) {
        throw new UrlError('image_timeout', 504);
      }
      if (
        error instanceof PinnedTransportError && error.reason === 'too_large'
      ) {
        throw new UrlError('image_too_large', 413);
      }
      if (
        error instanceof PinnedTransportError &&
        error.reason === 'unsupported_content_type'
      ) {
        throw new UrlError('unsupported_image_type', 415);
      }
      throw new UrlError('image_fetch_failed', 502);
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new UrlError('image_redirect_without_location', 502);
      if (hop === MAX_REDIRECTS) {
        throw new UrlError('image_too_many_redirects', 502);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new UrlError('image_fetch_failed', 502);
    }
    const contentType = (response.headers.get('content-type') ?? '').split(
      ';',
      1,
    )[0].trim().toLowerCase();
    if (contentType !== 'image/png' && contentType !== 'image/jpeg') {
      await response.body?.cancel();
      throw new UrlError('unsupported_image_type', 415);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new UrlError('image_too_large', 413);
    }
    const bytes = await readCappedImage(response);
    if (bytes.length === 0) throw new UrlError('empty_image', 502);
    return `data:${contentType};base64,${bytesToBase64(bytes)}`;
  }
  throw new UrlError('image_too_many_redirects', 502);
}

export interface CompositionImageSource {
  imageUrl: string | null;
}

/** Best-effort hydration: failures are intentionally represented as null. */
export async function hydrateCompositionImages<
  T extends CompositionImageSource,
>(
  sources: readonly T[],
  loader: (url: string) => Promise<string> = loadCompositionImage,
): Promise<
  Array<T & { imageDataUrl: string | null; imageRequested: boolean }>
> {
  const cache = new Map<string, Promise<string | null>>();
  return await Promise.all(
    sources.map(async (source) => {
      const imageRequested = typeof source.imageUrl === 'string' &&
        source.imageUrl.length > 0;
      if (!imageRequested) {
        return { ...source, imageDataUrl: null, imageRequested: false };
      }
      const imageUrl = source.imageUrl!;
      if (!cache.has(imageUrl)) {
        cache.set(imageUrl, loader(imageUrl).catch(() => null));
      }
      return {
        ...source,
        imageDataUrl: await cache.get(imageUrl)!,
        imageRequested: true,
      };
    }),
  );
}
