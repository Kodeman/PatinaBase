import { arrivalMode, arrivalRendition } from '@patina/utils';
import { platePicture } from './crop';
import { plateUrl } from '@/lib/plates';
import type { EditorialAsset, PlateCropKey } from './types';
export { arrivalMode };

export function containedRendition(scope: string, asset: EditorialAsset) {
  const crop = arrivalRendition(asset, null);
  if (!crop) return null;
  const key = crop.key as PlateCropKey;
  return { ...crop, src: plateUrl(scope, asset.sha256, key, crop.width, 'webp', asset.crops[key]?.rev) };
}

/** Geometry is evaluated on the served rendition, never on an unavailable original. */
export function galleryRendition(scope: string, asset: EditorialAsset, aspect: number) {
  const crop = arrivalRendition(asset, aspect);
  if (!crop) return null;
  const picture = platePicture(scope, asset, crop.key as PlateCropKey, '100vw');
  return picture ? { picture, position: crop.position, pixels: crop.width } : null;
}
