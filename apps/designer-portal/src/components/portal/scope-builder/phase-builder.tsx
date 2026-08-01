'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/controls';
import { proposalEvents } from '@/lib/analytics';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import {
  useProposalPhases,
  useAddProposalPhase,
  useUpdateProposalPhase,
  useRemoveProposalPhase,
  useProposalPaymentMilestones,
  useProposalScheduleMilestones,
  useProjects,
  useProjectPhaseCounts,
  useApplyPhaseTemplate,
  useCopyScheduleAsBuilt,
  mapProposalPhaseRowToScheduleInput,
  mapProposalScheduleMilestoneRowToScheduleInput,
  type ProposalScheduleMilestone,
} from '@patina/supabase';
import type { SchedulePhaseInput, ScheduleMilestoneInput } from '@patina/utils';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@patina/design-system';
import { DeliverablesEditor } from './deliverables-editor';
import {
  GateConditionsEditor,
  type ProposalPhaseLite,
  type PaymentMilestoneLite,
} from './gate-conditions-editor';
import { ProposalMilestonesEditor } from './proposal-milestones-editor';
import { PhaseTemplatePicker } from './phase-template-picker';
import { PhaseTimelineView } from './phase-timeline-view';
import { ScheduleBirth } from '@/components/document/schedule/schedule-birth';
import { ScheduleEntryField } from '@/components/document/schedule/schedule-entry-field';
import { AnchorChip } from '@/components/document/schedule/milestone-row';
import type { GhostAddInput } from '@/components/document/schedule/ghost-add-line';
import type { PastProjectOption } from '@/components/document/schedule/past-project-picker';

const PHASE_KEY_OPTIONS = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'concept_development', label: 'Concept Development' },
  { value: 'design_refinement', label: 'Design Refinement' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'installation', label: 'Installation' },
  { value: 'final_walkthrough', label: 'Final Walkthrough' },
] as const;

const DEFAULT_PHASES = [
  {
    name: 'Schematic Design',
    phaseKey: 'concept_development',
    durationWeeks: 3,
    feeCents: 250000,
    revisionLimit: 2,
  },
  {
    name: 'Design Development',
    phaseKey: 'design_refinement',
    durationWeeks: 4,
    feeCents: 350000,
    revisionLimit: 2,
  },
  {
    name: 'Procurement Management',
    phaseKey: 'procurement',
    durationWeeks: 8,
    feeCents: 200000,
    revisionLimit: 1,
  },
  {
    name: 'Installation & Styling',
    phaseKey: 'installation',
    durationWeeks: 3,
    feeCents: 150000,
    revisionLimit: 1,
  },
  {
    name: 'Completion & Handover',
    phaseKey: 'final_walkthrough',
    durationWeeks: 1,
    feeCents: 50000,
    revisionLimit: 0,
  },
];

interface PhaseBuilderProps {
  proposalId: string;
}

interface ProposalPhaseRow {
  id: string;
  proposal_id: string;
  name: string;
  phase_key: string | null;
  duration_weeks: number | null;
  fee_cents: number;
  revision_limit: number | null;
  gate_condition: string | null;
  sort_order: number;
  /** Chain columns (00324 — Schedule Compose). Nullable on rows never
   *  touched by the grammar field; the mapper falls back to duration_weeks. */
  duration_days: number | null;
  follows_phase_id: string | null;
  anchor_date: string | null;
  lane: 'main' | 'thread';
}

interface ProposalPaymentMilestoneRow {
  id: string;
  proposal_id: string;
  phase_id: string | null;
  label: string;
  percentage: number;
  amount_cents: number;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/** Effective duration (days ?? weeks*7), rendered via the same weeksOrDays
 *  convention the Schedule Spine's meta line uses (exact multiples of 7 →
 *  weeks, else days) — a small deliberate duplication (see
 *  lib/document/schedule-spine-derivation.ts's non-exported weeksOrDays)
 *  rather than reaching into the Document's private derivation module. */
function fmtEffectiveDuration(days: number | null | undefined, weeks: number | null | undefined): string {
  const effectiveDays = days ?? (weeks != null ? weeks * 7 : null);
  if (effectiveDays == null) return '—';
  return effectiveDays % 7 === 0 ? `${effectiveDays / 7}w` : `${effectiveDays}d`;
}

function useDebouncedSave(
  save: (phaseId: string, proposalId: string, updates: Record<string, unknown>) => void,
  delay = 600
) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  return useCallback(
    (phaseId: string, proposalId: string, updates: Record<string, unknown>) => {
      const existing = timers.current.get(phaseId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        phaseId,
        setTimeout(() => {
          save(phaseId, proposalId, updates);
          timers.current.delete(phaseId);
        }, delay)
      );
    },
    [save, delay]
  );
}

