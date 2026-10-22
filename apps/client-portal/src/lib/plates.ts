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
export type PlateFormat = 'avif' | 'webp';

export const PLATE_SIZES = {
  cover_phone: '100vw',
  tall: '100vw',
  wide: '100vw',
  wide32: '(min-width:1296px) 1248px, calc(100vw - 32px)',
  pair: '(min-width:1296px) 1248px, calc(100vw - 32px)',
  sheet: '(min-width:1296px) 1248px, calc(100vw - 32px)',
  board: '(min-width:1296px) 1248px, calc(100vw - 32px)',
} as const;

const FNV64_OFFSET = BigInt('0xcbf29ce484222325');
const FNV64_PRIME = BigInt('0x100000001b3');
const U64 = BigInt('0xffffffffffffffff');

/** 16 hex: FNV-1a 64 over [focal, subjectBox]; the media worker keys a framing's renditions by it. */
export function framingRevision(focal: readonly number[] | null, subjectBox: readonly number[] | null): string {
  let hash = FNV64_OFFSET;
  for (const char of JSON.stringify([focal, subjectBox])) {
    hash = ((hash ^ BigInt(char.charCodeAt(0))) * FNV64_PRIME) & U64;
  }
  return hash.toString(16).padStart(16, '0');
}

export function plateUrl(
  scopeId: string,
  sha256: string,
  cropKey: PlateCropKey,
  width: number,
  format: PlateFormat,
  revision?: string,
): string {
  const path = `/plates/${scopeId}/${sha256}/${cropKey}-${width}.${format}`;
  return revision ? `${path}?r=${encodeURIComponent(revision)}` : path;
}

export function plateSrcSet(
  scopeId: string,
  sha256: string,
  cropKey: PlateCropKey,
  widths: readonly number[],
  format: PlateFormat,
  revision?: string,
): string {
  const candidates = widths.map(
    (width) => {
      return `${plateUrl(scopeId, sha256, cropKey, width, format, revision)} ${width}w`;
    },
  );
  return candidates.join(', ');
}
