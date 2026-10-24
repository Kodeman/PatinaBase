/** Source coordinates: normalized 0–1, or source pixels for a rectangle. */
export type GalleryRect = readonly [number, number, number, number];
export type GalleryPoint = readonly [number, number];

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
  const box = gallerySubject(width, height, subject, focal ?? [0.5, 0.5]);
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
