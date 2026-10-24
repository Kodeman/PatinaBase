import { normalised, platePicture } from './crop';
import { galleryCropPosition } from './gallery-crop';
import type { EditorialAsset, PlateCropKey, Point, Rect } from './types';

function renditionSubject(asset: EditorialAsset, rect: Rect): Rect | null {
  if (!asset.subjectBox) return null;
  const box = normalised(asset.subjectBox, asset.width, asset.height);
  return [(box[0] - rect[0]) / rect[2], (box[1] - rect[1]) / rect[3], box[2] / rect[2], box[3] / rect[3]];
}

function renditionFocal(asset: EditorialAsset, rect: Rect): Point | null {
  return asset.focal ? [(asset.focal[0] - rect[0]) / rect[2], (asset.focal[1] - rect[1]) / rect[3]] : null;
}

/** Geometry is evaluated on the served rendition, never on an unavailable original. */
export function galleryRendition(scope: string, asset: EditorialAsset, aspect: number) {
  const candidates = (Object.keys(asset.crops) as PlateCropKey[]).flatMap((key) => {
    const crop = asset.crops[key];
    if (!crop?.widths.length) return [];
    const rect = normalised(crop.rect, asset.width, asset.height);
    const position = galleryCropPosition(rect[2] * asset.width, rect[3] * asset.height, aspect,
      renditionSubject(asset, rect), renditionFocal(asset, rect));
    const picture = platePicture(scope, asset, key, '100vw');
    return position && picture ? [{ picture, position, pixels: Math.max(...crop.widths) }] : [];
  });
  return candidates.sort((a, b) => b.pixels - a.pixels)[0] ?? null;
}
