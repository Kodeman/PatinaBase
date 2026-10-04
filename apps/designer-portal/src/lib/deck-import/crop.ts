/**
 * Applies `a:srcRect` (negative = transparent padding) and the frame's flips,
 * scales to the frame's aspect, and encodes webp with the long edge ≤ 2048 px
 * (the SQ-348 embed cap). All canvas work sits behind `DeckImageCodec`, so the
 * planning and orchestration are testable without a canvas.
 */
import type { DeckManifest, ManifestElement, SrcRect } from "./manifest";

export const DECK_CROP_MAX_EDGE = 2048;
/** Refuse to decode anything larger than 32 megapixels (read from the header first). */
export const MAX_DECODED_PIXELS = 32_000_000;
const WEBP_QUALITY = 0.9;

export interface CropPlan {
  canvasWidth: number;
  canvasHeight: number;
  /** Source rectangle in image pixels (the visible part of the image). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rectangle on the canvas (offset by any padding). */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  flipH: boolean;
  flipV: boolean;
}

/**
 * The srcRect region is `[l·W, (1−r)·W] × [t·H, (1−b)·H]`; outside the image it
 * is padding. The output keeps the frame aspect (pictures stretch to fill their
 * frame) and the region's pixel density, capped at `maxEdge`.
 */
export function planCrop(
  imageWidth: number,
  imageHeight: number,
  src: SrcRect | null,
  frame: { w: number; h: number } | null = null,
  options: { maxEdge?: number; flipH?: boolean; flipV?: boolean } = {},
): CropPlan | null {
  const { l = 0, t = 0, r = 0, b = 0 } = src ?? {};
  const x0 = l * imageWidth;
  const x1 = (1 - r) * imageWidth;
  const y0 = t * imageHeight;
  const y1 = (1 - b) * imageHeight;
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  if (!(regionW > 0 && regionH > 0)) return null;
  const ix0 = Math.max(0, x0);
  const ix1 = Math.min(imageWidth, x1);
  const iy0 = Math.max(0, y0);
  const iy1 = Math.min(imageHeight, y1);
  if (ix1 <= ix0 || iy1 <= iy0) return null;

  let outW = regionW;
  let outH = regionH;
  if (frame && frame.w > 0 && frame.h > 0) {
    const aspect = frame.w / frame.h;
    if (regionW / regionH >= aspect) outH = regionW / aspect;
    else outW = regionH * aspect;
  }
  const scale = Math.min(
    1,
    (options.maxEdge ?? DECK_CROP_MAX_EDGE) / Math.max(outW, outH),
  );
  const canvasWidth = Math.max(1, Math.round(outW * scale));
  const canvasHeight = Math.max(1, Math.round(outH * scale));
  const kx = canvasWidth / regionW;
  const ky = canvasHeight / regionH;
  return {
    canvasWidth,
    canvasHeight,
    sx: ix0,
    sy: iy0,
    sw: ix1 - ix0,
    sh: iy1 - iy0,
    dx: (ix0 - x0) * kx,
    dy: (iy0 - y0) * ky,
    dw: (ix1 - ix0) * kx,
    dh: (iy1 - iy0) * ky,
    flipH: options.flipH ?? false,
    flipV: options.flipV ?? false,
  };
}

/** Pixel size from the file header, without decoding: PNG, JPEG, GIF, WebP, BMP. */
export function readImageSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const be16 = (o: number) => (bytes[o] << 8) | bytes[o + 1];
  const le16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
  const be32 = (o: number) => be16(o) * 0x10000 + be16(o + 2);
  const le32 = (o: number) => le16(o) + le16(o + 2) * 0x10000;
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { width: be32(16), height: be32(20) };
  }
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return { width: le16(6), height: le16(8) };
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: Math.abs(le32(18) | 0), height: Math.abs(le32(22) | 0) };
  }
  if (bytes.length >= 30 && le32(0) === 0x46464952 && le32(8) === 0x50424557) {
    const chunk = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15],
    );
    if (chunk === "VP8X")
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    if (chunk === "VP8 ")
      return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    if (chunk === "VP8L") {
      const v = le32(21);
      return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) };
    }
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) return null;
      const marker = bytes[o + 1];
      if (
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        o += 2;
        continue;
      }
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { width: be16(o + 7), height: be16(o + 5) };
      }
      o += 2 + be16(o + 2);
    }
  }
  return null;
}

