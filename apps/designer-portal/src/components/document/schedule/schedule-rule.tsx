'use client';

/**
 * ScheduleRule — the Rule (Option A), the Spine folded into a glance (C6 ·
 * R99, Slice 02). Prototype: the `data-title="The Rule"` + `data-title=
 * "Anatomy"` slides of the-document-schedule-master-direction.html (ruled Jul
 * 14 2026: "B is the structure, A is the glance").
 *
 * The Rule is the Spine's collapsed header and its minimap. It reads the SAME
 * data door as the spine — `useResolvedSchedule` (React Query dedupes the
 * fetch; nothing here recomputes time, R100) — and projects the resolved
 * phases/milestones onto a horizontal instrument: a status-weighted line,
 * boundary ticks, milestone diamonds, a today cut, thread hairlines, and
 * natural-width staggered labels that NEVER truncate. Every label and diamond
 * is a focusable control that reveals its phase in the spine (§3.5, via
 * ScheduleNavProvider). This surface is READ-ONLY — no drag, no time editing
 * (Slice 04).
 *
 * Two modes, one file:
 *  · at rest — the full canvas (132px base + one 20px lane per extra
 *    thread): labels + threads + line + diamonds + today.
 *  · pinned — a ~22px fold (line + ticks + diamonds + today only, per
 *    foldedLayers), the project title inline at left; labels + thread fold
 *    away and the today date-label hides (the prototype's `.pin-rule`).
 *
 * Pin containment — the sticky element IS the wrapper. The component renders
 * two flow siblings: a 1px sentinel, then a `sticky top-0` wrapper whose
 * height is PERMANENT for a given schedule (the full resting canvas — 132px
 * plus one thread-lane pitch per extra thread; it varies with DATA, never
 * with scroll or pin). The wrapper itself is transparent and
 * `pointer-events-none`; only the rule surface inside is
 * `pointer-events-auto` (pinned, the ~22px strip at its top carries the
 * `--doc-paper` background — the rest stays see-through and click-through as
 * content scrolls beneath). Because the wrapper's height never changes on
 * pin and it stays in flow, folding shifts NOTHING downstream — and because
 * the sticky element is the wrapper itself, its sticking range is bounded by
 * its PARENT, not by a short internal container, so the pinned fold holds at
 * every scroll depth of that parent. The sentinel scrolling above the
 * viewport (IntersectionObserver) flips the mode; the observer attaches via
 * a STATE-held callback ref (`ref={setSentinelEl}` + effect on
 * `[sentinelEl]`), never a bare `useRef` + `[]` effect — the component
 * `return null`s while `useResolvedSchedule` loads, so a mount-time effect
 * would fire before the sentinel exists and never re-attach (live-walk
 * defect D-1: the pin silently never engaged on a cold load). z-[3]: above
 * the document's in-flow chrome (margin rail z-[1], doc-spine z-[2]), below
 * the unified mobile bar (z-40) and DocSheet overlays (z-50).
 *
 * Hit-testing (live-walk defect D-2): every decorative layer — track, ticks,
 * today line, thread hairlines — is `pointer-events-none`; the interactive
 * controls (label + diamond buttons, z-[1]) sit above them in paint and
 * hit-test order. A click anywhere on the rule can only ever land on a
 * button or fall through.
 *
 * MOUNT CONTRACT (step 3): mount as a child of the document page's main flow
 * where the parent spans the whole scrollable document (e.g. directly in
 * <main>'s column). A short parent caps the sticky range and breaks
 * every-depth pinning.
 *
 * Mobile (<980px, the codebase's phone boundary): labels + thread hide (their
 * containers measure 0 wide, so the stagger never runs) — the line, diamonds
 * and today remain. Full mobile treatment is a review escalation (§7).
 *
 * Mounted (S2-4) at the document page's `<main>` top-level flow behind the
 * `schedule-spine` flag, replacing `PhaseTimeline`; every reveal call fires
 * `rule_minimap_jump` alongside it (`@/lib/analytics/schedule-events`).
 * Zero shadows (D4).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedSchedule, useScheduleRevisions } from '@patina/supabase';
import type { ResolvedPhase } from '@patina/utils';
import { epochDayFromISO, isoFromEpochDay, resolveSchedule } from '@patina/utils';
import {
  buildTimeScale,
  ruleSegments,
  ruleDiamonds,
  ruleThreads,
  ruleBoundaries,
  ruleBars,
  boundaryDurationDays,
  milestoneOffsetDays,
  xToEpochDay,
  unplacedPhases,
  foldedLayers,
  ruleWeightForStatus,
  type RuleBoundary,
} from '@/lib/document/schedule-rule-derivation';
import { fmtDay } from '@/lib/document/format';
import { snapshotToResolverInputs, baselineGhostDiff } from '@/lib/document/schedule-baseline-derivation';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import { useScheduleNav } from './schedule-nav-context';
import { useRippleSession } from './schedule-ripple-context';
import { RuleTrack } from './rule-track';
import { RuleDiamond } from './rule-diamond';
import { RuleToday } from './rule-today';
import { RuleThread, THREAD_LANE_PITCH } from './rule-thread';
import { RuleLabelRow, type RuleLabelItem } from './rule-label-row';
import { RuleBoundaryHandle } from './rule-boundary-handle';
import { RulePhaseBar } from './rule-phase-bar';
import { RuleGhostLayer } from './rule-ghost-layer';
import { RuleBaselineLayer } from './rule-baseline-layer';

export interface ScheduleRuleProps {
  projectId: string;
  /** row.title — the inline title shown beside the line when pinned. */
  projectTitle: string;
}

