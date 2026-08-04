import type { BoardVerdictCounts } from '@patina/supabase';
import type { Verdict } from '@patina/utils';
import { verdictChipSpec } from '@/lib/document/verdict-chip';

interface BoardVerdictSummaryProps {
  counts?: BoardVerdictCounts | null;
  className?: string;
}

const VERDICTS: Verdict[] = ['approved', 'rejected', 'comment'];

/** Quiet, read-only verdict totals for board cover cards. */
export function BoardVerdictSummary({ counts, className }: BoardVerdictSummaryProps) {
  if (!counts || counts.total === 0) return null;

  const entries = VERDICTS.flatMap((verdict) => {
    const count = counts[verdict];
    const spec = verdictChipSpec(verdict);
    return count && spec ? [{ verdict, count, spec }] : [];
  });

  return (
    <div
      aria-label={`Client verdicts: ${entries
        .map(({ count, spec }) => `${count} ${spec.label.toLowerCase()}`)
        .join(', ')}`}
      className={`flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)] ${className ?? ''}`}
    >
      {entries.map(({ verdict, count, spec }) => (
        <span key={verdict} className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: spec.color }}
          />
          {count} {spec.label}
        </span>
      ))}
    </div>
  );
}
