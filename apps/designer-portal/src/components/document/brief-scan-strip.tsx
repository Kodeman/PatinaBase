'use client';

/**
 * Brief scan strip (Designer Handoff, Wave 1B) — the room scans attached to a
 * design request, as a small thumbnail grid between the Brief's facts block
 * and the TriageBar. Each tile opens the existing interactive viewer
 * (`ScanViewerSheet`) — the same door Discovery/Folio/Letterhead already use
 * (R90); this strip adds no new viewer plumbing. The primary scan
 * (`lead_room_scans.is_primary`) carries a quiet corner marker, not a badge.
 *
 * Renders nothing when the lead has no scans (designer-captured prospects,
 * legacy leads, and the manually-captured-lead path all carry none) — the
 * Brief's original shape is otherwise untouched.
 */

import { useState } from 'react';
import { useLeadScans } from '@patina/supabase';
import { ScanViewerSheet } from './overlays/scan-viewer-sheet';

export function BriefScanStrip({ leadId }: { leadId: string }) {
  const { data: junctions } = useLeadScans(leadId);
  const [viewingScanId, setViewingScanId] = useState<string | null>(null);

  const rows = (junctions ?? []).filter((row) => row.scan);
  if (rows.length === 0) return null;

  return (
    <div className="mb-3.5 border-b border-[var(--color-pearl)] pb-3.5">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {rows.length === 1 ? 'Room scan' : `Room scans · ${rows.length}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setViewingScanId(row.scan_id)}
            title={row.scan?.name ?? 'Room scan'}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            {row.scan?.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.scan.thumbnail_url}
                alt={row.scan.name ?? 'Room scan'}
                className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] italic text-[var(--text-muted)]">
                No preview
              </span>
            )}
            {row.is_primary && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 right-0 bg-[rgba(44,41,38,0.72)] px-1 py-[1.5px] text-center font-mono text-[7px] uppercase tracking-[0.06em] text-white"
              >
                Primary
              </span>
            )}
          </button>
        ))}
      </div>

      {viewingScanId && (
        <ScanViewerSheet scanId={viewingScanId} onClose={() => setViewingScanId(null)} />
      )}
    </div>
  );
}
