import { arrivalMode, arrivalRendition } from '@patina/utils';
export { galleryRendition } from './crop';
import { plateUrl } from '@/lib/plates';
import type { EditorialAsset, PlateCropKey } from './types';
export { arrivalMode };

export function containedRendition(scope: string, asset: EditorialAsset) {
  const crop = arrivalRendition(asset, null);
  if (!crop) return null;
  const key = crop.key as PlateCropKey;
  return { ...crop, src: plateUrl(scope, asset.sha256, key, crop.width, 'webp', asset.crops[key]?.rev) };
}
