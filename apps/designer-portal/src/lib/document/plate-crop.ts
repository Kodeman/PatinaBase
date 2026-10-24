/**
 * US-49 — the plate crop geometry the studio previews, so a focal frame and
 * the Press band show the crop the client page is actually served.
 *
 * `plateCropRect` is the centring/containment math of the media worker's
 * `fittedCrop` (infra/media-worker/container/plates.mjs): centre the crop on
 * the focal point (the thirds bias when there is none), keep it inside the
 * source and around the subject box. Containment wins over centring; no crop
 * exists when the subject is longer than the crop. No subject box constrains
 * nothing. `plateCrop` adds the worker's floors and its ground selection (a
 * white-ground picture is cut only as a pair and a piece), so it is null
 * exactly when planCrops cuts no such crop; `plateCrops` is every crop it cuts.
 *
 * `heroEligible` is the client page's cover choice (apps/client-portal
 * src/lib/editorial/rank.ts heroEligible + floors.ts meetsHero), so the band
 * can say whether the page opens on a photograph before any edition exists;
 * `coverCropShown` is the crop the page then draws (crop.ts heroPicture).
 */

export { arrivalMode, arrivalRendition, selectArrival, type ArrivalAsset } from '@patina/utils';

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
  /** The worker's ground ('white' | 'scene' | 'drawing'); null → unknown, no ground rule. */
  ground?: string | null;
}

/** plates.mjs DEFAULT_CENTRE: the crop centre when no focal point is given. */
export const DEFAULT_CENTRE: PlatePoint = [0.5, 0.45];

/** The worker's crops (plates.mjs PLATE_CROPS): aspect (null = the whole source) and hard floor. */
export const PLATE_CROPS = {
  wide: { aspect: 1.6, minWidth: 1600, minHeight: 1000 },
  cover_phone: { aspect: 39 / 34, minWidth: 780, minHeight: 680 },
  tall: { aspect: 0.46, minWidth: 780, minHeight: 1696 },
  wide32: { aspect: 3 / 2, minWidth: 1248, minHeight: 832 },
  pair: { aspect: 7 / 5, minWidth: 716, minHeight: 0 },
  piece: { aspect: null, minWidth: 330, minHeight: 0 },
} as const;
export type PlateCropKey = keyof typeof PLATE_CROPS;
/** The crops a cover can be drawn from. */
export type CoverCropKey = 'wide' | 'cover_phone' | 'tall' | 'wide32';

/** plates.mjs WHITE_GROUND_CROPS: the only crops cut from a white-ground picture. */
const WHITE_GROUND_CROPS: ReadonlySet<PlateCropKey> = new Set(['pair', 'piece']);

/** plates.mjs MAX_DISCARD (and floors.ts): a crop may drop at most half the source. */
const MAX_DISCARD = 0.5;

/** The two delivered cover crops' aspects. */
export const COVER_ASPECT = { wide: PLATE_CROPS.wide.aspect, cover_phone: PLATE_CROPS.cover_phone.aspect } as const;

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

/**
 * The rect the worker cuts for `key`, or null when planCrops cuts none: a
 * white ground rules the crop out, the source is under the crop's floor, the
 * crop would drop more than half of it, or the subject box cannot be held.
 */
export function plateCrop(source: PlateSource, key: PlateCropKey): PlateRect | null {
  const spec = PLATE_CROPS[key];
  const { width, height } = source;
  if (!(width > 0 && height > 0)) return null;
  if (source.ground === 'white' && !WHITE_GROUND_CROPS.has(key)) return null;
  if (spec.aspect === null) {
    return width >= spec.minWidth && height >= spec.minHeight ? [0, 0, width, height] : null;
  }
  const [cw, ch] = maxRectSize(width, height, spec.aspect);
  const floored =
    cw >= spec.minWidth && ch >= spec.minHeight && 1 - (cw * ch) / (width * height) <= MAX_DISCARD;
  return floored ? plateCropRect(source, spec.aspect) : null;
}

/**
 * Every crop planCrops cuts from this source, by key (the source-kind sheet
 * and board plates aside).
 */
export function plateCrops(source: PlateSource): Partial<Record<PlateCropKey, PlateRect>> {
  const crops: Partial<Record<PlateCropKey, PlateRect>> = {};
  for (const key of Object.keys(PLATE_CROPS) as PlateCropKey[]) {
    const rect = plateCrop(source, key);
    if (rect) crops[key] = rect;
  }
  return crops;
}

/** The visible part of the source as fractions: left/top and its width/height. */
export interface PlateWindow {
  left: number;
  top: number;
  vx: number;
  vy: number;
}

/** The window the worker's `key` crop shows; null when it cuts no such crop. */
export function plateCropWindow(source: PlateSource, key: PlateCropKey): PlateWindow | null {
  const rect = plateCrop(source, key);
  if (!rect) return null;
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

type HeroLayout = 'bleed' | 'measure' | 'portrait';

/** The cover's desktop layout (client-portal floors.ts heroDesktopLayout). */
function heroLayout(
  width: number,
  height: number,
  subjectBox: readonly number[] | null | undefined,
): HeroLayout | null {
  if (meetsCropped(HERO_DESKTOP, width, height, subjectBox)) return 'bleed';
  const measure = { ...HERO_DESKTOP, floor: { w: HERO_MEASURE_MIN_WIDTH, h: 0 } };
  if (meetsCropped(measure, width, height, subjectBox)) return 'measure';
  if (height > width && width >= HERO_PORTRAIT_MIN_WIDTH) return 'portrait';
  return null;
}

function meetsHero(width: number, height: number, subjectBox: readonly number[] | null | undefined) {
  return meetsCropped(HERO_PHONE, width, height, subjectBox) && heroLayout(width, height, subjectBox) !== null;
}

/** Each layout's own crop first, then the crops the worker does cut (crop.ts HERO_CROPS). */
const HERO_CROPS: Readonly<Record<HeroLayout, readonly CoverCropKey[]>> = {
  bleed: ['wide', 'cover_phone'],
  measure: ['wide', 'wide32', 'cover_phone'],
  portrait: ['tall', 'cover_phone'],
};

/**
 * The crop the client page draws a cover from (crop.ts heroPicture): on a
 * desktop its layout's first crop the worker cut; on a phone `cover_phone`,
 * else that desktop crop. Null when the worker cut none of them.
 */
export function coverCropShown(source: PlateSource, screen: 'desktop' | 'phone'): CoverCropKey | null {
  const layout = heroLayout(source.width, source.height, source.subjectBox) ?? 'bleed';
  const desktop = HERO_CROPS[layout].find((key) => plateCrop(source, key) !== null) ?? null;
  if (screen === 'desktop') return desktop;
  return plateCrop(source, 'cover_phone') ? 'cover_phone' : desktop;
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


