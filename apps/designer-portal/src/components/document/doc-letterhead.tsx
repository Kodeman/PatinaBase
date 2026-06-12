/**
 * Document letterhead (spec v1.1 §4, prototype v0.4 .doc-letterhead):
 * mini Strata Mark, Playfair title, one-line vitals. Pure presentation.
 */

import { StrataMark } from './strata-mark';

export function DocLetterhead({ title, vitals }: { title: string; vitals: string }) {
  return (
    <header className="mb-4 border-b border-[var(--color-pearl)] pb-4">
      <div className="mb-2.5">
        <StrataMark state="active" size="lg" />
      </div>
      <h1 className="font-heading text-[1.55rem] font-medium leading-tight tracking-[-0.01em] text-[var(--color-charcoal)]">
        {title}
      </h1>
      {vitals && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{vitals}</p>}
    </header>
  );
}
