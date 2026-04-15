import type { ReactNode } from 'react';

interface EmptyStateProps {
  message?: string;
  children?: ReactNode;
  /** Optional small meta label above the message */
  label?: string;
}

export function EmptyState({ message, label, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {label && <span className="type-meta-small">{label}</span>}
      {message && (
        <p className="type-body max-w-md italic text-[var(--text-muted)]">{message}</p>
      )}
      {children}
    </div>
  );
}
