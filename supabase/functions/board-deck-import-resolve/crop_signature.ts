// board-deck-import-resolve · a crop's identity: sha256 of its bytes and its
// 64-bit dHash (phash.ts).
//
// Deck crops are WebP (the browser encodes them, designer-portal
// lib/deck-import/crop.ts), so the pixels come from libwebp's decoder compiled
// to WASM (@jsquash/webp, ~140 KB). The .wasm file is read from the npm
// package with Deno.readFile(import.meta.resolve(...)), the pattern Supabase
// documents for WASM image libraries in edge functions. Anything that is not
// WebP, declares more than WEBP_MAX_EDGE, does not decode, or hashes to a
// degenerate dHash (a uniform crop), gets no phash: T1 then matches it by
// cosine only.

import decodeWebp, { init as initWebp } from 'npm:@jsquash/webp@1.5.0/decode.js';
import { type CropSignature, dHash, isDegenerateHash, toPgBigint } from './phash.ts';

/** Deck crops are at most 2048 px on the long edge (designer-portal
 *  DECK_CROP_MAX_EDGE); a crop declaring more than this is never decoded. */
export const WEBP_MAX_EDGE = 2048;

type Decode = (buffer: ArrayBuffer) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>;

let webpReady: Promise<void> | null = null;

function loadWebp(): Promise<void> {
  webpReady ??= (async () => {
    const wasm = await Deno.readFile(
      new URL('codec/dec/webp_dec.wasm', import.meta.resolve('npm:@jsquash/webp@1.5.0')),
    );
    await initWebp(await WebAssembly.compile(wasm));
  })();
  return webpReady;
}

const decodeDefault: Decode = async (buffer) => {
  await loadWebp();
  return await decodeWebp(buffer);
};

export function isWebp(bytes: Uint8Array): boolean {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP';
}

/** The canvas a WebP declares in its first chunk (VP8, VP8L or VP8X), read
 *  from the header alone; null when the first chunk is none of those. */
export function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isWebp(bytes) || bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  const at = (i: number) => bytes[20 + i];
  if (chunk === 'VP8 ') {
    if (at(3) !== 0x9d || at(4) !== 0x01 || at(5) !== 0x2a) return null;
    return { width: (at(6) | (at(7) << 8)) & 0x3fff, height: (at(8) | (at(9) << 8)) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (at(0) !== 0x2f) return null;
    const bits = (at(1) | (at(2) << 8) | (at(3) << 16) | (at(4) << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return {
      width: (at(4) | (at(5) << 8) | (at(6) << 16)) + 1,
      height: (at(7) | (at(8) << 8) | (at(9) << 16)) + 1,
    };
  }
  return null;
}

/** The response body read chunk by chunk, abandoned (null) past maxBytes. */
export async function readCappedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cropSignature(
  bytes: Uint8Array<ArrayBuffer>,
  decode: Decode = decodeDefault,
): Promise<CropSignature> {
  const image_hash = await sha256Hex(bytes);
  // A few header bytes can declare a ~1 GB canvas: check before decoding.
  const size = webpDimensions(bytes);
  if (!size || size.width > WEBP_MAX_EDGE || size.height > WEBP_MAX_EDGE) {
    return { image_hash, phash: null };
  }
  try {
    const image = await decode(bytes.slice().buffer);
    const hash = dHash(image.data, image.width, image.height);
    return { image_hash, phash: isDegenerateHash(hash) ? null : toPgBigint(hash) };
  } catch {
    return { image_hash, phash: null };
  }
}
