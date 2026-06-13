/**
 * The Strata mini-rule (spec §10) — the small two-line clay divider that
 * sits under a room heading (and other in-section subdivisions). Sibling to
 * StrataMark: the mark is a state device, the mini-rule is a separator.
 *   line 1 · 26px · clay
 *   line 2 · 16px · clay @ 0.5 opacity
 */

export function StrataMiniRule({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex flex-col gap-[3px] ${className}`}>
      <span className="h-px w-[26px] bg-[var(--color-clay)]" />
      <span className="h-px w-[16px] bg-[var(--color-clay)] opacity-50" />
    </span>
  );
}
