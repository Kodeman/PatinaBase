'use client';

/**
 * RoomCard — one entry in The Rooms roster (R107 §1, prototype scene 01's
 * `.roomcard`). Pure props: takes an already-built `RoomRosterEntry`
 * (apps/designer-portal/src/lib/room-view/geometry.ts — the pure adapter in
 * roster-from-rows.ts resolves the client-name fallback and the docRef), does
 * no fetching of its own.
 *
 * The whole card is a real link to `/room/[id]` — no dead surfaces (the
 * room-view package's P2 lesson). It uses the "stretched link" pattern
 * (a full-cover `<Link>` at the base of the stack, aria-labelled) rather than
 * wrapping every child in one `<a>`: the docref line is its OWN real `<Link>`
 * to the Document, and nesting an `<a>` inside an `<a>` is invalid HTML (React
 * warns on it — verified while building this component). Both links are real,
 * independently focusable, and never nested.
 *
 * The stretched link stashes the Rooms origin on click — the SAME mechanism
 * studio-drawer.tsx's `enterRoom` uses (`rememberRoomOrigin`), so leaving a
 * room opened from `/rooms` reads "← the Scans" and returns here, rather
 * than degrading to the Desk (the Phase-2 gate finding; room-origin.ts's
 * `isRoomPath` deliberately excludes bare `/rooms` from its no-op guard so
 * this stash actually lands).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { RoomRosterEntry } from '@/lib/room-view/geometry';
import { qualityGradeColor } from '@/components/portal/scan-card';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { RoomPlanThumb } from './room-plan-thumb';

export function RoomCard({ entry }: { entry: RoomRosterEntry }) {
  const pathname = usePathname();
  const displayName = entry.clientName ?? 'Unnamed room';
  const whatLine = buildWhatLine(entry);
  const metasLeft = buildMetasLeft(entry);
  const grade = entry.quality.grade;

  return (
    <div className="relative rounded-[2px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] p-5 transition-colors hover:border-[var(--color-clay)]">
      <div className="font-heading text-[1.25rem] font-medium text-[var(--color-charcoal)]">
        {displayName}
      </div>
      {whatLine && (
        <div className="mt-0.5 text-[0.78rem] text-[var(--color-mocha)]">{whatLine}</div>
      )}

      <div className="my-3.5">
        <RoomPlanThumb geometry={entry.geometry} />
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        <span>{metasLeft}</span>
        {grade && (
          <span className="flex shrink-0 items-center gap-1" style={{ color: qualityGradeColor(grade) }}>
            <span aria-hidden>●</span> quality {grade}
          </span>
        )}
      </div>

      {entry.docRef && (
        <div className="relative z-10 mt-2.5 w-fit border-t border-[var(--doc-ink-border)] pt-2.5">
          <Link
            href={`/doc/${entry.docRef.engagementId}`}
            className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-mocha)] hover:text-[var(--color-clay)]"
          >
            → the document · {entry.docRef.phaseLabel}
          </Link>
        </div>
      )}

      {/* The stretched link — covers the whole card, sits BELOW the docref
          link (z-0 vs z-10) so the docref stays independently clickable. */}
      <Link
        href={`/room/${entry.roomId}`}
        aria-label={`Open the room for ${displayName}`}
        className="absolute inset-0 z-0"
        onClick={() => rememberRoomOrigin(pathname)}
      >
        <span className="sr-only">{displayName}</span>
      </Link>
    </div>
  );
}

/** "Dining room · scanned Jul 14" — degrades gracefully when either half is
 *  missing; returns null (render nothing) when neither is known. */
function buildWhatLine(entry: RoomRosterEntry): string | null {
  const type = humanizeRoomType(entry.roomType);
  const date = formatScanDate(entry.scanDate);
  if (type && date) return `${type} · scanned ${date}`;
  if (type) return type;
  if (date) return `Scanned ${date}`;
  return null;
}

/** "14′ × 14′ · 196 SQ FT" in whole feet (the roster's quiet read, distinct
 *  from ftIn's feet-and-inches precision used elsewhere) — degrades to a
 *  quiet placeholder before the scan's geometry has parsed. */
function buildMetasLeft(entry: RoomRosterEntry): string {
  const parts: string[] = [];
  if (entry.dims) {
    parts.push(`${wholeFeet(entry.dims.w)} × ${wholeFeet(entry.dims.d)}`);
  }
  if (entry.areaSqFt != null) {
    parts.push(`${Math.round(entry.areaSqFt)} SQ FT`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Geometry pending';
}

function wholeFeet(ft: number): string {
  // Whole-foot display per the prototype's roster metas (ftIn's feet+inches
  // precision is for the interactive Plan, not this quiet card line).
  return `${Math.round(ft)}′`;
}

function humanizeRoomType(roomType: string | null): string | null {
  if (!roomType) return null;
  const spaced = roomType.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatScanDate(scanDate: string | null): string | null {
  if (!scanDate) return null;
  const d = new Date(scanDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