/** The resting rule's base height (prototype `.ma-canvas`) — one thread lane
 *  included; each EXTRA thread lane adds THREAD_LANE_PITCH (D-4). */
const BASE_CANVAS_H = 132;

/** A phase's one-line mono subtitle — anchor date, or its resolved range. */
function phaseSubline(rp: ResolvedPhase | null): string {
  if (!rp) return '';
  if (rp.anchored && rp.start) return `Anchored · ${fmtDay(rp.start)}`;
  if (rp.start && rp.end) return `${fmtDay(rp.start)} – ${fmtDay(rp.end)}`;
  if (rp.start) return fmtDay(rp.start);
  return '';
}

export function ScheduleRule({ projectId, projectTitle }: ScheduleRuleProps) {
  const schedule = useResolvedSchedule(projectId);
  const { reveal } = useScheduleNav();
  // The one preview session (Slice 04). INERT (no-op, providerPresent=false)
  // until batch 4 mounts RippleProvider around the Rule — until then the drag
  // handles simply don't render and the ghost layer never has a diff to draw.
  const ripple = useRippleSession();

  // The positioned track container — the % coordinate space every drag reads
  // its pointer x against (attached to whichever of the pinned/unpinned surfaces
  // is mounted; only one is at a time).
  const trackRef = useRef<HTMLDivElement>(null);

  // Render-side clock — the same convention as useResolvedSchedule's injected
  // `today` (computed once per mount).
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // resolved.* carry neither name nor status — join back through the raw rows.
  const phaseRowById = useMemo(
    () => new Map(schedule.phases.map((p) => [p.id, p])),
    [schedule.phases],
  );

  const resolvedPhases = useMemo(() => schedule.resolved?.phases ?? [], [schedule.resolved]);
  const resolvedMilestones = useMemo(
    () => schedule.resolved?.milestones ?? [],
    [schedule.resolved],
  );

  const milestoneNameById = useMemo(
    () => new Map(schedule.milestones.map((m) => [m.id, m.name])),
    [schedule.milestones],
  );

  // The proportional date→x scale (null when nothing is dated at all).
  const scale = useMemo(
    () => buildTimeScale(resolvedPhases.map((p) => ({ start: p.start, end: p.end })), today),
    [resolvedPhases, today],
  );

  // ── R100 "Memory" (Slice 05) — the signed v1 baseline. Derived client-side
  //    from the revisions ledger (no query beyond useScheduleRevisions); if the
  //    schedule was never signed there is no v1, and the whole baseline
  //    affordance — the toggle AND the ghosts — never appears. ──
  const revisions = useScheduleRevisions(projectId);
  const baselineV1 = useMemo(
    () => (revisions.data ?? []).find((r) => r.v === 1) ?? null,
    [revisions.data],
  );
  // The v1 promise RE-RESOLVED through the same one engine (R100) and diffed
  // against the current resolution. baselineGhostDiff emits only entries whose
  // dates moved (a deleted-in-current entry carries null current dates — the
  // promise that vanished). null until a v1 exists AND the current schedule has
  // resolved; positions are projected later through the SAME committed `scale`.
  const baselineDiff = useMemo(() => {
    if (baselineV1 == null || schedule.resolved == null) return null;
    const inputs = snapshotToResolverInputs(baselineV1.phase_snapshots);
    const baselineResolved = resolveSchedule(inputs.phases, inputs.milestones, {
      projectStartDate: undefined,
      today,
    });
    return baselineGhostDiff(schedule.resolved, baselineResolved);
  }, [baselineV1, schedule.resolved, today]);

  // All projections are pure + null-safe; they resolve to [] when scale is
  // null so the hook order stays fixed (the empty-state return is below).
  const segments = useMemo(
    () =>
      scale
        ? ruleSegments(resolvedPhases, (id) => ruleWeightForStatus(phaseRowById.get(id)?.status), scale)
        : [],
    [resolvedPhases, phaseRowById, scale],
  );

  const diamonds = useMemo(
    () => (scale ? ruleDiamonds(resolvedMilestones, scale) : []),
    [resolvedMilestones, scale],
  );

  const threads = useMemo(() => {
    if (!scale) return [];
    return ruleThreads(resolvedPhases, scale).map((t) => {
      const rp = resolvedPhases.find((p) => p.id === t.id);
      return {
        ...t,
        name: phaseRowById.get(t.id)?.name ?? '',
        start: rp?.start ?? null,
        end: rp?.end ?? null,
      };
    });
  }, [resolvedPhases, phaseRowById, scale]);

  const unplaced = useMemo(() => unplacedPhases(resolvedPhases), [resolvedPhases]);

  const todayX = useMemo(() => scale?.toX(today) ?? null, [scale, today]);

  // Internal-boundary drag handles — one per chain edge (Slice 04 T7). The
  // chain (id → followsPhaseId + name) comes from the raw rows; the resolver's
  // start/end + anchored come from `resolvedPhases`. Null scale ⇒ [] (the empty
  // early-return is below; the hook order stays fixed).
  const boundaries = useMemo<RuleBoundary[]>(() => {
    if (!scale) return [];
    const chain = schedule.phases.map((r) => ({
      id: r.id,
      followsPhaseId: r.follows_phase_id ?? null,
      name: r.name,
    }));
    return ruleBoundaries(resolvedPhases, chain, scale);
  }, [resolvedPhases, schedule.phases, scale]);

  // The Drafting Line's bars — one per placed main-lane phase, from the SAME
  // resolved phases + chain the boundaries read (ruleBars asks ruleBoundaries
  // which ends already carry a handle, so the two can't disagree).
  const bars = useMemo(() => {
    if (!scale) return [];
    const chain = schedule.phases.map((r) => ({
      id: r.id,
      followsPhaseId: r.follows_phase_id ?? null,
      name: r.name,
    }));
    return ruleBars(resolvedPhases, chain, scale);
  }, [resolvedPhases, schedule.phases, scale]);

  // Host phase END epoch by phase id — a diamond drag's `milestone-offset` base
  // (offset from the phase END). null when the host phase has no resolved end.
  const phaseEndEpochById = useMemo(
    () => new Map(resolvedPhases.map((p) => [p.id, epochDayFromISO(p.end)])),
    [resolvedPhases],
  );

  // Labels — one per placed main-lane phase (segments are exactly those). A
  // right-region label end-anchors (grows leftward off its phase END) so it
  // never overflows the container's right edge; the rest grow rightward.
  const labels = useMemo<RuleLabelItem[]>(
    () =>
      segments.map((s) => {
        const centerX = s.leftPct + s.widthPct / 2;
        const anchor: 'start' | 'end' = centerX > 66 ? 'end' : 'start';
        return {
          id: s.id,
          name: phaseRowById.get(s.id)?.name ?? '',
          subline: phaseSubline(resolvedPhases.find((p) => p.id === s.id) ?? null),
          weight: s.weight,
          xPct: anchor === 'end' ? s.leftPct + s.widthPct : s.leftPct,
          anchor,
        };
      }),
    [segments, resolvedPhases, phaseRowById],
  );

  // ── pin: a 1px sentinel at the top; when it scrolls above the viewport the
  // rule folds to the pinned bar. Zero downstream shift — the sticky wrapper
  // keeps its full resting height (see the file header). MOUNT-AWARE attach
  // (D-1): the sentinel element lives in STATE via a callback ref, and the
  // observer effect keys on it — so it attaches whenever the sentinel
  // actually mounts (first data render after the loading `return null`, or
  // any remount) and disconnects when it unmounts (React calls the callback
  // ref with null → sentinelEl null → cleanup runs, effect early-returns).
  // A bare useRef + []-deps effect fired during the loading render, found no
  // sentinel, and never re-attached — the pin silently never engaged cold.
  const [pinned, setPinned] = useState(false);
  // R100 "Memory" — the Baseline toggle (default OFF). State persists across
  // pin/unpin; the ghosts render only unpinned + off-ripple (see gates below).
  const [showBaseline, setShowBaseline] = useState(false);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelEl || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl]);

  const layers = foldedLayers(pinned);

  // Baseline affordance gates (R100): a v1 must exist; the toggle + ghosts hide
  // while a ripple session is active (terracotta preview ghosts take
  // precedence) and while pinned (the fold shows committed truth only). The
  // ghost layer additionally requires the toggle ON and a computed diff.
  const baselineToggleVisible = baselineV1 != null && !ripple.isActive && !pinned;
  const showBaselineLayer = baselineToggleVisible && showBaseline && baselineDiff != null;

  // Canvas height: base + one lane pitch per EXTRA thread (D-4 — every
  // thread gets its own lane row). Data-derived, so it is constant across
  // scroll/pin for a given schedule — the no-shift-on-pin invariant holds.
  const canvasH = BASE_CANVAS_H + Math.max(0, threads.length - 1) * THREAD_LANE_PITCH;

  const revealPhase = (phaseId: string) => {
    reveal({ kind: 'phase', phaseId });
    scheduleEvents.ruleMinimapJump({
      project_id: projectId,
      target_kind: 'phase',
      phase_id: phaseId,
      from_pinned: pinned,
    });
  };
  const revealMilestone = (phaseId: string, milestoneId: string) => {
    reveal({ kind: 'milestone', phaseId, milestoneId });
    scheduleEvents.ruleMinimapJump({
      project_id: projectId,
      target_kind: 'milestone',
      phase_id: phaseId,
      milestone_id: milestoneId,
      from_pinned: pinned,
    });
  };

  // Fully-undated schedule (or still loading): the Rule draws nothing — the
  // empty state is a review escalation (§7), and step 3 keeps the spine's own
  // loading copy as the only "resolving…" affordance.
  if (schedule.resolved == null || scale == null) return null;

  // Drag → ripple edits. `scale` is narrowed non-null past the early return
  // above. A boundary drag edits the UPSTREAM phase's DURATION; a diamond drag
  // the milestone's OFFSET from its host phase END. Both begin on the drag's
  // first frame (past threshold) and update every frame after — `ripple.update`
  // no-ops before `begin`, so ordering is safe. Session PERSISTS on pointerup
  // (the preview stays; batch 4's strip commits or reverts). Handles render
  // only when a provider is present; the ghost layer draws for BOTH origins
  // (a spine-originated diff ghosts here too — it reads the same `ripple.diff`).
  const beginBoundary = (b: RuleBoundary, xPct: number) =>
    ripple.begin(
      { kind: 'phase-duration', phaseId: b.upstreamPhaseId, durationDays: boundaryDurationDays(b.upstreamStartEpoch, xToEpochDay(scale, xPct)) },
      'rule',
    );
  const frameBoundary = (b: RuleBoundary, xPct: number) =>
    ripple.update({ kind: 'phase-duration', phaseId: b.upstreamPhaseId, durationDays: boundaryDurationDays(b.upstreamStartEpoch, xToEpochDay(scale, xPct)) });

  const beginDiamond = (milestoneId: string, phaseId: string, phaseEndEpoch: number, xPct: number) =>
    ripple.begin(
      { kind: 'milestone-offset', milestoneId, phaseId, offsetDays: milestoneOffsetDays(phaseEndEpoch, xToEpochDay(scale, xPct)) },
      'rule',
    );
  const frameDiamond = (milestoneId: string, phaseId: string, phaseEndEpoch: number, xPct: number) =>
    ripple.update({ kind: 'milestone-offset', milestoneId, phaseId, offsetDays: milestoneOffsetDays(phaseEndEpoch, xToEpochDay(scale, xPct)) });

  // Bar drags → the SAME two ripple kinds the boundary handles already stage.
  // A body drag stages `phase-anchor` at the bar's new start: one kind covers
  // both semantics (an unanchored phase gains an anchor there, an anchored
  // phase's anchor moves there). A null ISO is unreachable for a finite epoch
  // day, so an unplaceable start simply stages nothing.
  const beginBarMove = (phaseId: string, startEpoch: number) => {
    const anchorDate = isoFromEpochDay(startEpoch);
    if (anchorDate == null) return;
    ripple.begin({ kind: 'phase-anchor', phaseId, anchorDate }, 'rule');
  };
  const frameBarMove = (phaseId: string, startEpoch: number) => {
    const anchorDate = isoFromEpochDay(startEpoch);
    if (anchorDate == null) return;
    ripple.update({ kind: 'phase-anchor', phaseId, anchorDate });
  };
  const beginBarResize = (phaseId: string, durationDays: number) =>
    ripple.begin({ kind: 'phase-duration', phaseId, durationDays }, 'rule');
  const frameBarResize = (phaseId: string, durationDays: number) =>
    ripple.update({ kind: 'phase-duration', phaseId, durationDays });

  // Which phase (if any) the pending edit belongs to — a bar nudges its OWN
  // session forward and begins a fresh one otherwise.
  const sessionPhaseId =
    ripple.session != null &&
    (ripple.session.edit.kind === 'phase-anchor' || ripple.session.edit.kind === 'phase-duration')
      ? ripple.session.edit.phaseId
      : null;

  const handlesOn = ripple.providerPresent;

  return (
    <>
      {/* 1px sentinel, in flow ABOVE the sticky wrapper — it leaves the
          viewport exactly as the wrapper reaches the top, flipping the fold. */}
      <div ref={setSentinelEl} aria-hidden className="h-px w-full" />

      {/* THE sticky element is this wrapper (see the file header's pin
          containment + mount contract): permanent resting height, in flow,
          transparent, click-through — only the surface inside takes events. */}
      <section
        aria-label="Schedule rule"
        className="pointer-events-none sticky top-0 z-[3]"
        style={{ height: canvasH }}
      >
        {pinned ? (
          /* The ~22px fold at the wrapper's TOP — the only painted, hit-
             testable band while pinned; the ~110px beneath stays transparent
             so content scrolling under never visually collides. */
          <div className="pointer-events-auto flex items-center gap-4 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)] py-1">
            <span className="whitespace-nowrap font-heading text-[0.95rem] text-[var(--color-charcoal)]">
              {projectTitle}
            </span>
            <div ref={trackRef} className="relative h-[22px] flex-1">
              <RuleTrack segments={segments} pinned todayXPct={todayX} />
              {handlesOn &&
                bars.map((b) => (
                  <RulePhaseBar
                    key={b.id}
                    bar={b}
                    pinned
                    trackRef={trackRef}
                    xToDay={(x) => xToEpochDay(scale, x)}
                    sessionOwned={sessionPhaseId === b.id}
                    onMoveBegin={(s) => beginBarMove(b.id, s)}
                    onMoveFrame={(s) => frameBarMove(b.id, s)}
                    onResizeBegin={(d) => beginBarResize(b.id, d)}
                    onResizeFrame={(d) => frameBarResize(b.id, d)}
                  />
                ))}
              {diamonds.map((d) => {
                const pe = phaseEndEpochById.get(d.phaseId) ?? null;
                return (
                  <RuleDiamond
                    key={d.id}
                    xPct={d.xPct}
                    status={d.status}
                    label={milestoneNameById.get(d.id) ?? 'Milestone'}
                    pinned
                    onClick={() => revealMilestone(d.phaseId, d.id)}
                    draggable={handlesOn}
                    anchored={d.anchored}
                    phaseEndEpoch={pe}
                    suppressRefuse={ripple.isActive}
                    trackRef={trackRef}
                    onDragBegin={(x) => pe != null && beginDiamond(d.id, d.phaseId, pe, x)}
                    onDragFrame={(x) => pe != null && frameDiamond(d.id, d.phaseId, pe, x)}
                  />
                );
              })}
              {handlesOn &&
                boundaries.map((b) => (
                  <RuleBoundaryHandle
                    key={b.upstreamPhaseId}
                    xPct={b.xPct}
                    pinned
                    locked={b.locked}
                    refuseName={b.downstreamName}
                    suppressRefuse={ripple.isActive}
                    trackRef={trackRef}
                    onDragBegin={(x) => beginBoundary(b, x)}
                    onDragFrame={(x) => frameBoundary(b, x)}
                  />
                ))}
              {todayX != null && <RuleToday xPct={todayX} today={today} pinned />}
              {ripple.diff && <RuleGhostLayer diff={ripple.diff} scale={scale} pinned />}
            </div>
          </div>
        ) : (
          <div ref={trackRef} className="pointer-events-auto relative h-full">
            {/* labels — hidden <980px (mobile); the stagger short-circuits on
                a 0-wide container there. */}
            {layers.labels && (
              <div className="hidden min-[980px]:block">
                <RuleLabelRow labels={labels} onReveal={revealPhase} />
              </div>
            )}

            <RuleTrack segments={segments} pinned={false} todayXPct={todayX} />

            {/* the Drafting Line — draggable phase bars, above the decorative
                track and below the diamonds in paint order. Render only when a
                ripple provider is present (same gate as the handles). */}
            {handlesOn &&
              bars.map((b) => (
                <RulePhaseBar
                  key={b.id}
                  bar={b}
                  pinned={false}
                  trackRef={trackRef}
                  xToDay={(x) => xToEpochDay(scale, x)}
                  sessionOwned={sessionPhaseId === b.id}
                  onMoveBegin={(s) => beginBarMove(b.id, s)}
                  onMoveFrame={(s) => frameBarMove(b.id, s)}
                  onResizeBegin={(d) => beginBarResize(b.id, d)}
                  onResizeFrame={(d) => frameBarResize(b.id, d)}
                />
              ))}

            {diamonds.map((d) => {
              const pe = phaseEndEpochById.get(d.phaseId) ?? null;
              return (
                <RuleDiamond
                  key={d.id}
                  xPct={d.xPct}
                  status={d.status}
                  label={milestoneNameById.get(d.id) ?? 'Milestone'}
                  pinned={false}
                  onClick={() => revealMilestone(d.phaseId, d.id)}
                  draggable={handlesOn}
                  anchored={d.anchored}
                  phaseEndEpoch={pe}
                  suppressRefuse={ripple.isActive}
                  trackRef={trackRef}
                  onDragBegin={(x) => pe != null && beginDiamond(d.id, d.phaseId, pe, x)}
                  onDragFrame={(x) => pe != null && frameDiamond(d.id, d.phaseId, pe, x)}
                />
              );
            })}

            {/* boundary drag handles — internal boundaries only; render only
                when a ripple provider is present (batch 4). */}
            {handlesOn &&
              boundaries.map((b) => (
                <RuleBoundaryHandle
                  key={b.upstreamPhaseId}
                  xPct={b.xPct}
                  pinned={false}
                  locked={b.locked}
                  refuseName={b.downstreamName}
                  suppressRefuse={ripple.isActive}
                  trackRef={trackRef}
                  onDragBegin={(x) => beginBoundary(b, x)}
                  onDragFrame={(x) => frameBoundary(b, x)}
                />
              ))}

            {todayX != null && <RuleToday xPct={todayX} today={today} pinned={false} />}

            {/* thread hairlines — hidden <980px, folded away when pinned;
                one lane per thread, array order (D-4). */}
            {layers.thread && (
              <div className="hidden min-[980px]:block">
                {threads.map((t, i) => (
                  <RuleThread
                    key={t.id}
                    leftPct={t.leftPct}
                    widthPct={t.widthPct}
                    name={t.name}
                    start={t.start}
                    end={t.end}
                    laneIndex={i}
                  />
                ))}
              </div>
            )}

            {/* clay baseline ghosts (R100 "Memory") — the v1 promise where
                current dates diverge, in the SAME committed scale. Unpinned +
                off-ripple only (gated above); pointer-events-none. Sits behind
                the terracotta preview by mutual exclusion — the two never
                render together. */}
            {showBaselineLayer && baselineDiff && (
              <RuleBaselineLayer diff={baselineDiff} scale={scale} />
            )}

            {/* ghost layer — LAST, over the solid committed layers, in the same
                TimeScale; pointer-events-none; draws for BOTH edit origins. */}
            {ripple.diff && <RuleGhostLayer diff={ripple.diff} scale={scale} pinned={false} />}
          </div>
        )}
      </section>

      {/* Quiet meta controls beneath the rule — the Baseline (v1) toggle at
          left (R100 "Memory"; hidden with no v1, mid-ripple, or pinned) and the
          Unplaced fallback at right (a phase never drawn on the line, its reveal
          still routed → spine, §3.3). Rendered together so the row's presence
          never shifts what follows; empty placeholders keep each side anchored. */}
      {(baselineToggleVisible || unplaced.length > 0) && (
        <div className="mt-1 flex items-center justify-between gap-3">
          {baselineToggleVisible ? (
            <button
              type="button"
              aria-pressed={showBaseline}
              onClick={() => setShowBaseline((v) => !v)}
              aria-label="Toggle the v1 baseline ghosts"
              className={`font-mono text-[0.56rem] uppercase tracking-[0.07em] ${
                showBaseline
                  ? 'text-[var(--color-clay)]'
                  : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
              }`}
            >
              Baseline{showBaseline ? ' · on' : ''}
            </button>
          ) : (
            <span aria-hidden />
          )}
          {unplaced.length > 0 ? (
            <button
              type="button"
              onClick={() => revealPhase(unplaced[0].id)}
              aria-label={`${unplaced.length} unplaced ${
                unplaced.length === 1 ? 'phase' : 'phases'
              } — reveal the first in the schedule`}
              className="font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
            >
              Unplaced · {unplaced.length}
            </button>
          ) : (
            <span aria-hidden />
          )}
        </div>
      )}
    </>
  );
}
