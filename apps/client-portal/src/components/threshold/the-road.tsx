'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { GOODS_JOURNEY_STAGES } from '@/components/commercial/journey-stepper';
import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { countInWords } from '@/components/threshold/instruments/standing-sentence';
import { legalDate } from '@/lib/threshold/dates';
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

/* ── PROJECT PROGRESS (CPUX-06) ───────────────────────────────────────────────
   A short summary above the road, every line read off a source the page
   already holds: the open chapter, the project's own next milestone and its
   target, the standing note, and the first ask the page draws. Nothing is
   computed into a fact the source does not hold — no percentage (the phase
   mapper's 50% fallback is not a measurement of a home), no date inferred
   from phase order, no fetch time passed off as an update time.

   Each source keeps loading, failed and empty apart: a read that has not
   answered says nothing, a read that failed says so with a Retry, and only a
   read that succeeded empty may say there is nothing. ───────────────────── */

/** One source's read, kept apart from the others so one failure erases nothing. */
export type ProgressRead<T> =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'ready'; value: T };

export interface ProgressAsk {
  /** The in-page id of the ask, e.g. `door` or `approval-<id>`. */
  anchor: string;
  /** The ask's own name as the page prints it. */
  label: string;
}

export interface ProjectProgressProps {
  /** The open chapter's human-readable name, or null when no stage is held. */
  now: string | null;
  /** `project.nextMilestone`, when the project holds one. */
  nextMilestone?: { title: string; targetDate?: string | null } | null;
  /** `project.projectedCompletionDate`, a target and never a promise. */
  projectedCompletionDate?: string | null;
  /** The first open ask, or null when every ask read succeeded and none is open. */
  waiting: ProgressRead<ProgressAsk | null>;
  /** The current standing note's own send date, or null when none stands. */
  update: ProgressRead<{ sentAt: string | null } | null>;
  /** Where past updates are kept on this page, when there are any. */
  pastUpdatesAnchor?: string | null;
}

const ROW_CLASS = 'grid gap-1 border-t border-[var(--border-subtle)] py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4';
const TERM_CLASS = 'text-[15px] font-medium leading-6 text-[var(--text-body)]';
const VALUE_CLASS = 'text-[16px] leading-6 text-[var(--text-primary)]';
const QUIET_CLASS = 'mt-0.5 text-[15px] leading-6 text-[var(--text-body)]';
const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-[6px]';

function AskLink({ ask }: { ask: ProgressAsk }) {
  return (
    <>
      Your response to{' '}
      <a href={`#${ask.anchor}`} className="underline underline-offset-[6px]">
        {ask.label}
      </a>
      .
    </>
  );
}

function ReadFailed({
  testId,
  message,
  onRetry,
}: {
  testId: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div data-testid={testId} role="status">
      <p className={VALUE_CLASS}>{message}</p>
      <ScoredAction
        actionKey={`${testId}_retry`}
        regionKey="road"
        surfaceKey="the_threshold"
        variant="tertiary"
        onClick={onRetry}
      >
        Retry
      </ScoredAction>
    </div>
  );
}

/** The target the source holds, labelled as a target; null when none is held. */
function targetOf(
  nextMilestone: ProjectProgressProps['nextMilestone'],
  projectedCompletionDate: string | null | undefined,
): { term: string; date: string | null } | null {
  const milestoneDate = legalDate(nextMilestone?.targetDate ?? null);
  if (milestoneDate) return { term: 'Target date', date: milestoneDate };
  const completion = legalDate(projectedCompletionDate ?? null);
  if (completion) return { term: 'Target completion', date: completion };
  // A milestone held without a date: say the date is not confirmed rather
  // than leave its reader to guess one.
  return nextMilestone ? { term: 'Target date', date: null } : null;
}

