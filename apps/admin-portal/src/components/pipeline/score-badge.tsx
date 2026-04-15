import { cn } from '@/lib/utils';
import type { VendorPipeline } from '@patina/types';

const TRIAGE_STYLES: Record<VendorPipeline.TriageLevel, string> = {
  green: 'text-patina-success',
  yellow: 'text-patina-warning',
  orange: 'text-patina-clay-beige',
  red: 'text-patina-error',
};

export function ScoreBadge({
  score,
  triage,
  size = 'md',
  showLabel = false,
  className,
}: {
  score: number | null | undefined;
  triage: VendorPipeline.TriageLevel | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}) {
  const colorClass = triage ? TRIAGE_STYLES[triage] : 'text-muted-foreground';
  const sizeClass =
    size === 'lg' ? 'text-5xl' : size === 'sm' ? 'text-xl' : 'text-3xl';

  if (score == null) {
    return (
      <span className={cn('font-mono text-xs text-muted-foreground', className)}>
        unscored
      </span>
    );
  }

  return (
    <div className={cn('flex flex-col items-end', className)}>
      <span className={cn('font-display font-bold tabular-nums leading-none', sizeClass, colorClass)}>
        {score}
      </span>
      {showLabel && triage && (
        <span className={cn('font-mono text-[0.6rem] uppercase tracking-wide mt-1', colorClass)}>
          {triage}
        </span>
      )}
    </div>
  );
}
