'use client';

/**
 * The storage keys behind a Field-raised punch item's photo (FC-R15).
 * Portal-local by the §11.1 convention: shared Supabase reads live in
 * packages/supabase; hooks that serve one portal surface stay here, beside
 * use-margin-notes.ts and use-section-work.ts.
 *
 * One `in`-filtered read for a whole section's punch items, then ONE batched
 * signing call at the call site. field_captures RLS is owner-only outside the
 * shared inbox (00233:155-186), so a studio co-member simply gets fewer rows
 * back and the thumbnails do not render — FC-R8, per-designer in v1.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

const getSupabase = () => createBrowserClient();

interface CapturePhotoRow {
  id: string;
  photos: unknown;
  primary_photo_path: string | null;
}

export function photoPathsByCapture(
  rows: readonly CapturePhotoRow[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    if (!Array.isArray(row.photos)) continue;
    const paths = row.photos
      .map((p) =>
        p && typeof p === 'object' && typeof (p as { path?: unknown }).path === 'string'
          ? (p as { path: string }).path
          : '',
      )
      .filter((p) => p.length > 0);
    if (paths.length === 0) continue;

    const primary = row.primary_photo_path;
    // Divergence, recorded rather than fixed here: the margin's own photo
    // strip for this same capture (00543:377-385, `select ... order by
    // ph_ord`) orders strictly by capture order and never consults
    // primary_photo_path, while this punch thumbnail and
    // capture-context-section.tsx both lead with the primary. A designer who
    // marks a non-first photo primary sees a different lead photo on the
    // margin than on the punch item and the context section. Ruling: keep
    // primary-first HERE — it's the designer's own choice of evidence lead,
    // and it's what two of the three field-capture surfaces already do.
    // Aligning the margin's `photo_paths` ordering to match is owed, not
    // done in this change.
    out[row.id] =
      primary && paths.includes(primary)
        ? [primary, ...paths.filter((p) => p !== primary)]
        : paths;
  }
  return out;
}

export function useFieldCapturePhotoPaths(
  captureIds: readonly string[],
): UseQueryResult<Record<string, string[]>> {
  const ids = Array.from(new Set(captureIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['field-capture-photos', ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    // A punch thumbnail is supporting context: a failed read leaves the row
    // without its photo, and must not raise a toast on the whole spread.
    meta: { errorSurface: 'silent' },
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await getSupabase()
        .from('field_captures')
        .select('id, photos, primary_photo_path')
        .in('id', ids);
      if (error) throw error;
      return photoPathsByCapture(data ?? []);
    },
  });
}