export function PhaseBuilder({ proposalId }: PhaseBuilderProps) {
  const queryClient = useQueryClient();
  const refreshDraftingSummary = () =>
    queryClient.invalidateQueries({ queryKey: ['drafting-facets', proposalId] });
  const { data: phases = [], isLoading } = useProposalPhases(proposalId) as {
    data: ProposalPhaseRow[];
    isLoading: boolean;
  };
  const { data: milestones = [] } = useProposalPaymentMilestones(proposalId) as {
    data: ProposalPaymentMilestoneRow[];
  };

  const addPhase = useAddProposalPhase();
  const updatePhase = useUpdateProposalPhase();
  const removePhase = useRemoveProposalPhase();

  // ── Slice 03 (Compose) — birth + the duration/anchor grammar. Same RPCs
  //    the project-side Spine uses (schedule-spine.tsx), targeted at this
  //    proposal instead of a project. ──
  const applyTemplate = useApplyPhaseTemplate();
  const copyAsBuilt = useCopyScheduleAsBuilt();
  const { data: pastProjectRows, isPending: pastProjectsPending } = useProjects();
  const { data: pastPhaseCounts, isPending: pastCountsPending } = useProjectPhaseCounts();
  const { data: scheduleMilestones = [] } = useProposalScheduleMilestones(proposalId) as {
    data: ProposalScheduleMilestone[];
  };

  // The render-side clock — same convention as the project Spine's `today`.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Local edit state keyed by phase id (used by the per-phase form rows).
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [addingDefaults, setAddingDefaults] = useState(false);
  const [phaseCreateError, setPhaseCreateError] = useState<string | null>(null);
  // Bumped on a successful ghost-line create — clears the birth ghost line's kept fields.
  const [ghostResetSignal, setGhostResetSignal] = useState(0);

  // Sync server data into local state when phases load.
  useEffect(() => {
    if (phases.length > 0) {
      const next: Record<string, Record<string, unknown>> = {};
      for (const p of phases) {
        if (!edits[p.id]) {
          next[p.id] = {
            name: p.name,
            phase_key: p.phase_key,
            duration_weeks: p.duration_weeks,
            fee_cents: p.fee_cents,
            revision_limit: p.revision_limit,
            // Chain columns (00324) — seeded so a phase born via Patina Six /
            // as-built copy / a prior grammar commit shows its real duration
            // and anchor chip on first paint, not a blank grammar cell.
            duration_days: p.duration_days,
            anchor_date: p.anchor_date,
          };
        } else {
          next[p.id] = edits[p.id];
        }
      }
      setEdits(next);
    }
    // Only re-sync when phases array identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases]);

  const debouncedUpdate = useDebouncedSave(
    useCallback(
      (phaseId: string, propId: string, updates: Record<string, unknown>) => {
        updatePhase.mutate(
          { phaseId, proposalId: propId, updates },
          {
            onSuccess: () => {
              proposalEvents.scopeUpdated({ proposalId: propId, field: 'phase', action: 'update' });
            },
          }
        );
      },
      [updatePhase]
    )
  );

  function setField(phaseId: string, field: string, value: unknown) {
    setEdits((prev) => ({
      ...prev,
      [phaseId]: { ...prev[phaseId], [field]: value },
    }));
    debouncedUpdate(phaseId, proposalId, { [field]: value });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Compose (Slice 03) — the duration/anchor grammar + birth. Direct commits
  // (no debounce — a ScheduleEntryField fires once on Enter/blur, unlike the
  // continuous-typing number input it replaces), each firing its own
  // telemetry on SUCCESS only (R83 — a failed write is never counted).
  // ═══════════════════════════════════════════════════════════════════════

  function handleSetPhaseDuration(phaseId: string, days: number) {
    const weeksMirror = Math.round(days / 7); // precedence: days = truth, weeks = kept-in-sync mirror
    updatePhase.mutate(
      { phaseId, proposalId, updates: { duration_days: days, duration_weeks: weeksMirror } },
      {
        onSuccess: () => {
          setEdits((prev) => ({
            ...prev,
            [phaseId]: { ...prev[phaseId], duration_days: days, duration_weeks: weeksMirror },
          }));
          proposalEvents.scopeUpdated({ proposalId, field: 'phase', action: 'update' });
        },
      },
    );
  }

  function handleSetPhaseAnchor(phaseId: string, date: string) {
    updatePhase.mutate(
      { phaseId, proposalId, updates: { anchor_date: date } },
      {
        onSuccess: () => {
          setEdits((prev) => ({ ...prev, [phaseId]: { ...prev[phaseId], anchor_date: date } }));
          scheduleEvents.scheduleAnchorSet({
            surface: 'proposal',
            proposal_id: proposalId,
            target: 'phase',
            set: true,
          });
        },
      },
    );
  }

  function handleUnpinPhaseAnchor(phaseId: string) {
    updatePhase.mutate(
      { phaseId, proposalId, updates: { anchor_date: null } },
      {
        onSuccess: () => {
          setEdits((prev) => ({ ...prev, [phaseId]: { ...prev[phaseId], anchor_date: null } }));
          scheduleEvents.scheduleAnchorSet({
            surface: 'proposal',
            proposal_id: proposalId,
            target: 'phase',
            set: false,
          });
        },
      },
    );
  }

  // Birth support — the designer's past projects with a phase count each
  // (mirrors schedule-spine.tsx's picker; the copy RPC refuses an empty
  // source and a target that already has phases).
  const pastProjectOptions = useMemo<PastProjectOption[]>(() => {
    const rows = (pastProjectRows ?? []) as Array<{ id: string; name?: string | null }>;
    return rows
      .filter((p) => (pastPhaseCounts?.[p.id] ?? 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name ?? 'Untitled project',
        phaseCount: pastPhaseCounts?.[p.id] ?? 0,
      }));
  }, [pastProjectRows, pastPhaseCounts]);

  // The committed chain in resolver-input shape — feeds the birth ghost
  // line's passive compute-preview line (composePreview, via GhostAddLine).
  const committedPhaseInputs = useMemo<SchedulePhaseInput[]>(
    () => phases.map(mapProposalPhaseRowToScheduleInput),
    [phases],
  );
  const committedMilestoneInputs = useMemo<ScheduleMilestoneInput[]>(
    () => scheduleMilestones.map(mapProposalScheduleMilestoneRowToScheduleInput),
    [scheduleMilestones],
  );

  function handleSeedPatinaSix() {
    applyTemplate.mutate(
      { proposalId, templateSlug: 'patina_six' },
      {
        onSuccess: () => {
          scheduleEvents.scheduleBorn({
            surface: 'proposal',
            proposal_id: proposalId,
            kind: 'patina_six',
          });
          void refreshDraftingSummary();
        },
      },
    );
  }

  function handleCopyFromPastProject(sourceProjectId: string) {
    copyAsBuilt.mutate(
      { sourceProjectId, targetProposalId: proposalId },
      {
        onSuccess: () => {
          scheduleEvents.scheduleBorn({
            surface: 'proposal',
            proposal_id: proposalId,
            kind: 'past_project',
            source_project_id: sourceProjectId,
          });
          void refreshDraftingSummary();
        },
      },
    );
  }

  function handleGhostAdd(input: GhostAddInput) {
    // Captured before the mutate call — phases.length flips the instant the
    // write lands (see schedule-spine.tsx's handleAddPhase for the same note).
    const wasEmpty = phases.length === 0;
    addPhase.mutate(
      {
        proposalId,
        name: input.name,
        durationDays: input.durationDays,
        anchorDate: input.anchorDate,
        followsPhaseId: phases.length > 0 ? phases[phases.length - 1].id : undefined,
        lane: 'main',
      },
      {
        onSuccess: () => {
          if (wasEmpty) {
            scheduleEvents.scheduleBorn({ surface: 'proposal', proposal_id: proposalId, kind: 'blank' });
          }
          scheduleEvents.schedulePhaseAdded({ surface: 'proposal', proposal_id: proposalId, via: 'ghost_line' });
          if (input.anchorDate) {
            scheduleEvents.scheduleAnchorSet({
              surface: 'proposal',
              proposal_id: proposalId,
              target: 'phase',
              set: true,
            });
          }
          proposalEvents.scopeUpdated({ proposalId, field: 'phase', action: 'add' });
          setGhostResetSignal((n) => n + 1);
          void refreshDraftingSummary();
        },
      },
    );
  }

  const ghostError = addPhase.isError ? 'Add failed — nothing was saved; your entry is kept' : null;
  const birthBusy = applyTemplate.isPending || copyAsBuilt.isPending;
  const birthError = applyTemplate.isError
    ? 'Couldn’t seed the Patina Six — nothing was saved'
    : copyAsBuilt.isError
      ? 'Couldn’t copy that schedule — nothing was saved'
      : null;

  function handleAddPhase() {
    addPhase.mutate(
      {
        proposalId,
        name: 'New Phase',
        phaseKey: 'consultation',
        durationWeeks: 2,
        feeCents: 0,
        revisionLimit: 2,
      },
      {
        onSuccess: () => {
          proposalEvents.scopeUpdated({ proposalId, field: 'phase', action: 'add' });
          void refreshDraftingSummary();
        },
      }
    );
  }

  async function handleAddDefaults() {
    if (addingDefaults || addPhase.isPending) return;
    setAddingDefaults(true);
    setPhaseCreateError(null);
    try {
      await Promise.all(
        DEFAULT_PHASES.map((phase) =>
          addPhase.mutateAsync({
            proposalId,
            name: phase.name,
            phaseKey: phase.phaseKey,
            durationWeeks: phase.durationWeeks,
            feeCents: phase.feeCents,
            revisionLimit: phase.revisionLimit,
          }),
        ),
      );
      DEFAULT_PHASES.forEach(() => {
        proposalEvents.scopeUpdated({ proposalId, field: 'phase', action: 'add' });
      });
      await refreshDraftingSummary();
    } catch (error) {
      setPhaseCreateError(
        error instanceof Error ? error.message : 'Could not add the default phases. Try again.',
      );
    } finally {
      setAddingDefaults(false);
    }
  }

  const phaseWritePending = addPhase.isPending || addingDefaults;

  const totalFee = phases.reduce(
    (sum: number, p: ProposalPhaseRow) => sum + (p.fee_cents || 0),
    0
  );
  const totalWeeks = phases.reduce(
    (sum: number, p: ProposalPhaseRow) => sum + (p.duration_weeks || 0),
    0
  );

  const allPhasesLite: ProposalPhaseLite[] = useMemo(
    () =>
      phases.map((p) => ({
        id: p.id,
        name: p.name,
        sort_order: p.sort_order,
      })),
    [phases]
  );

  const milestonesLite: PaymentMilestoneLite[] = useMemo(
    () =>
      milestones.map((m) => ({
        id: m.id,
        label: m.label,
        amount_cents: m.amount_cents,
        percentage: m.percentage,
      })),
    [milestones]
  );

  if (isLoading) {
    return (
      <div className="py-8 text-center font-body text-[0.82rem] text-[var(--text-muted)]">
        Loading phases...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Visual timeline ─────────────────────────────────────────────── */}
      {phases.length > 0 && (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <PhaseTimelineView proposalId={proposalId} />
        </div>
      )}

      {/* ─── Editable phase rows ─────────────────────────────────────────── */}
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <span className="type-meta">Project Phases</span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={phaseWritePending}
              onClick={() => setTemplatePickerOpen(true)}
            >
              Apply Template
            </Button>
            {phases.length === 0 && (
              <Button
                variant="secondary"
                disabled={phaseWritePending}
                onClick={() => void handleAddDefaults()}
              >
                {addingDefaults ? 'Adding defaults…' : 'Add Defaults'}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={phaseWritePending}
              onClick={handleAddPhase}
            >
              {addPhase.isPending && !addingDefaults ? 'Adding phase…' : '+ Add Phase'}
            </Button>
          </div>
        </div>

        {phaseCreateError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--color-terracotta)]">
            {phaseCreateError}
          </p>
        ) : null}

        {/* Column headers */}
        {phases.length > 0 && (
          <div
            className="grid gap-3 border-b border-[var(--border-default)] pb-1.5"
            style={{ gridTemplateColumns: '1fr 120px 160px 120px 80px 36px' }}
          >
            <span className="type-meta-small">Phase Name</span>
            <span className="type-meta-small">Type</span>
            <span className="type-meta-small text-right">Duration</span>
            <span className="type-meta-small text-right">Fee</span>
            <span className="type-meta-small text-center">Revisions</span>
            <span />
          </div>
        )}

        {/* Phase rows */}
        {phases.map((phase) => {
          const id = phase.id;
          const local = edits[id] || {};
          const legacyText = phase.gate_condition;

          return (
            <div key={id}>
              <div
                className="grid items-start gap-3 border-b py-2"
                style={{
                  gridTemplateColumns: '1fr 120px 160px 120px 80px 36px',
                  borderColor: 'rgba(229, 226, 221, 0.4)',
                }}
              >
                {/* Name */}
                <input
                  type="text"
                  value={(local.name as string) ?? ''}
                  onChange={(e) => setField(id, 'name', e.target.value)}
                  className="w-full border-b border-transparent bg-transparent font-body text-[0.88rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />

                {/* Phase key select */}
                <select
                  value={(local.phase_key as string) ?? ''}
                  onChange={(e) => setField(id, 'phase_key', e.target.value)}
                  className="w-full cursor-pointer border-b border-transparent bg-transparent font-body text-[0.78rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="">--</option>
                  {PHASE_KEY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Duration / anchor — grammar field (Slice 03 §5). The
                    current effective value shows as read text; the field
                    itself is a blank direct-commit capture (the Document's
                    convention — schedule-entry-field.tsx never echoes the
                    stored value back into itself). Keyed on the persisted
                    values so a successful commit remounts it blank. */}
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-[0.68rem] text-[var(--text-muted)]">
                    {fmtEffectiveDuration(
                      local.duration_days as number | null | undefined,
                      local.duration_weeks as number | null | undefined
                    )}
                  </span>
                  <ScheduleEntryField
                    key={`${id}-${(local.duration_days as number | null) ?? ''}-${(local.duration_weeks as number | null) ?? ''}-${(local.anchor_date as string | null) ?? ''}`}
                    aria-label={`Set duration or anchor date for ${(local.name as string) || phase.name}`}
                    today={today}
                    bareNumberUnit="weeks"
                    accept={['duration', 'anchor']}
                    autoFocus={false}
                    placeholder="4w · 28d · Sep 21"
                    onCommit={(e) => {
                      if (e.kind === 'duration') handleSetPhaseDuration(id, e.days);
                      else handleSetPhaseAnchor(id, e.date);
                    }}
                    className="items-end"
                  />
                  {(local.anchor_date as string | null) && (
                    <AnchorChip
                      date={local.anchor_date as string}
                      onUnpin={() => handleUnpinPhaseAnchor(id)}
                    />
                  )}
                </div>

                {/* Fee (shown as dollars, stored as cents) */}
                <div className="flex items-center justify-end gap-0.5">
                  <span className="font-mono text-[0.78rem] text-[var(--text-muted)]">$</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={((local.fee_cents as number) ?? 0) / 100}
                    onChange={(e) =>
                      setField(
                        id,
                        'fee_cents',
                        Math.round(parseFloat(e.target.value || '0') * 100)
                      )
                    }
                    className="w-full border-b border-transparent bg-transparent text-right font-mono text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                {/* Revision stepper */}
                <div className="flex items-center justify-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-5 w-5 !px-0 !py-0"
                    onClick={() =>
                      setField(
                        id,
                        'revision_limit',
                        Math.max(0, ((local.revision_limit as number) ?? 0) - 1)
                      )
                    }
                  >
                    -
                  </Button>
                  <span className="w-4 text-center font-mono text-[0.82rem] text-[var(--text-primary)]">
                    {(local.revision_limit as number) ?? 0}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-5 w-5 !px-0 !py-0"
                    onClick={() =>
                      setField(id, 'revision_limit', ((local.revision_limit as number) ?? 0) + 1)
                    }
                  >
                    +
                  </Button>
                </div>

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 !px-0 !py-0"
                  onClick={() =>
                    removePhase.mutate(
                      { phaseId: id, proposalId },
                      {
                        onSuccess: () => {
                          proposalEvents.scopeUpdated({ proposalId, field: 'phase', action: 'remove' });
                          void refreshDraftingSummary();
                        },
                      }
                    )
                  }
                  aria-label="Remove phase"
                >
                  x
                </Button>
              </div>

              {/* Disclosure: deliverables + gates */}
              <Accordion type="single" collapsible variant="default">
                <AccordionItem value={`phase-${id}`}>
                  <AccordionTrigger className="!py-2 font-mono text-[0.65rem] uppercase tracking-wider text-[var(--text-muted)] hover:!no-underline">
                    Deliverables, gates &amp; key dates
                    {legacyText && (
                      <span
                        className="ml-2 rounded-[2px] px-1 py-0 font-mono text-[0.55rem] uppercase tracking-wider"
                        style={{
                          color: 'var(--text-muted)',
                          backgroundColor:
                            'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                        }}
                      >
                        legacy text present
                      </span>
                    )}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-5 pb-4 pt-2">
                      <DeliverablesEditor phaseId={id} />
                      <GateConditionsEditor
                        phaseId={id}
                        allPhases={allPhasesLite}
                        milestones={milestonesLite}
                      />
                      <ProposalMilestonesEditor phaseId={id} proposalId={proposalId} today={today} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          );
        })}

        {/* Summary */}
        {phases.length > 0 && (
          <div
            className="mt-1 grid items-baseline gap-3 border-t-2 border-[var(--border-default)] pt-3"
            style={{ gridTemplateColumns: '1fr 120px 160px 120px 80px 36px' }}
          >
            <span className="font-body text-[0.88rem] font-semibold text-[var(--text-primary)]">
              Total
            </span>
            <span />
            <span className="text-right font-mono text-[0.82rem] text-[var(--text-primary)]">
              {totalWeeks}w
            </span>
            <span className="text-right font-display text-[0.95rem] font-semibold text-[var(--text-primary)]">
              {formatDollars(totalFee)}
            </span>
            <span />
            <span />
          </div>
        )}

        {/* Zero-state — ScheduleBirth (Slice 03 §4/§5, R100 "PRIMARY" birth
            surface). The header's Apply Template / Add Defaults / + Add
            Phase buttons above stay live escape hatches (existing behavior
            intact); this is the primary typographic path. */}
        {phases.length === 0 && (
          <ScheduleBirth
            surface="proposal"
            onSeedPatinaSix={handleSeedPatinaSix}
            onCopyFromPastProject={handleCopyFromPastProject}
            pastProjects={pastProjectOptions}
            pastProjectsLoading={pastProjectsPending || pastCountsPending}
            busy={birthBusy}
            errorText={birthError}
            ghostCommittedPhases={committedPhaseInputs}
            ghostCommittedMilestones={committedMilestoneInputs}
            ghostFollowsPhaseId={null}
            ghostToday={today}
            onGhostAdd={handleGhostAdd}
            ghostErrorText={ghostError}
            ghostResetSignal={ghostResetSignal}
          />
        )}
      </div>

      {/* ─── Template picker modal ───────────────────────────────────────── */}
      <PhaseTemplatePicker
        proposalId={proposalId}
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
      />
    </div>
  );
}
