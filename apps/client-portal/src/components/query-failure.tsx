'use client';

interface QueryFailureProps {
  title: string;
  message: string;
  onRetry: () => unknown;
  className?: string;
}

/**
 * Inline read failure for React Query surfaces. Keeping this separate from an
 * empty or not-found state prevents a temporary data outage from telling a
 * client that an artifact does not exist.
 */
export function QueryFailure({
  title,
  message,
  onRetry,
  className = '',
}: QueryFailureProps) {
  return (
    <div
      role="alert"
      data-testid="query-failure"
      className={`rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-6 text-center ${className}`}
    >
      <h2 className="type-section-head">{title}</h2>
      <p className="type-body-small mx-auto mt-2 max-w-md text-[var(--text-muted)]">
        {message}
      </p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="type-meta mt-4 min-h-11 rounded-[3px] border border-[var(--border-default)] px-4 transition hover:border-[var(--text-primary)]"
      >
        Try again
      </button>
    </div>
  );
}
