'use client';

/**
 * GhostAddLine — the dashed "Name a phase…" line that joins a new phase to
 * the spine (Slice 03 §3, R100 birth/compose). Prototype: `.ghost-add` in
 * the-document-schedule-master-direction.html (dashed node, Playfair name,
 * a duration field, and the DM-Mono compute line beneath).
 *
 * The <5s capture: type a name → Tab (or Enter) to the duration → Enter
 * commits. The new phase follows the LAST main-lane phase (`followsPhaseId`);
 * on an empty spine that is null (a root). It doubles as the ongoing "+ add"
 * line at the foot of a populated spine AND the blank starting point inside
 * ScheduleBirth.
 *
 * The compute line is a PASSIVE display (R100 — NOT the ripple, Slice 04):
 * as a valid duration is typed it runs `composePreview` (which resolves the
 * hypothetical chain through the one engine) and states the computed
 * start/end and slack — or, when the add overruns a downstream anchor, the
 * terracotta overrun. A typed hard date reads as an anchor ("→ Anchored ·
 * Sep 21"); an unparseable entry shows the parser's own terracotta reason.
 * Nothing here writes — Enter calls `onAdd`; the spine owns the mutation.
 *
 * Error honesty (R83 inline idiom — no toasts): commit does NOT clear the
 * fields. The spine bumps `resetSignal` on the mutation's onSuccess (fields
 * clear, focus returns to the name for the next capture) and passes
 * `errorText` when the create failed — the typed values are KEPT, so a
 * failed write never masquerades as a saved phase.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  parseScheduleEntry,
  type SchedulePhaseInput,
  type ScheduleMilestoneInput,
} from '@patina/utils';
import { composePreview } from '@/lib/document/schedule-compose-derivation';
import { fmtDay } from '@/lib/document/format';

export interface GhostAddInput {
  name: string;
  durationDays?: number;
  anchorDate?: string;
}

export interface GhostAddLineProps {
  /** Committed chain (resolver inputs) — feeds the passive compute line. */
  committedPhases: SchedulePhaseInput[];
  committedMilestones: ScheduleMilestoneInput[];
  /** The new phase follows this (last main-lane phase id); null on an empty spine. */
  followsPhaseId: string | null;
  /** Injected clock 'YYYY-MM-DD'. */
  today: string;
  /** Enter with a non-empty name → the spine's useCreateProjectPhase. */
  onAdd: (input: GhostAddInput) => void;
  /** Bumps to steal focus into the name field ("Start blank" in ScheduleBirth). */
  focusSignal?: number;
  /** Suppress the input's own autoFocus (the ongoing +add line at spine foot). */
  autoFocus?: boolean;
  /** Inline terracotta line when the create FAILED — typed values are kept. */
  errorText?: string | null;
  /** Bumps after a SUCCESSFUL create — clears the fields for the next capture. */
  resetSignal?: number;
}

/** The DM-Mono line beneath the ghost — passive compute / anchor / reason. */
interface ComputeLine {
  text: string;
  tone: 'clay' | 'terracotta';
}

