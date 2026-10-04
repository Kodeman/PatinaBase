/**
 * Deterministic picture roles. Geometry and text signals decide first; pixel
 * signals (alpha, border uniformity) are optional and only measured once the
 * crop stage has decoded the image.
 */
import type { ElementKind, ElementRole, ExtractedFields } from "./manifest";

export interface PixelSignals {
  /** Any meaningfully transparent pixel (a cut-out). */
  hasAlpha: boolean;
  /** Share of border pixels close to the border's median colour (0..1). */
  borderUniformity: number;
}

export interface RoleSignals {
  kind: ElementKind;
  /** Picture area / slide area. */
  areaFraction: number;
  hasLink: boolean;
  extracted: ExtractedFields;
  hasCaption: boolean;
  pixels?: PixelSignals;
}

// A corner logo is ~0.5% of the slide; a six-up grid thumbnail ~2.5%. Keep the
// logo band below the smallest thumbnails so they stay on the board.
export const ICON_AREA = 0.008;
export const ORNAMENT_AREA = 0.002;

export function classifyRole(s: RoleSignals): ElementRole {
  if (s.kind === "background") return "background";
  if (s.hasLink || s.extracted.price_cents != null) return "product";
  if (s.areaFraction < ORNAMENT_AREA) return "decoration";
  if (s.areaFraction < ICON_AREA) return "logo";
  if (s.extracted.sku || s.extracted.dims || s.extracted.vendor)
    return "product";
  if (
    s.pixels &&
    (s.pixels.hasAlpha || s.pixels.borderUniformity >= 0.95) &&
    s.pixels.borderUniformity >= 0.9
  ) {
    return "product";
  }
  return "reference";
}

/**
 * Pixel signals from RGBA data (e.g. a downscaled `getImageData`). The border
 * is the outermost ring of pixels; uniform = within 24 per channel of its median.
 */
export function measurePixelSignals(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): PixelSignals {
  const border: number[] = [];
  let hasAlpha = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 200) hasAlpha = true;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1)
        border.push(i);
    }
  }
  if (border.length === 0) return { hasAlpha, borderUniformity: 0 };
  const median = [0, 1, 2, 3].map((c) => {
    const values = border.map((i) => rgba[i + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  });
  const close = border.filter((i) =>
    [0, 1, 2, 3].every((c) => Math.abs(rgba[i + c] - median[c]) <= 24),
  ).length;
  return { hasAlpha, borderUniformity: close / border.length };
}
