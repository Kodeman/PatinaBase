'use client';

import type { ReactNode } from 'react';

export interface RowItemProps {
  /** Primary block — usually a title + subtitle. Takes the remaining width. */
  leading: ReactNode;
  /** Right-aligned trailing block — value, badge, action. Sized to its content. */
  end?: ReactNode;
  /** Optional full-width row below — progress bar, helper text, etc. */
  below?: ReactNode;
  /** Whole-row click handler. The row becomes a button when set. */
  onClick?: () => void;
  /** Add extra classes to the outer row container. */
  className?: string;
}

const BASE_CLASS =
  'border-b border-[var(--border-subtle,#e5e2dd)] py-[1.1rem] transition-all duration-150 hover:bg-[var(--bg-hover,rgba(0,0,0,0.02))]';

const CLICKABLE_CLASS = 'cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]';

/**
 * Shared list-row primitive used by the proposal and project list pages.
 *
 * The container provides the bordered-row + hover behavior that both
 * surfaces want; consumers decide the contents of `leading` / `end` /
 * `below`. Keep this layout-light on purpose — heavy formatting (status
 * pills, money, dates) belongs in callers via `@patina/utils` and
 * `<StatusBadge>`.
 */
export function RowItem({ leading, end, below, onClick, className }: RowItemProps) {
  const classes = [
    BASE_CLASS,
    onClick ? CLICKABLE_CLASS : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const headRow = (
    <div className="flex items-baseline justify-between gap-6">
      <div className="min-w-0 flex-1">{leading}</div>
      {end ? <div className="shrink-0 text-right">{end}</div> : null}
    </div>
  );

  const content = (
    <>
      {headRow}
      {below ? <div className="mt-2.5">{below}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${classes} block w-full text-left`}
        style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border-subtle, #e5e2dd)' }}
      >
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
