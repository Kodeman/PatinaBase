import type { ReactNode } from 'react';

interface SectionProps {
  title?: string;
  /** Right-aligned content on the heading row */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, action, children, className }: SectionProps) {
  return (
    <section className={`animate-section-enter ${className ?? ''}`}>
      {title && (
        <div className="mb-6 flex items-end justify-between border-b border-[var(--border-default)] pb-3">
          <h2 className="type-section-head">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
