'use client';

import { useQueries } from '@tanstack/react-query';

/**
 * C-19: the photo strip on a damage claim — the receiving inspection's photos
 * (iOS or the desktop drawer), read back through the media proxy as signed
 * GET URLs.
 */

/** `receiving_inspections.photo_asset_ids` has no client-side shape guarantee. */
export function inspectionPhotoIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );
}

// Signed URLs live 15 minutes (media.service DOWNLOAD_URL_TTL_MS); drop them first.
const SIGNED_URL_FRESH_MS = 10 * 60 * 1000;

async function fetchPhotoUrl(assetId: string): Promise<string> {
  const res = await fetch(
    `/api/media/assets/${encodeURIComponent(assetId)}/download`,
  );
  const body = await res.json().catch(() => null);
  const url = body?.data?.downloadUrl;
  if (!res.ok || typeof url !== 'string') {
    throw new Error('The photo could not be opened.');
  }
  return url;
}

export function InspectionPhotoStrip({
  photoAssetIds,
}: {
  photoAssetIds: unknown;
}) {
  const ids = inspectionPhotoIds(photoAssetIds);
  const urls = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['media-download-url', id],
      queryFn: () => fetchPhotoUrl(id),
      staleTime: SIGNED_URL_FRESH_MS,
      gcTime: SIGNED_URL_FRESH_MS,
      retry: false,
    })),
  });
  if (ids.length === 0) return null;

  return (
    <ul
      aria-label="Inspection photos"
      data-testid="inspection-photo-strip"
      className="mt-2 flex flex-wrap gap-1.5"
    >
      {ids.map((id, i) => {
        const url = urls[i]?.data;
        const label = `Inspection photo ${i + 1} of ${ids.length}`;
        return (
          <li key={id}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
              >
                <img
                  src={url}
                  alt={label}
                  loading="lazy"
                  className="h-14 w-14 rounded-[3px] border border-[var(--color-pearl)] object-cover"
                />
              </a>
            ) : (
              <span
                role="img"
                aria-label={
                  urls[i]?.isError ? `${label} could not be opened` : label
                }
                className="doc-type-meta flex h-14 w-14 items-center justify-center rounded-[3px] border border-dashed border-[var(--color-pearl)] text-[var(--color-quiet-ink)]"
              >
                {urls[i]?.isError ? '—' : '…'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
