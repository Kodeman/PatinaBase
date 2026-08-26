'use client';

/**
 * Studio setup checklist (Day-1, U3) — five square-tick rows at the top of
 * the Studio page. The tick visual mirrors work-block.tsx's stamp idiom (a
 * local ChecklistRow — WorkBlock itself is hook-bound to section tasks and
 * not reusable here); every tick renders straight from `deriveSetupSteps`
 * and is never itself clickable. Three rows carry a scored word instead of a
 * plain label: row 3 opens the invite sheet, row 4 (Call Sheet Wave 2) opens
 * the rolodex review and SKIPs the seed-review, row 5 opens the existing
 * open-project front door. Collapses to a single settled mono line once
 * every step is done.
 *
 * Row 4 stays dependency-free (no @patina/supabase import, mirroring
 * desk-derivation.ts) — the caller (account-studio-page.tsx) owns the
 * `useStudioContacts` / `useUpdateOrganization` calls and passes primitives +
 * callbacks in, same as it already does for `onInvite`. Without
 * `onSkipSeed`/`onOpenSeedReview` (the flag-off / Wave-1 shape) row 4 renders
 * exactly as it did before this wave — SKIP disabled, "coming with the
 * rolodex".
 *
 * `organizations.rolodex_seed_skipped_at` is owner/admin-gated by RLS — the
 * SKIP word itself only ever renders for a caller that passes `onSkipSeed`
 * (the page gates that on the viewer's role before passing it down), so a
 * plain member simply never sees a SKIP control. `onOpenSeedReview` being
 * present without `onSkipSeed` (Wave 2 live, viewer lacks permission) drops
 * the SKIP affordance entirely rather than falling back to the Wave-1
 * disabled placeholder, which reads as "not built yet" — wrong message for a
 * plain member. `skipSeedError` is a belt-and-suspenders band for the race
 * where the write itself still 403s (a role change mid-session) — it swaps in
 * for row 4's hint line, mirroring rolodex-seed-sheet.tsx's inline RLS-error
 * idiom.
 */

import type { ReactNode } from 'react';
import { deriveSetupSteps, type StudioSetupInput } from '@/lib/document/studio-setup';
import { openOpenProject } from '../command-bar';

export interface StudioSetupChecklistProps extends StudioSetupInput {
  /** Row 3 ("Invite your crew") — opens the studio invite sheet. */
  onInvite: () => void;
  /** Row 4 ("Seed the rolodex") — Call Sheet Wave 2. Writes
   *  `rolodex_seed_skipped_at`. Omitted (or `undefined`) keeps row 4 in its
   *  Wave-1 disabled shape. */
  onSkipSeed?: () => void;
  /** True while the skip write is in flight — disables SKIP a second time. */
  skipSeedPending?: boolean;
  /** Row 4's label — opens the rolodex review sheet. Only interactive
   *  alongside `onSkipSeed` (both land together, Wave 2). Any studio member
   *  can open the review (it's read-only for them); presence of this prop
   *  without `onSkipSeed` signals "Wave 2 live, viewer can't skip" and drops
   *  the SKIP control rather than showing the Wave-1 placeholder. */
  onOpenSeedReview?: () => void;
  /** A failed skip write (RLS race — see module doc) — replaces row 4's hint
   *  line with an inline error band, mirroring rolodex-seed-sheet.tsx. */
  skipSeedError?: string | null;
  className?: string;
}

const SCORED_ROW_LABEL =
  'da-score-hover inline-flex min-h-11 min-w-11 items-center text-left text-[13.5px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

function ChecklistRow({
  done,
  label,
  hint,
  error,
  action,
}: {
  done: boolean;
  label: ReactNode;
  hint?: string;
  /** Swaps in for `hint` when present — the RLS-race inline band (module
   *  doc). Never shown alongside `hint`; an error always wins the slot. */
  error?: string | null;
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
        {error ? (
          <span
            role="alert"
            className="mt-0.5 block text-[11px] leading-relaxed text-[var(--color-terracotta-ink)]"
          >
            {error}
          </span>
        ) : (
          hint && (
            <span className="mt-0.5 block font-heading text-[11px] italic text-[var(--color-aged-oak)]">
              {hint}
            </span>
          )
        )}
      </span>
      {action}
    </div>
  );
}

export function StudioSetupChecklist({
  onInvite,
  onSkipSeed,
  skipSeedPending = false,
  onOpenSeedReview,
  skipSeedError,
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
        label={
          rolodexSeeded.done || !onOpenSeedReview ? (
            rolodexSeeded.label
          ) : (
            <button type="button" onClick={onOpenSeedReview} className={SCORED_ROW_LABEL}>
              {rolodexSeeded.label}
            </button>
          )
        }
        hint={
          rolodexSeeded.done ? undefined : 'The rolodex fills itself from your projects'
        }
        error={rolodexSeeded.done ? undefined : skipSeedError}
        action={
          rolodexSeeded.done ? undefined : onSkipSeed ? (
            <button
              type="button"
              onClick={onSkipSeed}
              disabled={skipSeedPending}
              className="da-score-hover inline-flex min-h-11 min-w-11 items-center font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip
            </button>
          ) : onOpenSeedReview ? (
            // Wave 2 is live but this viewer can't skip (not owner/admin) —
            // no SKIP control at all, not even a disabled one; the Wave-1
            // placeholder below reads as "not built yet", which is wrong here.
            null
          ) : (
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
