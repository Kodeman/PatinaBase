'use client';

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
  return (
    <div
      className={`mb-2.5 overflow-hidden rounded-[8px] border bg-[var(--doc-paper)] transition-colors ${
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
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* ✓ done tick — sage when written, hollow when not (matches compose). */}
        <span
          aria-hidden
          className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-[0.6rem] font-bold transition-colors ${
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
        <span className="text-[0.86rem] font-semibold text-[var(--color-charcoal)]">{name}</span>
        <span
          className={`ml-auto max-w-[55%] truncate font-mono text-[0.55rem] tracking-[0.04em] text-[var(--color-aged-oak)] ${
            done ? '' : 'italic opacity-70'
          }`}
        >
          {status}
        </span>
        {/* chevron — rotates open in place (no navigation). */}
        <span
          aria-hidden
          className={`shrink-0 text-[0.7rem] text-[var(--color-aged-oak)] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--doc-ink-border)] px-4 pb-4 pt-3 motion-safe:animate-[doc-fade_200ms_ease-out]">
          {children}
        </div>
      )}
    </div>
  );
}
