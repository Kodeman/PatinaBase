/**
 * Document letterhead (spec v1.1 §4, prototype v0.4 .doc-letterhead):
 * mini Strata Mark, Playfair title, one-line vitals. Pure presentation.
 */

import { StrataMark } from './strata-mark';
import type { FillState } from '@/lib/document/fill-state';

export function DocLetterhead({
  title,
  vitals,
  fill,
}: {
  title: string;
  vitals: string;
  /** R15: the mark as progress device — how far the engagement has come. */
  fill?: FillState;
}) {
  return (
    <header className="mb-4 border-b border-[var(--color-pearl)] pb-4">
      <div className="mb-2.5">
        <StrataMark state="active" size="lg" fill={fill} />
      </div>
      <h1 className="font-heading text-[1.55rem] font-medium leading-tight tracking-[-0.01em] text-[var(--color-charcoal)]">
        {title}
      </h1>
      {vitals && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{vitals}</p>}
    </header>
  );
}
