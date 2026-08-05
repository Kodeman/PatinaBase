import type { FFEStageKey } from '@patina/types';

/**
 * Goods journey the client sees on a selection card — six stops distilled
 * from the 8-state FF&E procurement lifecycle (`@patina/types` FFEStageKey).
 * The three pre-agreement stages (specified/quoted/approved) are internal
 * studio work the client never needs to track, so they all read as the same
 * first stop: the piece is agreed.
 */
export const GOODS_JOURNEY_STAGES = [
  'Agreed',
  'Ordered',
  'In production',
  'Shipped',
  'Delivered',
  'Installed',
] as const;

export type GoodsJourneyStage = (typeof GOODS_JOURNEY_STAGES)[number];

const STAGE_INDEX_BY_STATUS: Record<FFEStageKey, number> = {
  specified: 0,
  quoted: 0,
  approved: 0,
  ordered: 1,
  production: 2,
  shipped: 3,
  delivered: 4,
  installed: 5,
};

/** Maps an FF&E procurement status onto its index in GOODS_JOURNEY_STAGES. */
export function journeyStageIndexForStatus(status: FFEStageKey): number {
  return STAGE_INDEX_BY_STATUS[status] ?? 0;
}

export function JourneyStepper({ status }: { status: FFEStageKey }) {
  const currentIndex = journeyStageIndexForStatus(status);

  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1" aria-label="Order journey">
      {GOODS_JOURNEY_STAGES.map((stage, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={stage} className="flex items-center gap-1.5">
            <span
              className="type-meta-small"
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                color: isCurrent
                  ? 'var(--accent-primary)'
                  : isComplete
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
                fontWeight: isCurrent ? 600 : 400,
              }}
            >
              {stage}
            </span>
            {index < GOODS_JOURNEY_STAGES.length - 1 && (
              <span aria-hidden="true" className="text-[var(--border-default)]">
                ·
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
