/**
 * Type-floor assertion for R7 lifecycle surfaces (WP4 Track 3).
 *
 * Catches BOTH unit forms Tailwind arbitrary-value classes use for type size —
 * `text-[12px]` and `text-[0.6rem]` — because an adversarial review caught a
 * rem-vs-px drift the first pass of the plain `text-\[1[01]px\]` regex missed
 * entirely: `text-[0.55rem]` (8.8px) and `text-[0.6rem]` (9.6px) both slipped
 * under the 12px floor undetected. Assumes the browser default 16px root.
 */
const TEXT_SIZE_CLASS = /text-\[([\d.]+)(px|rem)\]/g;

const REM_TO_PX = 16;

/** Every `text-[…]` arbitrary-size class found in `html`, resolved to px. */
export function textSizeClassesPx(html: string): number[] {
  const sizes: number[] = [];
  for (const match of html.matchAll(TEXT_SIZE_CLASS)) {
    const value = Number(match[1]);
    const unit = match[2];
    sizes.push(unit === "rem" ? value * REM_TO_PX : value);
  }
  return sizes;
}

/**
 * Asserts every arbitrary-value `text-[…]` class in `html` meets the 12px
 * metadata floor, in whichever unit it was authored — px or rem alike.
 */
export function expectNoSubFloorType(html: string, floorPx = 12): void {
  const sizes = textSizeClassesPx(html);
  const offenders = sizes.filter((px) => px < floorPx);
  if (offenders.length > 0) {
    throw new Error(
      `Found ${offenders.length} text size(s) below the ${floorPx}px floor: ${offenders.join(", ")}px`,
    );
  }
}
