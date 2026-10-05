// board-deck-import-resolve · a crop's identity: sha256 of its bytes and its
// 64-bit dHash (phash.ts).
//
// Deck crops are WebP (the browser encodes them, designer-portal
// lib/deck-import/crop.ts), so the pixels come from libwebp's decoder compiled
// to WASM (@jsquash/webp, ~140 KB). The .wasm file is read from the npm
// package with Deno.readFile(import.meta.resolve(...)), the pattern Supabase
// documents for WASM image libraries in edge functions. Anything that is not
// WebP, or does not decode, gets no phash: T1 then matches it by cosine only.

import decodeWebp, { init as initWebp } from 'npm:@jsquash/webp@1.5.0/decode.js';
import { type CropSignature, dHash, toPgBigint } from './phash.ts';

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

export function isWebp(bytes: Uint8Array): boolean {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP';
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cropSignature(bytes: Uint8Array<ArrayBuffer>): Promise<CropSignature> {
  const image_hash = await sha256Hex(bytes);
  if (!isWebp(bytes)) return { image_hash, phash: null };
  try {
    await loadWebp();
    const image = await decodeWebp(bytes.slice().buffer);
    return { image_hash, phash: toPgBigint(dHash(image.data, image.width, image.height)) };
  } catch {
    return { image_hash, phash: null };
  }
}
