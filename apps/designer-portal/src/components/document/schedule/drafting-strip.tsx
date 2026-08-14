'use client';

/**
 * The Drafting Line — the deck's Option 04 anatomy, in the live document
 * (docs/design/the-document/patina-task-date-picker-concepts.html, slide 04).
 *
 * The compact single-track Rule kept every phase on ONE line. That reads as a
 * glance and nothing more: Kody's live walk called it "too small and cluttered
 * to read or use to adjust dates." The drag, keyboard and ripple machinery had
 * been grafted onto it, but the anatomy that makes those gestures legible never
 * shipped. This is that anatomy.
 *
 *   · a paper card header — FRAME · SCHEDULE / PHASE DATES
 *   · the engaged phase's name in Playfair, with a live mono readout
 *     ("Follows Consultation · 3w") that tracks a drag as it happens
 *   · month columns across the top over faint week gridlines — graph paper
 *   · ONE LANE PER PHASE, each with its name in the lane's own gutter and its
 *     span drawn as a chunky bar; thread lanes sit below the main ones, shorter
 *     and hairline-drawn
 *   · milestone diamonds inside their phase's lane, on the bar
 *   · today as a full-height terracotta tick, dated below the strip
 *   · a hint caption naming the three gestures
 *
 * Height is the point, not a cost: six phases run ~260px and every one of them
 * is legible and grabbable. Nothing here compresses to win space back.
 *
 * Interaction is UNCHANGED — every bar is a `RulePhaseBar`, carrying the same
 * pointer capture, drag threshold, grab-offset move (`phase-anchor`), right-edge
 * resize (`phase-duration`), keyboard slider model, ownership store and armed
 * focus it had on the single track. What changes is that a lane per phase gives
 * every bar its OWN right edge, so the internal-boundary sharing constraint
 * dissolves and every bar carries a permanent resize grip (R102). The locked-
 * downstream rule is unaffected: a resize still emits `phase-duration` and the
 * ripple's `anchorViolation` gate still governs whether it can commit.
 *
 * Zero shadows (D4); every colour a CSS var.
 */

import { useMemo } from 'react';
import type { RefObject } from 'react';
import type { MilestoneStatus } from '@patina/utils';
import {
  projectGhostBars,
  projectGhosts,
  projectBaselineGhosts,
  LANE_BAR_H,
  LANE_BAR_TOP,
  LANE_THREAD_TOP,
  type RuleBar,
  type RuleDiamond as RuleDiamondSpec,
  type RuleLane,
  type RuleLaneLayout,
  type RuleMonthColumn,
  type TimeScale,
} from '@/lib/document/schedule-rule-derivation';
import type { BaselineGhostDiff } from '@/lib/document/schedule-baseline-derivation';
import { fmtDelta, type RippleDiff } from '@/lib/document/schedule-ripple-derivation';
import { fmtDay } from '@/lib/document/format';
import { RuleDiamond } from './rule-diamond';
import { RulePhaseBar, type BarEditState } from './rule-phase-bar';
import type { RippleSession } from './schedule-ripple-context';

/** Height above the lane grid for the month label row. */
const MONTH_ROW_H = 15;

