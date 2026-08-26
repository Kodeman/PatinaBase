'use client';

/**
 * RoomFilesSection — the project detail page's "Room Files" zone (Field Capture
 * P1, package item 12). The FIRST consumer of `useProjectRoomScans`: it feeds
 * the project's ready scans, then keeps only those with a finished (generated)
 * Room File deliverable (`useGeneratedRoomFilesByScan`), each a door into
 * `/room/[scanId]/file` (R21 dissolve — the deliverable is scan-keyed, so its
 * address stopped being project-nested). Returns null when the project has
 * no room-file-bearing scans (no empty chrome), matching ProjectBoardsSection.
 *
 * Typography-first, zero shadows (D4). Strings are escalate-class placeholders
 * (room-file-copy.ts).
 */

import Link from 'next/link';
import { useProjectRoomScans, useGeneratedRoomFilesByScan } from '@patina/supabase';
import { ROOM_FILE_COPY as C } from './room-file-copy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface RoomFilesSectionProps {
  projectId: string;
}

export function RoomFilesSection({ projectId }: RoomFilesSectionProps) {
  const isReal = UUID_RE.test(projectId);
  const { data: scans } = useProjectRoomScans(isReal ? projectId : '');
  const scanIds = (scans ?? []).map((s) => s.id);
  const { data: byScan } = useGeneratedRoomFilesByScan(scanIds);

  if (!isReal || !scans || !byScan) return null;

  const rows = scans.filter((s) => byScan.has(s.id));
  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: '1.25rem',
            lineHeight: 1.35,
          }}
        >
          {C.sectionTitle}
        </h3>
        <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
          {rows.length} {rows.length === 1 ? 'room' : 'rooms'}
        </span>
      </div>

      <ul className="border-t" style={{ borderColor: 'var(--border-default)' }}>
        {rows.map((scan) => {
          const rf = byScan.get(scan.id);
          const sheetCount = rf?.drawings?.sheet_count ?? rf?.drawings?.sheets?.length ?? 0;
          return (
            <li key={scan.id} className="border-b" style={{ borderColor: 'var(--border-default)' }}>
              <Link
                href={`/room/${scan.id}/file`}
                className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 transition-colors"
              >
                <span className="flex items-baseline gap-3">
                  <span className="text-[15px] text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-clay-ink)]">
                    {scan.name || 'Room'}
                  </span>
                  {rf?.unverified && (
                    <span className="rounded-[2px] border border-[var(--color-clay)] px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--color-clay-ink)]">
                      {C.unverifiedBadge}
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-4 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  <span>{fmtDay(scan.scanned_at ?? scan.created_at)}</span>
                  <span>
                    {sheetCount} {sheetCount === 1 ? 'sheet' : 'sheets'}
                  </span>
                  <span className="text-[var(--color-clay-ink)] opacity-0 transition-opacity group-hover:opacity-100">
                    {C.roomViewDoorLabel}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
