/* Private plate URLs, served by `src/app/plates/[scope]/[sha256]/[file]/route.ts`.
   `scopeId` is the project id in Phase 1 and the approved edition id from Phase 2. */

export type PlateFormat = 'avif' | 'webp';

export function plateUrl(
  scopeId: string,
  sha256: string,
  cropKey: string,
  width: number,
  format: PlateFormat,
): string {
  return `/plates/${encodeURIComponent(scopeId)}/${encodeURIComponent(sha256)}/${cropKey}-${width}.${format}`;
}

export function plateSrcSet(
  scopeId: string,
  sha256: string,
  cropKey: string,
  widths: readonly number[],
  format: PlateFormat,
): string {
  return widths.map((w) => `${plateUrl(scopeId, sha256, cropKey, w, format)} ${w}w`).join(', ');
}
