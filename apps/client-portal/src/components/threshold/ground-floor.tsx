'use client';

import type { ReactNode } from 'react';

import { parseSpineDate, startOfWeek, type SpinePhase } from '@/components/making/making-spine';

/* ── THE GROUND FLOOR ───────────────────────────────────────────────────────
   Path A, "The Attendance": the house a project has before it has rooms.

   There is no plan key and there are no room bands, because there is nothing
   to draw — a key of no rooms is a blank rectangle, and a blank rectangle is
   a worse answer than silence. What is left is the attendance: what is asked,
   what was written, what is on the bench, what is owed, what came before, and
   what is ahead.

   The order is the whole component. Every slot is a node built next door in
   threshold.tsx, so this file owns nothing but the reading sequence — which
   is the one thing the two paths must not disagree about. A slot with nothing
   in it renders nothing; absence is silence here too. ───────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

/**
 * A target date softened to the week it lands in — the studio promises weeks,
 * not days, so the line ahead promises weeks too.
 */
function weekInWords(date: string | null | undefined): string | null {
  const target = parseSpineDate(date);
  return target ? `the week of ${LONG_MONTH_DAY.format(startOfWeek(target))}` : null;
}

export interface GroundFloorProps {
  /** The standing sentence, the ledger, the since row. */
  doorstep: ReactNode;
  /** The studio's standing note. */
  note: ReactNode;
  /** What the note encloses, and what else waits: the doors, walls, approvals. */
  enclosures: ReactNode;
  /** The bench — pieces that are not home yet. */
  bench: ReactNode;
  /** The toll — the letterbox, standing on its own without a house to sit in. */
  toll: ReactNode;
  previously: ReactNode;
  /** The sketched future, straight off the spine's own phase split. */
  ahead: SpinePhase[];
  mat: ReactNode;
}

export function GroundFloor({
  doorstep,
  note,
  enclosures,
  bench,
  toll,
  previously,
  ahead,
  mat,
}: GroundFloorProps) {
  const lines = ahead.flatMap((phase) => {
    const when = weekInWords(phase.targetDate);
    return when ? [{ id: phase.id, text: `${phase.label} · ${when}` }] : [];
  });

  return (
    <div className="min-w-0" data-testid="ground-floor">
      {doorstep}
      {note}
      {enclosures}
      {bench}
      {toll}
      {/* Rooms-as-lines belongs here in Path A's order. On the ground floor
          there are none by definition, so the slot stays empty rather than
          printing a heading over nothing. */}
      {previously}

      {lines.length > 0 && (
        <section
          id="ahead"
          data-threshold-unit="ahead"
          data-dimmable=""
          data-testid="ahead"
          aria-labelledby="ahead-title"
          className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
        >
          <h2
            id="ahead-title"
            className="font-heading pt-2.5 text-[1.35rem] font-medium tracking-[-0.012em]"
          >
            Ahead
          </h2>
          {lines.map((line) => (
            <p
              key={line.id}
              data-testid="ahead-line"
              className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-body)]"
            >
              {line.text}
            </p>
          ))}
        </section>
      )}

      {mat}
    </div>
  );
}
