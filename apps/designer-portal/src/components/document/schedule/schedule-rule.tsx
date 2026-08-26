'use client';

/**
 * ScheduleRule — the schedule instrument on the document page (C6 · R99/R100).
 * It reads the SAME data door as the spine — `useResolvedSchedule` (React Query
 * dedupes the fetch; nothing here recomputes time, R100) — and mounts TWO
 * surfaces over that one resolution:
 *
 *  · THE DRAFTING STRIP (`drafting-strip.tsx`) — ordinary in-flow content, and
 *    THE EDITOR. One lane per phase over month/week graph paper, each phase a
 *    chunky draggable bar. This is the deck's Option 04 anatomy
 *    (patina-task-date-picker-concepts.html, slide 04), built after the live
 *    walk found the compact single track "too small and cluttered to read or
 *    use to adjust dates": the drag/keyboard/ripple model had been grafted onto
 *    a glance, and a glance is not an editor. Height is the point.
 *
 *  · THE PINNED GLANCE — the compact single-track rule, unchanged: a status-
 *    weighted line, boundary ticks + handles, milestone diamonds, a today cut.
 *    Read-only-ish by design (its boundary handles were always its own
 *    affordance); phase bars live only in the strip.
 *
 * Every diamond and lane label is a focusable control that reveals its phase in
 * the spine (§3.5, via ScheduleNavProvider). Since B3 this surface is the ONLY
 * place phase dates are edited: the spine's "Edit dates" arms it
 * (`nav.armEdit`) — scrolling the strip into view and focusing that phase's bar
 * — and the bars carry the drag and keyboard models.
 *
 * Pin containment. The strip is plain in-flow content; the glance is a
 * ZERO-HEIGHT `sticky top-0` section rendered AFTER it, whose band is absolutely
 * positioned. Two consequences, both wanted: the glance reserves nothing in
 * flow, so nothing downstream shifts at any scroll depth or pin state; and
 * because its flow position sits below the strip, it can only stick once the
 * strip has actually scrolled past — the glance never covers the editor. A 1px
 * sentinel immediately above it flips `pinned` (IntersectionObserver); the
 * observer attaches via a STATE-held callback ref (`ref={setSentinelEl}` +
 * effect on `[sentinelEl]`), never a bare `useRef` + `[]` effect — the component
 * `return null`s while `useResolvedSchedule` loads, so a mount-time effect would
 * fire before the sentinel exists and never re-attach (live-walk defect D-1).
 * z-[3]: above the document's in-flow chrome (margin rail z-[1], doc-spine
 * z-[2]), below the unified mobile bar (z-40) and DocSheet overlays (z-50).
 *
 * Hit-testing (live-walk defect D-2): every decorative layer — track, ticks,
 * gridlines, today line, thread hairlines — is `pointer-events-none`; the
 * interactive controls (bars, diamonds, lane labels) sit above them in paint and
 * hit-test order. A click can only ever land on a control or fall through.
 *
 * MOUNT CONTRACT: mount in the document page's main flow where the parent spans
 * the whole scrollable document (e.g. directly in <main>'s column). A short
 * parent caps the glance's sticky range.
 *
 * Mounted unconditionally since B3 retired the `schedule-spine` gate and its
 * PhaseTimeline fallback; every reveal call fires `rule_minimap_jump`
 * (`@/lib/analytics/schedule-events`). Zero shadows (D4).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedSchedule, useScheduleRevisions } from '@patina/supabase';
import { epochDayFromISO, isoFromEpochDay, resolveSchedule } from '@patina/utils';
import {
  buildTimeScale,
  ruleSegments,
  ruleDiamonds,
  ruleThreads,
  ruleBoundaries,
  ruleBars,
  ruleLanes,
  monthColumns,
  weekGridlines,
  barNudgeEpochDay,
  boundaryDurationDays,
  milestoneOffsetDays,
  xToEpochDay,
  unplacedPhases,
  ruleWeightForStatus,
  type RuleBoundary,
} from '@/lib/document/schedule-rule-derivation';
import { weeksOrDays } from '@/lib/document/schedule-spine-derivation';
import { snapshotToResolverInputs, baselineGhostDiff } from '@/lib/document/schedule-baseline-derivation';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import { useScheduleNav } from './schedule-nav-context';
import { useRippleSession } from './schedule-ripple-context';
import { RuleDiamond } from './rule-diamond';
import { RuleBoundaryHandle } from './rule-boundary-handle';
import { ScheduleGlanceStrip } from './schedule-glance-strip';
import { DraftingStrip } from './drafting-strip';
import { RulePhaseBar, barOwnsSession, type BarEditState } from './rule-phase-bar';
import { useArmedBarFocus } from './use-armed-bar-focus';
import { RuleGhostLayer } from './rule-ghost-layer';

export interface ScheduleRuleProps {
  projectId: string;
  /** row.title — the inline title shown beside the line when pinned. */
  projectTitle: string;
}

