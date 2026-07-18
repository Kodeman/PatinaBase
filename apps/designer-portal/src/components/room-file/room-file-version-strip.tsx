'use client';

/**
 * RoomFileVersionStrip — the append-only version chain of a scan's Room File,
 * in the ProposalVersionHistory idiom (proposal-version-history.tsx): one quiet
 * DM-mono row, current marked but inert, earlier versions quiet links. A
 * re-scan/re-solve mints a new (scan_id, version) row (00341 R-f); this strip
 * reads the whole chain. A single-version chain renders nothing.
 *
 * Selecting an earlier version calls `onSelect(id)` — the page swaps the
 * rendered version in place (drawings/certificate/measurements re-resolve off
 * the selected room_file), the current row never unmounts.
 */

import type { RoomFile } from '@patina/supabase';
import { ROOM_FILE_COPY as C } from './room-file-copy';

function versionLabel(rf: RoomFile): string {
  if (rf.status === 'generated' && rf.generated_at) {
    const d = new Date(rf.generated_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `generated ${d}`;
  }
  if (rf.status === 'error') return 'error';
  return rf.status; // pending | solved
}

export interface RoomFileVersionStripProps {
  versions: RoomFile[];
  /** The room_file id currently rendered by the page. */
  currentId: string;
  onSelect: (roomFileId: string) => void;
}

export function RoomFileVersionStrip({ versions, currentId, onSelect }: RoomFileVersionStripProps) {
  // A single-version chain has no history worth showing.
  if (!versions || versions.length <= 1) return null;

  // Ascending so the strip reads v1 → v2 left to right.
  const ordered = [...versions].sort((a, b) => a.version - b.version);

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {ordered.map((v) => {
        const isCurrent = v.id === currentId;
        const label = isCurrent ? C.versionCurrent : versionLabel(v);
        if (isCurrent) {
          return (
            <span
              key={v.id}
              className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-clay)]"
            >
              v{v.version} · {label}
            </span>
          );
        }
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--color-clay)]"
          >
            v{v.version} · {label}
          </button>
        );
      })}
    </div>
  );
}
