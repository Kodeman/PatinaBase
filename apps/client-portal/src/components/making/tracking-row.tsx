'use client';

import { Fragment } from 'react';
import type { FFEStageKey } from '@patina/types';

import {
  GOODS_JOURNEY_STAGES,
  journeyStageIndexForStatus,
} from '../commercial/journey-stepper';

/* ── TRACKING ROW — parcel-grade, for a piece of furniture ───────────────────
   The piece, what it cost, a six-stop micro-spine filled to where it actually
   stands, and C's status stamp inked in the stage's own colour.

   The six stops and the mapping onto them are NOT re-derived here: they are
   the same `GOODS_JOURNEY_STAGES` / `journeyStageIndexForStatus` the selection
   cards already run on, so a piece cannot read "Shipped" on one surface and
   "In production" on the other. Only the drawing is new — the existing
   `JourneyStepper` renders the stops as a word list, and the deck asks for a
   line of dots.

   THE STAMP STATES ONLY WHAT THE DATA KNOWS. A `ClientSelection` carries a
   stage and a room; it carries no maker, no city, and no estimated date. The
   deck's second stamp line ("Dayton, Ohio · est Aug 28") is fixture invention
   with no column behind it, so it is not drawn. A stamp that guesses is worse
   than no stamp. ────────────────────────────────────────────────────────── */

/**
 * The stage's phase, as a portal-local reading of the palette: a piece agreed
 * but not yet moving carries refinement's oak; a piece with the vendor carries
 * procurement's gold; a piece in transit or landed carries installation's
 * terracotta; a piece placed carries the walkthrough's sage.
 */
const STAGE_PHASE = [
  'var(--phase-refinement)', // Agreed
  'var(--phase-procurement)', // Ordered
  'var(--phase-procurement)', // In production
  'var(--phase-installation)', // Shipped
  'var(--phase-installation)', // Delivered
  'var(--phase-walkthrough)', // Installed
] as const;

/**
 * The stamp's ink — the phase colour DARKENED into legibility, never the raw
 * pastel.
 *
 * The `--phase-*` values are wash colours for rules and fills. Set as type on
 * `--bg-primary` they are illegible: procurement gold `#E8C547` reads about
 * 1.6:1 before the stamp's own 0.72 opacity. The deck does not do this either
 * — it ships a separate darkened stamp palette (`--dc-gold:#96702A`,
 * `--dc-blue:#63798E`, `--dc-sage:#5A6F52`) for exactly this mark, and
 * `SpineGate` already darkens its kind line the same way with `color-mix`.
 * 45% phase against charcoal lands on the deck's swatches.
 */
const STAGE_INK = STAGE_PHASE.map(
  (phase) => `color-mix(in srgb, ${phase} 45%, var(--color-charcoal))`,
);

export interface TrackingRowProps {
  /** The piece, as the client knows it. */
  name: string;
  /** The selection's image. Null draws a quiet placeholder block, not a gap. */
  imageUrl: string | null;
  /** What was agreed for it, in cents. Omitted when the line carries no price. */
  priceCents: number | null;
  /** Where the piece stands — the FF&E procurement stage, unmapped. */
  status: FFEStageKey;
}

// Whole-dollar, no cents — the idiom the rest of the commercial rail uses for
// a client reading their own selections (see client-selections.tsx), and the
// one every figure on this surface now speaks (`moneyInWords`).
function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function TrackingRow({ name, imageUrl, priceCents, status }: TrackingRowProps) {
  const stopIndex = journeyStageIndexForStatus(status);
  const stage = GOODS_JOURNEY_STAGES[stopIndex];
  const ink = STAGE_INK[stopIndex];

  return (
    <div
      data-testid="tracking-row"
      data-journey-stop={stage}
      className="flex items-start gap-4 border-b border-[var(--border-subtle)] py-3.5"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-[3px] object-cover"
          data-testid="tracking-row-thumb"
        />
      ) : (
        <span
          aria-hidden="true"
          data-testid="tracking-row-thumb-placeholder"
          className="h-16 w-16 shrink-0 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-warm)]"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="type-body-small font-medium text-[var(--text-primary)]">{name}</p>

        {typeof priceCents === 'number' && (
          <p className="type-meta-small mt-0.5 text-[var(--text-muted)]" data-testid="tracking-row-price">
            {money(priceCents)}
          </p>
        )}

        <MicroSpine stopIndex={stopIndex} stage={stage} ink={ink} />
      </div>

      <StatusStamp stage={stage} ink={ink} />
    </div>
  );
}

/** Six stops on a rule, filled to where the piece stands, the stop named. */
function MicroSpine({
  stopIndex,
  stage,
  ink,
}: {
  stopIndex: number;
  stage: string;
  ink: string;
}) {
  return (
    <div className="mt-2.5 flex items-center" data-testid="tracking-row-spine">
      <span className="sr-only">
        {`${stage} — stop ${stopIndex + 1} of ${GOODS_JOURNEY_STAGES.length}`}
      </span>
      {GOODS_JOURNEY_STAGES.map((stop, index) => {
        const passed = index < stopIndex;
        const current = index === stopIndex;
        return (
          <Fragment key={stop}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className="h-px w-[10px] shrink-0 sm:w-[17px]"
                style={{
                  backgroundColor: passed || current ? 'var(--color-mocha)' : 'var(--border-default)',
                }}
              />
            )}
            <span
              aria-hidden="true"
              data-stop={stop}
              data-stop-state={current ? 'current' : passed ? 'passed' : 'ahead'}
              className={
                current
                  ? 'h-3 w-3 shrink-0 rounded-full border-2'
                  : 'h-[7px] w-[7px] shrink-0 rounded-full'
              }
              style={
                current
                  ? { backgroundColor: ink, borderColor: 'var(--color-mocha)' }
                  : { backgroundColor: passed ? 'var(--color-mocha)' : 'var(--border-default)' }
              }
            />
          </Fragment>
        );
      })}
      <span
        aria-hidden="true"
        data-testid="tracking-row-stop-label"
        className="ml-4 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]"
      >
        {stage}
      </span>
    </div>
  );
}

/**
 * C's status stamp — an inspection tag pressed onto the row: doubled border,
 * the stage's ink at low opacity, a couple of degrees off square, and one
 * line of mono caps. Decorative to a screen reader (the micro-spine already
 * announces the stop in words), so it is hidden rather than read twice.
 */
function StatusStamp({ stage, ink }: { stage: string; ink: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="tracking-row-stamp"
      className="relative mt-1 inline-block shrink-0 -rotate-[2.2deg] rounded-[2px] border-[1.5px] border-current px-[11px] pb-[5px] pt-[6px] text-center opacity-[0.72]"
      style={{ color: ink }}
    >
      <span className="pointer-events-none absolute inset-[2.5px] rounded-[1px] border border-current opacity-[0.42]" />
      <span className="relative block whitespace-nowrap font-mono text-[9px] font-bold uppercase tracking-[0.2em]">
        {stage}
      </span>
    </span>
  );
}
