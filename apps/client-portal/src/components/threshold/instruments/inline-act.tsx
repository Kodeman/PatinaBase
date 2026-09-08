'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

/* ── The inline act (house sheet §A5 / §F-D) ────────────────────────────────
   A tertiary act living inside a sentence. It inherits the sentence's family,
   size, case and colour, keeps no 44px control box of its own, and rests on a
   1px oak rule 3px under the baseline.

   THE RULE IS UNCONDITIONAL. A word inside prose that only rules itself on
   hover is invisible to every reader holding a phone, which is the whole of
   IX03 / IX04 / B01. There is no `@media (hover:none)` variant and no
   `scaleX(0)`.

   The grammar lives here rather than in globals.css because globals.css is
   another lane's file this wave; the class is a string so the doorstep and
   the story pole ink the same word the same way. ─────────────────────────── */

export const INLINE_ACT_CLASS = [
  'inline cursor-pointer border-0 border-b border-solid bg-transparent p-0 pb-[3px]',
  'border-b-[var(--color-aged-oak)] no-underline',
  '[font:inherit] [letter-spacing:inherit] [text-transform:inherit] [color:inherit]',
  '[-webkit-box-decoration-break:clone] [box-decoration-break:clone]',
  'hover:border-b-[1.5px] hover:border-b-[var(--color-quiet-ink)] hover:pb-[2.5px]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-[var(--color-clay-ink)]',
].join(' ');

export interface InlineActProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> {
  /** Always an in-page anchor: nothing on the Threshold opens a route. */
  href: string;
  children: ReactNode;
}

export function InlineAct({ href, children, ...rest }: InlineActProps) {
  return (
    <a {...rest} href={href} data-inline-act="" className={INLINE_ACT_CLASS}>
      {children}
    </a>
  );
}