export interface DraftingStripProps {
  /** Lane assignment for every drawable phase (main lanes first, threads after). */
  layout: RuleLaneLayout;
  /** One bar per placed main-lane phase — the draggable spans. */
  bars: RuleBar[];
  /** Thread-lane spans, drawn as hairlines in their own lanes. */
  threads: ReadonlyArray<{ id: string; leftPct: number; widthPct: number; name: string }>;
  months: RuleMonthColumn[];
  weekLines: number[];
  diamonds: RuleDiamondSpec[];
  milestoneNameById: (id: string) => string | undefined;
  scale: TimeScale;
  todayXPct: number | null;
  today: string;
  /** The engaged phase: its name in Playfair, its live meta beside it. */
  headerName: string;
  headerMeta: string;
  /** The pending ripple's per-lane preview, or null. */
  rippleDiff: RippleDiff | null;
  /** The v1 baseline's marks, when the toggle is on. */
  baselineDiff: BaselineGhostDiff | null;
  trackRef: RefObject<HTMLDivElement | null>;
  /** Bars render only under a ripple provider (same gate the handles used). */
  barsEnabled: boolean;
  /** The phase the header line speaks for — its bar wears the live treatment. */
  engagedPhaseId: string | null;
  session: RippleSession | null;
  getBarEdit: (phaseId: string) => BarEditState | null;
  setBarEdit: (phaseId: string, next: BarEditState | null) => void;
  registerBarEl: (phaseId: string, el: HTMLElement | null) => void;
  xToDay: (xPct: number) => number;
  domainMinEpoch: number;
  domainMaxEpoch: number;
  onMoveBegin: (phaseId: string, startEpoch: number) => void;
  onMoveFrame: (phaseId: string, startEpoch: number) => void;
  onResizeBegin: (phaseId: string, durationDays: number) => void;
  onResizeFrame: (phaseId: string, durationDays: number) => void;
  onRevealPhase: (phaseId: string) => void;
  onRevealMilestone: (phaseId: string, milestoneId: string) => void;
  onDiamondDragBegin: (milestoneId: string, phaseId: string, xPct: number) => void;
  onDiamondDragFrame: (milestoneId: string, phaseId: string, xPct: number) => void;
  phaseEndEpochById: Map<string, number | null>;
  /** Milestone drag refuses while a session is already in flight (nudge silence). */
  suppressRefuse: boolean;
}

function clampPct(x: number): number {
  return Math.max(0, Math.min(100, x));
}

