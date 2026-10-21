/* PLAN floors table (Image system → Floors and crops). Device pixels after the
   crop; below a floor a plate drops one role; nothing is ever upscaled. */

import type { PlateCropKey, Rect } from './types';

export type PlateRole =
  | 'hero'
  | 'room'
  | 'held'
  | 'pair'
  | 'piece'
  | 'sheet'
  | 'board'
  | 'plan'
  | 'swatch'
  | 'silhouette';

export interface FloorSpec {
  crop: PlateCropKey;
  /** Width ÷ height of the crop; null for an uncropped plate. */
  aspect: number | null;
  target: { w: number; h: number };
  floor: { w: number; h: number };
}

export const FLOORS = {
  heroDesktop: { crop: 'wide', aspect: 1.6, target: { w: 2048, h: 1280 }, floor: { w: 1600, h: 1000 } },
  heroPhone: { crop: 'cover_phone', aspect: 39 / 34, target: { w: 1080, h: 942 }, floor: { w: 780, h: 680 } },
  held: { crop: 'tall', aspect: 0.46, target: { w: 1080, h: 2348 }, floor: { w: 780, h: 1696 } },
  room: { crop: 'wide32', aspect: 3 / 2, target: { w: 2048, h: 1365 }, floor: { w: 1248, h: 832 } },
  pair: { crop: 'pair', aspect: 7 / 5, target: { w: 1224, h: 0 }, floor: { w: 716, h: 0 } },
  piece: { crop: 'piece', aspect: null, target: { w: 564, h: 0 }, floor: { w: 330, h: 0 } },
  sheet: { crop: 'none', aspect: null, target: { w: 2496, h: 0 }, floor: { w: 2048, h: 0 } },
  board: { crop: 'none', aspect: null, target: { w: 2400, h: 1600 }, floor: { w: 1600, h: 0 } },
} as const satisfies Record<string, FloorSpec>;

/** The desktop hero's narrower measure plate: 1248–1600 wide. */
export const HERO_MEASURE_MIN_WIDTH = 1248;
/** A portrait-only source still covers the 4:5 desktop template at 2×. */
export const HERO_PORTRAIT_MIN_WIDTH = 1040;
/** A crop may discard at most half the source. */
export const MAX_DISCARD = 0.5;

/** The role a plate falls to when its source misses the floor. */
export const DROP: Readonly<Record<PlateRole, PlateRole>> = {
  hero: 'room',
  held: 'room',
  room: 'pair',
  pair: 'piece',
  piece: 'silhouette',
  sheet: 'plan',
  board: 'piece',
  plan: 'plan',
  swatch: 'swatch',
  silhouette: 'silhouette',
};

/** The largest box of `aspect` inside the source, in whole pixels. */
export function cropBox(aspect: number, width: number, height: number): { w: number; h: number } {
  if (width / height > aspect) return { w: Math.floor(height * aspect), h: height };
  return { w: width, h: Math.floor(width / aspect) };
}

function holdsSubject(box: { w: number; h: number }, width: number, height: number, subject?: Rect | null) {
  if (!subject) return true;
  return subject[2] <= box.w / width + 1e-9 && subject[3] <= box.h / height + 1e-9;
}

/** Contain (piece) fits the long edge; sheets and boards are read across. */
function meetsUncropped(spec: FloorSpec, width: number, height: number): boolean {
  const edge = spec.crop === 'piece' ? Math.max(width, height) : width;
  return edge >= spec.floor.w && height >= spec.floor.h;
}

function meetsCropped(aspect: number, spec: FloorSpec, width: number, height: number, subjectBox?: Rect | null) {
  const box = cropBox(aspect, width, height);
  const keepsEnough = box.w * box.h >= (1 - MAX_DISCARD) * width * height;
  return keepsEnough && holdsSubject(box, width, height, subjectBox) && box.w >= spec.floor.w && box.h >= spec.floor.h;
}

export function meetsFloor(spec: FloorSpec, width: number, height: number, subjectBox?: Rect | null): boolean {
  if (!(width > 0 && height > 0)) return false;
  if (spec.aspect === null) return meetsUncropped(spec, width, height);
  return meetsCropped(spec.aspect, spec, width, height, subjectBox);
}

export type HeroDesktopLayout = 'bleed' | 'measure' | 'portrait';

export function heroDesktopLayout(width: number, height: number, subjectBox?: Rect | null): HeroDesktopLayout | null {
  if (meetsFloor(FLOORS.heroDesktop, width, height, subjectBox)) return 'bleed';
  const measure = { ...FLOORS.heroDesktop, floor: { w: HERO_MEASURE_MIN_WIDTH, h: 0 } };
  if (meetsFloor(measure, width, height, subjectBox)) return 'measure';
  if (height > width && width >= HERO_PORTRAIT_MIN_WIDTH) return 'portrait';
  return null;
}

function meetsHero(width: number, height: number, subjectBox?: Rect | null): boolean {
  return meetsFloor(FLOORS.heroPhone, width, height, subjectBox) && heroDesktopLayout(width, height, subjectBox) !== null;
}

type FlooredRole = 'held' | 'room' | 'pair' | 'piece' | 'sheet' | 'board';
const FLOORED_ROLES: readonly PlateRole[] = ['held', 'room', 'pair', 'piece', 'sheet', 'board'];

function meetsRole(role: PlateRole, width: number, height: number, subjectBox?: Rect | null): boolean {
  if (role === 'hero') return meetsHero(width, height, subjectBox);
  if (!FLOORED_ROLES.includes(role)) return true;
  return meetsFloor(FLOORS[role as FlooredRole], width, height, subjectBox);
}

/** The role this source can hold: the asked role, else one role below, else a silhouette. */
export function placeRole(role: PlateRole, width: number, height: number, subjectBox?: Rect | null): PlateRole {
  if (meetsRole(role, width, height, subjectBox)) return role;
  const lower = DROP[role];
  return meetsRole(lower, width, height, subjectBox) ? lower : 'silhouette';
}
