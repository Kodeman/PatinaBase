import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Optional italic accent word appended to the title */
  accent?: string;
  description?: string;
  /** Right-aligned meta content (timestamp, status) */
  meta?: ReactNode;
  /** Right-aligned action buttons */
  actions?: ReactNode;
}

export function PageHeader({ title, accent, description, meta, actions }: PageHeaderProps) {
  return (
    <section className="pb-4 pt-12 animate-section-enter">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-page-title">
          {title}
          {accent && (
            <>
              {' '}
              <span className="font-heading italic text-[var(--color-aged-oak)]">{accent}</span>
            </>
          )}
        </h1>
        {(meta || actions) && (
          <div className="flex items-center gap-4">
            {meta && <span className="type-meta hidden md:block">{meta}</span>}
            {actions}
          </div>
        )}
      </div>
      {description && (
        <p className="type-body mt-3 max-w-2xl text-[var(--text-muted)]">{description}</p>
      )}
    </section>
  );
}