export function DraftingStrip({
  layout,
  bars,
  threads,
  months,
  weekLines,
  diamonds,
  milestoneNameById,
  scale,
  todayXPct,
  today,
  headerName,
  headerMeta,
  rippleDiff,
  baselineDiff,
  trackRef,
  barsEnabled,
  engagedPhaseId,
  session,
  getBarEdit,
  setBarEdit,
  registerBarEl,
  xToDay,
  domainMinEpoch,
  domainMaxEpoch,
  onMoveBegin,
  onMoveFrame,
  onResizeBegin,
  onResizeFrame,
  onRevealPhase,
  onRevealMilestone,
  onDiamondDragBegin,
  onDiamondDragFrame,
  phaseEndEpochById,
  suppressRefuse,
}: DraftingStripProps) {
  const laneById = useMemo(
    () => new Map(layout.lanes.map((l) => [l.id, l])),
    [layout.lanes],
  );
  const ghostBars = useMemo(
    () => (rippleDiff ? projectGhostBars(rippleDiff, scale) : []),
    [rippleDiff, scale],
  );
  const ghostDiamonds = useMemo(
    () => (rippleDiff ? projectGhosts(rippleDiff, scale).diamonds : []),
    [rippleDiff, scale],
  );
  const baselineMarks = useMemo(
    () => (baselineDiff ? projectBaselineGhosts(baselineDiff, scale) : null),
    [baselineDiff, scale],
  );
  const ghostById = useMemo(
    () => new Map(ghostBars.map((g) => [g.id, g])),
    [ghostBars],
  );
  const barById = useMemo(() => new Map(bars.map((b) => [b.id, b])), [bars]);
  const threadById = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);

  return (
    <div className="border border-[var(--color-pearl)] bg-[var(--doc-paper)]">
      {/* The paper card's header band — the deck's `doc-hd`. */}
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-4 py-2 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
        <span>Frame · Schedule</span>
        <span>Phase Dates</span>
      </div>

      <div className="px-4 pb-4 pt-4">
        {/* The engaged phase, and what it currently reads as. The meta tracks a
            drag frame by frame — it is the readout, so nothing new is invented. */}
        <div className="mb-4 flex items-baseline gap-3 border-b border-[var(--color-pearl)] pb-3">
          <span className="font-heading text-[1.28rem] leading-none text-[var(--color-charcoal)]">
            {headerName}
          </span>
          <span className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
            {headerMeta}
          </span>
        </div>

        {/* Month labels — the graph paper's ruled top edge. */}
        <div className="relative" style={{ height: MONTH_ROW_H }}>
          {months.map((m) => (
            <span
              key={m.key}
              className="absolute font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]"
              style={{ left: `${m.xPct}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* THE GRID — the % coordinate space every drag reads its pointer against. */}
        <div
          ref={trackRef}
          className="relative border-y border-[var(--color-pearl)]"
          style={{ height: layout.totalHeightPx }}
        >
          {/* week gridlines, then month boundaries a shade stronger */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {weekLines.map((x) => (
              <span
                key={`w-${x.toFixed(3)}`}
                className="absolute inset-y-0"
                style={{ left: `${x}%`, width: 1, background: 'var(--color-pearl)', opacity: 0.55 }}
              />
            ))}
            {months.map((m) => (
              <span
                key={`m-${m.key}`}
                className="absolute inset-y-0"
                style={{ left: `${m.xPct}%`, width: 1, background: 'var(--color-pearl)' }}
              />
            ))}
          </div>

          {/* the v1 baseline: where the promise stood, full height in clay */}
          {baselineMarks && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {baselineMarks.ticks.map((t) => (
                <span
                  key={`b-${t.id}`}
                  className="absolute inset-y-0"
                  style={{ left: `${t.xPct}%`, width: 1, background: 'var(--color-clay)', opacity: 0.5 }}
                />
              ))}
            </div>
          )}

          {/* one row per lane */}
          {layout.lanes.map((lane) => (
            <LaneRow
              key={lane.id}
              lane={lane}
              bar={barById.get(lane.id) ?? null}
              thread={threadById.get(lane.id) ?? null}
              ghost={ghostById.get(lane.id) ?? null}
              onRevealPhase={onRevealPhase}
            />
          ))}

          {/* bars — every drawable main-lane phase, sized to its lane */}
          {barsEnabled &&
            bars.map((b) => {
              const lane = laneById.get(b.id);
              if (!lane) return null;
              return (
                <RulePhaseBar
                  key={b.id}
                  bar={b}
                  pinned={false}
                  // A lane per phase means every bar owns its own right edge —
                  // no boundary handle shares it, so all of them resize.
                  resizable
                  emphasis={b.id === engagedPhaseId}
                  laneGeometry={{
                    top: lane.topPx + LANE_BAR_TOP,
                    height: LANE_BAR_H,
                    tipTop: lane.topPx + 2,
                    modeTop: lane.topPx + LANE_BAR_TOP + 3,
                  }}
                  trackRef={trackRef}
                  xToDay={xToDay}
                  domainMinEpoch={domainMinEpoch}
                  domainMaxEpoch={domainMaxEpoch}
                  session={session}
                  getBarEdit={getBarEdit}
                  setBarEdit={setBarEdit}
                  registerRoot={(el) => registerBarEl(b.id, el)}
                  onMoveBegin={(s) => onMoveBegin(b.id, s)}
                  onMoveFrame={(s) => onMoveFrame(b.id, s)}
                  onResizeBegin={(d) => onResizeBegin(b.id, d)}
                  onResizeFrame={(d) => onResizeFrame(b.id, d)}
                />
              );
            })}

          {/* milestone diamonds, inside their host phase's lane, on its bar */}
          {diamonds.map((d) => {
            const lane = laneById.get(d.phaseId);
            if (!lane) return null;
            const pe = phaseEndEpochById.get(d.phaseId) ?? null;
            return (
              <RuleDiamond
                key={d.id}
                xPct={d.xPct}
                status={d.status as MilestoneStatus}
                label={milestoneNameById(d.id) ?? 'Milestone'}
                pinned={false}
                topPx={lane.topPx + LANE_BAR_TOP + (LANE_BAR_H - 8) / 2}
                onClick={() => onRevealMilestone(d.phaseId, d.id)}
                draggable={barsEnabled}
                anchored={d.anchored}
                phaseEndEpoch={pe}
                suppressRefuse={suppressRefuse}
                trackRef={trackRef}
                onDragBegin={(x) => onDiamondDragBegin(d.id, d.phaseId, x)}
                onDragFrame={(x) => onDiamondDragFrame(d.id, d.phaseId, x)}
              />
            );
          })}

          {/* ghost diamonds — a moved milestone previews in its own lane too */}
          {ghostDiamonds.map((g) => {
            const lane = laneById.get(g.phaseId);
            if (!lane) return null;
            return (
              <span
                key={`gd-${g.id}`}
                aria-hidden
                className="pointer-events-none absolute rotate-45"
                style={{
                  left: `${clampPct(g.xPct)}%`,
                  top: lane.topPx + LANE_BAR_TOP + (LANE_BAR_H - 8) / 2,
                  width: 8,
                  height: 8,
                  marginLeft: -4,
                  border: '1.5px dashed var(--color-terracotta)',
                  zIndex: 4,
                }}
              />
            );
          })}

          {/* today — full height, the strip's one terracotta mark */}
          {todayXPct != null && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0"
              style={{ left: `${todayXPct}%`, width: 1.5, background: 'var(--color-terracotta)', zIndex: 6 }}
            />
          )}
        </div>

        {/* today's date, under the strip where the tick lands */}
        {todayXPct != null && (
          <div className="relative h-4">
            <span
              className="absolute whitespace-nowrap font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--color-terracotta)]"
              style={{ left: `${clampPct(todayXPct)}%`, top: 3, marginLeft: 4 }}
            >
              Today · {fmtDay(today)}
            </span>
          </div>
        )}

        <p className="mt-5 font-mono text-[0.52rem] uppercase tracking-[0.13em] text-[var(--color-aged-oak)]">
          Drag the bar to move it · Drag its right edge to resize · Others follow
        </p>
      </div>
    </div>
  );
}

/**
 * One lane's own furniture: the gutter label (with its consequence chip while a
 * ripple is previewing), the committed span, and — when this lane moved — the
 * dashed preview of where it is going. The interactive bar is NOT here; it is
 * mounted over the grid so its pointer capture and focus order stay flat.
 */
function LaneRow({
  lane,
  bar,
  thread,
  ghost,
  onRevealPhase,
}: {
  lane: RuleLane;
  bar: RuleBar | null;
  thread: { name: string; leftPct: number; widthPct: number } | null;
  ghost: { leftPct: number; widthPct: number; deltaDays: number | null } | null;
  onRevealPhase: (phaseId: string) => void;
}) {
  const name = bar?.name ?? thread?.name ?? '';
  const isThread = lane.lane !== 'main';
  const committedLeft = bar?.leftPct ?? thread?.leftPct ?? 0;
  const committedWidth = bar?.widthPct ?? thread?.widthPct ?? 0;

  return (
    <div
      className="absolute inset-x-0"
      style={{
        top: lane.topPx,
        height: lane.heightPx,
        borderTop: lane.index === 0 ? undefined : '1px solid var(--color-pearl)',
      }}
    >
      {/* gutter label — always at the lane's left, never over a bar */}
      <button
        type="button"
        onClick={() => onRevealPhase(lane.id)}
        className="absolute left-0 top-[3px] z-[5] flex items-center gap-[6px] whitespace-nowrap font-mono text-[0.52rem] uppercase tracking-[0.11em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
      >
        {name}
        {ghost?.deltaDays != null && ghost.deltaDays !== 0 && (
          <span className="border border-[var(--color-terracotta)] px-[3px] text-[var(--color-terracotta)]">
            {fmtDelta(ghost.deltaDays)}
          </span>
        )}
      </button>

      {isThread ? (
        // a thread reads as a hairline: it rides the schedule, it is not a
        // phase you drag.
        <span
          aria-hidden
          className="absolute"
          style={{
            left: `${committedLeft}%`,
            width: `${Math.max(0, committedWidth)}%`,
            top: LANE_THREAD_TOP,
            height: 1,
            background: 'var(--color-aged-oak)',
            opacity: 0.7,
          }}
        />
      ) : (
        // the COMMITTED span. While this lane is previewing a move it stays put
        // and fades — the ghost beside it carries where the phase is going.
        <span
          aria-hidden
          className="absolute"
          style={{
            left: `${committedLeft}%`,
            width: `${Math.max(0, committedWidth)}%`,
            top: LANE_BAR_TOP,
            height: LANE_BAR_H,
            background: 'var(--color-clay)',
            opacity: ghost ? 0.28 : 0.45,
            border: '1px solid var(--color-pearl)',
          }}
        />
      )}

      {ghost && (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: `${ghost.leftPct}%`,
            width: `${Math.max(0, ghost.widthPct)}%`,
            top: LANE_BAR_TOP,
            height: LANE_BAR_H,
            border: '1px dashed var(--color-terracotta)',
            zIndex: 4,
          }}
        />
      )}
    </div>
  );
}
