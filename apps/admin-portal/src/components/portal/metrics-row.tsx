import type { ReactNode } from 'react';

interface MetricsRowProps {
  children: ReactNode;
  /** Number of columns on desktop. Default 4. */
  columns?: 2 | 3 | 4;
}

const colClasses: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

/**
 * Divider pattern for MetricBlock children: wraps each child with the
 * vertical-divider rhythm designer portal uses. Accepts any children —
 * typically a set of <MetricBlock/>.
 */
export function MetricsRow({ children, columns = 4 }: MetricsRowProps) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div
      className={`mt-10 grid grid-cols-2 gap-6 border-b border-[var(--border-default)] pb-8 ${colClasses[columns]} md:gap-0 animate-section-enter`}
      style={{ animationDelay: '150ms' }}
    >
      {items.map((child, i) => (
        <div
          key={i}
          className={
            i === 0
              ? 'pr-0 md:pr-8'
              : 'border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8'
          }
        >
          {child}
        </div>
      ))}
    </div>
  );
}
