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

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useCoordinationItems,
  useProjectParties,
  useProjectFFEItems,
  useCoordinationRealtime,
  useDesignerClientForClientUser,
  useResolvedSchedule,
  useProjects,
  useCreateProjectPhase,
  useProjectPhaseCounts,
  useAddScheduleMilestone,
  useUpdateScheduleMilestone,
  useUpdateProjectPhaseChain,
  useDeletePhaseWithRelink,
  useSeedProjectScheduleFromTemplate,
  useCopyScheduleAsBuilt,
  mapPhaseRowToScheduleInput,
  mapMilestoneRowToScheduleInput,
} from '@patina/supabase';
import type {
  ResolvedPhase,
  SchedulePhaseInput,
  ScheduleMilestoneInput,
} from '@patina/utils';
import { useSectionTasks } from '@/hooks/use-section-work';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import {
  phaseState,
  itemsForPhase,
  todayIndex,
  phaseMeta,
  phaseGhostLine,
  threadsFor,
  type SpinePhaseState,
} from '@/lib/document/schedule-spine-derivation';
import { relinkOnDelete } from '@/lib/document/schedule-compose-derivation';
import {
  blocksText,
  sortItemsBlockingFirst,
} from '@/lib/document/coordination-derivation';
import { phaseAnchorId } from '@/lib/document/phase-anchor';
import {
  useScheduleNav,
  type ScheduleRevealTarget,
} from './schedule-nav-context';
import { useRippleSession } from './schedule-ripple-context';
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
import { GhostAddLine, type GhostAddInput } from './ghost-add-line';
import { ScheduleBirth } from './schedule-birth';
import { PhaseComposeActions } from './phase-compose-actions';
import { PhaseDeleteConfirm } from './phase-delete-confirm';
import { MilestoneComposer, type MilestoneDraft } from './milestone-composer';
import { ScheduleEntryField } from './schedule-entry-field';
import { RevisionLedger } from './revision-ledger';
import type { PastProjectOption } from './past-project-picker';
import { DocumentAction } from '../document-action';

/** Best-effort phase_key from a free-typed name (phase_key is nullable + not
 *  unique on project_phases, so a plain slug is safe — no dedupe needed). */
function slugifyPhaseKey(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'phase'
  );
}

