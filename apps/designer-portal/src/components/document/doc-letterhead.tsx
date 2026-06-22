/**
 * Document letterhead (spec v1.1 §4, prototype v0.4 .doc-letterhead):
 * mini Strata Mark, Playfair title, the client line, one-line vitals. Pure
 * presentation. The client ("who this is for") is a first-class subtitle in the
 * title block (R68.2) — directly under the title, above the small vitals.
 */

import type { ReactNode } from 'react';
import { StrataMark } from './strata-mark';
import type { FillState } from '@/lib/document/fill-state';

export function DocLetterhead({
  title,
  vitals,
  fill,
  client,
}: {
  title: string;
  vitals: string;
  /** R15: the mark as progress device — how far the engagement has come. */
  fill?: FillState;
  /** The client this document is for — the clickable HouseholdChip, rendered as
   *  a prominent subtitle in the title block (not a tiny line below it). */
  client?: ReactNode;
}) {
  return (
    <header className="mb-4 border-b border-[var(--color-pearl)] pb-4">
      <div className="mb-2.5">
        <StrataMark state="active" size="lg" fill={fill} label={fill ? 'Document progress' : undefined} />
      </div>
      <h1 className="font-heading text-[1.55rem] font-medium leading-tight tracking-[-0.01em] text-[var(--color-charcoal)]">
        {title}
      </h1>
      {client}
      {vitals && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{vitals}</p>}
    </header>
  );
}
