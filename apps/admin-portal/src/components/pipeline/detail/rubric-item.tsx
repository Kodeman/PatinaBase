import { cn } from '@/lib/utils';
import type { VendorPipeline } from '@patina/types';

type VendorScore = VendorPipeline.VendorScore;
type RubricDimensionDef = VendorPipeline.RubricDimensionDef;

export function RubricItem({
  def,
  score,
}: {
  def: RubricDimensionDef;
  score: VendorScore | null;
}) {
  const raw = score?.raw_score ?? 0;
  const width = (raw / 5) * 100;
  const isLeah = def.owner === 'leah';
  const isScored = !!score?.raw_score;

  return (
    <div className="space-y-2 border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{def.name}</div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            Weight ×{def.weight} · {def.owner}
          </div>
        </div>
        <div className="text-right">
          {isScored ? (
            <>
              <div className="font-display text-2xl font-bold tabular-nums">
                {raw}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/5</span>
              </div>
              <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                by {score.scored_by}
              </div>
            </>
          ) : (
            <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              awaiting score
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-all',
            isLeah ? 'bg-patina-clay-beige' : 'bg-patina-success',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      {score?.evidence && (
        <p className="text-xs text-muted-foreground italic">“{score.evidence}”</p>
      )}
    </div>
  );
}