export interface DecodedDeckImage {
  width: number;
  height: number;
  source: unknown;
  close(): void;
}

export interface DeckImageCodec {
  decode(bytes: Uint8Array, mimeType: string): Promise<DecodedDeckImage>;
  /** Draws `plan` from the decoded image and encodes it (webp). */
  render(
    image: DecodedDeckImage,
    plan: CropPlan,
    quality: number,
  ): Promise<Blob>;
}

export type CropResult =
  | { element_key: string; ok: true; blob: Blob; width: number; height: number }
  | {
      element_key: string;
      ok: false;
      reason:
        | "missing_media"
        | "image_too_large"
        | "decode_failed"
        | "empty_crop";
    };

/**
 * Decodes each media part once and crops every element that uses it. `media`
 * entries are released as soon as they are decoded.
 */
export async function cropDeckElements(
  manifest: Pick<DeckManifest, "elements">,
  media: Map<string, Uint8Array>,
  codec: DeckImageCodec,
  options: {
    maxEdge?: number;
    concurrency?: number;
    onResult?: (result: CropResult) => void;
  } = {},
): Promise<CropResult[]> {
  const byMedia = new Map<string, ManifestElement[]>();
  for (const element of manifest.elements) {
    if (!element.media) continue;
    byMedia.set(element.media, [
      ...(byMedia.get(element.media) ?? []),
      element,
    ]);
  }
  const results: CropResult[] = [];
  const emit = (result: CropResult) => {
    results.push(result);
    options.onResult?.(result);
  };
  const queue = [...byMedia.entries()];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [part, elements] = job;
      const bytes = media.get(part);
      const type = elements[0].media_type;
      if (!bytes || !type) {
        elements.forEach((e) =>
          emit({
            element_key: e.element_key,
            ok: false,
            reason: "missing_media",
          }),
        );
        continue;
      }
      const size = readImageSize(bytes);
      if (size && size.width * size.height > MAX_DECODED_PIXELS) {
        media.delete(part);
        elements.forEach((e) =>
          emit({
            element_key: e.element_key,
            ok: false,
            reason: "image_too_large",
          }),
        );
        continue;
      }
      let image: DecodedDeckImage;
      try {
        image = await codec.decode(bytes, type);
      } catch {
        elements.forEach((e) =>
          emit({
            element_key: e.element_key,
            ok: false,
            reason: "decode_failed",
          }),
        );
        continue;
      } finally {
        media.delete(part);
      }
      try {
        for (const e of elements) {
          const plan = planCrop(image.width, image.height, e.src_rect, e.bbox, {
            maxEdge: options.maxEdge,
            flipH: e.flip_h,
            flipV: e.flip_v,
          });
          if (!plan) {
            emit({
              element_key: e.element_key,
              ok: false,
              reason: "empty_crop",
            });
            continue;
          }
          const blob = await codec.render(image, plan, WEBP_QUALITY);
          emit({
            element_key: e.element_key,
            ok: true,
            blob,
            width: plan.canvasWidth,
            height: plan.canvasHeight,
          });
        }
      } finally {
        image.close();
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker),
  );
  return results;
}

/** createImageBitmap + OffscreenCanvas; works on the main thread and in workers. */
export function createCanvasCodec(): DeckImageCodec {
  return {
    async decode(bytes, mimeType) {
      const bitmap = await createImageBitmap(
        new Blob([bytes as BlobPart], { type: mimeType }),
      );
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      };
    },
    async render(image, plan, quality) {
      const canvas = new OffscreenCanvas(plan.canvasWidth, plan.canvasHeight);
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("The browser could not create an image canvas");
      context.translate(
        plan.flipH ? plan.canvasWidth : 0,
        plan.flipV ? plan.canvasHeight : 0,
      );
      context.scale(plan.flipH ? -1 : 1, plan.flipV ? -1 : 1);
      context.drawImage(
        image.source as CanvasImageSource,
        plan.sx,
        plan.sy,
        plan.sw,
        plan.sh,
        plan.dx,
        plan.dy,
        plan.dw,
        plan.dh,
      );
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      if (blob.type !== "image/webp")
        throw new Error(`The browser encoded ${blob.type}, not webp`);
      return blob;
    },
  };
}
