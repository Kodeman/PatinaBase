export const PLATE_WIDTHS = {
  cover_phone: [640, 828, 1080, 1242],
  tall: [640, 828, 1080, 1242],
  wide: [1280, 1600, 2048, 2560],
  wide32: [768, 1024, 1600, 2048],
  pair: [768, 1024, 1600, 2048],
  sheet: [768, 1024, 1600, 2048],
  board: [768, 1024, 1600, 2048],
  piece: [256, 512, 768],
} as const;

export type PlateCropKey = keyof typeof PLATE_WIDTHS;
type PlateFormat = 'avif' | 'webp';

export const PLATE_SIZES = {
  cover_phone: '100vw',
  tall: '100vw',
  wide: '100vw',
  wide32: '(min-width:1296px) 1248px, calc(100vw - 32px)',
  pair: '(min-width:1296px) 1248px, calc(100vw - 32px)',
  sheet: '(min-width:1296px) 1248px, calc(100vw - 32px)',
  board: '(min-width:1296px) 1248px, calc(100vw - 32px)',
} as const;

export function plateUrl(
  scopeId: string,
  sha256: string,
  cropKey: PlateCropKey,
  width: number,
  format: PlateFormat,
): string {
  return `/plates/${scopeId}/${sha256}/${cropKey}-${width}.${format}`;
}

export function plateSrcSet(
  scopeId: string,
  sha256: string,
  cropKey: PlateCropKey,
  widths: readonly number[],
  format: PlateFormat,
): string {
  const candidates = widths.map(
    (width) => {
      return `${plateUrl(scopeId, sha256, cropKey, width, format)} ${width}w`;
    },
  );
  return candidates.join(', ');
}
