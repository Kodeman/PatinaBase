/** Source coordinates: normalized 0–1, or source pixels for a rectangle. */
export type GalleryRect = readonly [number, number, number, number];
export type GalleryPoint = readonly [number, number];

export const GALLERY_DEFAULT_FOCAL: GalleryPoint = [0.5, 0.5];

export const GALLERY_PHONE_ASPECT = 390 / 796;
export const GALLERY_DESKTOP_ASPECT = 1440 / 852;

/** One axis of a cover crop, kept nearest the focal point without cutting the subject. */
function galleryAxis(visible: number, from: number, length: number, focal: number): number | null {
  const to = from + length;
  if (!axisHolds(visible, from, length)) return null;
  const slack = 1 - visible;
  if (slack < 1e-9) return 0.5;
  const start = Math.min(Math.max(focal - visible / 2, to - visible, 0), from, slack);
  return start / slack;
}

function axisHolds(visible: number, from: number, length: number): boolean {
  return from >= 0 && from + length <= 1 && length >= 0 && length <= visible + 1e-9;
}

function gallerySubject(width: number, height: number, subject: GalleryRect | null | undefined, focal: GalleryPoint): GalleryRect {
  if (!subject) return [focal[0], focal[1], 0, 0];
  if (subject.every((v) => v >= 0 && v <= 1)) return subject;
  return [subject[0] / width, subject[1] / height, subject[2] / width, subject[3] / height];
}

function galleryFocal(subject: GalleryRect, focal?: GalleryPoint | null): GalleryPoint {
  return focal ?? [subject[0] + subject[2] / 2, subject[1] + subject[3] / 2];
}

/** Separate tall/wide object positions, in source coordinates, protecting the whole subject. */
export function galleryCropPosition(
  width: number, height: number, aspect: number, subject?: GalleryRect | null, focal?: GalleryPoint | null,
): string | null {
  if (![width, height, aspect].every((n) => Number.isFinite(n) && n > 0)) return null;
  const box = gallerySubject(width, height, subject, focal ?? GALLERY_DEFAULT_FOCAL);
  const centre = galleryFocal(box, focal);
  if (![...box, ...centre].every(Number.isFinite)) return null;
  const sourceAspect = width / height;
  const visible = sourceAspect > aspect ? [aspect / sourceAspect, 1] : [1, sourceAspect / aspect];
  const x = galleryAxis(visible[0], box[0], box[2], centre[0]);
  const y = galleryAxis(visible[1], box[1], box[3], centre[1]);
  return galleryPositionText(x, y);
}

function galleryPositionText(x: number | null, y: number | null): string | null {
  if (x === null || y === null) return null;
  return [x, y].map((v) => Math.round(v * 1000) / 10 + '%').join(' ');
}


