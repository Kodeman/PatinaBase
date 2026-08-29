'use client';

/**
 * Brief scan strip (Designer Handoff, Wave 1B) — the room scans attached to a
 * design request, as a small thumbnail grid between the Brief's facts block
 * and the TriageBar. Each tile opens the Room View (`/room/[id]`, I74a) — the
 * same door Discovery/Folio/Letterhead/Ceremony already use. The primary scan
 * (`lead_room_scans.is_primary`) carries a quiet corner marker, not a badge.
 *
 * Renders nothing when the lead has no scans (designer-captured prospects,
 * legacy leads, and the manually-captured-lead path all carry none) — the
 * Brief's original shape is otherwise untouched.
 *
 * Cover photo (Room Photos W2-T6, I81): `lead_room_scans.scan.thumbnail_url`
 * (the `room_scans` scalar) is perma-NULL in practice — no producer ever sets
 * it — so the real cover comes from `room_scan_images` via one
 * `useRoomScanCovers` call across every scan id in the strip. A per-tile
 * `useRoomScanPhotos` call would be a hook inside a `.map()` loop, breaking
 * rules-of-hooks the moment the tile count changes between renders — the
 * batch hook fetches + signs every tile's cover in one round trip instead.
 *
 * Per-tile source order: the legacy scalar (kept first in case a future
 * producer ever fills it — zero-cost to prefer) → the resolved cover's
 * signed thumbnail → its signed 1600 px preview → its signed full image →
 * the quiet "No preview" placeholder. That placeholder also covers the
 * strip's brief loading window (covers is `undefined` until the batch query
 * resolves) — no spinner, same box either way.
 */

import { useRouter } from 'next/navigation';
import { useLeadScans, useRoomScanCovers } from '@patina/supabase';

export function BriefScanStrip({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { data: junctions } = useLeadScans(leadId);

  const rows = (junctions ?? []).filter((row) => row.scan);
  const scanIds = rows.map((row) => row.scan_id);
  const { data: covers } = useRoomScanCovers(scanIds);

  if (rows.length === 0) return null;

  return (
    <div className="mb-3.5 border-b border-[var(--color-pearl)] pb-3.5">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {rows.length === 1 ? 'Room scan' : `Room scans · ${rows.length}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const cover = covers?.get(row.scan_id) ?? null;
          const coverSrc =
            row.scan?.thumbnail_url ||
            cover?.signedThumbUrl ||
            cover?.signedPreviewUrl ||
            cover?.signedImageUrl ||
            null;

          return (
            <button
              key={row.id}
              type="button"
              onClick={() => router.push(`/room/${row.scan_id}?from=document&docId=${leadId}`)}
              title={row.scan?.name ?? 'Room scan'}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverSrc}
                  alt={row.scan?.name ?? 'Room scan'}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] italic text-[var(--text-muted)]">
                  No preview
                </span>
              )}
              {row.is_primary && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 right-0 bg-[rgba(44,41,38,0.72)] px-1 py-[1.5px] text-center font-mono text-[11px] uppercase tracking-[0.06em] text-white"
                >
                  Primary
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