export function ScheduleRule({ projectId, projectTitle }: ScheduleRuleProps) {
  const schedule = useResolvedSchedule(projectId);
  const { reveal, registerArmEditHandler } = useScheduleNav();
  // The one preview session (Slice 04). INERT (no-op, providerPresent=false)
  // until batch 4 mounts RippleProvider around the Rule — until then the drag
  // handles simply don't render and the ghost layer never has a diff to draw.
  const ripple = useRippleSession();

  // The positioned track container — the % coordinate space every drag reads
  // its pointer x against (attached to whichever of the pinned/unpinned surfaces
  // is mounted; only one is at a time).
  const trackRef = useRef<HTMLDivElement>(null);
  // The strip's own grid — a separate coordinate space, because the strip and
  // the pinned glance are now BOTH mounted (the glance simply paints only once
  // the strip has scrolled past).
  const stripTrackRef = useRef<HTMLDivElement>(null);

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

  // ── The drafting strip's vertical layout: one lane per drawable phase, in
  //    the LEDGER's order (`schedule.phases` is sort_order-ordered, so its ids
  //    carry that order without this file re-sorting on a column it can't see).
  //    Main lanes first, threads after. ──
  const laneOrder = useMemo(() => schedule.phases.map((p) => p.id), [schedule.phases]);
  const laneLayout = useMemo(
    () => ruleLanes(resolvedPhases, laneOrder),
    [resolvedPhases, laneOrder],
  );
  const months = useMemo(() => (scale ? monthColumns(scale) : []), [scale]);
  const weekLines = useMemo(() => (scale ? weekGridlines(scale) : []), [scale]);

  // Host phase END epoch by phase id — a diamond drag's `milestone-offset` base
  // (offset from the phase END). null when the host phase has no resolved end.
  const phaseEndEpochById = useMemo(
    () => new Map(resolvedPhases.map((p) => [p.id, epochDayFromISO(p.end)])),
    [resolvedPhases],
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

  // ── The bars' ownership + staged store, keyed by phase id (B1/B2). It lives
  //    HERE, not in RulePhaseBar: the pinned/unpinned surfaces are a ternary on
  //    `pinned`, so scrolling past the pin threshold unmounts and remounts every
  //    bar. Instance-local memory would be wiped by that scroll while the
  //    session the bar authored lives on in the provider, and the next gesture
  //    would silently begin again off stale committed values, discarding the
  //    accumulated edit. ScheduleRule does not remount across the flip, so the
  //    store outlives it. (Deliberately NOT in RippleProvider — the provider
  //    owns the one pending EDIT; this is the Rule's own surface bookkeeping.) ──
  const [barEdits, setBarEdits] = useState<Map<string, BarEditState>>(() => new Map());
  const getBarEdit = useCallback(
    (phaseId: string): BarEditState | null => barEdits.get(phaseId) ?? null,
    [barEdits],
  );
  const setBarEdit = useCallback((phaseId: string, next: BarEditState | null) => {
    setBarEdits((prev) => {
      const map = new Map(prev);
      if (next == null) map.delete(phaseId);
      else map.set(phaseId, next);
      return map;
    });
  }, []);
  // Prune every proof the live session no longer bears out — cleared, committed,
  // origin-flipped, or taken over. `barOwnsSession` is the SAME predicate the
  // bars read, so the store can never hold a proof a bar would still honour.
  useEffect(() => {
    setBarEdits((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      let changed = false;
      for (const [phaseId, entry] of prev) {
        if (!barOwnsSession(ripple.session, phaseId, entry.emitted)) {
          next.delete(phaseId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ripple.session]);

  // ── "Edit dates" arms the instrument (B3). The Spine's per-phase action no
  //    longer opens a typed panel in the ledger; it calls `nav.armEdit(phaseId)`
  //    and the Rule answers: scroll itself into view, then hand that phase's bar
  //    the focus so the edit happens by drag or by the bar's keyboard model.
  //    The sentinel is the scroll target — it sits immediately above the sticky
  //    wrapper, so bringing it to the top brings the Rule with it.
  //
  //    The focus is ARMED, not spent: that smooth scroll typically un-pins the
  //    Rule partway through, which remounts every bar through the ternary below,
  //    so a focus applied on the next frame would land on an element that is
  //    about to be thrown away. `useArmedBarFocus` holds the intent until a bar
  //    for the phase actually appears — through as many pin flips as the scroll
  //    causes — and drops it after ~1.5s. A phase with NO bar (unplaced, or a
  //    thread lane) never registers one, so its intent expires unspent; the
  //    "Unplaced · N" affordance below remains its way in. ──
  const { registerBarEl, arm: armBarFocus } = useArmedBarFocus();
  // Which phase the strip's header line speaks for when no edit is in flight.
  const [armedPhaseId, setArmedPhaseId] = useState<string | null>(null);
  // A REF, not state: the only reader is `handleArmEdit`, which runs after the
  // commit that attached it. Held in state, the handler registered on the
  // strip's FIRST render closed over `null` — and an arm re-fired the instant
  // the region unfolded (schedule-rule-region.tsx) landed on that closure and
  // scrolled nowhere. Refs are assigned during commit, before any effect, so
  // this is set by the time the region's post-unfold effect can call in.
  const stripRef = useRef<HTMLDivElement | null>(null);

  const handleArmEdit = useCallback(
    (phaseId: string) => {
      setArmedPhaseId(phaseId);
      armBarFocus(phaseId);
      stripRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [armBarFocus],
  );

  useEffect(() => {
    registerArmEditHandler(handleArmEdit);
    return () => registerArmEditHandler(null);
  }, [registerArmEditHandler, handleArmEdit]);

  // Baseline affordance gates (R100): a v1 must exist; the toggle + ghosts hide
  // while a ripple session is active (terracotta preview ghosts take
  // precedence) and while pinned (the fold shows committed truth only). The
  // ghost layer additionally requires the toggle ON and a computed diff.
  const baselineToggleVisible = baselineV1 != null && !ripple.isActive;
  const showBaselineLayer = baselineToggleVisible && showBaseline && baselineDiff != null;

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

  // The scale's padded epoch domain, read through its own inverse so the bounds
  // are exactly the days a drag at either edge resolves to — the bars' announced
  // slider range and the clamp their staged values pass through.
  const domainMinEpoch = xToEpochDay(scale, 0);
  const domainMaxEpoch = xToEpochDay(scale, 100);

  const handlesOn = ripple.providerPresent;

  // ── The strip's header line. The ENGAGED phase is whichever the pending edit
  //    names, else the last one "Edit dates" armed, else the active phase, else
  //    the first lane. Its meta reads through the ripple when one is in flight,
  //    so a drag rewrites "· 3w" frame by frame — the document's own grammar
  //    becomes the readout rather than a second vocabulary. ──
  const sessionPhaseId =
    ripple.session != null &&
    (ripple.session.edit.kind === 'phase-anchor' || ripple.session.edit.kind === 'phase-duration')
      ? ripple.session.edit.phaseId
      : null;
  const activePhaseId =
    bars.find((b) => ruleWeightForStatus(phaseRowById.get(b.id)?.status) === 'active')?.id ?? null;
  const headerBar =
    bars.find((b) => b.id === sessionPhaseId) ??
    bars.find((b) => b.id === armedPhaseId) ??
    bars.find((b) => b.id === activePhaseId) ??
    bars[0] ??
    null;

  const headerChange =
    headerBar == null
      ? null
      : (ripple.diff?.phaseChanges.find((c) => c.phaseId === headerBar.id) ?? null);
  const headerStartEpoch =
    headerChange != null ? epochDayFromISO(headerChange.toStart) : headerBar?.startEpoch ?? null;
  const headerEndEpoch =
    headerChange != null
      ? epochDayFromISO(headerChange.toEnd)
      : headerBar != null
        ? barNudgeEpochDay(headerBar.startEpoch, headerBar.durationDays)
        : null;
  const headerDurationDays =
    headerStartEpoch != null && headerEndEpoch != null
      ? boundaryDurationDays(headerStartEpoch, headerEndEpoch)
      : (headerBar?.durationDays ?? null);

  const predecessorName = (() => {
    if (headerBar == null) return null;
    const row = phaseRowById.get(headerBar.id);
    const followsId = row?.follows_phase_id ?? null;
    return followsId ? (phaseRowById.get(followsId)?.name ?? null) : null;
  })();

  const headerName = headerBar?.name ?? projectTitle;
  const headerMeta = (() => {
    if (headerBar == null) return '';
    const parts: string[] = [];
    if (headerBar.anchored) parts.push('Anchored');
    else if (predecessorName) parts.push(`Follows ${predecessorName}`);
    if (headerDurationDays != null) parts.push(weeksOrDays(headerDurationDays));
    return parts.join(' · ');
  })();

  return (
    <>
      {/* THE EDITOR — the drafting strip, ordinary in-flow content. One lane per
          phase over month/week graph paper; this is where dates are adjusted. */}
      <div ref={stripRef}>
        <p className="mb-2 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
          Frame · Phase dates
        </p>
        <DraftingStrip
          layout={laneLayout}
          bars={bars}
          threads={threads}
          months={months}
          weekLines={weekLines}
          diamonds={diamonds}
          milestoneNameById={(id) => milestoneNameById.get(id)}
          scale={scale}
          todayXPct={todayX}
          today={today}
          headerName={headerName}
          headerMeta={headerMeta}
          rippleDiff={ripple.diff}
          baselineDiff={showBaselineLayer ? baselineDiff : null}
          trackRef={stripTrackRef}
          barsEnabled={handlesOn}
          engagedPhaseId={headerBar?.id ?? null}
          session={ripple.session}
          getBarEdit={getBarEdit}
          setBarEdit={setBarEdit}
          registerBarEl={registerBarEl}
          xToDay={(x) => xToEpochDay(scale, x)}
          domainMinEpoch={domainMinEpoch}
          domainMaxEpoch={domainMaxEpoch}
          onMoveBegin={beginBarMove}
          onMoveFrame={frameBarMove}
          onResizeBegin={beginBarResize}
          onResizeFrame={frameBarResize}
          onRevealPhase={revealPhase}
          onRevealMilestone={revealMilestone}
          onDiamondDragBegin={(milestoneId, phaseId, x) => {
            const pe = phaseEndEpochById.get(phaseId) ?? null;
            if (pe != null) beginDiamond(milestoneId, phaseId, pe, x);
          }}
          onDiamondDragFrame={(milestoneId, phaseId, x) => {
            const pe = phaseEndEpochById.get(phaseId) ?? null;
            if (pe != null) frameDiamond(milestoneId, phaseId, pe, x);
          }}
          phaseEndEpochById={phaseEndEpochById}
          suppressRefuse={ripple.isActive}
        />
      </div>

      {/* 1px sentinel, in flow BELOW the strip — it leaves the viewport exactly
          as the strip finishes scrolling past, flipping the glance on. */}
      <div ref={setSentinelEl} aria-hidden className="h-px w-full" />

      {/* The pinned GLANCE — the compact single-track rule, unchanged. A
          zero-height sticky element: it reserves nothing in flow (so nothing
          shifts, at any scroll depth) and its band paints over the content
          beneath only once the strip has scrolled past. Read-only by design —
          the editor is the strip above; the boundary handles stay because they
          were already the glance's own affordance. */}
      <section
        aria-label="Schedule rule"
        className="pointer-events-none sticky top-0 z-[3] h-0"
      >
        {pinned && (
          <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-4 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)] py-1">
            <span className="whitespace-nowrap font-heading text-[0.95rem] text-[var(--color-charcoal)]">
              {projectTitle}
            </span>
            <ScheduleGlanceStrip
              segments={segments}
              todayXPct={todayX}
              today={today}
              trackRef={trackRef}
              className="flex-1"
            >
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
              {ripple.diff && <RuleGhostLayer diff={ripple.diff} scale={scale} pinned />}
            </ScheduleGlanceStrip>
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
                  ? 'text-[var(--color-clay-ink)]'
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
