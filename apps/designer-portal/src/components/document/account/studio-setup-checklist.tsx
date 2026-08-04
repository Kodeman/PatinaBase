'use client';

/**
 * Studio setup checklist (Day-1, U3) — five square-tick rows at the top of
 * the Studio page. The tick visual mirrors work-block.tsx's stamp idiom (a
 * local ChecklistRow — WorkBlock itself is hook-bound to section tasks and
 * not reusable here); every tick renders straight from `deriveSetupSteps`
 * and is never itself clickable. Two rows carry a scored word instead of a
 * plain label: row 3 opens the invite sheet, row 5 opens the existing
 * open-project front door. Row 4's SKIP word is disabled this wave — the
 * rolodex table (and its seed-skip write) lands in Wave 2, so there is
 * nothing yet to skip into. Collapses to a single settled mono line once
 * every step is done.
 */

import type { ReactNode } from 'react';
import { deriveSetupSteps, type StudioSetupInput } from '@/lib/document/studio-setup';
import { openOpenProject } from '../command-bar';

export interface StudioSetupChecklistProps extends StudioSetupInput {
  /** Row 3 ("Invite your crew") — opens the studio invite sheet. */
  onInvite: () => void;
  className?: string;
}

const SCORED_ROW_LABEL =
  'da-score-hover inline-flex min-h-11 min-w-11 items-center text-left text-[13.5px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

function ChecklistRow({
  done,
  label,
  hint,
  action,
}: {
  done: boolean;
  label: ReactNode;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed border-[var(--color-pearl)] py-2 last:border-b-0">
      <span
        aria-hidden
        className="relative inline-flex h-[15px] w-[15px] items-center justify-center rounded-[2px] border-[1.5px] text-[8px] font-bold leading-none text-white"
        style={{
          borderColor: done ? 'var(--color-sage)' : 'var(--doc-ink-border)',
          background: done ? 'var(--color-sage)' : 'transparent',
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span className="min-w-0">
        <span
          className={`text-[13.5px] ${done ? 'text-[var(--color-aged-oak)]' : 'text-[var(--color-charcoal)]'}`}
        >
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block font-heading text-[11px] italic text-[var(--color-aged-oak)]">
            {hint}
          </span>
        )}
      </span>
      {action}
    </div>
  );
}

export function StudioSetupChecklist({
  onInvite,
  className,
  ...input
}: StudioSetupChecklistProps) {
  const { steps, allDone, settledLabel } = deriveSetupSteps(input);
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s])) as Record<
    (typeof steps)[number]['key'],
    (typeof steps)[number]
  >;

  if (allDone) {
    return (
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] ${className ?? ''}`}
      >
        {settledLabel}
      </p>
    );
  }

  const crewInvited = byKey['crew-invited'];
  const rolodexSeeded = byKey['rolodex-seeded'];
  const firstProject = byKey['first-project'];

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Still to do
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
          {steps.filter((s) => !s.done).length}
        </span>
      </div>

      <ChecklistRow
        done={byKey['named-and-branded'].done}
        label={byKey['named-and-branded'].label}
      />
      <ChecklistRow
        done={byKey['own-title-set'].done}
        label={byKey['own-title-set'].label}
      />
      <ChecklistRow
        done={crewInvited.done}
        label={
          crewInvited.done ? (
            crewInvited.label
          ) : (
            <button type="button" onClick={onInvite} className={SCORED_ROW_LABEL}>
              {crewInvited.label}
            </button>
          )
        }
      />
      <ChecklistRow
        done={rolodexSeeded.done}
        label={rolodexSeeded.label}
        hint={
          rolodexSeeded.done ? undefined : 'The rolodex fills itself from your projects'
        }
        action={
          rolodexSeeded.done ? undefined : (
            <button
              type="button"
              disabled
              title="coming with the rolodex"
              aria-disabled="true"
              className="da-score-hover inline-flex min-h-11 min-w-11 items-center font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)] opacity-50 disabled:cursor-not-allowed"
            >
              Skip
            </button>
          )
        }
      />
      <ChecklistRow
        done={firstProject.done}
        label={
          firstProject.done ? (
            firstProject.label
          ) : (
            <button
              type="button"
              onClick={() => openOpenProject()}
              className={SCORED_ROW_LABEL}
            >
              {firstProject.label}
            </button>
          )
        }
      />

      <p className="mt-2 font-heading text-[11px] italic text-[var(--color-aged-oak)]">
        The marks follow the work. Nothing on this list is something you tick
        — do the thing and the box fills.
      </p>
    </div>
  );
}
