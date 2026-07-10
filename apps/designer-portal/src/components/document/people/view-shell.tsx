'use client';

/**
 * Shared view chrome for the People Room — the Playfair title + the quiet
 * sub-line (prototype .view-title / .view-sub), a placeholder block the
 * Wave-0 skeleton uses until a track fills its slot, and the R94 pencil-idiom
 * empty-state teach. Typography-first, zero shadows (D4).
 */

import type { ReactNode } from 'react';

export function ViewHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-heading text-[1.6rem] font-medium leading-tight text-[var(--color-charcoal)]">
        {title}
      </h1>
      {sub && <p className="mt-0.5 text-[0.78rem] text-[var(--color-aged-oak)]">{sub}</p>}
    </div>
  );
}

/** A quiet "arrives in Track N" notice for an unfilled view slot. */
export function ViewPlaceholder({ track }: { track: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-8 text-center">
      <p className="text-[0.76rem] leading-relaxed text-[var(--color-aged-oak)]">
        This view is bound in <span className="font-mono">{track}</span>. The Room shell, the
        directory, and the navigation contract are in place around it.
      </p>
    </div>
  );
}

/**
 * R94 — the studio's pencil-idiom empty-state teach: what/why in Playfair
 * italic (a graphite tone), an en-dash lead, and at most one next-move link
 * in DM Mono. No card, no border, no illustration — typography carries it,
 * matching the Desk's own "Nothing needs your hand" precedent. Renders only
 * where a view actually has nothing to show; not a tour, not dismissible.
 */
export function EmptyTeach({
  children,
  action,
}: {
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <p className="px-1 py-8 font-heading text-[15px] italic leading-relaxed text-[var(--color-aged-oak)]">
      – {children}
      {action && (
        <>
          {' '}
          <button
            type="button"
            onClick={action.onClick}
            className="not-italic font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)] transition-colors hover:text-[var(--color-mocha)]"
          >
            {action.label} →
          </button>
        </>
      )}
    </p>
  );
}
