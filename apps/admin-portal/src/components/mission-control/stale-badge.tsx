// Terracotta chip shown when a task has been flagged stale (flagged_stale_at set
// by the queue-groom job for awaiting_review items older than the SLA). A quiet
// hairline chip, not a shout — it earns attention by color, not weight.

interface StaleBadgeProps {
  flaggedStaleAt: string | null | undefined;
  className?: string;
}

export function StaleBadge({ flaggedStaleAt, className = '' }: StaleBadgeProps) {
  if (!flaggedStaleAt) return null;

  return (
    <span
      data-testid="stale-badge"
      className={`inline-flex items-center gap-1 border border-[var(--color-terracotta)] px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.07em] text-[var(--color-terracotta)] ${className}`}
      style={{ fontFamily: 'var(--font-meta)' }}
      title={`Flagged stale ${new Date(flaggedStaleAt).toLocaleString()}`}
    >
      Stale
    </span>
  );
}
