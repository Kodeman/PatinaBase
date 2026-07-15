'use client';

/**
 * ScheduleSpine — the Ledger Spine, the project page's bones (C6, Slice 01
 * read). Prototype: the `data-title="The Spine"` slide of
 * the-document-schedule-master-direction.html (ruled Jul 14 2026: B is the
 * structure, A is the glance).
 *
 * The architectural sibling of CoordinationBand — same props, same data
 * hooks, same sheet-mounting pattern — with the schedule resolver layered on:
 *   · resolves designer_clients.id from the client's auth uid (the
 *     work-block.tsx pattern); create surfaces gate on it.
 *   · reads the live coordination data (items / tasks / parties / FF&E) and
 *     subscribes ONCE via useCoordinationRealtime; useResolvedSchedule is the
 *     single door for phases + milestones + resolved dates (R100 — nothing
 *     here computes time; the derivation lib only decides presentation).
 *   · owns the spine-LOCAL sheet state — never a route, tab, or split view
 *     (D1). OpenItemSheet + ItemComposer mount as DocSheet overlays at the
 *     spine root with EXACTLY the band's props, so item detail + CRUD keep
 *     working by construction.
 *
 * Slice 01 is READ: the only affordances are unfold/fold on closed/future
 * phases and the head's one quiet "+ New open item" (gated on a resolved
 * designerClientId — hidden, not disabled, until then). Items created there
 * carry no phase and land in the active phase via itemsForPhase's null rule.
 * Zero shadows (D4): depth is the section head's value contrast, the spine's
 * ink weight, and pearl hairlines.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useCoordinationItems,
  useProjectParties,
  useProjectFFEItems,
  useCoordinationRealtime,
  useDesignerClientForClientUser,
  useResolvedSchedule,
} from '@patina/supabase';
import type { ResolvedPhase } from '@patina/utils';
import { useSectionTasks } from '@/hooks/use-section-work';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import {
  phaseState,
  itemsForPhase,
  todayIndex,
  phaseMeta,
  threadsFor,
  type SpinePhaseState,
} from '@/lib/document/schedule-spine-derivation';
import {
  blocksText,
  sortItemsBlockingFirst,
} from '@/lib/document/coordination-derivation';
import { phaseAnchorId } from '@/lib/document/phase-anchor';
import { useScheduleNav, type ScheduleRevealTarget } from './schedule-nav-context';
import { StrataMiniRule } from '../strata-mini-rule';
import { DocSheet } from '../overlays/doc-sheet';
import { OpenItemSheet } from '../coordination/open-item-sheet';
import {
  ItemComposer,
  toComposerFfeItems,
  toComposerPhases,
} from '../coordination/item-composer';
import { CoordinationWork } from '../coordination/coordination-work';
import { PhaseSection } from './phase-section';
import { TodayRule } from './today-rule';

// ── schedule-spine.tsx (orchestrator; owns ALL sheet-open LOCAL state) ──
// Props byte-identical to CoordinationBandProps — the spine replaces the band
// on the project page, so it must slot into the exact same mount.
export interface ScheduleSpineProps {
  projectId: string;
  /** The client's AUTH user id (profiles.id) — row.client_profile_id. The spine
   *  feeds this to useDesignerClientForClientUser to produce designerClientId. */
  clientUserId: string | null;
  clientName: string;
}

/** The spine's sheet state: an item id (its OpenItemSheet), the composer, or none. */
type SheetState = { kind: 'item'; id: string } | { kind: 'composer' } | null;

