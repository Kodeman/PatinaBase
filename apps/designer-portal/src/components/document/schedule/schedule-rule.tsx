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
 *  · at rest — the full 132px canvas (labels + thread + line + diamonds +
 *    today).
 *  · pinned — a ~22px fold (line + ticks + diamonds + today only, per
 *    foldedLayers), the project title inline at left; labels + thread fold
 *    away and the today date-label hides (the prototype's `.pin-rule`).
 *
 * Pin containment — the sticky element IS the wrapper. The component renders
 * two flow siblings: a 1px sentinel, then a `sticky top-0` wrapper whose
 * height is PERMANENTLY the full resting canvas (~132px). The wrapper itself
 * is transparent and `pointer-events-none`; only the rule surface inside is
 * `pointer-events-auto` (pinned, the ~22px strip at its top carries the
 * `--doc-paper` background — the remaining ~110px stays see-through and
 * click-through as content scrolls beneath). Because the wrapper's height
 * never changes and it stays in flow, folding shifts NOTHING downstream —
 * and because the sticky element is the wrapper itself, its sticking range
 * is bounded by its PARENT, not by a short internal container, so the pinned
 * fold holds at every scroll depth of that parent. The sentinel scrolling
 * above the viewport (IntersectionObserver) flips the mode. z-[3]: above the
 * document's in-flow chrome (margin rail z-[1], doc-spine z-[2]), below the
 * unified mobile bar (z-40) and DocSheet overlays (z-50).
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
 * NOT mounted in this slice — step 3 gates + mounts it and adds the telemetry
 * at the `// telemetry: wired in S2-4` seams. Zero shadows (D4).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedSchedule } from '@patina/supabase';
import type { ResolvedPhase } from '@patina/utils';
import {
  buildTimeScale,
  ruleSegments,
  ruleDiamonds,
  ruleThreads,
  unplacedPhases,
  foldedLayers,
  ruleWeightForStatus,
} from '@/lib/document/schedule-rule-derivation';
import { fmtDay } from '@/lib/document/format';
import { useScheduleNav } from './schedule-nav-context';
import { RuleTrack } from './rule-track';
import { RuleDiamond } from './rule-diamond';
import { RuleToday } from './rule-today';
import { RuleThread } from './rule-thread';
import { RuleLabelRow, type RuleLabelItem } from './rule-label-row';

export interface ScheduleRuleProps {
  projectId: string;
  /** row.title — the inline title shown beside the line when pinned. */
  projectTitle: string;
}

const CANVAS_H = 132; // the resting rule's full height (prototype `.ma-canvas`)

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
  // rule folds to the pinned bar. Zero downstream shift — the outer reserves
  // the full resting height and the inner is sticky (see the file header). ──
  const [pinned, setPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layers = foldedLayers(pinned);

  const revealPhase = (phaseId: string) => {
    reveal({ kind: 'phase', phaseId });
    // telemetry: wired in S2-4
  };
  const revealMilestone = (phaseId: string, milestoneId: string) => {
    reveal({ kind: 'milestone', phaseId, milestoneId });
    // telemetry: wired in S2-4
  };

  // Fully-undated schedule (or still loading): the Rule draws nothing — the
  // empty state is a review escalation (§7), and step 3 keeps the spine's own
  // loading copy as the only "resolving…" affordance.
  if (schedule.resolved == null || scale == null) return null;

  return (
    <>
      {/* 1px sentinel, in flow ABOVE the sticky wrapper — it leaves the
          viewport exactly as the wrapper reaches the top, flipping the fold. */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* THE sticky element is this wrapper (see the file header's pin
          containment + mount contract): permanent resting height, in flow,
          transparent, click-through — only the surface inside takes events. */}
      <section
        aria-label="Schedule rule"
        className="pointer-events-none sticky top-0 z-[3]"
        style={{ height: CANVAS_H }}
      >
        {pinned ? (
          /* The ~22px fold at the wrapper's TOP — the only painted, hit-
             testable band while pinned; the ~110px beneath stays transparent
             so content scrolling under never visually collides. */
          <div className="pointer-events-auto flex items-center gap-4 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)] py-1">
            <span className="whitespace-nowrap font-heading text-[0.95rem] text-[var(--color-charcoal)]">
              {projectTitle}
            </span>
            <div className="relative h-[22px] flex-1">
              <RuleTrack segments={segments} pinned />
              {diamonds.map((d) => (
                <RuleDiamond
                  key={d.id}
                  xPct={d.xPct}
                  status={d.status}
                  label={milestoneNameById.get(d.id) ?? 'Milestone'}
                  pinned
                  onClick={() => revealMilestone(d.phaseId, d.id)}
                />
              ))}
              {todayX != null && <RuleToday xPct={todayX} today={today} pinned />}
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto relative h-full">
            {/* labels — hidden <980px (mobile); the stagger short-circuits on
                a 0-wide container there. */}
            {layers.labels && (
              <div className="hidden min-[980px]:block">
                <RuleLabelRow labels={labels} onReveal={revealPhase} />
              </div>
            )}

            <RuleTrack segments={segments} pinned={false} />

            {diamonds.map((d) => (
              <RuleDiamond
                key={d.id}
                xPct={d.xPct}
                status={d.status}
                label={milestoneNameById.get(d.id) ?? 'Milestone'}
                pinned={false}
                onClick={() => revealMilestone(d.phaseId, d.id)}
              />
            ))}

            {todayX != null && <RuleToday xPct={todayX} today={today} pinned={false} />}

            {/* thread hairlines — hidden <980px, folded away when pinned. */}
            {layers.thread && (
              <div className="hidden min-[980px]:block">
                {threads.map((t) => (
                  <RuleThread
                    key={t.id}
                    leftPct={t.leftPct}
                    widthPct={t.widthPct}
                    name={t.name}
                    start={t.start}
                    end={t.end}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Unplaced phases — never drawn on the line; a quiet right-aligned mono
          control that still routes reveal → spine (§3.3). Always rendered
          (both modes) so toggling the pin never shifts what follows. */}
      {unplaced.length > 0 && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => revealPhase(unplaced[0].id) /* telemetry: wired in S2-4 */}
            aria-label={`${unplaced.length} unplaced ${
              unplaced.length === 1 ? 'phase' : 'phases'
            } — reveal the first in the schedule`}
            className="font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
          >
            Unplaced · {unplaced.length}
          </button>
        </div>
      )}
    </>
  );
}
