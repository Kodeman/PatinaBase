'use client';

import { useState } from 'react';

import { GOODS_JOURNEY_STAGES } from '@/components/commercial/journey-stepper';
import { countInWords } from '@/components/making/standing-sentence';
import type { RoadPieceModel } from '@/lib/threshold/derive';
import type { ClosedOrderModel, RoadOrderModel } from '@/lib/threshold/road-orders';

import { RoadOrders } from './road-orders';
import { ThresholdJourney } from './room-band';

/* ── THE ROAD ────────────────────────────────────────────────────────────────
   Everything that has been agreed but is not home yet, drawn as one ruled line
   with the six stops of the goods journey ticked across it and the house at
   its right-hand edge. A piece stands at its own stop; lifting it opens the
   same record a piece in a room opens.

   The stops are `GOODS_JOURNEY_STAGES` — the fixture's own six — so a piece
   cannot read one stop out here and another inside its room. ─────────────── */

const ROAD_W = 1000;
const ROAD_H = 170;
const ROAD_Y = 130;
const ROAD_X1 = 40;
const ROAD_X2 = 900;
const STOP_GAP = (ROAD_X2 - ROAD_X1) / (GOODS_JOURNEY_STAGES.length - 1);

function stopX(index: number): number {
  return Math.round(ROAD_X1 + STOP_GAP * index);
}

const PIECE_W = 72;

/**
 * A furnishings authorization releases a batch of pieces that then move
 * through the stages together, so two pieces sharing a stop is the common
 * case, not an edge one. Fan them across the stop's own neighbourhood rather
 * than stacking identical rects on the same x.
 */
function pieceX(pieces: RoadPieceModel[], piece: RoadPieceModel): number {
  const sharing = pieces.filter((other) => other.stageIndex === piece.stageIndex);
  const place = sharing.findIndex((other) => other.selectionId === piece.selectionId);
  const centre = stopX(piece.stageIndex);
  if (sharing.length <= 1) return centre - PIECE_W / 2;
  // Keep the fan inside the gap to the next stop so a piece never drifts past
  // the tick it is standing at.
  const stride = Math.min(PIECE_W + 8, (STOP_GAP * 0.9) / sharing.length);
  return centre - ((sharing.length - 1) * stride) / 2 + place * stride - PIECE_W / 2;
}

export interface TheRoadProps {
  pieces: RoadPieceModel[];
  /** Pieces she bought herself — the same road, and the act that pays for them. */
  orders?: RoadOrderModel[];
  /** Bought direct and not coming: refunded, cancelled. Never in the count. */
  closedOrders?: ClosedOrderModel[];
  /** Re-read the direct orders while a return from the till is waiting. */
  onOrdersRefetch?: () => void | Promise<unknown>;
  today?: Date;
}

export function TheRoad({
  pieces,
  orders = [],
  closedOrders = [],
  onOrdersRefetch,
  today,
}: TheRoadProps) {
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const inMotion = pieces.length + orders.length;

  return (
    <section
      id="road"
      data-threshold-unit="road"
      data-dimmable=""
      aria-labelledby="road-title"
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border-default)] pb-2.5 pt-2.5">
        <h2
          id="road-title"
          className="font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
        >
          The road
        </h2>
        <p
          data-testid="road-lintel"
          className="max-w-[34ch] text-[15px] leading-normal text-[var(--text-body)] sm:text-right"
        >
          {inMotion > 0
            ? `What is not home yet · ${countInWords(inMotion)} ${
                inMotion === 1 ? 'piece' : 'pieces'
              } in motion`
            : 'What is not home yet'}
        </p>
      </div>

      <svg
        data-testid="road-drawing"
        role="img"
        aria-label="The road, ruled in the six stops a piece passes through, with the house at its right-hand edge"
        viewBox={`0 0 ${ROAD_W} ${ROAD_H}`}
        className="mt-4 block h-auto w-full"
        style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1, color: 'inherit' }}
      >
        <g vectorEffect="non-scaling-stroke">
          <line x1={ROAD_X1} y1={ROAD_Y} x2={ROAD_X2} y2={ROAD_Y} />
          {GOODS_JOURNEY_STAGES.map((stop, index) => (
            <line
              key={stop}
              data-testid="road-stop"
              data-stop={stop}
              data-stop-index={index}
              x1={stopX(index)}
              y1={ROAD_Y - 6}
              x2={stopX(index)}
              y2={ROAD_Y + 6}
            />
          ))}
          {pieces.map((piece) => {
            const lifted = liftedId === piece.selectionId;
            return (
              <rect
                key={piece.selectionId}
                data-road-piece={piece.selectionId}
                data-stop-index={piece.stageIndex}
                data-lifted={lifted ? 'true' : undefined}
                x={Math.round(pieceX(pieces, piece))}
                y={ROAD_Y - 46 - (lifted ? 2 : 0)}
                width={PIECE_W}
                height={40}
              />
            );
          })}
          {/* the house, at the right-hand edge */}
          <polyline points={`${ROAD_X2},${ROAD_Y} ${ROAD_X2},40 980,40 980,${ROAD_Y} 880,${ROAD_Y}`} />
        </g>
      </svg>

      {inMotion === 0 ? (
        <p className="mt-2.5 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-body)]">
          Nothing on the road.
        </p>
      ) : pieces.length === 0 ? null : (
        <ul data-testid="road-pieces" className="mt-4 list-none">
          {pieces.map((piece) => {
            const lifted = liftedId === piece.selectionId;
            return (
              <li
                key={piece.selectionId}
                data-threshold-piece={piece.selectionId}
                data-lifted={lifted ? 'true' : undefined}
                className={`border-t border-[var(--border-subtle)] transition-transform duration-200 motion-reduce:transition-none ${
                  lifted ? '-translate-y-[2px] motion-reduce:transform-none' : ''
                }`}
              >
                <button
                  type="button"
                  aria-expanded={lifted}
                  aria-controls={`road-record-${piece.selectionId}`}
                  onClick={() =>
                    setLiftedId(lifted ? null : piece.selectionId)
                  }
                  className={`flex w-full flex-wrap items-baseline justify-between gap-4 py-3 text-left ${
                    lifted ? 'border-b border-current' : ''
                  }`}
                >
                  <span className="font-heading text-[1.08rem] tracking-[-0.008em]">
                    {piece.name}
                  </span>
                  <span className="text-[15px] text-[var(--text-body)]">
                    {GOODS_JOURNEY_STAGES[piece.stageIndex]}
                    {piece.roomName ? ` · for the ${piece.roomName}` : ''}
                  </span>
                </button>
                <div id={`road-record-${piece.selectionId}`}>
                  {lifted && (
                    <div
                      data-testid="road-record"
                      className="pb-4 pt-1 text-[15px] leading-relaxed text-[var(--text-body)]"
                    >
                      <p>
                        {piece.roomName
                          ? `Bound for the ${piece.roomName}.`
                          : 'No room is named on the record, so it stands on the road.'}
                      </p>
                      <ThresholdJourney stopIndex={piece.stageIndex} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(orders.length > 0 || closedOrders.length > 0) && (
        <RoadOrders
          orders={orders}
          closed={closedOrders}
          onRefetch={onOrdersRefetch}
          today={today}
        />
      )}
    </section>
  );
}
