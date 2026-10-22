/**
 * US-49 — the plate crop geometry the studio previews, so a focal frame and
 * the Press band show the crop the client page is actually served.
 *
 * `plateCropRect` is the centring/containment math of the media worker's
 * `fittedCrop` (infra/media-worker/container/plates.mjs:53–103), ported
 * without the floors: centre the crop on the focal point (the thirds bias
 * when there is none), keep it inside the source and around the subject box.
 * Containment wins over centring; no crop exists when the subject is longer
 * than the crop. No subject box constrains nothing.
 *
 * `heroEligible` is the client page's cover choice (apps/client-portal
 * src/lib/editorial/rank.ts heroEligible + floors.ts meetsHero), so the band
 * can say whether the page opens on a photograph before any edition exists.
 */

export type PlatePoint = [number, number];
export type PlateBox = [number, number, number, number];
export type PlateRect = [number, number, number, number];

export interface PlateSource {
  width: number;
  height: number;
  /** [x, y], each 0–1; null → the worker's thirds bias. */
  focal?: readonly number[] | null;
  /** [x, y, w, h], each 0–1; null → no containment. */
  subjectBox?: readonly number[] | null;
}

/** plates.mjs DEFAULT_CENTRE: the crop centre when no focal point is given. */
export const DEFAULT_CENTRE: PlatePoint = [0.5, 0.45];

/** The two delivered cover crops (plates.mjs PLATE_CROPS aspects). */
export const COVER_ASPECT = { wide: 1.6, cover_phone: 39 / 34 } as const;

/** Largest rect of `aspect` that fits inside width × height (plates.mjs maxRectSize). */
export function maxRectSize(width: number, height: number, aspect: number): [number, number] {
  if (width / height > aspect) return [Math.round(height * aspect), height];
  return [width, Math.round(width / aspect)];
}

function axisOffset(
  cropLength: number,
  sourceLength: number,
  centre: number,
  subjectStart: number,
  subjectEnd: number,
): number | null {
  const min = Math.max(0, subjectEnd - cropLength);
  const max = Math.min(sourceLength - cropLength, subjectStart);
  if (min > max) return null;
  return Math.min(max, Math.max(min, Math.round(centre - cropLength / 2)));
}

function subjectSpan(subjectBox: readonly number[] | null | undefined, width: number, height: number) {
  if (!subjectBox || subjectBox.length !== 4) return { left: width, right: 0, top: height, bottom: 0 };
  const [x, y, w, h] = subjectBox;
  const floor = (v: number) => Math.floor(v + 1e-6);
  const ceil = (v: number) => Math.ceil(v - 1e-6);
  return {
    left: Math.max(0, floor(x * width)),
    right: Math.min(width, ceil((x + w) * width)),
    top: Math.max(0, floor(y * height)),
    bottom: Math.min(height, ceil((y + h) * height)),
  };
}

/** The crop rect [left, top, width, height] in source pixels, or null. */
export function plateCropRect(source: PlateSource, aspect: number): PlateRect | null {
  const { width, height } = source;
  if (!(width > 0 && height > 0)) return null;
  const [cw, ch] = maxRectSize(width, height, aspect);
  const [fx, fy] = source.focal?.length === 2 ? source.focal : DEFAULT_CENTRE;
  const span = subjectSpan(source.subjectBox, width, height);
  const left = axisOffset(cw, width, fx * width, span.left, span.right);
  const top = axisOffset(ch, height, fy * height, span.top, span.bottom);
  if (left === null || top === null) return null;
  return [left, top, cw, ch];
}

/** The visible part of the source as fractions: left/top and its width/height. */
export interface PlateWindow {
  left: number;
  top: number;
  vx: number;
  vy: number;
}

/**
 * The window a crop of `aspect` shows. Where the worker cuts no crop (the
 * subject cannot be held) the preview centres on the point unconstrained.
 */
export function plateCropWindow(source: PlateSource, aspect: number): PlateWindow {
  const rect =
    plateCropRect(source, aspect) ?? plateCropRect({ ...source, subjectBox: null }, aspect);
  if (!rect) return { left: 0, top: 0, vx: 1, vy: 1 };
  const [left, top, cw, ch] = rect;
  return {
    left: left / source.width,
    top: top / source.height,
    vx: cw / source.width,
    vy: ch / source.height,
  };
}

/** The CSS object-position that makes an object-fit: cover frame show `window`. */
export function objectPositionOf({ left, top, vx, vy }: PlateWindow): string {
  const x = vx < 1 ? (left / (1 - vx)) * 100 : 50;
  const y = vy < 1 ? (top / (1 - vy)) * 100 : 50;
  return `${x}% ${y}%`;
}

// ── The client page's cover choice (client-portal floors.ts / rank.ts) ──────

const MAX_DISCARD = 0.5;
const HERO_DESKTOP = { aspect: 1.6, floor: { w: 1600, h: 1000 } };
const HERO_PHONE = { aspect: 39 / 34, floor: { w: 780, h: 680 } };
const HERO_MEASURE_MIN_WIDTH = 1248;
const HERO_PORTRAIT_MIN_WIDTH = 1040;

function cropBox(aspect: number, width: number, height: number) {
  if (width / height > aspect) return { w: Math.floor(height * aspect), h: height };
  return { w: width, h: Math.floor(width / aspect) };
}

function meetsCropped(
  spec: { aspect: number; floor: { w: number; h: number } },
  width: number,
  height: number,
  subjectBox: readonly number[] | null | undefined,
): boolean {
  if (!(width > 0 && height > 0)) return false;
  const box = cropBox(spec.aspect, width, height);
  const keepsEnough = box.w * box.h >= (1 - MAX_DISCARD) * width * height;
  const holds =
    !subjectBox ||
    (subjectBox[2] <= box.w / width + 1e-9 && subjectBox[3] <= box.h / height + 1e-9);
  return keepsEnough && holds && box.w >= spec.floor.w && box.h >= spec.floor.h;
}

function meetsHero(width: number, height: number, subjectBox: readonly number[] | null | undefined) {
  if (!meetsCropped(HERO_PHONE, width, height, subjectBox)) return false;
  return (
    meetsCropped(HERO_DESKTOP, width, height, subjectBox) ||
    meetsCropped({ ...HERO_DESKTOP, floor: { w: HERO_MEASURE_MIN_WIDTH, h: 0 } }, width, height, subjectBox) ||
    (height > width && width >= HERO_PORTRAIT_MIN_WIDTH)
  );
}

const PHOTOGRAPH_KINDS = new Set(['installed', 'scan', 'board', 'upload', 'maker']);

/**
 * May this asset be the client page's cover: a job photograph (never a
 * concept render, a drawing sheet or a white-ground clipping) that meets the
 * phone cover floor and one desktop cover layout.
 */
export function heroEligible(asset: {
  sourceKind: string | null;
  ground: string | null;
  width: number;
  height: number;
  subjectBox?: readonly number[] | null;
}): boolean {
  if (!asset.sourceKind || !PHOTOGRAPH_KINDS.has(asset.sourceKind) || asset.ground === 'white') return false;
  return meetsHero(asset.width, asset.height, asset.subjectBox);
}
