'use client';

import { useId } from 'react';

/**
 * One facet of the Drafting Room (R42) — the anti-wizard's section primitive,
 * a sibling to the Composing Page's ComposeSection (compose-section.tsx). A
 * facet is a self-contained part of the proposal (Rooms, FF&E, Palette…) that
 * fills in ANY order, shows its own completion (a ✓ tick + a one-line status
 * word), and opens/closes in place — no gate, no stepper, no required order.
 *
 * It hosts an arbitrary child — here, a REUSED legacy scope-builder editor,
 * each of which is proposalId-addressed and self-persisting. The facet adds no
 * Save: the proposal is always a real draft.
 *
 * Zero shadows (D4); depth is the ink border + the done/open accent, never a
 * drop. Paper tokens throughout (--doc-paper / --doc-ink-border).
 */

export function FacetSection({
  name,
  /** The quiet status word — "done", a one-line summary, or "not yet written". */
  status,
  done,
  open,
  onToggle,
  /** A small movement accent dot in the head (the line this facet feeds). */
  accent,
  children,
}: {
  name: string;
  status: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  accent?: string;
  children: React.ReactNode;
}) {
  const contentId = useId();

  return (
    <div
      className={`mb-2.5 overflow-hidden rounded-[8px] border bg-[var(--doc-paper)] transition-colors motion-reduce:transition-none ${
        open
          ? 'border-[var(--color-clay)]'
          : done
            ? 'border-[rgba(168,181,160,0.5)]'
            : 'border-[var(--color-pearl)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      >
        {/* ✓ done tick — sage when written, hollow when not (matches compose). */}
        <span
          aria-hidden
          className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-[0.6rem] font-bold transition-colors motion-reduce:transition-none ${
            done
              ? 'border-[var(--color-sage)] bg-[rgba(168,181,160,0.18)] text-[var(--color-sage)]'
              : 'border-[#cfc8bb] text-transparent'
          }`}
        >
          ✓
        </span>
        {accent && (
          <span
            aria-hidden
            className="h-[5px] w-[5px] shrink-0 rounded-full"
            style={{ background: accent }}
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span className="doc-type-body shrink-0 font-semibold leading-tight text-[var(--color-charcoal)]">
            {name}
          </span>
          <span
            title={status}
            className={`doc-type-meta truncate leading-tight sm:ml-auto ${
              done ? '' : 'italic opacity-70'
            }`}
          >
            {status}
          </span>
        </span>
        {/* chevron — rotates open in place (no navigation). */}
        <span
          aria-hidden
          className={`doc-type-meta shrink-0 text-[var(--color-quiet-ink)] transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
      </button>
      {open && (
        <div
          id={contentId}
          className="border-t border-[var(--doc-ink-border)] px-4 pb-4 pt-3 motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {children}
        </div>
      )}
    </div>
  );
}