export function ScheduleSpine({
  projectId,
  clientUserId,
  clientName,
}: ScheduleSpineProps) {
  // ── designer_clients.id resolution (work-block.tsx pattern) ──
  const { data: designerClient } = useDesignerClientForClientUser(clientUserId ?? '');
  const designerClientId = designerClient?.id ?? null;

  // ── live data (the band's hooks) + the schedule's single door ──
  const { data: items } = useCoordinationItems(projectId);
  const { data: parties } = useProjectParties(projectId);
  const { data: tasks } = useSectionTasks(projectId);
  const { data: ffeRows } = useProjectFFEItems(projectId);
  const schedule = useResolvedSchedule(projectId);
  // Subscribe ONCE for the whole spine — the rows above re-read on invalidation.
  useCoordinationRealtime(projectId);

  // The Rule (the minimap) reveals phases/milestones here through the nav
  // context. Inert when no provider is above (the spine works standalone).
  const { registerRevealHandler } = useScheduleNav();

  const allItems = useMemo(() => items ?? [], [items]);
  const allTasks = useMemo(() => tasks ?? [], [tasks]);
  const allParties = useMemo(() => parties ?? [], [parties]);
  const composerFfe = useMemo(() => toComposerFfeItems(ffeRows), [ffeRows]);
  // useResolvedSchedule already carries the raw project_phases rows (the one
  // canonical fetch) — the composer's phase picker maps straight off them.
  const composerPhases = useMemo(
    () => toComposerPhases(schedule.phases),
    [schedule.phases],
  );

  // The render-side clock — the same convention as useResolvedSchedule's
  // injected `today`, computed once per mount (stamps, splice, the rule).
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── derivation assembly (all presentation — the resolver did the time) ──
  const rowById = useMemo(
    () => new Map(schedule.phases.map((p) => [p.id, p])),
    [schedule.phases],
  );
  const milestoneNameById = useMemo(
    () => new Map(schedule.milestones.map((m) => [m.id, m.name])),
    [schedule.milestones],
  );

  const resolvedPhases = useMemo(
    () => schedule.resolved?.phases ?? [],
    [schedule.resolved],
  );
  const resolvedMilestones = useMemo(
    () => schedule.resolved?.milestones ?? [],
    [schedule.resolved],
  );

  /** The rendered entries — main-lane phases only; threads stitch into hosts. */
  const mainLane = useMemo(
    () => resolvedPhases.filter((p) => p.lane === 'main'),
    [resolvedPhases],
  );

  const activePhaseId = useMemo(
    () =>
      mainLane.find((p) => phaseState(rowById.get(p.id)?.status) === 'active')?.id ??
      null,
    [mainLane, rowById],
  );

  // Valid = ALL resolved phases (main + thread). Dangling means null or a
  // DELETED phase_id (the derivation's rule) — those land in the active phase
  // so they surface somewhere live. An item on a real THREAD-lane phase is
  // NOT dangling: its work is the stitch, its rows defer to the Loom — it
  // renders no main-phase row here (it still counts in CoordinationWork's
  // blocking surface and stays pending; nothing is lost).
  const validPhaseIds = useMemo(
    () => new Set(resolvedPhases.map((p) => p.id)),
    [resolvedPhases],
  );

  const threadMap = useMemo(
    () => threadsFor(resolvedPhases, activePhaseId),
    [resolvedPhases, activePhaseId],
  );

  const todayIdx = useMemo(() => {
    const activeIndex = mainLane.findIndex((p) => p.id === activePhaseId);
    return todayIndex(mainLane, today, activeIndex);
  }, [mainLane, activePhaseId, today]);

  /** Everything a PhaseSection renders, assembled once per data change. */
  const entries = useMemo(
    () =>
      mainLane.map((phase) => {
        const row = rowById.get(phase.id);
        const state = phaseState(row?.status);

        const milestones = resolvedMilestones
          .filter((m) => m.phaseId === phase.id)
          .map((m) => ({ ...m, name: milestoneNameById.get(m.id) ?? '' }));

        // Open items for this phase (null/dangling phase_id → active phase),
        // the thing holding the line first (R101.2).
        const phaseItems = sortItemsBlockingFirst(
          itemsForPhase(allItems, phase.id, activePhaseId, validPhaseIds),
          allTasks,
        );

        // ── the meta line's inputs (per-state; phaseMeta drops empties) ──
        const linkedCount = allItems.filter((i) => i.phase_id === phase.id).length;
        const blockingCount = phaseItems.filter(
          (i) => blocksText(i, allTasks) !== null,
        ).length;
        let lastSigned: { name: string; date: string | null } | null = null;
        for (const m of milestones) {
          if (m.derivedStatus !== 'signed' || m.date == null) continue;
          if (lastSigned == null || (lastSigned.date != null && m.date > lastSigned.date)) {
            lastSigned = { name: m.name, date: m.date };
          }
        }
        const durationDays =
          row == null
            ? null
            : row.duration_days ??
              (row.duration_weeks != null ? row.duration_weeks * 7 : null);
        const predecessorName = row?.follows_phase_id
          ? rowById.get(row.follows_phase_id)?.name ?? null
          : null;

        const metaLine = phaseMeta({
          state,
          start: phase.start,
          end: phase.end,
          anchored: phase.anchored,
          itemCount: linkedCount,
          openCount: phaseItems.length,
          blockingCount,
          lastSigned,
          predecessorName,
          durationDays,
          milestoneCount: milestones.length,
        });

        const threads = (threadMap.get(phase.id) ?? [])
          .map((tid) => {
            const thread = resolvedPhases.find((p) => p.id === tid);
            return thread
              ? { phase: thread, name: rowById.get(tid)?.name ?? '' }
              : null;
          })
          .filter((t): t is { phase: ResolvedPhase; name: string } => t != null);

        return {
          phase,
          name: row?.name ?? '',
          state,
          metaLine,
          milestones,
          items: phaseItems,
          threads,
        };
      }),
    [
      mainLane,
      rowById,
      resolvedMilestones,
      milestoneNameById,
      allItems,
      allTasks,
      activePhaseId,
      validPhaseIds,
      threadMap,
      resolvedPhases,
    ],
  );

  // ── spine-LOCAL sheet state — never a route/tab (D1) ──
  const [sheet, setSheet] = useState<SheetState>(null);

  const openItem = (id: string) => setSheet({ kind: 'item', id });
  const openComposer = () => setSheet({ kind: 'composer' });
  const closeSheet = () => setSheet(null);

  // The item currently in the OpenItemSheet (resolved fresh from the live query
  // so the sheet always reads the latest row after an optimistic update).
  const activeItem = useMemo(
    () => (sheet?.kind === 'item' ? allItems.find((i) => i.id === sheet.id) ?? null : null),
    [sheet, allItems],
  );

  // ── unfold state — closed/future phases only. The ACTIVE phase is expanded
  // unconditionally (its onToggle is null), which realizes the "seeded with
  // the active phase" rule structurally — ids load async, sets don't wait. ──
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());

  const handlePhaseToggle = (
    phaseId: string,
    state: SpinePhaseState,
    itemCount: number,
    milestoneCount: number,
  ) => {
    // C7: spine_phase_unfolded fires ONLY on the fold→unfold transition of a
    // closed/future phase — read `unfolded` (current render's state) directly
    // rather than inside the setUnfolded updater, since a functional updater
    // can run more than once (batching / Strict Mode) and would double-fire.
    // The active phase never reaches here (its onToggle is null below), but
    // the state guard stays as a defensive no-op boundary, not a load-bearing
    // check.
    const isUnfolding = !unfolded.has(phaseId);
    if (isUnfolding && state !== 'active') {
      scheduleEvents.spinePhaseUnfolded({
        project_id: projectId,
        phase_id: phaseId,
        phase_state: state,
        item_count: itemCount,
        milestone_count: milestoneCount,
      });
    }
    setUnfolded((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  // ── minimap reveal — the Rule asks the spine to surface a phase/milestone.
  // A milestone target also flashes its row (~1.6s transient highlight). ──
  const [highlightMilestoneId, setHighlightMilestoneId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReveal = useCallback((target: ScheduleRevealTarget) => {
    // Unfold the target phase through the SAME Set the header toggle uses
    // (a no-op for the always-open active phase); never fold it back.
    setUnfolded((prev) => {
      if (prev.has(target.phaseId)) return prev;
      const next = new Set(prev);
      next.add(target.phaseId);
      return next;
    });

    if (target.kind === 'milestone') {
      setHighlightMilestoneId(target.milestoneId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightMilestoneId(null), 1600);
    }

    // Scroll after the unfold paints — the page's rAF + smooth + scroll-mt
    // pattern; each PhaseSection wears phaseAnchorId(phaseId) as its DOM id.
    requestAnimationFrame(() => {
      document
        .getElementById(phaseAnchorId(target.phaseId))
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  // Register for as long as the spine is mounted; unregister on unmount so a
  // reveal from a still-mounted Rule no-ops once the spine is gone.
  useEffect(() => {
    registerRevealHandler(handleReveal);
    return () => {
      registerRevealHandler(null);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [registerRevealHandler, handleReveal]);

  const loading = schedule.isLoading || schedule.resolved == null;

  return (
    <section aria-label="Project schedule" className="mt-2">
      {/* The section head — the band's grammar: a quiet Playfair label over the
          StrataMiniRule, ONE quiet mono action at right (hidden, not disabled,
          until the designer-client id resolves). Depth = value contrast. */}
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          Schedule
        </h2>
        {designerClientId && (
          <button
            type="button"
            onClick={openComposer}
            className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
          >
            + New open item
          </button>
        )}
      </div>
      <StrataMiniRule className="mt-1.5" />

      {loading ? (
        // Nothing heavy while the resolver's sources load — one quiet line.
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          resolving the schedule…
        </p>
      ) : (
        <>
          <div className="mt-5">
            {entries.map((entry, i) => (
              <Fragment key={entry.phase.id}>
                {i === todayIdx && <TodayRule today={today} />}
                <PhaseSection
                  phase={entry.phase}
                  name={entry.name}
                  state={entry.state}
                  anchorId={phaseAnchorId(entry.phase.id)}
                  highlightMilestoneId={highlightMilestoneId}
                  expanded={entry.state === 'active' ? true : unfolded.has(entry.phase.id)}
                  onToggle={
                    entry.state === 'active'
                      ? null
                      : () =>
                          handlePhaseToggle(
                            entry.phase.id,
                            entry.state,
                            entry.items.length,
                            entry.milestones.length,
                          )
                  }
                  metaLine={entry.metaLine}
                  milestones={entry.milestones}
                  items={entry.items}
                  tasks={allTasks}
                  parties={allParties}
                  clientName={clientName}
                  threads={entry.threads}
                  onOpenItem={openItem}
                  today={today}
                />
              </Fragment>
            ))}
            {entries.length > 0 && todayIdx === entries.length && (
              <TodayRule today={today} />
            )}
          </div>

          {/* The work + the dependency web — lives here pending a design
              ruling; a blocked ⊘ tick opens its blocker's sheet. */}
          <CoordinationWork projectId={projectId} items={allItems} onOpenItem={openItem} />
        </>
      )}

      {/* ── Overlays — DocSheet children at the spine root so the document stays
          mounted beneath (D1). `open` is spine-local state, never a route. ── */}
      <DocSheet
        open={sheet?.kind === 'item' && Boolean(activeItem)}
        onClose={closeSheet}
        title={activeItem ? `Open item — ${activeItem.title}` : 'Open item'}
      >
        {activeItem && (
          <OpenItemSheet
            item={activeItem}
            tasks={allTasks}
            parties={allParties}
            projectId={projectId}
            designerClientId={designerClientId ?? ''}
            clientName={clientName}
            onClose={closeSheet}
          />
        )}
      </DocSheet>

      <DocSheet
        open={sheet?.kind === 'composer' && Boolean(designerClientId)}
        onClose={closeSheet}
        title="New open item"
      >
        {sheet?.kind === 'composer' && designerClientId && (
          <ItemComposer
            projectId={projectId}
            designerClientId={designerClientId}
            tasks={allTasks}
            ffeItems={composerFfe}
            phases={composerPhases}
            parties={allParties}
            onClose={closeSheet}
            onCreated={closeSheet}
          />
        )}
      </DocSheet>
    </section>
  );
}
