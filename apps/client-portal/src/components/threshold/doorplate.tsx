'use client';

import { StrataMark } from '@/components/strata-mark';

/* ── The doorplate ──────────────────────────────────────────────────────────
   The Making's letterhead, with the corner links taken off the plate.

   A doorplate is fixed to the house: it names the studio, the place, the
   project and the month, and it goes nowhere. That is the whole rule — this
   file renders NO anchor of any kind, because on the Threshold the seven old
   destinations have collapsed into anchors on this one page and a plate that
   sends you elsewhere would re-open them.

   Presentational by construction. Every fact arrives as a prop; a fact the
   surface does not know is simply not printed. A line with nothing in it is
   not rendered at all rather than printed as an empty rule. ─────────────── */

export interface DoorplateProps {
  /** The studio that keeps the house. */
  studioName?: string | null;
  /** Where the house is. */
  location?: string | null;
  /** The project's name, as the studio wrote it. */
  projectName: string;
  /** The client-facing phase label — "Procurement". */
  phaseLabel?: string | null;
  /** Today's month and year: "August 2026". */
  monthLabel?: string | null;
  /** Who this page is for — the addressee of the plate. */
  preparedFor?: string | null;
}

function words(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function Doorplate({
  studioName,
  location,
  projectName,
  phaseLabel,
  monthLabel,
  preparedFor,
}: DoorplateProps) {
  const keeper = [words(studioName), words(location)].filter(
    (part): part is string => part !== null,
  );
  const addressee = words(preparedFor);
  const vitals = [words(location), words(phaseLabel), words(monthLabel)].filter(
    (part): part is string => part !== null,
  );

  return (
    <header
      id="doorplate"
      data-threshold-unit="doorplate"
      data-testid="doorplate"
      className="border-b border-[var(--border-default)] pb-3"
    >
      <StrataMark variant="mini" />

      {(keeper.length > 0 || addressee) && (
        <p
          data-testid="doorplate-line"
          className="flex flex-wrap justify-between gap-x-[18px] gap-y-1 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.13em] text-[var(--text-body)]"
        >
          <span>{keeper.join(' · ')}</span>
          {addressee && <span>{`prepared for ${addressee}`}</span>}
        </p>
      )}

      <h1
        data-testid="doorplate-title"
        className="font-heading my-[0.15em] text-[clamp(2.1rem,4.6vw,3.5rem)] font-medium leading-[1.14] tracking-[-0.012em] text-[var(--text-primary)]"
      >
        {projectName}
      </h1>

      {vitals.length > 0 && (
        <p
          data-testid="doorplate-sub"
          className="font-mono text-[11.5px] leading-[1.5] tracking-[0.09em] text-[var(--text-body)]"
        >
          {vitals.join(' · ')}
        </p>
      )}
    </header>
  );
}
