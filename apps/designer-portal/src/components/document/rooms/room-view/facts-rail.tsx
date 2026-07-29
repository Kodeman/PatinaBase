/**
 * FactsRail — the Room View's comprehension instrument (R107 §4, I73).
 * Pure-prop component: every line is derived directly from the geometry
 * (+ two scan-metadata scalars) the caller already resolved, so it stays
 * unit-testable without React Query or Supabase in the loop. The optional
 * `measure` prop follows the same rule — it's a plain callbacks-and-booleans
 * shape the caller (room-view.tsx, wired to `useMeasure()`) resolves; this
 * component owns no measure STATE of its own.
 *
 * Sections, per the prototype's `.facts` block and the task's ruling:
 *   Area · Walls (+ ceiling-stands-in note, + thickness-convention note when
 *   the adapter applied it) · Openings (windows/doors/openings counts) ·
 *   Detected (furniture categories) · Scan (date · quality · coverage) ·
 *   Verify — ONLY rendered when ≥1 wall reads low confidence (I73a).
 *
 * Below `.facts`, the prototype's `.toolrow` (W2-T4, package accept 2.3):
 * a quiet Measure button — since I107 "the tool" treatment is the Scored Ink
 * one: a bare word, no border and no fill, that takes a steady charcoal score
 * when armed — plus a Clear button shown ONLY once a measurement exists.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  areaOf,
  ftIn,
  overallDims,
  type RoomGeometry,
} from '@/lib/room-view/geometry';
import { fmtDay } from '@/lib/document/format';
import { cn } from '@/lib/utils';
import { REFINE_COPY } from './refine-copy';
import { RefineReadout, type RefineReadoutProps } from './refine-readout';

export interface FactsRailMeasureProps {
  /** true while the tool is capturing clicks (armed or first-point placed) —
   *  the Measure button inverts to its "on" treatment. */
  armed: boolean;
  /** true once a measurement is complete — shows the Clear button. */
  hasMeasurement: boolean;
  onArm: () => void;
  onClear: () => void;
}

export interface FactsRailPhotosProps {
  /** Deduped photo count (from useRoomScanPhotos). */
  count: number;
  /** Opens the viewer at the first photo. */
  onOpen: () => void;
}