export function GhostAddLine({
  committedPhases,
  committedMilestones,
  followsPhaseId,
  today,
  onAdd,
  focusSignal,
  autoFocus = false,
  errorText = null,
  resetSignal,
}: GhostAddLineProps) {
  const [name, setName] = useState('');
  const [durationText, setDurationText] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);

  // "Start blank" (and re-focus after a birth selection) drives focus here.
  useEffect(() => {
    if (focusSignal !== undefined) nameRef.current?.focus();
  }, [focusSignal]);

  // The create SUCCEEDED (spine's onSuccess bumps this) — only now do the
  // fields clear; a failed create keeps everything typed (see header note).
  useEffect(() => {
    if (resetSignal) {
      setName('');
      setDurationText('');
      nameRef.current?.focus();
    }
  }, [resetSignal]);

  const compute = useMemo<ComputeLine | null>(() => {
    const trimmedName = name.trim();
    const trimmedDur = durationText.trim();
    if (!trimmedName || !trimmedDur) return null;

    const parsed = parseScheduleEntry(trimmedDur, today, { bareNumberUnit: 'weeks' });
    if (parsed.kind === 'invalid') return { text: parsed.reason, tone: 'terracotta' };
    if (parsed.kind === 'anchor') {
      return { text: `→ Anchored · ${fmtDay(parsed.date)}`, tone: 'clay' };
    }

    const preview = composePreview(
      committedPhases,
      committedMilestones,
      { kind: 'add-phase', name: trimmedName, durationDays: parsed.days, followsPhaseId },
      today,
    );

    const overrun = preview.conflicts.find((c) => c.kind === 'chain_does_not_fit');
    if (overrun) {
      const anchor = committedPhases.find((p) => p.id === overrun.anchorId);
      const when = anchor?.anchorDate ? fmtDay(anchor.anchorDate) : 'the anchor';
      const by = overrun.overrunDays != null ? ` by ${overrun.overrunDays} days` : '';
      return { text: `Chain overruns ${when}${by}`, tone: 'terracotta' };
    }

    if (preview.start && preview.end) {
      const slack = preview.slackDays != null ? ` · Slack → ${preview.slackDays} days` : '';
      return { text: `→ Computes ${fmtDay(preview.start)} – ${fmtDay(preview.end)}${slack}`, tone: 'clay' };
    }
    return null;
  }, [name, durationText, today, committedPhases, committedMilestones, followsPhaseId]);

  const reset = () => {
    setName('');
    setDurationText('');
    nameRef.current?.focus();
  };

  // Fields are NOT cleared here — only `resetSignal` (the mutation's
  // onSuccess) clears them, so a failed create keeps the typed values.
  const commit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedDur = durationText.trim();
    if (!trimmedDur) {
      // telemetry: wired in S3-6 (schedule_phase_added)
      onAdd({ name: trimmedName });
      return;
    }
    const parsed = parseScheduleEntry(trimmedDur, today, { bareNumberUnit: 'weeks' });
    if (parsed.kind === 'invalid') return; // reason already shows on the compute line
    // telemetry: wired in S3-6 (schedule_phase_added; schedule_anchor_set on the anchor arm)
    if (parsed.kind === 'duration') onAdd({ name: trimmedName, durationDays: parsed.days });
    else onAdd({ name: trimmedName, anchorDate: parsed.date });
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (name.trim()) {
        e.preventDefault();
        durationRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      reset();
    }
  };

  const onDurationKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      reset();
    }
  };

  return (
    <div className="mt-[0.2rem] grid grid-cols-[30px_minmax(0,1fr)] gap-x-[1.1rem]">
      {/* dashed spine + hollow dashed clay node (`.ghost-add .cell` / `.nd`) */}
      <div className="relative" aria-hidden>
        <span
          className="absolute bottom-0 left-[6px] top-0 w-[1.5px]"
          style={{
            background:
              'repeating-linear-gradient(to bottom, var(--color-pearl) 0 5px, transparent 5px 10px)',
          }}
        />
        <span className="absolute left-[1px] top-[6px] h-[12px] w-[12px] rounded-full border-[1.5px] border-dashed border-[var(--color-clay)] bg-[var(--color-off-white)]" />
      </div>

      <div className="pb-[1.4rem]">
        <input
          ref={nameRef}
          autoFocus={autoFocus}
          type="text"
          aria-label="Name a phase"
          value={name}
          placeholder="Name a phase…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onNameKeyDown}
          className="min-w-[280px] max-w-full border-b border-dashed border-[var(--color-clay)] bg-transparent pb-[2px] font-heading text-[1.2rem] text-[var(--color-aged-oak)] placeholder:text-[var(--color-aged-oak)] placeholder:opacity-70 focus:outline-none"
        />

        {/* the duration field appears once a name is being typed (`.date-entry`) */}
        {name.trim() !== '' && (
          <div className="mt-[0.5rem] inline-flex items-baseline gap-[0.6rem]">
            <label className="inline-flex items-baseline gap-[0.35rem] rounded-[3px] border border-[var(--color-pearl)] bg-[var(--color-off-white)] px-[0.6rem] py-[0.3rem]">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                Duration
              </span>
              <input
                ref={durationRef}
                type="text"
                aria-label="Phase duration or anchor date"
                value={durationText}
                placeholder="3w · 10d · Sep 21"
                onChange={(e) => setDurationText(e.target.value)}
                onKeyDown={onDurationKeyDown}
                className="w-[130px] bg-transparent font-mono text-[0.72rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </label>
          </div>
        )}

        {compute && (
          <div
            className="mt-[0.45rem] font-mono text-[0.6rem] uppercase tracking-[0.07em]"
            style={{ color: compute.tone === 'terracotta' ? 'var(--color-terracotta)' : 'var(--color-clay)' }}
          >
            {compute.text}
          </div>
        )}

        {errorText && (
          <div className="mt-[0.45rem] font-mono text-[0.6rem] uppercase tracking-[0.07em] text-[var(--color-terracotta)]">
            {errorText}
          </div>
        )}
      </div>
    </div>
  );
}
