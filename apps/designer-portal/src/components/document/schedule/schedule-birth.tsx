'use client';

/**
 * ScheduleBirth — the three quiet starting points a schedule is born from
 * (Slice 03 §3/§4, R100 birth). Prototype: the "Born" slide's `.tmpl` lines
 * in the-document-schedule-master-direction.html. No modal, no wizard (D4) —
 * three typographic rows and a ghost line:
 *
 *   i   · The Patina Six — the studio's standard six phases, pre-chained.
 *   ii  · From a past project — your history as your estimate (as-built copy).
 *   iii · Start blank — name your first phase (focuses the ghost line).
 *
 * Shared across surfaces via `surface` ('proposal' | 'project'); the spine
 * wires the 'project' surface here. The mutations live in the caller — this
 * only signals which starting point was chosen and forwards the blank path's
 * ghost-add wiring to GhostAddLine.
 */

import { useState } from 'react';
import type { SchedulePhaseInput, ScheduleMilestoneInput } from '@patina/utils';
import { GhostAddLine, type GhostAddInput } from './ghost-add-line';
import { PastProjectPicker, type PastProjectOption } from './past-project-picker';

export interface ScheduleBirthProps {
  surface: 'proposal' | 'project';
  /** i · seed the Patina Six (useSeedProjectScheduleFromTemplate / useApplyPhaseTemplate). */
  onSeedPatinaSix: () => void;
  /** ii · clone a past project's as-built chain (useCopyScheduleAsBuilt). */
  onCopyFromPastProject: (sourceProjectId: string) => void;
  pastProjects: PastProjectOption[];
  pastProjectsLoading?: boolean;
  /** Any birth RPC in flight — disables the tmpl rows + picker. */
  busy?: boolean;
  /** Inline terracotta line when a birth RPC (seed/copy) FAILED. */
  errorText?: string | null;

  // iii · the blank path — GhostAddLine wiring (forwarded verbatim).
  ghostCommittedPhases: SchedulePhaseInput[];
  ghostCommittedMilestones: ScheduleMilestoneInput[];
  ghostFollowsPhaseId: string | null;
  ghostToday: string;
  onGhostAdd: (input: GhostAddInput) => void;
  /** Forwarded to the ghost line — create-failed line / clear-on-success. */
  ghostErrorText?: string | null;
  ghostResetSignal?: number;
}

interface TmplRow {
  numeral: string;
  heading: string;
  body: string;
  tag: string;
}

const ROWS: TmplRow[] = [
  {
    numeral: 'i',
    heading: 'The Patina Six',
    body:
      'Consultation · Schematic Design · Design Development · Procurement & Orders · Installation & Styling · Completion — the studio’s standard six, pre-chained. Delete what the project doesn’t need.',
    tag: 'Default',
  },
  {
    numeral: 'ii',
    heading: 'From a past project',
    body:
      'Pull the phase chain from a finished project — with the durations that actually happened, not the ones that were hoped for. Your history becomes your estimate.',
    tag: 'As-built',
  },
  {
    numeral: 'iii',
    heading: 'Start blank',
    body: 'An empty spine and a ghost line — name your first phase. For the project that fits no template.',
    tag: 'Blank',
  },
];

export function ScheduleBirth({
  surface,
  onSeedPatinaSix,
  onCopyFromPastProject,
  pastProjects,
  pastProjectsLoading = false,
  busy = false,
  errorText = null,
  ghostCommittedPhases,
  ghostCommittedMilestones,
  ghostFollowsPhaseId,
  ghostToday,
  onGhostAdd,
  ghostErrorText = null,
  ghostResetSignal,
}: ScheduleBirthProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [ghostFocus, setGhostFocus] = useState(0);

  const onRow = (numeral: string) => {
    if (numeral === 'i') {
      // schedule_born (kind 'patina_six') fires in the caller's onSuccess
      // (schedule-spine.tsx handleSeedPatinaSix / phase-builder.tsx's
      // proposal-surface equivalent) — onSeedPatinaSix only signals intent.
      onSeedPatinaSix();
    } else if (numeral === 'ii') {
      setShowPicker((v) => !v);
    } else {
      setShowPicker(false);
      setGhostFocus((n) => n + 1); // focus the ghost name field
    }
  };

  return (
    <div className="mt-5 max-w-[720px]">
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] pb-[0.5rem]">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.07em] text-[var(--color-charcoal)]">
          Compose a schedule · Three starting points
        </span>
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          {surface === 'proposal' ? 'Born in the proposal' : 'Typographic · No wizards'}
        </span>
      </div>

      {errorText && (
        <div className="mt-[0.6rem] font-mono text-[0.6rem] uppercase tracking-[0.07em] text-[var(--color-terracotta-ink)]">
          {errorText}
        </div>
      )}

      {ROWS.map((row) => (
        <div key={row.numeral} className="border-b border-[var(--color-pearl)]">
          <button
            type="button"
            onClick={() => onRow(row.numeral)}
            disabled={busy}
            className="grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-baseline gap-x-[1.1rem] py-[1rem] text-left disabled:opacity-50"
          >
            <span className="font-heading text-[1.4rem] font-light leading-none text-[var(--color-clay-ink)]">
              {row.numeral}
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-[1.12rem] text-[var(--color-charcoal)]">
                {row.heading}
              </span>
              <span className="mt-[0.15rem] block max-w-[560px] text-[0.84rem] text-[var(--color-mocha)]">
                {row.body}
              </span>
            </span>
            <span className="whitespace-nowrap font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[var(--color-clay-ink)]">
              {row.tag}
            </span>
          </button>

          {row.numeral === 'ii' && showPicker && (
            <div className="pb-[0.9rem] pl-[calc(30px+1.1rem)]">
              <PastProjectPicker
                projects={pastProjects}
                onPick={onCopyFromPastProject}
                isLoading={pastProjectsLoading}
                busy={busy}
                surface={surface}
              />
            </div>
          )}
        </div>
      ))}

      {/* the blank path's ghost line — always present; "Start blank" focuses it */}
      <div className="mt-[1.2rem]">
        <GhostAddLine
          committedPhases={ghostCommittedPhases}
          committedMilestones={ghostCommittedMilestones}
          followsPhaseId={ghostFollowsPhaseId}
          today={ghostToday}
          onAdd={onGhostAdd}
          focusSignal={ghostFocus || undefined}
          errorText={ghostErrorText}
          resetSignal={ghostResetSignal}
        />
      </div>
    </div>
  );
}