export interface FactsRailProps {
  geometry: RoomGeometry;
  /** true when from-rows.ts applied the 0.45ft thickness convention (no
   *  captured wall thickness — I73d). */
  thicknessConvention: boolean;
  /** `room_scan_documents.scanned_at` (ISO timestamp), or null. */
  scanDate: string | null;
  qualityGrade: string | null;
  /** 0–1 fraction, e.g. 0.91. */
  coveragePercentage: number | null;
  /** Photos line (Room View PHOTOS, W2) — a `Photos · N` fact between Detected
   *  and Scan, rendered ONLY when count > 0; clicking it opens the viewer.
   *  Omitted entirely (no line) for a Field scan with no photos. */
  photos?: FactsRailPhotosProps;
  /** Measure-tool toolrow — omitted entirely (no dead UI) when the caller
   *  doesn't wire the tool up. */
  measure?: FactsRailMeasureProps;
  /** Room File door (Field Capture P1, item 12) — a quiet link to this scan's
   *  generated drawing set, rendered ONLY when the caller resolves one
   *  (a generated room_file exists for the scan AND it's on a project). One
   *  link, no restructuring: absent otherwise. */
  roomFile?: { href: string };
  /** Refine diagnostic readout (Field Capture P2, Layer 3, ruling R-G) — the
   *  drift figures and R123's advisory, behind the `room-view-refined-path`
   *  flag. Omitted entirely (no line at all) when the flag is off, when no
   *  Layer-2 delivery record exists, or when the artifacts don't parse — which
   *  is every scan in production today. No plan or orbit rendering. */
  refine?: RefineReadoutProps;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Groups detected objects by category, preserving first-appearance order
 *  (the scan's own detection order) — e.g. ["3 chairs", "table", "storage"]. */
function detectedCategories(geometry: RoomGeometry): string[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const obj of geometry.objects) {
    if (!counts.has(obj.cat)) order.push(obj.cat);
    counts.set(obj.cat, (counts.get(obj.cat) ?? 0) + 1);
  }
  return order.map((cat) => {
    const n = counts.get(cat) ?? 0;
    return n > 1 ? `${n} ${cat}s` : cat;
  });
}

export function FactsRail({
  geometry,
  thicknessConvention,
  scanDate,
  qualityGrade,
  coveragePercentage,
  photos,
  measure,
  roomFile,
  refine,
}: FactsRailProps) {
  const { w, d } = overallDims(geometry);
  const area = Math.round(areaOf(geometry));
  const lowConfWalls = geometry.walls.filter((wall) => wall.conf === 'low');
  const detected = detectedCategories(geometry);

  return (
    <aside className="border-t border-[var(--doc-ink-border)]">
      <Fact k="Area">
        {area} sq ft · {ftIn(w)} × {ftIn(d)}
      </Fact>

      <Fact k="Walls">
        {plural(geometry.walls.length, 'wall')} · {ftIn(geometry.wallH)}
        <Sub>stands in for ceiling — RoomPlan captures none</Sub>
        {thicknessConvention && <Sub>wall thickness drawn by convention</Sub>}
      </Fact>

      <Fact k="Openings">
        {plural(geometry.windows.length, 'window')} ·{' '}
        {plural(geometry.doors.length, 'door')} ·{' '}
        {plural(geometry.openings.length, 'opening')}
      </Fact>

      <Fact k="Detected">
        {detected.length > 0 ? detected.join(' · ') : 'nothing detected'}
      </Fact>

      {photos && photos.count > 0 && (
        <Fact k="Photos">
          {/* Quiet, not button-chrome (Measure-toolrow precedent): a scored
              word in the fact-value slot (I107) — the hairline draws under it
              on hover/focus and the mono "view" hint arrives with it. */}
          <button
            type="button"
            onClick={photos.onOpen}
            className="group inline-flex min-h-11 items-center gap-1.5 text-left font-mono text-[12px] font-light uppercase tracking-[0.1em] text-[var(--color-charcoal)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            <span className="da-score-hover">
              {plural(photos.count, 'photo')}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              view
            </span>
          </button>
        </Fact>
      )}

      <Fact k="Scan">
        {scanDate ? fmtDay(scanDate) : '—'}
        {qualityGrade ? ` · quality ${qualityGrade}` : ''}
        {coveragePercentage != null
          ? ` · ${coveragePercentage.toFixed(2)}`
          : ''}
      </Fact>

      {roomFile && (
        <Fact k="Room File">
          {/* Quiet, not button-chrome (Photos/Measure precedent): the same
              scored word in the fact-value slot, with a mono "open" hint on
              hover/focus. Links into /portal/projects/[id]/room-file/[scanId]. */}
          <Link
            href={roomFile.href}
            className="group inline-flex min-h-11 items-center gap-1.5 font-mono text-[12px] font-light uppercase tracking-[0.1em] text-[var(--color-charcoal)] no-underline outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            <span className="da-score-hover">drawing set</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              open
            </span>
          </Link>
        </Fact>
      )}

      {refine && (
        <Fact k={REFINE_COPY.factKey}>
          <RefineReadout {...refine} />
        </Fact>
      )}

      {lowConfWalls.length > 0 && (
        <Fact k="Verify">
          <Sub>
            {lowConfWalls.map((wall) => wall.name).join(' · ')} — drawn dashed;
            confirm on site
          </Sub>
        </Fact>
      )}

      {measure && (
        <div className="mt-4 flex gap-2.5">
          {/* The tool is a word, and arming it is a rule held under that word
              (I107): armed = charcoal ink + the steady score; at rest = aged
              oak, the score drawn only when asked. No fill, no box — the 44px
              target survives as invisible padding. */}
          <button
            type="button"
            onClick={measure.onArm}
            aria-pressed={measure.armed}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center px-1.5 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]',
              measure.armed
                ? 'text-[var(--color-charcoal)]'
                : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]',
            )}
          >
            <span
              className={cn('da-score-hover', measure.armed && 'da-score-on')}
            >
              Measure
            </span>
          </button>
          {measure.hasMeasurement && (
            <button
              type="button"
              onClick={measure.onClear}
              className="inline-flex min-h-11 min-w-11 items-center justify-center px-1.5 font-mono text-[12px] font-light uppercase tracking-[0.12em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              <span className="da-score-hover">Clear</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="border-b border-[var(--doc-ink-border)] py-[11px]">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
        {k}
      </div>
      <div className="mt-0.5 text-[14px] text-[var(--color-charcoal)]">
        {children}
      </div>
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1 block font-heading text-[12px] italic text-[var(--color-mocha)]">
      {children}
    </span>
  );
}
