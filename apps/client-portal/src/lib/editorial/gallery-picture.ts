import { normalised, platePicture } from './crop';
import { galleryCropPosition, GALLERY_DESKTOP_ASPECT, GALLERY_PHONE_ASPECT } from '@patina/utils';
import { plateUrl } from '@/lib/plates';
import type { EditorialAsset, PlateCropKey, Point, Rect } from './types';

export function containedRendition(scope: string, asset: EditorialAsset) {
  const subject = asset.subjectBox && normalised(asset.subjectBox, asset.width, asset.height);
  const candidates = (Object.keys(asset.crops) as PlateCropKey[]).flatMap(key => {
    const crop = asset.crops[key];
    const width = Math.max(0, ...(crop?.widths ?? []));
    if (!crop || !width) return [];
    const rect = normalised(crop.rect, asset.width, asset.height);
    if (subject && (rect[0] > subject[0] + 1e-6 || rect[1] > subject[1] + 1e-6
      || rect[0] + rect[2] < subject[0] + subject[2] - 1e-6
      || rect[1] + rect[3] < subject[1] + subject[3] - 1e-6)) return [];
    return [{ key, width, rect, src: plateUrl(scope, asset.sha256, key, width, 'webp', crop.rev) }];
  });
  return candidates.sort((a, b) => b.width - a.width)[0] ?? null;
}

export function arrivalMode(asset: EditorialAsset): 'cover' | 'contained' | null {
  if (asset.sourceKind === 'concept' || asset.sourceKind === 'sheet') return null;
  const fullHeight = asset.crops.cover_phone?.widths.length && (asset.crops.wide?.widths.length || asset.crops.wide32?.widths.length);
  const large = Math.max(asset.width, asset.height) >= 2000 && Math.min(asset.width, asset.height) >= 1200;
  if (asset.ground === 'scene' && (large || fullHeight)
    && galleryRendition('', asset, GALLERY_PHONE_ASPECT) && galleryRendition('', asset, GALLERY_DESKTOP_ASPECT)) return 'cover';
  return containedRendition('', asset) ? 'contained' : null;
}

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
