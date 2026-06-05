import type { ReactNode } from 'react';

export interface ListPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /**
   * Action cluster rendered to the right of the title, baseline-aligned.
   * Pages compose their own kit `Button`s (e.g.
   * `<Button asChild><Link href="…">+ New Proposal</Link></Button>`), so
   * multi-action headers and non-primary variants work without special props.
   */
  actions?: ReactNode;
  /** Optional filter/toolbar row rendered full-width below the title row. */
  children?: ReactNode;
}

/**
 * Standard list-page header: an h1 with optional actions on the right, an
 * optional subtitle beneath it, and an optional full-width children row
 * (filters/toolbar) below the title row.
 *
 * The h1 renders at 1.5rem (`text-[1.5rem]`) to match the section-head size
 * list pages currently use — this standardizes that size rather than
 * enlarging it.
 */
export function ListPageHeader({
  title,
  subtitle,
  actions,
  children,
}: ListPageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="type-section-head text-[1.5rem]">{title}</h1>
          {subtitle && (
            <div className="type-label-secondary">{subtitle}</div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