/** Which inline compose panel is open, and on which phase (one across the spine). */
type ComposeState = {
  phaseId: string;
  kind: 'edit' | 'milestone' | 'delete';
} | null;

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
  const { data: designerClient } = useDesignerClientForClientUser(
    clientUserId ?? '',
  );
  const designerClientId = designerClient?.id ?? null;

  // ── live data (the band's hooks) + the schedule's single door ──
  const { data: items } = useCoordinationItems(projectId);
  const { data: parties } = useProjectParties(projectId);
  const { data: tasks } = useSectionTasks(projectId);
  const { data: ffeRows } = useProjectFFEItems(projectId);
  const schedule = useResolvedSchedule(projectId);
  // Subscribe ONCE for the whole spine — the rows above re-read on invalidation.
  useCoordinationRealtime(projectId);

  // ── compose mutations — the spine owns EVERY schedule write (R100). Each
  //    hook invalidates ['project-phases'|'schedule-milestones', id], and
  //    useResolvedSchedule composes off those keys, so the Rule + Spine both
  //    re-resolve after a write with no extra plumbing. ──
  const createPhase = useCreateProjectPhase();
  const updateChain = useUpdateProjectPhaseChain();
  const addMilestone = useAddScheduleMilestone();
  const updateMilestone = useUpdateScheduleMilestone();
  const deletePhaseWithRelink = useDeletePhaseWithRelink();
  const seedTemplate = useSeedProjectScheduleFromTemplate();
  const copyAsBuilt = useCopyScheduleAsBuilt();

  // ── birth "from a past project" — the designer's readable projects, each
  //    with a phase count (the copy RPC refuses a target that already has
  //    phases, and a source with none has nothing to copy). ──
  const { data: projectRows, isPending: projectsPending } = useProjects();
  const { data: phaseCounts, isPending: countsPending } =
    useProjectPhaseCounts();

  // The Rule (the minimap) reveals phases/milestones here through the nav
  // context. Inert when no provider is above (the spine works standalone).
  const { registerRevealHandler } = useScheduleNav();

  // The single ripple session (Slice 04). A time edit (duration/anchor) begins
  // a preview here; every consumer — this spine's downstream ghost meta, the
  // Rule's ghost layer, the confirm strip — reads the SAME `diff`. INERT
  // (providerPresent=false, no-op begin) when no RippleProvider is above, so
  // the spine still works standalone (batch 4 mounts the provider on the page).
  const ripple = useRippleSession();

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
  const resolvedConflicts = useMemo(
    () => schedule.resolved?.conflicts ?? [],
    [schedule.resolved],
  );

  /** The rendered entries — main-lane phases only; threads stitch into hosts. */
  const mainLane = useMemo(
    () => resolvedPhases.filter((p) => p.lane === 'main'),
    [resolvedPhases],
  );

  const activePhaseId = useMemo(
    () =>
      mainLane.find((p) => phaseState(rowById.get(p.id)?.status) === 'active')
        ?.id ?? null,
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
        const linkedCount = allItems.filter(
          (i) => i.phase_id === phase.id,
        ).length;
        const blockingCount = phaseItems.filter(
          (i) => blocksText(i, allTasks) !== null,
        ).length;
        let lastSigned: { name: string; date: string | null } | null = null;
        for (const m of milestones) {
          if (m.derivedStatus !== 'signed' || m.date == null) continue;
          if (
            lastSigned == null ||
            (lastSigned.date != null && m.date > lastSigned.date)
          ) {
            lastSigned = { name: m.name, date: m.date };
          }
        }
        const durationDays =
          row == null
            ? null
            : (row.duration_days ??
              (row.duration_weeks != null ? row.duration_weeks * 7 : null));
        const predecessorName = row?.follows_phase_id
          ? (rowById.get(row.follows_phase_id)?.name ?? null)
          : null;

        // Slice 03 — a chain_does_not_fit conflict tags BOTH phaseId and
        // anchorId with the ANCHORED phase's own id (the anchor names
        // itself), so this phase's overrun (if any) is always found by its
        // own id — never a downstream/upstream lookup.
        const chainConflict = resolvedConflicts.find(
          (c) => c.kind === 'chain_does_not_fit' && c.phaseId === phase.id,
        );

        const { text: metaLine, overrunText } = phaseMeta({
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
          slackDays: phase.slackDays,
          overrun:
            chainConflict && phase.start
              ? {
                  anchorDate: phase.start,
                  overrunDays: chainConflict.overrunDays ?? 0,
                }
              : null,
        });

        const threads = (threadMap.get(phase.id) ?? [])
          .map((tid) => {
            const thread = resolvedPhases.find((p) => p.id === tid);
            return thread
              ? { phase: thread, name: rowById.get(tid)?.name ?? '' }
              : null;
          })
          .filter(
            (t): t is { phase: ResolvedPhase; name: string } => t != null,
          );

        return {
          phase,
          name: row?.name ?? '',
          state,
          metaLine,
          overrunText,
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
      resolvedConflicts,
    ],
  );

  // Downstream ghost meta (Slice 04 T11) — while a ripple is in flight, every
  // MOVED phase wears a dashed-terracotta preview of its new range under the
  // meta line. Keyed by phaseId; phaseGhostLine returns null for the unmoved,
  // so this map holds only movers (the edited phase included). The map is empty
  // whenever no session is active → PhaseSection renders byte-identically.
  const ghostLineByPhase = useMemo(() => {
    const map = new Map<string, string>();
    if (ripple.diff == null) return map;
    for (const pc of ripple.diff.phaseChanges) {
      const line = phaseGhostLine(
        { start: pc.fromStart, end: pc.fromEnd },
        { start: pc.toStart, end: pc.toEnd },
      );
      if (line) map.set(pc.phaseId, line);
    }
    return map;
  }, [ripple.diff]);

  // ═══════════════════════════════════════════════════════════════════════
  // Compose (Slice 03) — birth + write paths. The entry grammar's parsed
  // output is persisted here; resolveSchedule stays the only engine (R100).
  // ═══════════════════════════════════════════════════════════════════════

  // Committed chain in resolver-input shape — feeds the ghost-add compute line.
  const committedPhaseInputs = useMemo<SchedulePhaseInput[]>(
    () => schedule.phases.map(mapPhaseRowToScheduleInput),
    [schedule.phases],
  );
  const committedMilestoneInputs = useMemo<ScheduleMilestoneInput[]>(
    () => schedule.milestones.map(mapMilestoneRowToScheduleInput),
    [schedule.milestones],
  );

  // A new phase joins the END of the main lane; an empty spine → a root (null).
  const lastMainPhaseId = useMemo(
    () => (mainLane.length > 0 ? mainLane[mainLane.length - 1].id : null),
    [mainLane],
  );

  const pastProjectOptions = useMemo<PastProjectOption[]>(() => {
    const rows = (projectRows ?? []) as Array<{
      id: string;
      name?: string | null;
    }>;
    return rows
      .filter((p) => p.id !== projectId && (phaseCounts?.[p.id] ?? 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name ?? 'Untitled project',
        phaseCount: phaseCounts?.[p.id] ?? 0,
      }));
  }, [projectRows, phaseCounts, projectId]);

  // Which inline compose panel is open, on which phase (one across the spine).
  const [compose, setCompose] = useState<ComposeState>(null);
  const closeCompose = () => setCompose(null);

  // ── error honesty (R83 inline idiom — the Document opts out of global
  //    toasts): every handler resets/closes ONLY on onSuccess; a failure
  //    keeps the acting surface open with an inline terracotta line, so a
  //    failed write never masquerades as a saved one. ──

  // Bumped on a successful create — clears the ghost line's kept fields.
  const [ghostResetSignal, setGhostResetSignal] = useState(0);

  const handleAddPhase = (input: GhostAddInput) => {
    // Captured BEFORE the mutate call — resolvedPhases.length flips the
    // instant the write lands, so "was this the birthing add?" has to be
    // decided from the render that triggered the click, not the one after.
    const wasEmpty = resolvedPhases.length === 0;
    createPhase.mutate(
      {
        projectId,
        phaseKey: slugifyPhaseKey(input.name),
        name: input.name,
        sortOrder: schedule.phases.length,
        durationDays: input.durationDays,
        anchorDate: input.anchorDate,
        followsPhaseId: lastMainPhaseId ?? undefined,
      },
      {
        onSuccess: () => {
          if (wasEmpty) {
            scheduleEvents.scheduleBorn({
              surface: 'project',
              project_id: projectId,
              kind: 'blank',
            });
          }
          scheduleEvents.schedulePhaseAdded({
            surface: 'project',
            project_id: projectId,
            via: 'ghost_line',
          });
          if (input.anchorDate) {
            scheduleEvents.scheduleAnchorSet({
              surface: 'project',
              project_id: projectId,
              target: 'phase',
              set: true,
            });
          }
          setGhostResetSignal((n) => n + 1);
        },
      },
    );
  };
  const ghostError = createPhase.isError
    ? 'Add failed — nothing was saved; your entry is kept'
    : null;

  // ── The ruled boundary (Slice 04 R100) ────────────────────────────────────
  // A TIME edit — a phase's duration or a hard anchor date — never writes
  // directly from the spine anymore: it BEGINS a ripple preview (origin
  // 'spine'), and the confirm strip commits or reverts it. Nothing moves until
  // Commit. So these two close the inline compose panel and hand off to the
  // strip. Everything ELSE the spine writes stays DIRECT — the unpin chip,
  // the ghost-add line, and milestone/phase create+delete are not time-shifting
  // ripples (they add/remove entities or clear a pin), so they persist
  // immediately as before. (Rule-side drags begin the same ripple with origin
  // 'rule'; both surfaces share one session.)
  const handleEditDuration = (phaseId: string, days: number) => {
    ripple.begin(
      { kind: 'phase-duration', phaseId, durationDays: days },
      'spine',
    );
    closeCompose(); // the strip takes over the preview + commit
  };
  const handleSetAnchor = (phaseId: string, date: string) => {
    ripple.begin({ kind: 'phase-anchor', phaseId, anchorDate: date }, 'spine');
    closeCompose(); // the strip takes over the preview + commit
  };
  const handleUnpinPhase = (phaseId: string) => {
    updateChain.mutate(
      { phaseId, projectId, anchorDate: null },
      {
        onSuccess: () =>
          scheduleEvents.scheduleAnchorSet({
            surface: 'project',
            project_id: projectId,
            target: 'phase',
            set: false,
          }),
      },
    );
  };

  const handleAddMilestone = (phaseId: string, draft: MilestoneDraft) => {
    addMilestone.mutate(
      {
        projectId,
        phaseId,
        name: draft.name,
        kind: draft.kind,
        offsetDays: draft.offsetDays,
        anchorDate: draft.anchorDate,
      },
      {
        onSuccess: () => {
          if (draft.anchorDate) {
            scheduleEvents.scheduleAnchorSet({
              surface: 'project',
              project_id: projectId,
              target: 'milestone',
              set: true,
            });
          }
          closeCompose();
        },
      },
    );
  };
  const handleUnpinMilestone = (milestoneId: string) => {
    updateMilestone.mutate(
      { milestoneId, projectId, anchorDate: null },
      {
        onSuccess: () =>
          scheduleEvents.scheduleAnchorSet({
            surface: 'project',
            project_id: projectId,
            target: 'milestone',
            set: false,
          }),
      },
    );
  };

  const handleDeletePhase = (phaseId: string) => {
    // relink FIRST (followers → deleted phase's own predecessor), then delete —
    // relinkOnDelete computes the patch the hook applies before the DELETE.
    const relinkUpdates = relinkOnDelete(
      schedule.phases.map((r) => ({
        id: r.id,
        followsPhaseId: r.follows_phase_id ?? null,
      })),
      phaseId,
    ).map((u) => ({ phaseId: u.id, followsPhaseId: u.followsPhaseId }));
    // Close ONLY on success — the sequence is not transactional (relinks may
    // have applied when the delete fails), and the confirm must say so.
    deletePhaseWithRelink.mutate(
      { projectId, phaseId, relinkUpdates },
      { onSuccess: closeCompose },
    );
  };

  const handleSeedPatinaSix = () => {
    seedTemplate.mutate(
      { projectId, templateSlug: 'patina_six' },
      {
        onSuccess: () =>
          scheduleEvents.scheduleBorn({
            surface: 'project',
            project_id: projectId,
            kind: 'patina_six',
          }),
      },
    );
  };
  const handleCopyFromProject = (sourceProjectId: string) => {
    copyAsBuilt.mutate(
      { sourceProjectId, targetProjectId: projectId },
      {
        onSuccess: () =>
          scheduleEvents.scheduleBorn({
            surface: 'project',
            project_id: projectId,
            kind: 'past_project',
            source_project_id: sourceProjectId,
          }),
      },
    );
  };

  const birthBusy = seedTemplate.isPending || copyAsBuilt.isPending;
  const birthError = seedTemplate.isError
    ? 'Couldn’t seed the Patina Six — nothing was saved'
    : copyAsBuilt.isError
      ? 'Couldn’t copy that schedule — nothing was saved'
      : null;

  // ── spine-LOCAL sheet state — never a route/tab (D1) ──
  const [sheet, setSheet] = useState<SheetState>(null);

  const openItem = (id: string) => setSheet({ kind: 'item', id });
  const openComposer = () => setSheet({ kind: 'composer' });
  const closeSheet = () => setSheet(null);

  // The item currently in the OpenItemSheet (resolved fresh from the live query
  // so the sheet always reads the latest row after an optimistic update).
  const activeItem = useMemo(
    () =>
      sheet?.kind === 'item'
        ? (allItems.find((i) => i.id === sheet.id) ?? null)
        : null,
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
  const [highlightMilestoneId, setHighlightMilestoneId] = useState<
    string | null
  >(null);
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
      highlightTimer.current = setTimeout(
        () => setHighlightMilestoneId(null),
        1600,
      );
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
          <DocumentAction
            actionKey="new-open-item"
            surfaceKey="open-document"
            regionKey="schedule-head"
            variant="secondary"
            onClick={openComposer}
          >
            + New open item
          </DocumentAction>
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
          {resolvedPhases.length === 0 ? (
            // ── Birth — a schedule with no phases yet (R100). Three quiet
            //    starting points + the ghost line; the mutations are ours. ──
            <ScheduleBirth
              surface="project"
              onSeedPatinaSix={handleSeedPatinaSix}
              onCopyFromPastProject={handleCopyFromProject}
              pastProjects={pastProjectOptions}
              pastProjectsLoading={projectsPending || countsPending}
              busy={birthBusy}
              errorText={birthError}
              ghostCommittedPhases={committedPhaseInputs}
              ghostCommittedMilestones={committedMilestoneInputs}
              ghostFollowsPhaseId={lastMainPhaseId}
              ghostToday={today}
              onGhostAdd={handleAddPhase}
              ghostErrorText={ghostError}
              ghostResetSignal={ghostResetSignal}
            />
          ) : (
            <div className="mt-5">
              {entries.map((entry, i) => {
                const composeKind =
                  compose?.phaseId === entry.phase.id ? compose.kind : null;
                const row = rowById.get(entry.phase.id);
                const predecessorName = row?.follows_phase_id
                  ? (rowById.get(row.follows_phase_id)?.name ?? null)
                  : null;
                const followerCount = schedule.phases.filter(
                  (p) => p.follows_phase_id === entry.phase.id,
                ).length;

                // The phase's last COMMITTED effective duration — same
                // formula the meta line above computes (durationDays, line
                // ~271): an authored day count, or weeks*7 when only a
                // week count is stored, or null (e.g. legacy-dates-derived
                // phases with neither). Feeds the Edit-dates duration
                // field's 'relative' mode below — it's what a signed
                // '+5d'/'-3d' shift resolves against. Not the resolved
                // start/end span (that'd need epoch-day math this render
                // path doesn't otherwise do) — the stored authored value is
                // what "committed duration" means for R100's grammar.
                const baselineDurationDays =
                  row == null
                    ? null
                    : (row.duration_days ??
                      (row.duration_weeks != null
                        ? row.duration_weeks * 7
                        : null));

                // The revealed compose surface for this phase, per open kind.
                const composePanel =
                  composeKind === 'edit' ? (
                    <div className="mt-[0.5rem] flex flex-col gap-[0.5rem]">
                      <ScheduleEntryField
                        aria-label="Set phase duration"
                        today={today}
                        bareNumberUnit="weeks"
                        accept={['duration']}
                        durationSign="relative"
                        baselineDays={baselineDurationDays}
                        placeholder="Duration — 4w · 28d · +5d"
                        onCommit={(e) =>
                          e.kind === 'duration' &&
                          handleEditDuration(entry.phase.id, e.days)
                        }
                        onCancel={closeCompose}
                      />
                      <ScheduleEntryField
                        aria-label="Anchor phase date"
                        today={today}
                        accept={['anchor']}
                        autoFocus={false}
                        placeholder="Anchor a date — Sep 21"
                        onCommit={(e) =>
                          e.kind === 'anchor' &&
                          handleSetAnchor(entry.phase.id, e.date)
                        }
                        onCancel={closeCompose}
                      />
                      {/* No inline error surface here: a duration/anchor entry
                          now begins a ripple preview (it never writes), and the
                          confirm strip owns commit + its failure line. */}
                    </div>
                  ) : composeKind === 'milestone' ? (
                    <MilestoneComposer
                      today={today}
                      onSubmit={(draft) =>
                        handleAddMilestone(entry.phase.id, draft)
                      }
                      onCancel={closeCompose}
                      busy={addMilestone.isPending}
                      errorText={
                        addMilestone.isError
                          ? 'Add failed — nothing was saved'
                          : null
                      }
                    />
                  ) : composeKind === 'delete' ? (
                    <PhaseDeleteConfirm
                      name={entry.name}
                      milestoneCount={entry.milestones.length}
                      followerCount={followerCount}
                      predecessorName={predecessorName}
                      onConfirm={() => handleDeletePhase(entry.phase.id)}
                      onCancel={closeCompose}
                      busy={deletePhaseWithRelink.isPending}
                      errorText={
                        deletePhaseWithRelink.isError
                          ? 'Delete failed — the chain may have been relinked; refresh to see its current state'
                          : null
                      }
                    />
                  ) : null;

                return (
                  <Fragment key={entry.phase.id}>
                    {i === todayIdx && <TodayRule today={today} />}
                    <PhaseSection
                      phase={entry.phase}
                      name={entry.name}
                      state={entry.state}
                      anchorId={phaseAnchorId(entry.phase.id)}
                      highlightMilestoneId={highlightMilestoneId}
                      expanded={
                        entry.state === 'active'
                          ? true
                          : unfolded.has(entry.phase.id)
                      }
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
                      overrunText={entry.overrunText}
                      ghostLine={ghostLineByPhase.get(entry.phase.id) ?? null}
                      milestones={entry.milestones}
                      items={entry.items}
                      tasks={allTasks}
                      parties={allParties}
                      clientName={clientName}
                      threads={entry.threads}
                      onOpenItem={openItem}
                      today={today}
                      headingActions={
                        <PhaseComposeActions
                          onAddItem={openComposer}
                          // Each open resets its mutation's stale error state
                          // (updateChain is shared with the chip unpin) so a
                          // fresh panel never opens wearing an old failure.
                          onAddMilestone={() => {
                            addMilestone.reset();
                            setCompose({
                              phaseId: entry.phase.id,
                              kind: 'milestone',
                            });
                          }}
                          // Opens the duration/anchor entry panel. No mutation
                          // reset needed — the panel begins a ripple preview, it
                          // never carries a stale write error (the strip does).
                          onEditDates={() =>
                            setCompose({
                              phaseId: entry.phase.id,
                              kind: 'edit',
                            })
                          }
                          onDelete={() => {
                            deletePhaseWithRelink.reset();
                            setCompose({
                              phaseId: entry.phase.id,
                              kind: 'delete',
                            });
                          }}
                        />
                      }
                      composePanel={composePanel}
                      onUnpinPhaseAnchor={() =>
                        handleUnpinPhase(entry.phase.id)
                      }
                      onUnpinMilestoneAnchor={handleUnpinMilestone}
                    />
                  </Fragment>
                );
              })}
              {entries.length > 0 && todayIdx === entries.length && (
                <TodayRule today={today} />
              )}

              {/* The ongoing +add — the same ghost line, joining the main lane. */}
              <GhostAddLine
                committedPhases={committedPhaseInputs}
                committedMilestones={committedMilestoneInputs}
                followsPhaseId={lastMainPhaseId}
                today={today}
                onAdd={handleAddPhase}
                errorText={ghostError}
                resetSignal={ghostResetSignal}
              />
            </div>
          )}

          {/* The work + the dependency web — lives here pending a design
              ruling; a blocked ⊘ tick opens its blocker's sheet. */}
          <CoordinationWork
            projectId={projectId}
            items={allItems}
            onOpenItem={openItem}
          />

          {/* R100 "Memory" — the schedule's own append-only ledger at the
              spine's foot: v · reason · who · when, newest first, no actions.
              Studio-only by construction (inside the gated spine); renders
              nothing until a baseline is cut. */}
          <RevisionLedger projectId={projectId} />
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
