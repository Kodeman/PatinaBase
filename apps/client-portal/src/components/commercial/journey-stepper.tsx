import type { FFEStageKey, TradeScopeProgressState } from '@patina/types';

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

/**
 * Trade scope journey — a sub does not move through procurement, they move
 * through the work itself. Four stops (matches the deck's slide-19
 * vocabulary), one per TradeScopeProgressState EXCEPT 'accepted': the
 * client's own acceptance act is the endpoint of "Complete", not a fifth
 * stop of its own, so 'accepted' maps onto the same index as
 * 'substantially_complete'. A client only ever sees a presence line once the
 * studio has engaged the sub (progress_state can't go below 'engaged' by the
 * time a line exists), but 'none' still maps to the first stop as a safe
 * fallback.
 */
export const TRADE_JOURNEY_STAGES = [
  'Agreed',
  'Engaged',
  'In progress',
  'Complete',
] as const;

export type TradeJourneyStage = (typeof TRADE_JOURNEY_STAGES)[number];

const TRADE_STAGE_INDEX_BY_STATE: Record<TradeScopeProgressState, number> = {
  none: 0,
  engaged: 1,
  in_progress: 2,
  substantially_complete: 3,
  accepted: 3,
};

/** Maps a trade scope's progress_state onto its index in TRADE_JOURNEY_STAGES. */
export function tradeJourneyStageIndexForState(state: TradeScopeProgressState): number {
  return TRADE_STAGE_INDEX_BY_STATE[state] ?? 0;
}

function StageList({
  stages,
  currentIndex,
  ariaLabel,
}: {
  stages: readonly string[];
  currentIndex: number;
  ariaLabel: string;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1" aria-label={ariaLabel}>
      {stages.map((stage, index) => {
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
            {index < stages.length - 1 && (
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

export function JourneyStepper({ status }: { status: FFEStageKey }) {
  return (
    <StageList
      stages={GOODS_JOURNEY_STAGES}
      currentIndex={journeyStageIndexForStatus(status)}
      ariaLabel="Order journey"
    />
  );
}

export function TradeJourneyStepper({ state }: { state: TradeScopeProgressState }) {
  return (
    <StageList
      stages={TRADE_JOURNEY_STAGES}
      currentIndex={tradeJourneyStageIndexForState(state)}
      ariaLabel="Trade scope journey"
    />
  );
}
