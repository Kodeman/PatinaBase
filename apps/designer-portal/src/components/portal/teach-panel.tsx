import type { ReactNode } from 'react';

interface TeachPanelProps {
  title: string;
  badge?: string;
  badgeVariant?: 'required' | 'optional';
  children: ReactNode;
}

export function TeachPanel({ title, badge, badgeVariant = 'required', children }: TeachPanelProps) {
  return (
    <div className="rounded-lg border border-[rgba(196,165,123,0.15)] bg-[rgba(196,165,123,0.04)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="type-item-name">{title}</h3>
        {badge && (
          badgeVariant === 'required' ? (
            <span className="rounded-sm bg-[var(--accent-primary)] px-2 py-0.5 type-meta-small text-white">
              {badge}
            </span>
          ) : (
            <span className="type-meta-small text-[var(--color-sage)]">
              {badge}
            </span>
          )
        )}
      </div>
      {children}
    </div>
  );
}