export interface ArrivalAsset {
  id: string; sha256: string; sourceKind: string | null; ground: string | null;
  width: number; height: number; subjectBox: readonly number[] | null; focal: readonly number[] | null;
  crops: Partial<Record<string, { rect: readonly number[]; widths: readonly number[] }>>;
}
export function arrivalTier(asset: Pick<ArrivalAsset, 'sourceKind' | 'ground'>): number {
  if (asset.sourceKind === 'maker' && asset.ground === 'white') return 3;
  const tiers: Record<string, number> = { installed: 0, scan: 1, board: 1, sheet: 1, upload: 1, maker: 2 };
  return tiers[asset.sourceKind ?? ''] ?? 4;
}
export function compareArrivalAssets(a: ArrivalAsset, b: ArrivalAsset): number {
  const rank = arrivalTier(a) - arrivalTier(b) || b.width * b.height - a.width * a.height;
  if (rank) return rank;
  if (a.sha256 === b.sha256) return 0;
  return a.sha256 < b.sha256 ? -1 : 1;
}
function arrivalRect(rect: readonly number[], asset: ArrivalAsset): GalleryRect {
  if (rect.every(v => v >= 0 && v <= 1)) return rect as GalleryRect;
  return [rect[0] / asset.width, rect[1] / asset.height, rect[2] / asset.width, rect[3] / asset.height];
}
function containsSubject(rect: GalleryRect, subject: GalleryRect | null): boolean {
  if (!subject) return true;
  return [0, 1].every(axis => rect[axis] <= subject[axis] + 1e-6
    && rect[axis] + rect[axis + 2] >= subject[axis] + subject[axis + 2] - 1e-6);
}
function relativeSubject(asset: ArrivalAsset, rect: GalleryRect): GalleryRect | null {
  if (!asset.subjectBox) return null;
  const box = arrivalRect(asset.subjectBox, asset);
  return [(box[0]-rect[0])/rect[2], (box[1]-rect[1])/rect[3], box[2]/rect[2], box[3]/rect[3]];
}
function relativeFocal(asset: ArrivalAsset, rect: GalleryRect): GalleryPoint | null {
  if (!asset.focal) return null;
  return [(asset.focal[0]-rect[0])/rect[2], (asset.focal[1]-rect[1])/rect[3]];
}
function arrivalPosition(asset: ArrivalAsset, rect: GalleryRect, aspect: number | null): string | null {
  if (aspect !== null) return galleryCropPosition(rect[2]*asset.width, rect[3]*asset.height,
    aspect, relativeSubject(asset, rect), relativeFocal(asset, rect));
  const subject = asset.subjectBox ? arrivalRect(asset.subjectBox, asset) : null;
  return containsSubject(rect, subject) ? '50% 50%' : null;
}
export function arrivalRendition(asset: ArrivalAsset, aspect: number | null) {
  const candidates = Object.entries(asset.crops).flatMap(([key, crop]) => {
    if (!crop) return [];
    const width = Math.max(0, ...crop.widths);
    if (!width) return [];
    const rect = arrivalRect(crop.rect, asset);
    const position = arrivalPosition(asset, rect, aspect);
    return position ? [{ key, width, rect, position }] : [];
  });
  return candidates.sort((a,b) => b.width-a.width)[0] ?? null;
}

function coverDimensions(asset: ArrivalAsset): boolean {
  return Math.max(asset.width, asset.height) >= 2000 && Math.min(asset.width, asset.height) >= 1200;
}
function arrivalCover(asset: ArrivalAsset): boolean {
  if (!['installed', 'upload', 'scan', 'maker'].includes(asset.sourceKind ?? '') || asset.ground !== 'scene') return false;
  if (!coverDimensions(asset)) return false;
  return Boolean(arrivalRendition(asset, GALLERY_PHONE_ASPECT) && arrivalRendition(asset, GALLERY_DESKTOP_ASPECT));
}
export function arrivalMode(asset: ArrivalAsset): 'cover' | 'contained' | null {
  if (['concept', 'sheet'].includes(asset.sourceKind ?? '')) return null;
  if (arrivalCover(asset)) return 'cover';
  return arrivalRendition(asset, null) ? 'contained' : null;
}
export function selectArrival<T extends ArrivalAsset>(editorial: {
  assets: readonly T[]; palette: readonly unknown[]; edition?: unknown;
  composition?: { hero?: { assetId: string } | null } | null;
}) {
  const chosenId = chosenArrivalId(editorial);
  const chosen = editorial.assets.find(asset => asset.id === chosenId);
  const asset = chosen && arrivalMode(chosen) ? chosen : null;
  if (asset) return { kind: 'photo' as const, asset, mode: arrivalMode(asset)! };
  return { kind: editorial.palette.length ? 'paint' as const : 'empty' as const, asset: null, mode: null };
}

function chosenArrivalId(editorial: { edition?: unknown; composition?: { hero?: { assetId: string } | null } | null }) {
  return editorial.edition ? editorial.composition?.hero?.assetId : null;
}
