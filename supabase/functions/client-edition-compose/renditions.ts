// The pictures a model sees: each plate's own full-frame rendition (the `piece`
// crop: uncropped, written once per sha256 by the plate copier), read from the
// media worker's GET /plates/{projectId}/{sha256}/piece-{512|768}.webp with the
// plate bearer. Bytes bound to the asset's sha256, already sized, never the
// original address. A picture that cannot be read, is not WebP or is too large
// is dropped on its own; it never fails the call it would have joined.

import type { FactsAsset } from "./prompts.ts";

/** Perception reads the larger width, the hero pick the smaller; either falls back to the other. */
const WIDTHS = { perceive: [768, 512], hero: [512, 768] } as const;
export type RenditionUse = keyof typeof WIDTHS;

export const RENDITION_MAX_BYTES = 2_000_000;
export const RENDITION_TIMEOUT_MS = 8_000;

/** GET one plate file from the media worker within `timeoutMs`; `path` starts at /plates/. */
export type Media = (path: string, timeoutMs: number) => Promise<Response>;

export function mediaWorker(baseUrl: string, secret: string, fetcher: typeof fetch = fetch): Media {
  const origin = baseUrl.replace(/\/+$/, "");
  return (path, timeoutMs) =>
    fetcher(`${origin}${path}`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(timeoutMs) });
}

/** No media worker configured: every picture is unavailable, so none is sent. */
export const noMedia: Media = () => Promise.resolve(new Response(null, { status: 404 }));

export function renditionPath(projectId: string, asset: FactsAsset, use: RenditionUse): string | null {
  const widths = asset.crops?.piece?.widths ?? [];
  const width = WIDTHS[use].find((candidate) => widths.includes(candidate));
  return width ? `/plates/${projectId}/${asset.sha256}/piece-${width}.webp` : null;
}

/** RIFF....WEBP */
function isWebp(bytes: Uint8Array): boolean {
  const tag = (start: number) => String.fromCharCode(...bytes.subarray(start, start + 4));
  return bytes.length > 12 && tag(0) === "RIFF" && tag(8) === "WEBP";
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function joined(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** The stream's bytes, or null once they pass `max` (the rest is not read). */
async function readUpTo(reader: ReadableStreamDefaultReader<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  return joined(chunks, size);
}

/** The body, or null when it declares or reaches more than `max` bytes; a body not read is canceled. */
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!response.body) return null;
  if (declared > max) {
    await response.body.cancel();
    return null;
  }
  return await readUpTo(response.body.getReader(), max);
}

function servedWebp(response: Response): boolean {
  return response.status === 200 && response.headers.get("content-type") === "image/webp";
}

async function bytesOf(response: Response): Promise<Uint8Array | null> {
  if (!servedWebp(response)) {
    await response.body?.cancel();
    return null;
  }
  const bytes = await readCapped(response, RENDITION_MAX_BYTES);
  return bytes && isWebp(bytes) ? bytes : null;
}

/** The picture as base64 WebP, or null when it cannot be read within `timeoutMs`. */
export async function readRendition(
  media: Media,
  projectId: string,
  asset: FactsAsset,
  use: RenditionUse,
  timeoutMs: number,
): Promise<string | null> {
  const path = renditionPath(projectId, asset, use);
  if (!path || timeoutMs <= 0) return null;
  try {
    const bytes = await bytesOf(await media(path, timeoutMs));
    return bytes ? toBase64(bytes) : null;
  } catch {
    return null;
  }
}
