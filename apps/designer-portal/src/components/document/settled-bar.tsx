'use client';

/**
 * Settled section bar (spec §4): letterhead bar + stamp; unfolds in place,
 * read-only. Every settled phase with a read-only body is expandable now — the
 * designer clicks a completed phase (spine marker or the bar) to review what was
 * captured (Brief, Discovery, Direction, Proposal). `anchorId` makes the bar the
 * scroll target for spine jumps.
 */

import { Stamp } from './stamp';

export function SettledBar({
  name,
  hint,
  stamp,
  open = false,
  onToggle,
  children,
  anchorId,
}: {
  name: string;
  hint?: string;
  stamp?: { label: string; color: string; ink?: string };
  open?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
  /** DOM id (sectionAnchorId) so the spine can scroll to this bar. */
  anchorId?: string;
}) {
  const expandable = Boolean(onToggle);
  const rowClass =
    'flex w-full items-center justify-between gap-3 rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(229,226,221,0.32)] px-4 py-3 text-left';
  const inner = (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="font-heading text-[13.5px] font-medium text-[var(--color-aged-oak)]">
          {name}
        </span>
        {(hint || expandable) && (
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            {[hint, expandable ? (open ? 'fold ↑' : 'unfold ↓') : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {stamp && <Stamp label={stamp.label} color={stamp.color} ink={stamp.ink} />}
    </>
  );

  return (
    <div id={anchorId} className="mb-2 scroll-mt-24">
      {expandable ? (
        <button
          type="button"
          data-settled-heading
          aria-expanded={open}
          aria-controls={anchorId ? `${anchorId}-review` : undefined}
          onClick={onToggle}
          className={`${rowClass} hover:border-[#CFC8BB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]`}
        >
          {inner}
        </button>
      ) : (
        <div
          data-settled-heading
          tabIndex={-1}
          className={`${rowClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]`}
        >
          {inner}
        </div>
      )}
      {expandable && (
        <div
          id={anchorId ? `${anchorId}-review` : undefined}
          hidden={!open}
          className="rounded-b-[5px] border border-t-0 border-[var(--color-pearl)] bg-[rgba(252,250,246,0.7)] px-4 pb-4 pt-3.5"
        >
          {open ? children : null}
        </div>
      )}
    </div>
  );
}