export function ProjectProgress({
  now,
  nextMilestone,
  projectedCompletionDate,
  waiting,
  update,
  pastUpdatesAnchor,
}: ProjectProgressProps) {
  const milestone = nextMilestone?.title?.trim() || null;
  const openAsk = waiting.status === 'ready' ? waiting.value : null;
  const target = targetOf(nextMilestone, projectedCompletionDate);
  const pastUpdates = pastUpdatesAnchor ? (
    <a href={`#${pastUpdatesAnchor}`} className={`${LINK_CLASS} text-[15px] text-[var(--text-body)]`}>
      Past updates
    </a>
  ) : null;

  return (
    <div data-testid="project-progress" className="pb-6">
      <h2
        id="road-progress-title"
        className="pt-2.5 font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        Project progress
      </h2>
      <dl className="mt-3 border-b border-[var(--border-subtle)]">
        <div className={ROW_CLASS} data-testid="progress-now">
          <dt className={TERM_CLASS}>Now</dt>
          <dd className={VALUE_CLASS}>{now ?? 'No project stage is shown here yet.'}</dd>
        </div>

        <div className={ROW_CLASS} data-testid="progress-next">
          <dt className={TERM_CLASS}>Next</dt>
          <dd className={VALUE_CLASS}>
            {milestone ??
              (openAsk ? <AskLink ask={openAsk} /> : 'Your designer will share the next step here.')}
          </dd>
        </div>

        {target ? (
          <div className={ROW_CLASS} data-testid="progress-target">
            <dt className={TERM_CLASS}>{target.term}</dt>
            <dd className={VALUE_CLASS}>
              {target.date ?? 'Date not confirmed'}
              {target.date ? <p className={QUIET_CLASS}>A target, not a confirmed date.</p> : null}
            </dd>
          </div>
        ) : null}

        <div className={ROW_CLASS} data-testid="progress-update">
          <dt className={TERM_CLASS}>Current designer update</dt>
          <dd className={VALUE_CLASS}>
            {update.status === 'loading' ? (
              <span className="text-[var(--text-body)]">Loading the current update</span>
            ) : update.status === 'error' ? (
              <ReadFailed
                testId="progress-update-error"
                message="We couldn’t load the current designer update."
                onRetry={update.onRetry}
              />
            ) : update.value ? (
              <>
                {legalDate(update.value.sentAt) ? `Sent ${legalDate(update.value.sentAt)}` : null}
                <div>
                  <a href="#note" className={`${LINK_CLASS} text-[15px] text-[var(--text-body)]`}>
                    Read the update
                  </a>
                </div>
              </>
            ) : (
              <>
                No current designer update is shown here.
                {pastUpdates ? <div>{pastUpdates}</div> : null}
              </>
            )}
          </dd>
        </div>

        {/* Said only once every ask read has answered: a read still out has no
            standing to say nothing is waiting. */}
        {waiting.status === 'loading' ? null : (
          <div className={ROW_CLASS} data-testid="progress-waiting">
            <dt className={TERM_CLASS}>Waiting on you</dt>
            <dd className={VALUE_CLASS}>
              {waiting.status === 'error' ? (
                <ReadFailed
                  testId="progress-waiting-error"
                  message="We couldn’t check what is waiting on you."
                  onRetry={waiting.onRetry}
                />
              ) : openAsk ? (
                <AskLink ask={openAsk} />
              ) : (
                'Nothing is waiting on you right now.'
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export interface TheRoadProps {
  /** CPUX-06 — the Project progress summary, drawn above the orders. */
  progress?: ProjectProgressProps;
  /** Named designer help, kept beside the summary. */
  help?: ReactNode;
  /**
   * Whether the orders part draws. The road's section stands whenever the
   * summary does (it is the page's Progress destination); its orders draw only
   * once the direct-orders read has something to say.
   */
  showOrders?: boolean;
  pieces: RoadPieceModel[];
  /** Pieces she bought herself — the same road, and the act that pays for them. */
  orders?: RoadOrderModel[];
  /** Bought direct and not coming: refunded, cancelled. Never in the count. */
  closedOrders?: ClosedOrderModel[];
  /** Re-read the direct orders while a return from the till is waiting. */
  onOrdersRefetch?: () => void | Promise<unknown>;
  /**
   * The direct-orders read failed. "Nothing on the road." is an assertion, and
   * a read that never answered has no standing to make it — the road says the
   * register could not be read instead.
   */
  ordersUnread?: boolean;
  today?: Date;
}

export function TheRoad({
  progress,
  help,
  showOrders = true,
  pieces,
  orders = [],
  closedOrders = [],
  onOrdersRefetch,
  ordersUnread = false,
  today,
}: TheRoadProps) {
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const inMotion = pieces.length + orders.length;

  return (
    <section
      id="road"
      data-threshold-unit="road"
      data-dimmable=""
      aria-labelledby={progress ? 'road-progress-title' : 'road-title'}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      {progress ? <ProjectProgress {...progress} /> : null}
      {help}
      {showOrders && (
      <>
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border-default)] pb-2.5 pt-2.5">
        <h2
          id="road-title"
          className="font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
        >
          Orders in progress
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
        aria-label="Orders in progress, shown across six delivery stages for each item"
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

      {/* "Nothing on the road." is an assertion, and a refunded piece standing
          under it in the next element takes it straight back. Where the road
          holds only pieces that are no longer coming, the list speaks for
          itself and the sentence is not said. */}
      {ordersUnread ? (
        <p
          data-testid="road-orders-error"
          className="mt-2.5 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-body)]"
        >
          Couldn&rsquo;t load your direct purchases. Please refresh.
        </p>
      ) : null}

      {inMotion === 0 ? (
        closedOrders.length > 0 || ordersUnread ? null : (
          <p className="mt-2.5 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-body)]">
            No orders in progress.
          </p>
        )
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
                          : 'No room is named on the record for this order.'}
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
      </>
      )}
    </section>
  );
}
