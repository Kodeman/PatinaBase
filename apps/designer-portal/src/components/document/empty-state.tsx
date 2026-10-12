/**
 * EmptyState — the one empty state (US-28 S1; uplift.md (b)5; house sheet
 * §G-10).
 *
 * A Section with nothing in it: the Section's eyebrow, ONE sentence with its
 * starting act inline, and the Section's own closing rule. Never a dashed
 * box, never a rule with nothing above it, never a spinner (loading is not
 * empty). The one exception, `framed`: a Section of Cards that empties keeps
 * one card frame for its sentence (US-26 A's close-of-day Today).
 *
 * The classes are the US-28 S1 block's (`.section`, `.sec-head`, `.eb`,
 * `.orn`, `.empty-t`, `.card-empty`), so the empty Section closes on the same
 * rule a full one does.
 */

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** The Section's eyebrow, as the full Section prints it ("Plans"). It also
   *  names the region for assistive technology. */
  eyebrow: string;
  /** The one sentence. */
  children: ReactNode;
  /** The starting act, printed inline after the sentence: one secondary or
   *  tertiary act, never a filled one. */
  act?: ReactNode;
  /** Controls on the eyebrow's baseline, as the full Section carries them
   *  (the Desk's "Mine · The studio's"). */
  controls?: ReactNode;
  /** A Section of Cards that empties keeps one card frame (§G-10). */
  framed?: boolean;
  className?: string;
}

export function EmptyState({
  eyebrow,
  children,
  act,
  controls,
  framed = false,
  className,
}: EmptyStateProps) {
  const line = (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <p className="empty-t">{children}</p>
      {act}
    </div>
  );

  return (
    <section
      aria-label={eyebrow}
      data-empty-state
      className={className ? `section ${className}` : 'section'}
    >
      <div className="sec-head">
        <p className="eb">
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>{eyebrow}</span>
        </p>
        {controls}
      </div>
      {framed ? <div className="card-empty">{line}</div> : line}
    </section>
  );
}
