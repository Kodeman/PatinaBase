import type { BoardReactionStatus } from '@patina/supabase';

const STATUS_CONFIG: Record<BoardReactionStatus, { label: string; color: string }> = {
  awaiting_reaction: { label: 'Awaiting reaction', color: 'var(--text-muted)' },
  reactions_in: { label: 'Reactions in', color: 'var(--color-dusty-blue, #8B9CAD)' },
  approved_pipeline: { label: 'Approved · pipeline', color: 'var(--color-sage)' },
};

/**
 * Small, state-carrying chip for a board card (board-paths W2b #1): one of
 * "awaiting reaction" / "reactions in" / "approved → pipeline", or nothing at
 * all for a board that has never been shared. Colour only on this dot, per
 * house convention (small state-carrying things may carry colour).
 */
export function BoardReactionStatusChip({
  status,
  className,
}: {
  status: BoardReactionStatus | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)] ${className ?? ''}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}
